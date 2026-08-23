## MODIFIED Requirements

### Requirement: La política de borde no altera la superficie de API

Aplicar la política de borde SHALL ser transparente para el contrato de endpoints ya especificado: la configuración de CORS, del límite de tasa y de los handlers de error NO SHALL agregar, montar ni exponer por sí misma ninguna ruta de aplicación, ni alterar el contrato de las ya expuestas. Una ruta de dominio SHALL aparecer en la superficie de API únicamente cuando el change que la implementa la monte explícitamente; los endpoints de dominio todavía no implementados SHALL seguir sin estar disponibles.

#### Scenario: Health conserva su contrato exacto

- **WHEN** se hace `GET /health` con la política de borde activa
- **THEN** la respuesta sigue siendo `200` con body exactamente `{"status": "ok", "service": "wasa-fastapi-bridge"}`

#### Scenario: Los routers de dominio siguen sin montarse

- **WHEN** se hace `POST /api/v1/auth/register`
- **THEN** la respuesta sigue siendo `404`, porque la política de borde no monta routers de dominio: sólo lo hace el change que implementa cada uno

#### Scenario: El disparo de escaneo está montado por su propio change, no por la política de borde

- **WHEN** se hace `POST /api/v1/scan/start`
- **THEN** la ruta existe porque el change del borde HTTP del dominio scan la registró explícitamente, y la política de borde se aplica sobre ella sin haberla creado

#### Scenario: Sin conexiones a infraestructura externa

- **WHEN** se construye e importa la aplicación con la política de borde activa
- **THEN** no se abre ninguna conexión a PostgreSQL, n8n ni Redis, y el conteo de tasa se resuelve dentro del propio proceso
