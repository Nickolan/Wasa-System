## Purpose

Define **qué datos devuelve la consulta de resultados y con qué semántica**: qué conjunto de escaneos y de vulnerabilidades se expone, en qué orden, qué significa exactamente cada filtro y cómo se combinan entre sí, qué forma tiene cada fila devuelta, y la garantía —central para este sistema— de que leer esos datos nunca escribe, altera ni migra la base de datos compartida con el sistema WASA existente.

## Requirements

### Requirement: La proyección expone escaneos y vulnerabilidades persistidos por el sistema existente

La consulta de resultados SHALL devolver dos colecciones tomadas de la base de datos compartida del sistema WASA: la de escaneos y la de vulnerabilidades. Los datos SHALL provenir de la persistencia real —los escaneos que el orquestador y sus trabajadores registraron— y NO SHALL derivarse, sintetizarse, cachearse ni completarse con valores inventados por el servicio. El servicio no es la fuente de verdad de estos datos: los proyecta tal como están.

#### Scenario: Los escaneos registrados aparecen en la proyección

- **WHEN** el sistema existente registró escaneos y se invoca la consulta de resultados sin filtros
- **THEN** la colección de escaneos devuelta contiene un elemento por cada escaneo registrado, ninguno más y ninguno menos

#### Scenario: Las vulnerabilidades registradas aparecen en la proyección

- **WHEN** el sistema existente registró vulnerabilidades y se invoca la consulta de resultados sin filtros
- **THEN** la colección de vulnerabilidades devuelta contiene un elemento por cada vulnerabilidad registrada

#### Scenario: Un dato que no está persistido no aparece

- **WHEN** se invoca la consulta de resultados contra una base sin ningún registro
- **THEN** ambas colecciones vienen vacías: el servicio no fabrica escaneos ni vulnerabilidades de ejemplo

### Requirement: Cada fila devuelta conserva los campos que la persistencia expone

Cada elemento de las colecciones devueltas SHALL conservar los campos tal como están almacenados, sin renombrarlos ni recalcularlos. Cada escaneo SHALL incluir al menos su identificador, su URL objetivo y su fecha de escaneo. Cada vulnerabilidad SHALL incluir al menos su identificador, el identificador del escaneo al que pertenece, su severidad, su fuente, su tipo, su URL, su descripción, su solución, su identificador CWE y su evidencia.

El servicio NO SHALL descartar un campo por no conocerlo: el esquema de esas tablas pertenece al sistema existente y puede incorporar columnas sin que este servicio se entere, de modo que un campo presente en la persistencia y ausente de la documentación del servicio SHALL llegar igualmente al consumidor. Recíprocamente, el servicio NO SHALL fallar la consulta porque una fila traiga un campo que no esperaba.

La severidad SHALL devolverse con la capitalización con que está almacenada, sin normalizar: la presentación es responsabilidad del consumidor. Las fechas SHALL devolverse en un formato de fecha y hora interoperable que un cliente pueda interpretar sin conocer el motor de base de datos.

#### Scenario: Campos mínimos de un escaneo

- **WHEN** la proyección devuelve un escaneo
- **THEN** ese elemento incluye su identificador, su URL objetivo y su fecha de escaneo con los mismos nombres con que están almacenados

#### Scenario: Campos mínimos de una vulnerabilidad

- **WHEN** la proyección devuelve una vulnerabilidad
- **THEN** ese elemento incluye identificador, identificador de escaneo, severidad, fuente, tipo, URL, descripción, solución, identificador CWE y evidencia

#### Scenario: Una columna no documentada llega igual al consumidor

- **WHEN** la tabla de escaneos de la base compartida contiene una columna que la documentación del servicio no enumera
- **THEN** el valor de esa columna aparece en el elemento devuelto, en lugar de descartarse silenciosamente

#### Scenario: La severidad no se normaliza

- **WHEN** una vulnerabilidad está almacenada con severidad `high`
- **THEN** la proyección la devuelve como `high`, no como `High` ni `HIGH`

#### Scenario: La fecha es interpretable por el cliente

- **WHEN** la proyección devuelve la fecha de un escaneo
- **THEN** el valor es una fecha y hora en formato interoperable que el consumidor puede ordenar y formatear sin conocer el motor de base de datos

### Requirement: Los escaneos vienen completos y ordenados cronológicamente

La colección de escaneos SHALL devolverse siempre completa y SHALL NOT verse afectada por ninguno de los filtros de la consulta: los filtros aplican exclusivamente a las vulnerabilidades. Los escaneos SHALL ordenarse por fecha de escaneo de forma ascendente —del más antiguo al más reciente—, de modo que un consumidor pueda graficar la evolución temporal sin reordenar.

#### Scenario: Orden cronológico ascendente

- **WHEN** se invoca la consulta de resultados y hay varios escaneos con fechas distintas
- **THEN** los escaneos vienen ordenados de fecha más antigua a más reciente

#### Scenario: Los filtros no recortan los escaneos

- **WHEN** se invoca la consulta de resultados con un filtro que deja cero vulnerabilidades
- **THEN** la colección de escaneos sigue siendo la completa, sin recortar

#### Scenario: Filtrar por un escaneo no oculta los demás escaneos

- **WHEN** se invoca la consulta de resultados filtrando por el identificador de un escaneo
- **THEN** las vulnerabilidades devueltas son sólo las de ese escaneo, pero la colección de escaneos sigue conteniéndolos a todos

### Requirement: Semántica de cada filtro de vulnerabilidades

Cada filtro presente SHALL restringir la colección de vulnerabilidades a las que coinciden exactamente con el valor pedido, sin coincidencia parcial ni por prefijo:

- **Identificador de escaneo**: coincidencia exacta con el escaneo al que pertenece la vulnerabilidad.
- **Fuente**: coincidencia exacta y sensible a mayúsculas con el valor almacenado; el servicio NO SHALL transformar el valor recibido.
- **Severidad**: el valor recibido SHALL convertirse a minúsculas antes de comparar, y compararse contra el valor almacenado tal cual. Esto es deliberado y es el comportamiento del sistema que se reemplaza: las severidades se almacenan en minúsculas mientras que el consumidor las muestra y las envía capitalizadas, de modo que sin esa conversión el filtro no devolvería nada.

#### Scenario: Filtro por severidad enviada capitalizada

- **WHEN** se filtra por severidad `Critical` y existen vulnerabilidades almacenadas con severidad `critical`
- **THEN** esas vulnerabilidades se devuelven: el valor recibido se convirtió a minúsculas antes de comparar

#### Scenario: Filtro por severidad enviada en minúsculas

- **WHEN** se filtra por severidad `critical`
- **THEN** el resultado es idéntico al de filtrar por `Critical`

#### Scenario: Filtro por fuente sensible a mayúsculas

- **WHEN** se filtra por fuente `SQLMap (Worker)` y existen vulnerabilidades almacenadas con esa fuente exacta
- **THEN** esas vulnerabilidades se devuelven; filtrar por `sqlmap (worker)` en cambio no devuelve ninguna

#### Scenario: Filtro por identificador de escaneo

- **WHEN** se filtra por el identificador de un escaneo concreto
- **THEN** todas las vulnerabilidades devueltas pertenecen a ese escaneo, y ninguna vulnerabilidad de ese escaneo queda fuera

#### Scenario: Un filtro sin coincidencias devuelve una colección vacía

- **WHEN** se filtra por un valor que no coincide con ninguna vulnerabilidad almacenada
- **THEN** la colección de vulnerabilidades viene vacía y la respuesta es exitosa, no un error

### Requirement: Los filtros presentes se combinan por conjunción

Cuando más de un filtro está presente, la colección de vulnerabilidades SHALL restringirse a las que satisfacen **todos** ellos simultáneamente. Un filtro ausente SHALL NOT participar de la restricción. La combinación SHALL ser conmutativa: el orden en que se envían los parámetros NO SHALL alterar el resultado.

#### Scenario: Dos filtros simultáneos

- **WHEN** se filtra a la vez por severidad y por fuente
- **THEN** las vulnerabilidades devueltas son exactamente las que tienen esa severidad **y** esa fuente

#### Scenario: Los tres filtros simultáneos

- **WHEN** se filtra a la vez por identificador de escaneo, severidad y fuente
- **THEN** las vulnerabilidades devueltas son exactamente las que satisfacen las tres condiciones

#### Scenario: El orden de los parámetros es indiferente

- **WHEN** se invoca la consulta con los mismos filtros enviados en distinto orden
- **THEN** el resultado es idéntico

#### Scenario: Filtros contradictorios

- **WHEN** se combinan filtros que ninguna vulnerabilidad satisface a la vez
- **THEN** la colección de vulnerabilidades viene vacía y la respuesta es exitosa

### Requirement: La proyección es estrictamente de solo lectura sobre la base compartida

Resolver la consulta de resultados SHALL consistir exclusivamente en consultas de lectura sobre la base de datos compartida. La operación NO SHALL emitir inserciones, actualizaciones, borrados ni instrucciones de definición de esquema sobre las tablas del sistema existente, NO SHALL confirmar ninguna transacción, y NO SHALL declararlas como entidades del modelo de datos propio del servicio, para que el mecanismo de creación de esquema del servicio siga sin poder alcanzarlas ni siquiera por accidente.

El aislamiento SHALL estar anclado por pruebas automatizadas, de modo que un change futuro que introduzca una escritura o un mapeo sobre esas tablas deje la suite en rojo.

#### Scenario: Una consulta no modifica los datos

- **WHEN** se invoca la consulta de resultados repetidamente
- **THEN** el contenido de las tablas del sistema existente queda idéntico: mismo número de filas y mismos valores antes y después

#### Scenario: Ninguna instrucción de escritura sobre las tablas compartidas

- **WHEN** se inspeccionan las instrucciones que el servicio emite contra las tablas de escaneos y vulnerabilidades
- **THEN** todas son de lectura: no aparece ninguna inserción, actualización, borrado, `ALTER`, `DROP` ni `TRUNCATE`

#### Scenario: Las tablas compartidas quedan fuera del modelo de datos del servicio

- **WHEN** se inspecciona el conjunto de tablas que el modelo de datos propio del servicio conoce y sobre el que puede emitir creación de esquema
- **THEN** contiene únicamente la tabla de usuarios: las tablas de escaneos y vulnerabilidades no figuran

#### Scenario: El arranque sigue emitiendo un solo DDL

- **WHEN** arranca la aplicación con la consulta de resultados ya disponible
- **THEN** el único DDL emitido sigue siendo la creación idempotente de la tabla de usuarios, acotada explícitamente a esa tabla

#### Scenario: El aislamiento está anclado por tests

- **WHEN** un change futuro introduzca una escritura o un mapeo del modelo de datos sobre las tablas del sistema existente
- **THEN** la suite de tests falla señalando el archivo infractor

### Requirement: La conexión a la base compartida se resuelve por configuración

El acceso a la base de datos compartida SHALL usar la misma cadena de conexión configurada del servicio que el resto de sus operaciones de persistencia. NO SHALL existir en el código ningún host, puerto, nombre de base, usuario ni contraseña propios de esta consulta: el backend de dashboard que este servicio reemplaza los llevaba embebidos en el código fuente, y esa es precisamente una de las condiciones que la unificación elimina.

#### Scenario: Sin credenciales en el código

- **WHEN** se inspecciona el código de producción que resuelve la consulta de resultados
- **THEN** no aparece ninguna credencial, host, puerto ni nombre de base literal: todo proviene de la configuración

#### Scenario: Cambiar la configuración cambia el destino de la consulta

- **WHEN** se modifica la cadena de conexión configurada del servicio
- **THEN** la consulta de resultados apunta a la nueva base sin ninguna modificación de código fuente

#### Scenario: Una sola configuración de conexión para todo el servicio

- **WHEN** se comparan el destino de la consulta de resultados y el de las operaciones de usuarios
- **THEN** ambos derivan de la misma variable de configuración: no hay dos configuraciones de conexión que puedan divergir
