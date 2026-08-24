## REMOVED Requirements

### Requirement: La política de borde no altera la superficie de API

**Reason**: El requirement vigente en `openspec/specs/api-edge-security/spec.md` (evolucionado por CHANGE-05, que montó auth) trae el escenario "El router de scan sigue sin montarse", que afirma que `POST /api/v1/scan/start` sigue respondiendo `404`. Este change monta y protege esa ruta: el escenario queda desmentido por su propio nombre. El validador de `openspec` exige que un `MODIFIED` conserve el nombre de todos los escenarios existentes (no permite retirarlos aunque su contenido ya no aplique), así que la única forma de reemplazar ese escenario obsoleto por uno que describa el estado nuevo es retirar el requirement completo y reintroducirlo bajo un nombre distinto en `ADDED Requirements` (mismo patrón ya usado en `bridge-bootstrap` dentro de este change).

**Migration**: Sustituido por "La política de borde no altera la superficie de API ya implementada" en `ADDED Requirements`, que conserva las mismas garantías (contrato exacto de `/health`, contrato exacto de las operaciones de auth, sin conexiones a infraestructura externa) y actualiza únicamente el escenario de scan: de "sigue sin montarse" a "está montado por su propio change, no por la política de borde" — que es exactamente lo que este change hace. Ninguna garantía se pierde.

## ADDED Requirements

### Requirement: La política de borde no altera la superficie de API ya implementada

Aplicar la política de borde SHALL ser transparente para el contrato de endpoints ya especificado: la configuración de CORS, del límite de tasa y de los handlers de error NO SHALL agregar, montar ni exponer por sí misma ninguna ruta de aplicación, ni alterar el contrato de las ya expuestas. Una ruta de dominio SHALL aparecer en la superficie de API únicamente cuando el change que la implementa la monte explícitamente; los endpoints de dominio todavía no implementados SHALL seguir sin estar disponibles.

#### Scenario: Health conserva su contrato exacto

- **WHEN** se hace `GET /health` con la política de borde activa
- **THEN** la respuesta sigue siendo `200` con body exactamente `{"status": "ok", "service": "wasa-fastapi-bridge"}`

#### Scenario: Las operaciones de auth conservan su contrato con la política activa

- **WHEN** se hacen `POST /api/v1/auth/register` y `POST /api/v1/auth/login` con la política de borde activa
- **THEN** devuelven `201` y `200` respectivamente, con el mismo cuerpo que devolverían sin ella: la política de borde no interviene en su contrato

#### Scenario: El disparo de escaneo está montado por su propio change, no por la política de borde

- **WHEN** se hace `POST /api/v1/scan/start`
- **THEN** la ruta existe porque el change del borde HTTP del dominio scan la registró explícitamente, y la política de borde se aplica sobre ella (guard JWT + cupo por IP) sin haberla creado ni haber decidido su protección

#### Scenario: Sin conexiones a infraestructura externa

- **WHEN** se construye e importa la aplicación con la política de borde activa
- **THEN** no se abre ninguna conexión a PostgreSQL, n8n ni Redis, y el conteo de tasa se resuelve dentro del propio proceso
