## ADDED Requirements

### Requirement: Forma de los datos de autenticación en el cliente

El frontend SHALL declarar en un único lugar la forma de los datos de autenticación que maneja: el formulario de registro (`email`, `password`, `confirmPassword`), el formulario de inicio de sesión (`email`, `password`), la respuesta exitosa del Bridge (`access_token`, `token_type`, `expires_in`) y el error de la API (`type`, `title`, `status`, `detail`, `instance`).

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

### Requirement: Ambos formularios exigen un email sintácticamente válido

Los schemas de validación de registro e inicio de sesión SHALL rechazar un email que no tenga forma de email, antes de cualquier llamada al Bridge. El rechazo SHALL identificar el campo `email` como el que falló, para que el formulario pueda situar el mensaje bajo ese campo y no como un error global.

#### Scenario: Email malformado en el login

- **WHEN** se valida un login con `email` igual a `"not-email"` y una contraseña no vacía
- **THEN** la validación falla e identifica a `email` como el campo en error

#### Scenario: Email malformado en el registro

- **WHEN** se valida un registro con un `email` sin arroba y el resto de los campos válidos
- **THEN** la validación falla e identifica a `email` como el campo en error

#### Scenario: Email válido

- **WHEN** se valida un formulario cuyo `email` es una dirección bien formada
- **THEN** la validación no reporta ningún error sobre `email`

### Requirement: La contraseña de registro exige un mínimo de 8 caracteres

El schema de registro SHALL rechazar toda contraseña de menos de 8 caracteres, codificando RN-WS-15 del lado del cliente. Esta validación SHALL ser una conveniencia de UX que anticipa el rechazo del Bridge, NO la garantía de la política: la garantía es el schema Pydantic del Bridge, que valida lo mismo con independencia del cliente.

#### Scenario: Contraseña de 7 caracteres

- **WHEN** se valida un registro con `password` y `confirmPassword` iguales a `"1234567"`
- **THEN** la validación falla e identifica a `password` como el campo en error

#### Scenario: Contraseña de exactamente 8 caracteres

- **WHEN** se valida un registro con una contraseña de exactamente 8 caracteres, confirmada correctamente
- **THEN** la validación pasa: 8 es el mínimo aceptado, no el primero rechazado

### Requirement: La contraseña tiene un techo de 72 bytes UTF-8 medido en bytes

Los schemas de registro y de inicio de sesión SHALL rechazar toda contraseña cuya codificación UTF-8 supere los 72 bytes, replicando el techo que el Bridge impone en `UserRegister` y `UserLogin` (límite duro del algoritmo bcrypt).

La medida SHALL ser el largo en **bytes** de la codificación UTF-8, NO el largo de la cadena en JavaScript: `String.prototype.length` cuenta unidades de código UTF-16 y subestima el tamaño real de todo carácter no ASCII, de modo que una contraseña de acentos o emojis pasaría la validación del formulario y sería rechazada por el Bridge con un 422 sin explicación visible bajo ningún campo.

El techo SHALL aplicarse también al inicio de sesión, no solo al registro: el Bridge lo aplica en ambos endpoints, y una contraseña por encima del techo escrita en el login produciría el mismo 422 opaco.

#### Scenario: Contraseña ASCII por encima del techo

- **WHEN** se valida un registro con una contraseña de 73 caracteres ASCII, confirmada correctamente
- **THEN** la validación falla e identifica a `password` como el campo en error

#### Scenario: Contraseña multibyte que el conteo de caracteres dejaría pasar

- **WHEN** se valida un registro con una contraseña de menos de 73 caracteres cuya codificación UTF-8 supera los 72 bytes (por ejemplo, una sucesión de emojis o de caracteres acentuados)
- **THEN** la validación falla igualmente, porque la medida es en bytes UTF-8 y no en unidades de código de JavaScript

#### Scenario: Contraseña de exactamente 72 bytes

- **WHEN** se valida un registro con una contraseña que codifica exactamente 72 bytes UTF-8
- **THEN** la validación pasa: 72 es el máximo aceptado, no el primero rechazado

#### Scenario: El techo también rige en el inicio de sesión

- **WHEN** se valida un login con un email válido y una contraseña que supera los 72 bytes UTF-8
- **THEN** la validación falla antes de llamar al Bridge

### Requirement: El inicio de sesión acepta cualquier contraseña no vacía

El schema de inicio de sesión SHALL exigir únicamente que la contraseña no esté vacía, y NO SHALL reassertar el mínimo de 8 caracteres del registro, replicando la asimetría deliberada del Bridge entre `UserLogin` y `UserRegister`.

Unificar ambas políticas "por simetría" tendría dos costos: le confirmaría al usuario —y a quien inspeccione el formulario— cuál es la política de longitud vigente, y dejaría fuera del login a cualquier cuenta creada bajo una política anterior más laxa, sin siquiera poder autenticarse para cambiar su contraseña.

#### Scenario: Contraseña de un solo carácter en el login

- **WHEN** se valida un login con un email válido y `password` igual a `"x"`
- **THEN** la validación pasa: la longitud mínima es materia del registro, no del login

#### Scenario: Contraseña vacía en el login

- **WHEN** se valida un login con un email válido y `password` igual a la cadena vacía
- **THEN** la validación falla e identifica a `password` como el campo en error

### Requirement: El registro exige que la confirmación coincida con la contraseña

El schema de registro SHALL rechazar todo formulario en el que `confirmPassword` no sea idéntico a `password`. El error resultante SHALL señalar al campo `confirmPassword`, no a `password` ni al formulario completo: el campo que el usuario debe corregir es el de confirmación, y un error sin campo asociado obliga al formulario a mostrarlo suelto, lejos del control que lo origina.

La confirmación SHALL exigirse además no vacía, de modo que un formulario enviado sin completar ese campo falle por su propia regla y no solo por la comparación.

#### Scenario: Confirmación distinta de la contraseña

- **WHEN** se valida un registro con `password` igual a `"pass1234"` y `confirmPassword` igual a `"diferente"`
- **THEN** la validación falla y el error queda asociado al campo `confirmPassword`

#### Scenario: Confirmación coincidente

- **WHEN** se valida un registro con un email válido y `password` y `confirmPassword` iguales a `"pass1234"`
- **THEN** la validación pasa sin errores

#### Scenario: Confirmación vacía

- **WHEN** se valida un registro con una contraseña válida y `confirmPassword` igual a la cadena vacía
- **THEN** la validación falla y el error queda asociado al campo `confirmPassword`

### Requirement: La confirmación de contraseña no viaja al Bridge

El contrato del cuerpo que se envía a `POST /auth/register` SHALL contener exactamente `email` y `password`, sin `confirmPassword`. El frontend SHALL declarar ese cuerpo como un tipo propio, derivado del modelo del formulario quitándole la confirmación, y no reutilizar el modelo del formulario como cuerpo de la petición.

Motivo: los schemas de entrada del Bridge prohíben campos desconocidos (`extra="forbid"`), de modo que enviar el modelo del formulario tal cual produciría un 422 en cada registro. `confirmPassword` es un control de la interfaz, no un dato del dominio.

#### Scenario: El cuerpo del registro declara solo dos miembros

- **WHEN** se inspecciona el contrato del cuerpo de la petición de registro
- **THEN** son exactamente `email` y `password`

#### Scenario: El modelo del formulario no es asignable al cuerpo de la petición sin quitar la confirmación

- **WHEN** se intenta usar el modelo del formulario de registro como cuerpo de la petición sin descartar `confirmPassword`
- **THEN** el sistema de tipos lo impide, en lugar de dejar que el campo extra llegue al Bridge

### Requirement: Paridad verificada con los contratos del Bridge

La política de contraseña del cliente SHALL declararse mediante constantes nombradas, en un único módulo compartido por ambos schemas, y NO SHALL repetirse como números literales dispersos en cada schema.

El proyecto SHALL verificar automáticamente que esos valores siguen coincidiendo con los del Bridge (`fastapi_bridge/schemas/auth_schemas.py`): el mínimo de caracteres y el techo de bytes del cliente SHALL contrastarse contra los del backend, de forma que un cambio de la política en un solo lado produzca un test rojo y no una divergencia silenciosa descubierta como un 422 en producción.

#### Scenario: La política vive en constantes compartidas

- **WHEN** se inspecciona cómo expresan los schemas de login y de registro el techo de bytes
- **THEN** ambos lo toman de la misma constante nombrada, y ninguno repite el número literal

#### Scenario: Una divergencia con el backend se detecta sola

- **WHEN** el Bridge cambia su mínimo de caracteres o su techo de bytes y el cliente no
- **THEN** la verificación de paridad falla, señalando qué valor dejó de coincidir

### Requirement: La slice de usuario es modelo puro, sin UI ni entrada/salida

La slice `entities/user` SHALL contener únicamente tipos y schemas de validación: NO SHALL importar React, ni componentes, ni el store de sesión, ni cliente HTTP alguno, ni acceder a `localStorage`. Sus schemas SHALL ser funciones puras de sus entradas, ejecutables fuera del navegador.

La slice SHALL exponer su contrato a través de una API pública única, de modo que los formularios que la consumen importen la slice y no rutas internas de sus módulos.

#### Scenario: Sin dependencias de interfaz ni de red

- **WHEN** se inspeccionan los imports de todos los módulos de la slice
- **THEN** no aparece React, ni ningún módulo de las capas `app`, `pages`, `widgets` o `features`, ni ningún cliente HTTP

#### Scenario: Validación ejecutable sin navegador

- **WHEN** se valida un formulario de registro sin que exista ningún DOM ni ninguna petición de red
- **THEN** la validación produce su resultado igual: no depende de nada del entorno del navegador

#### Scenario: Los consumidores importan la API pública de la slice

- **WHEN** un formulario necesita el schema de registro
- **THEN** lo obtiene del punto de entrada de la slice de usuario, sin alcanzar rutas internas de sus módulos
