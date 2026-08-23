## MODIFIED Requirements

### Requirement: El límite de escaneos no alcanza a los demás endpoints

El límite de tasa SHALL aplicarse únicamente al endpoint de disparo de escaneos. Los endpoints de autenticación (registro y login) y el endpoint de salud NO SHALL estar sujetos a ese límite: un usuario que agotó su cupo de escaneos SHALL seguir pudiendo autenticarse, y el monitoreo de salud del servicio SHALL seguir respondiendo. Ahora que las operaciones de autenticación están montadas, esta exclusión SHALL verificarse sobre los endpoints reales, no sobre un endpoint simulado.

#### Scenario: Auth no consume ni agota el cupo de scan

- **WHEN** una misma IP hace más peticiones de autenticación que el cupo configurado para escaneos
- **THEN** ninguna de ellas es rechazada con `429`: el cupo de escaneos no se aplica a esas rutas

#### Scenario: Autenticarse sigue siendo posible con el cupo de escaneos agotado

- **WHEN** una IP agota su cupo de escaneos y a continuación hace `POST /api/v1/auth/login` con credenciales correctas
- **THEN** la respuesta es `200`, no `429`

#### Scenario: Health check nunca es limitado

- **WHEN** se hace `GET /health` repetidamente por encima del cupo configurado
- **THEN** todas las respuestas siguen siendo `200`

#### Scenario: El límite se declara por endpoint, no globalmente

- **WHEN** se inspecciona la configuración del limitador
- **THEN** no hay límites por defecto aplicados a toda la aplicación: el límite se declara explícitamente sobre el endpoint de disparo de escaneos

### Requirement: La política de borde no altera la superficie de API

Aplicar la política de borde SHALL ser transparente para el contrato de endpoints ya especificado: la política de CORS y el límite de tasa NO SHALL agregar, montar ni exponer ninguna ruta de aplicación por su cuenta, NO SHALL cambiar el código de estado ni el cuerpo de ninguna operación existente, y los endpoints de dominio cuyos changes todavía no se implementaron SHALL seguir sin estar disponibles. Montar un router SHALL ser siempre una decisión explícita del change que implementa sus operaciones.

#### Scenario: Health conserva su contrato exacto

- **WHEN** se hace `GET /health` con la política de borde activa
- **THEN** la respuesta sigue siendo `200` con body exactamente `{"status": "ok", "service": "wasa-fastapi-bridge"}`

#### Scenario: Las operaciones de auth conservan su contrato con la política activa

- **WHEN** se hacen `POST /api/v1/auth/register` y `POST /api/v1/auth/login` con la política de borde activa
- **THEN** devuelven `201` y `200` respectivamente, con el mismo cuerpo que devolverían sin ella: la política de borde no interviene en su contrato

#### Scenario: El router de scan sigue sin montarse

- **WHEN** se hace `POST /api/v1/scan/start`
- **THEN** la respuesta sigue siendo `404`, porque la política de borde no monta routers de dominio

#### Scenario: Sin conexiones a infraestructura externa

- **WHEN** se construye e importa la aplicación con la política de borde activa
- **THEN** no se abre ninguna conexión a PostgreSQL, n8n ni Redis, y el conteo de tasa se resuelve dentro del propio proceso
