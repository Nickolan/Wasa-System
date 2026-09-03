## Purpose

Define cómo la Landing le pide al FastAPI Bridge el estado consolidado de escaneos y vulnerabilidades: por qué cliente y a qué ruta, cómo se traducen los filtros de la interfaz a parámetros de consulta, qué forma se asume —y cuál no— sobre la respuesta, y qué recibe quien llama cuando la consulta se rechaza. Es el borde de red de la pantalla de resultados; `dashboard-screen` describe lo que el usuario ve y `dashboard-metrics` lo que se deriva de los datos.

## Requirements

### Requirement: La consulta viaja por el único cliente HTTP de la aplicación, contra el Bridge

La consulta de resultados SHALL emitirse a través del único cliente HTTP compartido de la Landing, el mismo que usan el resto de las operaciones contra el Bridge, y SHALL dirigirse a la operación de consulta de resultados del Bridge por su ruta versionada.

La dirección de destino SHALL derivarse de la configuración del cliente compartido: el módulo que emite la consulta SHALL NOT declarar un host, un puerto ni un origen propios, SHALL NOT leer ninguna variable de entorno por su cuenta y SHALL NOT construir una dirección absoluta. El dashboard standalone que esta consulta reemplaza apuntaba a una dirección de desarrollo escrita en el código, y eliminar esa clase de dirección es una de las condiciones de la unificación.

#### Scenario: La consulta sale por el cliente compartido

- **WHEN** se emite la consulta de resultados
- **THEN** viaja por el cliente HTTP compartido de la aplicación, no por una instancia propia ni por el mecanismo de red del navegador usado directamente

#### Scenario: Verbo y ruta

- **WHEN** se emite la consulta de resultados
- **THEN** es una lectura sobre la ruta versionada de consulta de resultados del Bridge

#### Scenario: Sin direcciones escritas en el código

- **WHEN** se inspecciona el módulo que emite la consulta
- **THEN** no contiene ningún host, puerto ni origen literal, ni lee variables de entorno: la dirección sale de la configuración del cliente compartido

### Requirement: Los filtros de la interfaz se traducen a parámetros de consulta, y los ausentes no viajan

La consulta SHALL admitir los tres filtros de la interfaz —escaneo, severidad y herramienta de origen— y SHALL enviarlos como los parámetros de consulta que la operación del Bridge declara. Un filtro sin seleccionar SHALL NOT viajar: SHALL omitirse del pedido, no enviarse con valor vacío, para que el Bridge lo trate como ausente sin depender de su tolerancia a cadenas vacías.

El identificador de escaneo SHALL viajar como un valor numérico, coherente con lo que la operación del Bridge acepta. Los valores de severidad y de herramienta SHALL viajar tal como la interfaz los ofrece, sin transformarlos: la conversión de capitalización de la severidad la hace el Bridge, y la herramienta de origen es sensible a mayúsculas.

#### Scenario: Sin ningún filtro seleccionado

- **WHEN** se emite la consulta con los tres filtros sin seleccionar
- **THEN** el pedido no lleva ninguno de los tres parámetros de consulta

#### Scenario: Un solo filtro seleccionado

- **WHEN** se emite la consulta con únicamente la severidad seleccionada
- **THEN** el pedido lleva sólo el parámetro de severidad; los otros dos no aparecen, ni siquiera con valor vacío

#### Scenario: Los tres filtros seleccionados

- **WHEN** se emite la consulta con los tres filtros seleccionados
- **THEN** el pedido lleva los tres parámetros con sus valores

#### Scenario: El identificador de escaneo viaja como número

- **WHEN** se emite la consulta con un escaneo seleccionado
- **THEN** el parámetro de escaneo lleva su identificador numérico, no una representación que la operación del Bridge rechazaría

#### Scenario: Los valores de texto viajan sin transformar

- **WHEN** se emite la consulta con la severidad `Critical` y la herramienta `SQLMap (Worker)` seleccionadas
- **THEN** ambos valores viajan exactamente así, sin cambiar su capitalización

### Requirement: La consulta no adjunta credenciales propias y tolera que no haya sesión

El módulo que emite la consulta SHALL NOT adjuntar ninguna credencial de sesión a mano, SHALL NOT leer el estado de sesión de la aplicación y SHALL NOT condicionar el pedido a que exista una sesión iniciada. La operación del Bridge es pública (`dashboard-endpoint`): la consulta SHALL resolverse igual con sesión y sin ella.

Si el cliente compartido adjunta la credencial de sesión cuando existe —comportamiento general de la aplicación, no específico de esta consulta—, eso SHALL NOT alterar el resultado ni SHALL ser condición para obtenerlo.

#### Scenario: Sin sesión iniciada

- **WHEN** se emite la consulta sin sesión iniciada
- **THEN** el pedido se emite igual y su resultado es el mismo conjunto de datos

#### Scenario: El módulo no lee el estado de sesión

- **WHEN** se inspeccionan las dependencias del módulo que emite la consulta
- **THEN** no incluye el estado de sesión de la aplicación ni ninguna lectura de la credencial

### Requirement: La forma de la respuesta se asume abierta, no cerrada

La respuesta SHALL tratarse como dos colecciones —escaneos y vulnerabilidades— cuyos elementos pueden traer campos que la Landing no enumera y pueden omitir campos que sí enumera. El Bridge proyecta el esquema de las tablas compartidas tal como está (`dashboard-projection`), y ese esquema pertenece al sistema existente: puede incorporar columnas sin que la Landing se entere.

En consecuencia, la Landing SHALL NOT rechazar ni descartar un elemento por traer un campo desconocido, SHALL NOT fallar la carga porque un campo esperado venga ausente o nulo, y SHALL NOT validar la respuesta contra un conjunto cerrado de campos. Un campo ausente SHALL degradar únicamente lo que depende de él.

#### Scenario: Campo adicional no enumerado

- **WHEN** la respuesta trae un elemento con un campo que la Landing no enumera
- **THEN** el elemento se procesa igual, sin error y sin descartarse

#### Scenario: Campo esperado ausente

- **WHEN** la respuesta trae un elemento sin uno de los campos que la Landing enumera
- **THEN** la carga se completa y sólo se degrada lo que depende de ese campo

#### Scenario: Colecciones vacías

- **WHEN** la respuesta trae ambas colecciones vacías
- **THEN** la consulta se considera exitosa, no fallida

### Requirement: Un rechazo llega tipado a quien llama, sin inventar un cuerpo de error

Cuando la consulta se rechaza, quien la llamó SHALL recibir un fallo tipado que transporte el estado de la respuesta —o la indicación explícita de que nunca hubo respuesta, en un fallo de red— y el cuerpo de error del contrato de la API cuando el cuerpo recibido efectivamente tiene esa forma, o la indicación explícita de que no la tiene.

La Landing SHALL NOT fabricar un cuerpo de error a partir de una respuesta que no lo es —una página de error de un intermediario, un cuerpo vacío— ni SHALL propagar el error crudo del cliente HTTP hacia la interfaz.

#### Scenario: Rechazo con cuerpo del contrato de errores

- **WHEN** el Bridge rechaza la consulta con un cuerpo en el formato de problema de la API
- **THEN** quien llamó recibe un fallo tipado con el estado de la respuesta y ese cuerpo ya reconocido

#### Scenario: Rechazo con un cuerpo ajeno al contrato

- **WHEN** la consulta se rechaza con un cuerpo que no tiene la forma del contrato de errores
- **THEN** quien llamó recibe un fallo tipado con el estado de la respuesta y la indicación de que no hubo cuerpo del contrato, sin inventar uno

#### Scenario: Fallo de red sin respuesta

- **WHEN** la consulta falla sin que llegue ninguna respuesta
- **THEN** quien llamó recibe un fallo tipado que indica explícitamente que no hubo respuesta

#### Scenario: El error crudo no se propaga

- **WHEN** la consulta se rechaza por cualquiera de los caminos anteriores
- **THEN** lo que llega a quien llamó es el fallo tipado, no el error del cliente HTTP tal como lo produjo

### Requirement: Cada cambio de filtro consulta de nuevo y el resultado mostrado es el del último pedido

Un cambio en cualquiera de los tres filtros SHALL provocar una consulta nueva con los filtros vigentes. Cuando varios cambios se suceden más rápido de lo que el servicio responde, lo que la pantalla muestra SHALL corresponder al último conjunto de filtros pedido: una respuesta de un pedido anterior que llegue tarde SHALL NOT reemplazar a la del pedido vigente.

Mientras una consulta posterior está en curso, los datos ya mostrados SHALL permanecer visibles en lugar de vaciarse: sustituirlos por un estado de carga en cada cambio de filtro haría parpadear la pantalla entera.

#### Scenario: Cambiar un filtro reconsulta

- **WHEN** cambia el valor de cualquiera de los tres filtros
- **THEN** se emite una consulta nueva con los filtros vigentes

#### Scenario: Respuesta tardía de un pedido superado

- **WHEN** dos consultas se emiten en sucesión y la primera responde después de la segunda
- **THEN** lo que la pantalla muestra corresponde a los filtros de la segunda, no a los de la primera

#### Scenario: Los datos previos permanecen durante una recarga

- **WHEN** hay datos ya mostrados y se emite una consulta nueva por un cambio de filtro
- **THEN** los datos previos siguen visibles hasta que la respuesta nueva llega
