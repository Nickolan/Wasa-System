## MODIFIED Requirements

### Requirement: Forma de los datos de autenticación en el cliente

El frontend SHALL declarar en un único lugar la forma de los datos de autenticación que maneja: el formulario de registro (`email`, `password`, `confirmPassword`), el formulario de inicio de sesión (`email`, `password`), la respuesta exitosa del Bridge (`access_token`, `token_type`, `expires_in`) y el error de la API (`type`, `title`, `status`, `detail`, `instance`).

El error de la API SHALL resolver al contrato de error compartido del frontend (`http-client`), declarado una sola vez para todos los dominios, y SHALL NOT enumerar sus cinco miembros dentro de la slice. La slice SHALL seguir exponiéndolo por su nombre de dominio a través de su API pública, de modo que sus consumidores no cambien.

Los nombres de los miembros de la respuesta de token y del error SHALL ser exactamente los que emite el Bridge —en `snake_case` cuando así viajan por el cable—, sin renombrado a la convención de TypeScript: un renombrado silencioso convierte un contrato verificable en una traducción que nadie ejercita hasta que rompe en runtime.

Estas declaraciones SHALL ser tipos, no validadores de runtime: describen datos, no los parsean.

#### Scenario: Los cuatro contratos existen y son importables

- **WHEN** se importa el modelo de autenticación desde la API pública de la slice de usuario
- **THEN** están disponibles los contratos del formulario de registro, del formulario de login, de la respuesta de token y del error de la API

#### Scenario: Los miembros del token conservan el nombre del cable

- **WHEN** se tipa una respuesta de token del Bridge
- **THEN** sus miembros son `access_token`, `token_type` y `expires_in`, y NO variantes en `camelCase`

#### Scenario: El error de la API es espejo del Problem Details del Bridge

- **WHEN** se tipa un cuerpo de error recibido del Bridge
- **THEN** declara los cinco miembros de RFC 7807 (`type`, `title`, `status`, `detail`, `instance`), y `detail` admite ausencia de valor porque el Bridge lo emite nulo cuando el código de estado y el título ya son suficientes

#### Scenario: El error de la API es el contrato compartido, no una copia

- **WHEN** se inspecciona la declaración del error de la API de la slice de usuario
- **THEN** resuelve al contrato de error compartido del frontend, el mismo al que resuelve el de la slice de escaneo, y no enumera los cinco miembros por su cuenta

### Requirement: La slice de usuario es modelo puro, sin UI ni entrada/salida

La slice `entities/user` SHALL contener únicamente tipos y schemas de validación: NO SHALL importar React, ni componentes, ni el store de sesión, ni cliente HTTP alguno, ni acceder a `localStorage`. Sus schemas SHALL ser funciones puras de sus entradas, ejecutables fuera del navegador.

Referenciar el **tipo** del contrato de error compartido de la capa compartida NO SHALL considerarse importar un cliente HTTP: es una declaración de datos que se borra al compilar y no incorpora código de red a la slice ni al bundle.

La slice SHALL exponer su contrato a través de una API pública única, de modo que los formularios que la consumen importen la slice y no rutas internas de sus módulos.

#### Scenario: Sin dependencias de interfaz ni de red

- **WHEN** se inspeccionan los imports de todos los módulos de la slice
- **THEN** no aparece React, ni ningún módulo de las capas `app`, `pages`, `widgets` o `features`, y ningún import incorpora código de un cliente HTTP al bundle

#### Scenario: Validación ejecutable sin navegador

- **WHEN** se valida un formulario de registro sin que exista ningún DOM ni ninguna petición de red
- **THEN** la validación produce su resultado igual: no depende de nada del entorno del navegador

#### Scenario: Los consumidores importan la API pública de la slice

- **WHEN** un formulario necesita el schema de registro
- **THEN** lo obtiene del punto de entrada de la slice de usuario, sin alcanzar rutas internas de sus módulos
