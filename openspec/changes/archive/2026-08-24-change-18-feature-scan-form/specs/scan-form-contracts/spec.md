## MODIFIED Requirements

### Requirement: Forma de los datos del escaneo en el cliente

El frontend SHALL declarar en un único lugar la forma de los datos del escaneo que maneja: el formulario de escaneo (URL objetivo, sesión PHPSESSID, nivel de SQLMap, riesgo de SQLMap y aceptación ética), el cuerpo que viaja al Bridge, la respuesta de aceptación del Bridge (identificador de escaneo, estado y mensaje) y el error de la API (los cinco miembros de RFC 7807).

El error de la API SHALL resolver al contrato de error compartido del frontend (`http-client`), declarado una sola vez para todos los dominios, y SHALL NOT enumerar sus cinco miembros dentro de la slice: la misma forma declarada dos veces en dos slices es una divergencia esperando ocurrir, y el mecanismo que la vigilaba quedaba fuera del alcance de compilación del proyecto. La slice SHALL seguir exponiéndolo por su nombre de dominio a través de su API pública, de modo que sus consumidores no cambien.

Los nombres de los miembros SHALL ser exactamente los que usa el Bridge en el cable —en `snake_case` cuando así viajan—, sin renombrado a la convención de TypeScript: un renombrado silencioso convierte un contrato verificable en una traducción que nadie ejercita hasta que rompe en runtime.

La declaración de la respuesta de aceptación y la del error SHALL ser tipos, no validadores de runtime: describen datos, no los parsean. El reconocimiento en runtime de un cuerpo de error recibido es responsabilidad del cliente HTTP, no de esta slice.

#### Scenario: Los cuatro contratos existen y son importables

- **WHEN** se importa el modelo de escaneo desde la API pública de la slice de escaneo
- **THEN** están disponibles el contrato del formulario, el del cuerpo que viaja al Bridge, el de la respuesta de aceptación y el del error de la API

#### Scenario: Los miembros conservan el nombre del cable

- **WHEN** se tipa el cuerpo de una solicitud de escaneo
- **THEN** sus miembros son `target_url`, `phpsessid`, `sqlmap_level` y `sqlmap_risk`, y NO variantes en `camelCase`

#### Scenario: La respuesta de aceptación solo admite el estado encolado

- **WHEN** se tipa una respuesta de aceptación del Bridge
- **THEN** declara `scan_id`, `status` y `message`, y `status` admite exactamente el valor `queued` y ningún otro

#### Scenario: El error de la API es espejo del Problem Details del Bridge

- **WHEN** se tipa un cuerpo de error recibido del Bridge
- **THEN** declara los cinco miembros de RFC 7807 (`type`, `title`, `status`, `detail`, `instance`), y `detail` admite ausencia de valor porque el Bridge lo emite nulo cuando el código de estado y el título ya son suficientes

#### Scenario: El error de la API es el contrato compartido, no una copia

- **WHEN** se inspecciona la declaración del error de la API de la slice de escaneo
- **THEN** resuelve al contrato de error compartido del frontend, y no enumera los cinco miembros por su cuenta

#### Scenario: Los consumidores siguen importándolo desde la slice

- **WHEN** un consumidor necesita tipar un error del escaneo
- **THEN** lo obtiene de la API pública de la slice de escaneo bajo el nombre del dominio, sin necesidad de conocer dónde vive la declaración

### Requirement: La slice de escaneo es un modelo puro expuesto por una API pública

El modelo de escaneo del cliente SHALL ser puro: SHALL NOT depender de React, de un cliente HTTP, del almacenamiento del navegador ni del estado de sesión, y SHALL poder ejecutarse fuera de un navegador. Referenciar el **tipo** del contrato de error compartido NO SHALL considerarse una dependencia de un cliente HTTP: es una declaración de datos que se borra al compilar y no arrastra ningún código de red a la slice. SHALL NOT importar de ninguna capa superior a la de entidades.

Los consumidores SHALL acceder al modelo de escaneo a través de la API pública de la slice, y SHALL NOT importar sus módulos internos por ruta profunda.

#### Scenario: La slice no arrastra dependencias de interfaz ni de red

- **WHEN** se inspeccionan las dependencias de los módulos del modelo de escaneo
- **THEN** ninguno importa React, el estado de sesión ni el almacenamiento del navegador, y ninguno incorpora código de red al bundle

#### Scenario: La slice respeta la dirección de las capas

- **WHEN** se inspeccionan los imports de los módulos del modelo de escaneo
- **THEN** ninguno importa de las capas de aplicación, páginas, widgets o features

#### Scenario: Los consumidores importan desde la API pública

- **WHEN** un consumidor necesita el schema de validación o los tipos del escaneo
- **THEN** los obtiene de la API pública de la slice, no de una ruta interna de su modelo
