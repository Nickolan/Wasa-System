## Purpose

Define la pantalla de resultados de escaneo dentro de la Landing: por qué dirección se alcanza, desde dónde se llega a ella sin salir de la aplicación, qué vistas ofrece sobre los mismos datos, cómo se acotan esos datos con filtros, qué muestra mientras carga, cuando falla y cuando no hay nada que mostrar, y cómo se inspecciona una vulnerabilidad en detalle. Reemplaza a la aplicación de dashboard standalone que hasta ahora vivía en un origen aparte; `dashboard-client-requests` describe cómo se piden los datos y `dashboard-metrics` qué se deriva de ellos.

## Requirements

### Requirement: La pantalla de resultados es una ruta de la propia aplicación

La Landing SHALL exponer la pantalla de resultados como una ruta propia bajo la dirección `/dashboard`, servida por la misma aplicación que sirve el resto de las pantallas. Visitar esa dirección SHALL montar la pantalla de resultados sin recargar el documento, sin abandonar la aplicación y sin navegar a un origen distinto.

La pantalla SHALL conservar la barra de navegación de la aplicación, igual que cualquier otra ruta: llegar a los resultados no SHALL dejar al usuario en una interfaz ajena desde la que no puede volver.

#### Scenario: La ruta está montada

- **WHEN** se navega a `/dashboard` dentro de la aplicación
- **THEN** se monta la pantalla de resultados, y no la página de inicio ni la de escaneo

#### Scenario: La pantalla conserva la navegación de la aplicación

- **WHEN** la pantalla de resultados está montada
- **THEN** la barra de navegación de la aplicación sigue presente, con sus entradas hacia el resto de las pantallas

#### Scenario: Las demás rutas siguen funcionando

- **WHEN** se navega a la página de inicio, a la de información o a la de escaneo
- **THEN** cada una monta su propia pantalla: incorporar la de resultados no desplaza a ninguna

### Requirement: Al Dashboard se llega por navegación interna, nunca por una dirección externa configurada

Toda entrada de la interfaz que lleve al usuario a los resultados SHALL ser navegación interna dentro de la aplicación: SHALL NOT abrir una pestaña nueva, SHALL NOT apuntar a un origen distinto del de la aplicación y SHALL NOT leer su destino de una variable de configuración de entorno.

Esto SHALL valer al menos para la entrada "Dashboard" de la barra de navegación —en su presentación de escritorio y en la de dispositivos angostos— y para la salida secundaria hacia los resultados que ofrece la pantalla de espera posterior a un escaneo aceptado.

#### Scenario: La entrada de la barra de navegación es interna

- **WHEN** se activa la entrada "Dashboard" de la barra de navegación
- **THEN** la aplicación navega a la ruta interna de resultados sin recargar el documento y sin abrir una pestaña nueva

#### Scenario: La salida de la pantalla de espera es interna

- **WHEN** se activa la salida hacia los resultados desde la pantalla de espera posterior a un escaneo aceptado
- **THEN** la aplicación navega a la ruta interna de resultados, en la misma pestaña

#### Scenario: Ninguna entrada al Dashboard lee una dirección de entorno

- **WHEN** se inspeccionan los destinos de las entradas de la interfaz que llevan a los resultados
- **THEN** ninguno proviene de una variable de configuración de entorno: todos son la ruta interna

### Requirement: La pantalla ofrece tres vistas sobre el mismo conjunto de datos

La pantalla SHALL ofrecer tres vistas conmutables sobre el mismo conjunto de datos ya cargado: un panel general con los indicadores y los gráficos, un listado de los endpoints más afectados, y el detalle completo de las vulnerabilidades. Exactamente una SHALL estar activa en todo momento, y el panel general SHALL ser la vista inicial.

Conmutar de vista SHALL NOT provocar una nueva solicitud de datos ni SHALL restablecer los filtros aplicados: las tres vistas leen el mismo conjunto vigente.

#### Scenario: Vista inicial

- **WHEN** la pantalla de resultados termina de cargar por primera vez
- **THEN** la vista activa es el panel general

#### Scenario: Conmutar de vista

- **WHEN** se selecciona la vista de endpoints más afectados
- **THEN** esa vista pasa a ser la activa y las otras dos dejan de mostrarse

#### Scenario: Conmutar no recarga los datos

- **WHEN** se conmuta entre las tres vistas con filtros ya aplicados
- **THEN** no se emite ninguna solicitud nueva al servicio y los filtros vigentes se conservan

#### Scenario: Una sola vista activa

- **WHEN** se inspecciona la pantalla en cualquier momento
- **THEN** hay exactamente una vista activa, y el control de vistas indica cuál es

### Requirement: La pantalla ofrece tres filtros que acotan los datos consultados

La pantalla SHALL ofrecer tres controles de filtrado: por escaneo, por severidad y por herramienta de origen. Cada uno SHALL tener una opción que representa "sin filtrar", y esa SHALL ser la selección inicial de los tres.

Las opciones del filtro por escaneo SHALL derivarse de los escaneos efectivamente devueltos por el servicio —no de una lista fija— y cada opción SHALL identificar su escaneo por fecha, hora y URL objetivo, de modo que el usuario pueda distinguir dos escaneos del mismo objetivo. Los filtros por severidad y por herramienta SHALL ofrecer las opciones conocidas del sistema.

Cambiar cualquier filtro SHALL provocar una consulta nueva de los datos acotada por los filtros vigentes, y el resultado SHALL reflejarse en las tres vistas.

#### Scenario: Selección inicial sin filtrar

- **WHEN** la pantalla de resultados termina de cargar por primera vez
- **THEN** los tres filtros están en su opción "sin filtrar" y se muestran todos los datos

#### Scenario: Las opciones de escaneo salen de los datos

- **WHEN** el servicio devuelve un conjunto de escaneos
- **THEN** el filtro por escaneo ofrece una opción por cada escaneo devuelto, además de la opción "sin filtrar", y ninguna opción de un escaneo que no exista

#### Scenario: Cada opción de escaneo es distinguible

- **WHEN** dos escaneos comparten la misma URL objetivo y difieren en su fecha
- **THEN** sus opciones son distinguibles entre sí: cada una muestra fecha, hora y URL objetivo

#### Scenario: Cambiar un filtro reconsulta

- **WHEN** se cambia la severidad seleccionada
- **THEN** se emite una consulta nueva acotada por los filtros vigentes y la pantalla pasa a mostrar su resultado

#### Scenario: Volver a "sin filtrar" restablece el conjunto completo

- **WHEN** se devuelve un filtro a su opción "sin filtrar"
- **THEN** se emite una consulta nueva sin ese filtro y vuelven a mostrarse los datos que ese filtro excluía

### Requirement: La pantalla comunica su estado de carga, de fallo y de conjunto vacío

Mientras la primera consulta está en curso y todavía no hay datos que mostrar, la pantalla SHALL informar que está cargando. Si la consulta falla, la pantalla SHALL mostrar un mensaje de error en español dirigido al usuario, y SHALL NOT quedar en blanco ni mostrar indefinidamente el estado de carga. El mensaje de error SHALL NOT exponer detalles de infraestructura —dirección del servicio, texto de consulta, traza técnica— ni el mensaje crudo del cliente HTTP.

Cuando la consulta tiene éxito pero los filtros vigentes no dejan ninguna vulnerabilidad, cada vista SHALL mostrar un aviso explícito de que no hay resultados con los filtros actuales, en lugar de un gráfico vacío o una tabla sin filas. Ese estado SHALL NOT tratarse como un error, y los controles de filtrado SHALL seguir operables para que el usuario pueda ensanchar la búsqueda.

#### Scenario: Primera carga en curso

- **WHEN** la primera consulta de datos está en curso y aún no hay datos
- **THEN** la pantalla informa que está cargando

#### Scenario: La consulta falla

- **WHEN** la consulta de datos se rechaza
- **THEN** la pantalla muestra un mensaje de error en español y deja de indicar carga en curso

#### Scenario: El error no expone detalles de infraestructura

- **WHEN** se inspecciona el mensaje de error mostrado al usuario
- **THEN** no contiene la dirección del servicio, texto de consulta, ni el mensaje crudo del cliente HTTP

#### Scenario: Sin vulnerabilidades con los filtros vigentes

- **WHEN** la consulta tiene éxito y devuelve cero vulnerabilidades
- **THEN** la vista activa muestra un aviso de que no hay resultados con los filtros actuales, y no un error

#### Scenario: Los filtros siguen operables sin resultados

- **WHEN** la pantalla está mostrando el aviso de conjunto vacío
- **THEN** los tres controles de filtrado siguen presentes y operables

### Requirement: El detalle completo permite inspeccionar una vulnerabilidad

En la vista de detalle completo, cada vulnerabilidad SHALL mostrarse como una fila con su herramienta de origen, su tipo, su severidad, su identificador CWE, su evidencia y la URL afectada. Un campo ausente o vacío SHALL representarse con un marcador explícito, nunca con un hueco que el usuario no pueda interpretar.

Activar una fila SHALL abrir una vista de detalle de esa vulnerabilidad con su tipo, severidad, herramienta de origen, identificador CWE, URL afectada, descripción, solución sugerida y evidencia. Cuando la descripción, la solución o la evidencia no están disponibles, el detalle SHALL decirlo explícitamente en lugar de mostrar un espacio en blanco.

El detalle SHALL poder cerrarse y devolver al usuario a la vista de detalle completo con sus filtros intactos, y cerrarlo SHALL NOT provocar una consulta nueva.

#### Scenario: Columnas de la tabla de detalle

- **WHEN** la vista de detalle completo muestra una vulnerabilidad
- **THEN** su fila expone herramienta de origen, tipo, severidad, identificador CWE, evidencia y URL afectada

#### Scenario: Campo ausente en la tabla

- **WHEN** una vulnerabilidad no tiene identificador CWE ni evidencia registrada
- **THEN** su fila muestra un marcador explícito en esas columnas, no una celda vacía

#### Scenario: Abrir el detalle de una vulnerabilidad

- **WHEN** se activa la fila de una vulnerabilidad
- **THEN** se abre su detalle, con su descripción, su solución sugerida y su evidencia además de sus metadatos

#### Scenario: Detalle con campos no disponibles

- **WHEN** se abre el detalle de una vulnerabilidad sin descripción, sin solución y sin evidencia
- **THEN** el detalle indica explícitamente que cada uno de esos datos no está disponible

#### Scenario: Cerrar el detalle

- **WHEN** se cierra el detalle abierto
- **THEN** el usuario vuelve a la vista de detalle completo con los mismos filtros vigentes, sin que se emita una consulta nueva

### Requirement: La pantalla de resultados es pública y no distingue entre usuarios

La pantalla de resultados SHALL ser alcanzable sin sesión iniciada, SHALL mostrar el mismo conjunto de escaneos y vulnerabilidades a cualquier visitante, y SHALL NOT anteponer un muro de autenticación, un formulario de acceso ni un mensaje de sesión requerida. El estado de sesión de la aplicación SHALL NOT participar de lo que la pantalla muestra ni de lo que consulta.

Este comportamiento replica exactamente el del dashboard standalone que la pantalla reemplaza y es una decisión explícita del propietario del producto, coherente con que la operación del servicio sea pública (`dashboard-endpoint`). Cerrar el acceso es un cambio de producto que corresponde a un change propio.

#### Scenario: Sin sesión iniciada

- **WHEN** se visita la pantalla de resultados sin sesión iniciada
- **THEN** la pantalla muestra los resultados, y no un muro de autenticación ni un formulario de acceso

#### Scenario: Con sesión iniciada

- **WHEN** se visita la pantalla de resultados con sesión iniciada
- **THEN** muestra exactamente el mismo conjunto de datos que sin sesión

#### Scenario: La pantalla no lee el estado de sesión

- **WHEN** se inspeccionan las dependencias de la pantalla de resultados y de sus piezas
- **THEN** ninguna lee el estado de sesión de la aplicación para decidir qué mostrar ni qué consultar

### Requirement: La pantalla respeta la dirección de las capas y no filtra configuración de entorno

La pantalla de resultados y todas sus piezas SHALL respetar la dirección única de dependencias entre capas de la aplicación: ninguna pieza SHALL importar de una capa anterior a la propia. La derivación de indicadores SHALL vivir en la capa de dominio, la obtención de datos en la de funcionalidad, la presentación en widgets, y la composición en la página; ninguna SHALL leer las variables de entorno por su cuenta.

El contenido textual fijo de la pantalla —rótulos de vistas, títulos de secciones, encabezados de tabla, opciones de filtro y mensajes de estado— SHALL declararse como datos en la capa correspondiente, no como literales dispersos en el marcado, del mismo modo que el resto de las pantallas de la aplicación.

#### Scenario: Sin violaciones de frontera

- **WHEN** se verifican las fronteras de importación entre capas sobre el árbol de la aplicación con la pantalla de resultados incorporada
- **THEN** no hay ninguna violación: ninguna pieza importa de una capa anterior a la suya

#### Scenario: Sin lectura directa de entorno

- **WHEN** se buscan lecturas directas de las variables de entorno en el árbol de la aplicación
- **THEN** la única sigue estando en la puerta única de configuración: ninguna pieza de la pantalla de resultados lee entorno por su cuenta

#### Scenario: El contenido fijo está declarado como datos

- **WHEN** se inspecciona el marcado de las piezas de la pantalla de resultados
- **THEN** los rótulos, encabezados y mensajes provienen de estructuras de datos declaradas, no de literales escritos en el marcado

### Requirement: Montar la pantalla de resultados no ensucia la consola

Montar la pantalla de resultados completa SHALL NOT emitir advertencias ni errores por la consola del navegador. En particular, la pantalla SHALL NOT registrar por consola los datos recibidos del servicio: el dashboard standalone que reemplaza volcaba la respuesta completa en cada carga, y esa respuesta contiene URLs objetivo y evidencias de vulnerabilidades de todos los usuarios.

#### Scenario: Consola limpia al montar

- **WHEN** se monta la pantalla de resultados con datos disponibles
- **THEN** no se emite ninguna advertencia ni error por consola

#### Scenario: Los datos recibidos no se vuelcan por consola

- **WHEN** la consulta de datos se resuelve con éxito
- **THEN** ni la respuesta ni ninguna parte de ella se registra por consola
