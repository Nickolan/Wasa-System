## Purpose

Define la política de borde HTTP del FastAPI Bridge: qué orígenes de navegador pueden consumir la API y con qué métodos y headers, cuántas solicitudes por IP y por ventana de tiempo admite el endpoint que dispara escaneos, qué endpoints quedan explícitamente fuera de ese límite, y qué forma exacta tiene la respuesta cuando el límite se excede. Es la primera línea de defensa entre la Landing pública y la infraestructura de escaneo WASA existente.

## Requirements

### Requirement: Orígenes permitidos declarados por configuración

El servicio SHALL responder a solicitudes cross-origin de navegador aplicando exclusivamente la lista de orígenes declarada en la configuración de entorno (`CORS_ORIGINS`). Ningún origen SHALL quedar habilitado por defecto ni por comodín: la lista es la única fuente de verdad y no existe ningún origen hardcodeado en el código de la aplicación.

#### Scenario: Origen permitido recibe headers CORS

- **WHEN** llega una solicitud con header `Origin` cuyo valor está en la lista de orígenes configurada
- **THEN** la respuesta incluye `Access-Control-Allow-Origin` con exactamente ese origen (no `*`) y la solicitud se procesa normalmente

#### Scenario: Origen no permitido no recibe autorización CORS

- **WHEN** llega una solicitud con header `Origin` cuyo valor NO está en la lista de orígenes configurada
- **THEN** la respuesta NO incluye ningún header `Access-Control-Allow-Origin`, por lo que el navegador bloquea el acceso al cuerpo de la respuesta

#### Scenario: Preflight desde origen no permitido es rechazado

- **WHEN** llega un preflight `OPTIONS` con `Origin` no listado y `Access-Control-Request-Method`
- **THEN** la respuesta es un rechazo explícito (status `400`) sin headers de autorización CORS, y la solicitud real nunca se ejecuta

#### Scenario: Preflight desde origen permitido es aceptado

- **WHEN** llega un preflight `OPTIONS` con `Origin` listado y `Access-Control-Request-Method: POST`
- **THEN** la respuesta es `200` e incluye `Access-Control-Allow-Origin` con ese origen y `Access-Control-Allow-Methods` incluyendo `POST`

#### Scenario: La lista de orígenes se lee del entorno, no del código

- **WHEN** se cambia el valor de `CORS_ORIGINS` en el entorno y se construye la aplicación
- **THEN** la política CORS refleja la nueva lista sin ninguna modificación de código fuente

#### Scenario: Cabeceras necesarias para el flujo autenticado

- **WHEN** un origen permitido envía un preflight anunciando los headers `Authorization` y `Content-Type`
- **THEN** la respuesta los declara como permitidos, de modo que el frontend puede enviar el JWT Bearer y cuerpos JSON

#### Scenario: Sin credenciales de navegador

- **WHEN** se inspecciona la política CORS aplicada
- **THEN** no se habilitan credenciales de navegador (cookies / `Access-Control-Allow-Credentials`), porque la autenticación del sistema viaja como token Bearer en el header `Authorization` y no como cookie

### Requirement: Límite de solicitudes por IP sobre el disparo de escaneos

El endpoint de disparo de escaneos (`POST /api/v1/scan/start`) SHALL admitir como máximo `RATE_LIMIT_REQUESTS` solicitudes por dirección IP dentro de una ventana de `RATE_LIMIT_WINDOW` segundos (valores por defecto: 10 solicitudes por 3600 segundos). La solicitud que exceda ese cupo SHALL rechazarse con status `429 Too Many Requests` sin ejecutar ninguna lógica de negocio ni contactar a n8n. La identidad del solicitante para efectos del conteo SHALL ser su dirección IP remota. (RN-WS-06)

#### Scenario: Solicitudes dentro del cupo

- **WHEN** una misma IP realiza `RATE_LIMIT_REQUESTS` solicitudes al endpoint de disparo de escaneos dentro de la ventana
- **THEN** ninguna de ellas es rechazada por el límite de tasa

#### Scenario: La solicitud siguiente al cupo es rechazada

- **WHEN** esa misma IP realiza una solicitud adicional (la número `RATE_LIMIT_REQUESTS + 1`) dentro de la misma ventana
- **THEN** la respuesta es `429` y el handler del endpoint no llega a ejecutarse

#### Scenario: El cupo es por IP, no global

- **WHEN** una segunda IP distinta solicita el endpoint mientras la primera ya agotó su cupo
- **THEN** la segunda IP es atendida normalmente, con su propio contador independiente

#### Scenario: El cupo y la ventana son configurables

- **WHEN** se modifican `RATE_LIMIT_REQUESTS` y `RATE_LIMIT_WINDOW` en el entorno
- **THEN** el límite efectivo del endpoint refleja los nuevos valores sin modificar código fuente

### Requirement: El límite de escaneos no alcanza a los demás endpoints

El límite de tasa SHALL aplicarse únicamente al endpoint de disparo de escaneos. Los endpoints de autenticación (registro y login) y el endpoint de salud NO SHALL estar sujetos a ese límite: un usuario que agotó su cupo de escaneos SHALL seguir pudiendo autenticarse, y el monitoreo de salud del servicio SHALL seguir respondiendo.

#### Scenario: Auth no consume ni agota el cupo de scan

- **WHEN** una IP agotó su cupo de solicitudes al endpoint de disparo de escaneos y a continuación solicita un endpoint de autenticación
- **THEN** la solicitud de autenticación NO recibe `429` por causa de ese límite

#### Scenario: Health check nunca es limitado

- **WHEN** una IP solicita `GET /health` repetidas veces, por encima del cupo configurado
- **THEN** todas las respuestas siguen siendo `200` y ninguna es `429`

#### Scenario: El límite se declara por endpoint, no globalmente

- **WHEN** se inspecciona cómo está aplicada la política de tasa en la aplicación
- **THEN** no existe ningún límite por defecto que alcance a todas las rutas: el límite se declara explícitamente sobre el endpoint de escaneo

### Requirement: La respuesta de límite excedido es RFC 7807 con Retry-After

Cuando una solicitud es rechazada por exceder el límite de tasa, la respuesta SHALL tener status `429`, cuerpo en formato **RFC 7807 Problem Details** (`type`, `title`, `status`, `detail`, `instance`) con `Content-Type: application/problem+json`, y SHALL incluir el header `Retry-After` con el número de segundos que el cliente debe esperar. Ningún error de la API SHALL retornarse fuera de este formato. (RN-WS-06, RN-WS-09)

#### Scenario: Cuerpo del error 429

- **WHEN** una solicitud es rechazada por exceder el límite
- **THEN** el cuerpo es JSON con las claves `type`, `title`, `status`, `detail` e `instance`, y `status` vale `429`

#### Scenario: Content-Type de problem details

- **WHEN** se inspecciona la respuesta `429`
- **THEN** su header `Content-Type` es `application/problem+json`

#### Scenario: Header Retry-After presente

- **WHEN** se inspecciona la respuesta `429`
- **THEN** incluye el header `Retry-After` con un valor entero de segundos mayor que cero

#### Scenario: El campo instance identifica el endpoint

- **WHEN** se inspecciona el cuerpo de la respuesta `429`
- **THEN** el campo `instance` refleja el path de la solicitud que fue rechazada

#### Scenario: El error no filtra información interna

- **WHEN** se inspecciona el cuerpo de la respuesta `429`
- **THEN** no contiene stack traces, rutas de archivos del servidor ni nombres de módulos internos

### Requirement: La política de borde no altera la superficie de API

Aplicar la política de borde SHALL ser transparente para el contrato de endpoints ya especificado: no SHALL agregarse, montarse ni exponerse ninguna ruta de aplicación nueva, y los endpoints de dominio todavía no implementados SHALL seguir sin estar disponibles.

#### Scenario: Health conserva su contrato exacto

- **WHEN** se hace `GET /health` con la política de borde activa
- **THEN** la respuesta sigue siendo `200` con body exactamente `{"status": "ok", "service": "wasa-fastapi-bridge"}`

#### Scenario: Los routers de dominio siguen sin montarse

- **WHEN** se hace `POST /api/v1/scan/start` o `POST /api/v1/auth/register`
- **THEN** la respuesta sigue siendo `404`, porque este change configura la política de borde pero no monta routers de dominio

#### Scenario: Sin conexiones a infraestructura externa

- **WHEN** se construye e importa la aplicación con la política de borde activa
- **THEN** no se abre ninguna conexión a PostgreSQL, n8n ni Redis, y el conteo de tasa se resuelve dentro del propio proceso
