## Purpose

Define qué indicadores y series se derivan de la respuesta de la consulta de resultados y con qué reglas exactas: el conteo de escaneos, el total de vulnerabilidades y el de críticas, la distribución por severidad, la evolución histórica por escaneo y el ranking de endpoints más afectados, más la normalización de capitalización de severidad que la presentación necesita. Es comportamiento puro sobre datos ya recibidos: no consulta nada por red y no decide cómo se dibuja, sólo qué números salen de qué datos.

## ADDED Requirements

### Requirement: La severidad se normaliza a capitalización inicial para la presentación

El servicio devuelve la severidad con la capitalización con que está almacenada, que es minúscula (`dashboard-projection`). La derivación de indicadores SHALL normalizar cada severidad recibida a capitalización inicial —primera letra en mayúscula, resto tal cual llega— y SHALL usar esa forma normalizada de manera consistente en todos los indicadores, series y comparaciones que produce.

La normalización SHALL aplicarse a cualquier valor de severidad recibido, incluidos los que el sistema no enumera. Una vulnerabilidad sin severidad registrada SHALL agruparse bajo una categoría explícita de severidad desconocida, en vez de descartarse en silencio o de romper la derivación.

#### Scenario: Severidad almacenada en minúsculas

- **WHEN** una vulnerabilidad llega con severidad `critical`
- **THEN** los indicadores la cuentan como `Critical`

#### Scenario: Severidad ya capitalizada

- **WHEN** una vulnerabilidad llega con severidad `Critical`
- **THEN** los indicadores la cuentan como `Critical`: normalizar dos veces da el mismo resultado

#### Scenario: Severidad desconocida para el sistema

- **WHEN** una vulnerabilidad llega con una severidad que el sistema no enumera
- **THEN** aparece en la distribución con su propia etiqueta normalizada, sin descartarse y sin interrumpir el cálculo del resto

#### Scenario: Severidad ausente

- **WHEN** una vulnerabilidad llega sin severidad registrada
- **THEN** se agrupa bajo una categoría explícita de severidad desconocida y sigue contando en el total de vulnerabilidades

### Requirement: Los indicadores principales son el conteo de escaneos, el total de vulnerabilidades y el de críticas

La derivación SHALL producir tres indicadores principales sobre el conjunto vigente:

- **Escaneos**: cuando no hay un escaneo seleccionado, la cantidad de escaneos devueltos por el servicio; cuando hay uno seleccionado, la identificación de ese escaneo, porque contar "todos los escaneos" mientras se mira uno solo describiría un conjunto distinto del que la pantalla muestra. El rótulo del indicador SHALL reflejar cuál de los dos casos aplica.
- **Total de vulnerabilidades**: la cantidad de vulnerabilidades del conjunto vigente, ya acotado por los filtros.
- **Críticas**: la cantidad de vulnerabilidades del conjunto vigente cuya severidad normalizada es `Critical`.

Los tres SHALL calcularse sobre el conjunto que la pantalla está mostrando, no sobre uno anterior.

#### Scenario: Sin escaneo seleccionado

- **WHEN** no hay ningún escaneo seleccionado y el servicio devolvió varios escaneos
- **THEN** el indicador de escaneos vale la cantidad de escaneos devueltos, con el rótulo correspondiente al conjunto completo

#### Scenario: Con un escaneo seleccionado

- **WHEN** hay un escaneo seleccionado
- **THEN** el indicador de escaneos identifica a ese escaneo, con el rótulo correspondiente al escaneo analizado, en vez de contar todos

#### Scenario: Total de vulnerabilidades del conjunto vigente

- **WHEN** los filtros vigentes dejan un conjunto de vulnerabilidades
- **THEN** el total vale exactamente la cantidad de elementos de ese conjunto

#### Scenario: Conteo de críticas

- **WHEN** el conjunto vigente contiene vulnerabilidades de severidades mezcladas
- **THEN** el indicador de críticas cuenta únicamente las de severidad normalizada `Critical`, y ninguna de otra severidad

#### Scenario: Conjunto vacío

- **WHEN** el conjunto vigente no contiene ninguna vulnerabilidad
- **THEN** el total y el conteo de críticas valen cero, y la derivación no falla

### Requirement: La distribución por severidad cuenta una entrada por severidad presente

La derivación SHALL producir una distribución con una entrada por cada severidad presente en el conjunto vigente, cada una con su etiqueta normalizada y la cantidad de vulnerabilidades que la tienen. La suma de las cantidades SHALL igualar el total de vulnerabilidades del conjunto: ninguna vulnerabilidad SHALL contarse dos veces ni quedar fuera.

Una severidad sin vulnerabilidades en el conjunto vigente SHALL NOT aparecer en la distribución con valor cero: la distribución describe lo que hay, no el catálogo de severidades posibles.

#### Scenario: Una entrada por severidad presente

- **WHEN** el conjunto vigente tiene vulnerabilidades de tres severidades distintas
- **THEN** la distribución tiene exactamente tres entradas, una por severidad, con sus cantidades

#### Scenario: La distribución suma el total

- **WHEN** se suman las cantidades de todas las entradas de la distribución
- **THEN** el resultado es igual al total de vulnerabilidades del conjunto vigente

#### Scenario: Severidad sin ocurrencias

- **WHEN** ninguna vulnerabilidad del conjunto vigente tiene severidad `Low`
- **THEN** la distribución no incluye una entrada `Low` con valor cero

#### Scenario: Conjunto vacío

- **WHEN** el conjunto vigente no contiene ninguna vulnerabilidad
- **THEN** la distribución viene vacía, sin entradas

### Requirement: La evolución histórica recorre todos los escaneos en orden cronológico

La derivación SHALL producir una serie temporal con un punto por cada escaneo devuelto por el servicio, ordenados de más antiguo a más reciente. El valor de cada punto SHALL ser la cantidad de vulnerabilidades del conjunto vigente que pertenecen a ese escaneo.

La serie SHALL incluir los escaneos que no aportan ninguna vulnerabilidad al conjunto vigente, con valor cero: omitirlos ocultaría un escaneo que efectivamente ocurrió y distorsionaría la lectura de la evolución.

Cada punto SHALL llevar una etiqueta legible derivada de la fecha y hora del escaneo. La derivación SHALL interpretar la fecha tal como el servicio la emite y SHALL producir etiquetas estables: dos escaneos con fechas distintas SHALL producir etiquetas distinguibles.

#### Scenario: Un punto por escaneo, en orden

- **WHEN** el servicio devuelve varios escaneos con fechas distintas
- **THEN** la serie tiene un punto por cada uno, ordenados de fecha más antigua a más reciente

#### Scenario: Escaneo sin vulnerabilidades en el conjunto vigente

- **WHEN** un escaneo devuelto no aporta ninguna vulnerabilidad al conjunto vigente
- **THEN** su punto figura igual en la serie, con valor cero

#### Scenario: El valor de un punto cuenta sólo sus vulnerabilidades

- **WHEN** el conjunto vigente contiene vulnerabilidades de varios escaneos
- **THEN** el valor de cada punto cuenta únicamente las que pertenecen a su escaneo, y la suma de todos los puntos iguala el total del conjunto

#### Scenario: Escaneos con la misma fecha nominal

- **WHEN** dos escaneos ocurrieron el mismo día a horas distintas
- **THEN** sus etiquetas son distinguibles entre sí: la etiqueta incluye la hora, no sólo el día

#### Scenario: Sin escaneos

- **WHEN** el servicio no devuelve ningún escaneo
- **THEN** la serie viene vacía y la derivación no falla

### Requirement: El ranking de endpoints ordena las URLs por cantidad de hallazgos

La derivación SHALL producir un ranking con una entrada por cada URL distinta presente en el conjunto vigente de vulnerabilidades, cada una con la cantidad de vulnerabilidades registradas sobre esa URL, ordenadas de mayor a menor cantidad. La suma de las cantidades SHALL igualar el total de vulnerabilidades del conjunto.

Las URLs SHALL compararse tal como llegan, sin normalizar ni agrupar por prefijo: agrupar dos rutas distintas del mismo host cambiaría el hallazgo que el ranking reporta.

#### Scenario: Ordenamiento descendente

- **WHEN** el conjunto vigente tiene vulnerabilidades repartidas de forma desigual entre varias URLs
- **THEN** el ranking las lista de mayor a menor cantidad de hallazgos

#### Scenario: El ranking suma el total

- **WHEN** se suman las cantidades de todas las entradas del ranking
- **THEN** el resultado es igual al total de vulnerabilidades del conjunto vigente

#### Scenario: URLs distintas no se agrupan

- **WHEN** el conjunto vigente contiene vulnerabilidades sobre dos rutas distintas del mismo host
- **THEN** el ranking las reporta como dos entradas separadas, no como una sola

#### Scenario: Conjunto vacío

- **WHEN** el conjunto vigente no contiene ninguna vulnerabilidad
- **THEN** el ranking viene vacío, sin entradas

### Requirement: La derivación es pura y tolera datos incompletos

La derivación de indicadores SHALL ser una transformación pura de la respuesta recibida: SHALL NOT emitir solicitudes de red, SHALL NOT leer ni escribir estado externo, SHALL NOT mutar los datos que recibe, y SHALL producir el mismo resultado ante la misma entrada, cuantas veces se la invoque.

La derivación SHALL tolerar una respuesta incompleta sin interrumpirse: campos ausentes, colecciones vacías, una vulnerabilidad cuyo escaneo no figura entre los devueltos, o campos adicionales que el sistema no enumera. Ninguna de esas situaciones SHALL producir un fallo; la derivación SHALL degradar el indicador afectado, no la pantalla entera.

#### Scenario: No muta su entrada

- **WHEN** se deriva sobre una respuesta y luego se inspecciona esa respuesta
- **THEN** su contenido es idéntico al de antes de la derivación

#### Scenario: Determinismo

- **WHEN** se deriva dos veces sobre la misma respuesta
- **THEN** ambos resultados son iguales

#### Scenario: Vulnerabilidad huérfana

- **WHEN** una vulnerabilidad referencia un escaneo que no figura entre los devueltos
- **THEN** sigue contando en el total, en la distribución y en el ranking, y la serie temporal se calcula sin fallar

#### Scenario: Campos adicionales no enumerados

- **WHEN** la respuesta trae campos que el sistema no enumera
- **THEN** la derivación los ignora sin fallar y produce los mismos indicadores que sin ellos

#### Scenario: Respuesta con colecciones vacías

- **WHEN** la respuesta trae ambas colecciones vacías
- **THEN** todos los indicadores valen su valor neutro y la derivación no falla
