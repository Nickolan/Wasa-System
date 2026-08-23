## ADDED Requirements

### Requirement: Las operaciones de autenticación están montadas y son alcanzables
El FastAPI Bridge SHALL exponer dos operaciones de autenticación bajo el prefijo `/api/v1/auth`: `POST /api/v1/auth/register` y `POST /api/v1/auth/login`, declaradas en `fastapi_bridge/api/v1/auth/router.py` y montadas en la aplicación desde `create_app()`. El prefijo SHALL declararse una sola vez, en la construcción del `APIRouter`, y NO SHALL repetirse al montar el router. Ninguna otra ruta de aplicación SHALL agregarse en este estadio.

#### Scenario: Las dos rutas de auth existen
- **WHEN** se inspecciona el conjunto de rutas registradas en la aplicación, descartando las rutas internas del framework (`/docs`, `/openapi.json`, `/redoc`)
- **THEN** aparecen exactamente `GET /health`, `POST /api/v1/auth/register` y `POST /api/v1/auth/login`

#### Scenario: El prefijo no se duplica
- **WHEN** se hace una petición a `/api/v1/auth/api/v1/auth/register`
- **THEN** la respuesta es `404`: el prefijo se aplicó una sola vez

#### Scenario: El router de scan sigue sin montarse
- **WHEN** se hace `POST /api/v1/scan/start`
- **THEN** la respuesta sigue siendo `404`, porque ese router se monta en su propio change

#### Scenario: Método no permitido sobre una ruta existente
- **WHEN** se hace `GET /api/v1/auth/login`
- **THEN** la respuesta es `405` y su cuerpo está en formato RFC 7807, igual que cualquier otro error de la API

### Requirement: El registro crea el usuario y devuelve un token
`POST /api/v1/auth/register` SHALL recibir un cuerpo JSON con el contrato de registro de usuario, SHALL delegar la operación completa en el servicio de auth, y ante el camino feliz SHALL responder `201 Created` con el contrato de respuesta de token. La respuesta NO SHALL incluir la contraseña, su hash, ni ningún eco del usuario creado (RN-WS-12). El cuerpo de la petición SHALL viajar como JSON, NO como formulario codificado.

#### Scenario: Registro exitoso
- **WHEN** se hace `POST /api/v1/auth/register` con un email no registrado y una contraseña de al menos 8 caracteres
- **THEN** la respuesta es `201` y su cuerpo contiene un token de acceso, el tipo `bearer` y una duración en segundos mayor que cero

#### Scenario: El token devuelto identifica al usuario registrado
- **WHEN** se decodifica el token de acceso devuelto por un registro exitoso
- **THEN** su sujeto es el email con el que quedó persistido el usuario

#### Scenario: El usuario queda efectivamente persistido
- **WHEN** se registra un usuario y luego se consulta la persistencia por ese email
- **THEN** existe la fila correspondiente, con un hash almacenado distinto de la contraseña enviada

#### Scenario: La respuesta no filtra material sensible
- **WHEN** se inspecciona el cuerpo completo de una respuesta de registro exitoso
- **THEN** no contiene la contraseña enviada, ni el hash almacenado, ni ningún campo del usuario más allá del token, su tipo y su duración

### Requirement: El email ya registrado se rechaza con 409
Cuando el email recibido ya esté registrado, `POST /api/v1/auth/register` SHALL responder `409 Conflict` con un cuerpo en formato RFC 7807, y NO SHALL crear un segundo usuario. La traducción del error de dominio de email duplicado a ese estado SHALL ocurrir en el manejador global de errores de dominio; la capa de transporte NO SHALL capturarlo ni construir esa respuesta por su cuenta.

#### Scenario: Registro con email duplicado
- **WHEN** se registra un email que ya existe
- **THEN** la respuesta es `409`, su `Content-Type` es `application/problem+json` y su cuerpo trae `type`, `title`, `status`, `detail` e `instance`

#### Scenario: El campo instance identifica el endpoint
- **WHEN** se inspecciona el cuerpo del `409`
- **THEN** su campo `instance` es `/api/v1/auth/register` y su campo `status` es `409`, coherente con el estado de la respuesta

#### Scenario: No queda un segundo usuario
- **WHEN** un registro es rechazado por email duplicado
- **THEN** la persistencia sigue teniendo una sola fila para ese email

#### Scenario: Otra capitalización del mismo email también colisiona
- **WHEN** existe `user@test.com` y se registra `USER@TEST.COM`
- **THEN** la respuesta es `409`, no `201`

### Requirement: El inicio de sesión verifica credenciales y devuelve un token
`POST /api/v1/auth/login` SHALL recibir un cuerpo JSON con el contrato de inicio de sesión, SHALL delegar la verificación en el servicio de auth, y ante credenciales correctas SHALL responder `200 OK` con el contrato de respuesta de token. La operación NO SHALL crear ni modificar ningún recurso.

#### Scenario: Inicio de sesión exitoso
- **WHEN** un usuario registrado hace `POST /api/v1/auth/login` con su contraseña correcta
- **THEN** la respuesta es `200` y su cuerpo contiene un token de acceso, el tipo `bearer` y una duración en segundos mayor que cero

#### Scenario: El token emitido en el login identifica al usuario
- **WHEN** se decodifica el token devuelto por un inicio de sesión exitoso
- **THEN** su sujeto es el email del usuario que inició sesión

#### Scenario: El login acepta cualquier capitalización del email
- **WHEN** un usuario registrado como `user@test.com` inicia sesión escribiendo `USER@TEST.COM` con su contraseña correcta
- **THEN** la respuesta es `200`

#### Scenario: El registro y el login devuelven la misma forma de respuesta
- **WHEN** se comparan el cuerpo de un registro exitoso y el de un inicio de sesión exitoso
- **THEN** ambos tienen exactamente el mismo conjunto de campos: sólo cambia el código de estado (`201` frente a `200`)

### Requirement: Las credenciales inválidas se rechazan con 401 indistinguible
Cuando el email no corresponda a ningún usuario **o** la contraseña no coincida, `POST /api/v1/auth/login` SHALL responder `401 Unauthorized` con un cuerpo en formato RFC 7807 idéntico en ambos casos. La respuesta NO SHALL incluir el email consultado ni ningún dato que permita distinguir cuál de las dos condiciones se dio (RN-WS-12 §Excepciones globales, HU-03-02).

#### Scenario: Email inexistente
- **WHEN** se intenta iniciar sesión con un email que no está registrado
- **THEN** la respuesta es `401` con cuerpo RFC 7807

#### Scenario: Contraseña incorrecta
- **WHEN** un usuario registrado intenta iniciar sesión con una contraseña equivocada
- **THEN** la respuesta es `401` con cuerpo RFC 7807

#### Scenario: Los dos rechazos son idénticos byte a byte
- **WHEN** se comparan el cuerpo del `401` por email inexistente y el del `401` por contraseña incorrecta
- **THEN** son iguales en todos sus campos: nada en la respuesta permite saber si el email estaba registrado

#### Scenario: El rechazo no devuelve el email consultado
- **WHEN** se inspecciona el cuerpo de un `401` de login
- **THEN** el email enviado en la petición no aparece en ningún campo de la respuesta

### Requirement: Los cuerpos que violan el contrato se rechazan con 422
Cuando el cuerpo recibido sea JSON válido pero incumpla el schema declarado —contraseña por debajo del mínimo, email con formato inválido, campo faltante o campo no declarado—, ambas operaciones SHALL responder `422 Unprocessable Entity` en formato RFC 7807, sin alcanzar el servicio de auth. El `detail` SHALL nombrar el campo que falló y NO SHALL incluir el valor recibido.

#### Scenario: Contraseña por debajo del mínimo en el registro
- **WHEN** se hace `POST /api/v1/auth/register` con una contraseña de menos de 8 caracteres
- **THEN** la respuesta es `422` con cuerpo RFC 7807 cuyo `detail` menciona el campo de la contraseña

#### Scenario: El detalle de validación no filtra la contraseña
- **WHEN** se inspecciona el cuerpo de ese `422`
- **THEN** la contraseña enviada no aparece en ninguna parte de la respuesta

#### Scenario: Email con formato inválido
- **WHEN** se hace `POST /api/v1/auth/register` con un email sin arroba
- **THEN** la respuesta es `422` con cuerpo RFC 7807

#### Scenario: Campo no declarado en el cuerpo
- **WHEN** se hace `POST /api/v1/auth/register` con un campo adicional que el contrato no declara
- **THEN** la respuesta es `422`: el contrato de entrada rechaza campos extra en lugar de ignorarlos en silencio

#### Scenario: Cuerpo que no es JSON parseable
- **WHEN** se hace `POST /api/v1/auth/login` con un cuerpo que no es JSON válido
- **THEN** la respuesta es `400` con cuerpo RFC 7807, distinguiéndose del `422` que corresponde a un JSON válido que viola el schema

#### Scenario: La validación ocurre antes del servicio
- **WHEN** una petición es rechazada por validación
- **THEN** no se derivó ningún hash de contraseña ni se abrió ninguna transacción: el rechazo ocurrió en el borde

### Requirement: La capa de transporte no contiene lógica de negocio ni manejo de errores propio
El módulo del router de auth NO SHALL capturar excepciones, NO SHALL construir respuestas de error por su cuenta, NO SHALL derivar hashes ni emitir tokens, y NO SHALL importar el ORM, el cliente HTTP, la librería de hashing ni la de JWT. Cada operación SHALL limitarse a recibir el cuerpo ya validado, invocar la operación correspondiente del servicio y devolver su resultado. Todo error SHALL propagarse hasta los manejadores globales, que son el único punto donde un error del proyecto se convierte en respuesta HTTP.

#### Scenario: Sin captura de excepciones en el router
- **WHEN** se inspecciona el código del módulo del router de auth
- **THEN** no contiene ninguna sentencia de captura de excepciones ni construye ninguna excepción HTTP del framework

#### Scenario: Sin acceso directo a infraestructura ni a criptografía
- **WHEN** se inspeccionan los imports del módulo del router de auth
- **THEN** no aparece el ORM, ni el cliente HTTP, ni la librería de hashing de contraseñas, ni la librería de JWT

#### Scenario: El mapeo de errores de dominio a estados HTTP vive en un solo lugar
- **WHEN** se busca en el proyecto la traducción del error de email duplicado a `409` y la del error de credenciales inválidas a `401`
- **THEN** aparece únicamente en la tabla de mapeo del módulo de manejadores globales, no en el router

#### Scenario: Un error de dominio sin mapear no se convierte en un estado inventado
- **WHEN** el servicio lanza un error de dominio que la tabla de mapeo no cubre
- **THEN** la respuesta es `500` en formato RFC 7807, no un `400` atribuido al cliente

### Requirement: El servicio de auth llega al router por inyección de dependencias
El router NO SHALL construir el servicio de auth, su Unit of Work, la factory de sesiones ni la configuración: SHALL recibir el servicio ya compuesto a través de una dependencia declarada del framework. Esa dependencia SHALL construir una instancia por petición y SHALL obtener su configuración del único punto de configuración del proyecto, nunca de valores fijos en el código.

#### Scenario: El router sólo declara la dependencia
- **WHEN** se inspecciona el módulo del router de auth
- **THEN** no instancia el servicio, la Unit of Work ni la factory de sesiones: sólo declara la dependencia y la usa

#### Scenario: La dependencia es sustituible en pruebas
- **WHEN** se sustituye la dependencia del servicio de auth por una implementación de prueba y se ejercita cualquiera de las dos rutas
- **THEN** la ruta usa la implementación sustituida, sin abrir ninguna conexión contra la base compartida

#### Scenario: Una instancia por petición
- **WHEN** se resuelven dos peticiones consecutivas
- **THEN** cada una obtiene su propia instancia del servicio, de modo que el estado de una no puede alcanzar a la otra

#### Scenario: Sin configuración fija en el código
- **WHEN** se inspecciona el proveedor de la dependencia
- **THEN** obtiene la cadena de conexión y el resto de la configuración del punto único de configuración, sin literales propios

### Requirement: Las operaciones están documentadas con su contrato real
El esquema OpenAPI que publica el servicio SHALL describir ambas operaciones con su cuerpo de entrada, su respuesta exitosa y sus respuestas de error. Las respuestas de error documentadas SHALL usar el modelo de error del proyecto y el media type de problem details, NO el modelo de error por defecto del framework, que este servicio nunca emite.

#### Scenario: Las operaciones aparecen en el esquema
- **WHEN** se obtiene el esquema OpenAPI del servicio
- **THEN** declara `POST /api/v1/auth/register` y `POST /api/v1/auth/login`, cada una con su schema de cuerpo de entrada y el contrato de respuesta de token como respuesta exitosa

#### Scenario: El código de éxito documentado es el que se emite
- **WHEN** se comparan los códigos de respuesta exitosa declarados en el esquema con los que devuelven las rutas
- **THEN** el registro declara `201` y el login declara `200`, coincidiendo con el comportamiento real

#### Scenario: Los errores documentados usan el contrato de error del proyecto
- **WHEN** se inspeccionan las respuestas de error declaradas para ambas operaciones
- **THEN** el registro documenta `409` y `422`, el login documenta `401` y `422`, y todas referencian el modelo de error del proyecto con el media type de problem details

#### Scenario: Ambas operaciones quedan agrupadas bajo su dominio
- **WHEN** se inspecciona el esquema OpenAPI
- **THEN** las dos operaciones están etiquetadas bajo el dominio de autenticación, separadas del endpoint de salud

### Requirement: La capa de transporte no registra material sensible
Las operaciones del router de auth NO SHALL escribir en logs el cuerpo de la petición, la contraseña, el token emitido ni el email consultado en un intento fallido. El único registro admisible en el camino de error SHALL ser el que ya produce el manejador global de errores no previstos.

#### Scenario: Sin sentencias de registro en el router
- **WHEN** se inspecciona el código del módulo del router de auth
- **THEN** no contiene ninguna sentencia de registro en logs

#### Scenario: Un rechazo por credenciales no deja rastro del email
- **WHEN** se ejercita un `401` de login con los logs capturados
- **THEN** el email enviado no aparece en ningún registro emitido durante esa petición

#### Scenario: Un rechazo por validación no deja rastro de la contraseña
- **WHEN** se ejercita un `422` de registro con los logs capturados
- **THEN** la contraseña enviada no aparece en ningún registro emitido durante esa petición
