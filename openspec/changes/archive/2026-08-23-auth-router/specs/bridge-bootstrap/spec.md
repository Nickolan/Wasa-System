## ADDED Requirements

### Requirement: Superficie de API expuesta por el servicio
La aplicación SHALL exponer, además del endpoint de salud, las dos operaciones de autenticación (`POST /api/v1/auth/register` y `POST /api/v1/auth/login`), montando el router de auth desde `create_app()`. Los routers de dominio cuyos changes todavía no se implementaron —el de scan— SHALL seguir existiendo como módulos sin montar, y sus rutas SHALL seguir respondiendo `404`. Montar un router SHALL ser una decisión explícita del change que implementa sus operaciones, nunca un efecto colateral de otro change.

#### Scenario: Rutas de aplicación registradas
- **WHEN** se inspecciona `app.routes` descartando las rutas internas de FastAPI (`/docs`, `/openapi.json`, `/redoc`)
- **THEN** las rutas de aplicación registradas son exactamente `GET /health`, `POST /api/v1/auth/register` y `POST /api/v1/auth/login`

#### Scenario: Los endpoints de auth están disponibles
- **WHEN** se hace `POST /api/v1/auth/register` o `POST /api/v1/auth/login` con un cuerpo válido
- **THEN** la respuesta no es `404`: ambas rutas están montadas y atendidas por el router de auth

#### Scenario: El endpoint de scan aún no está disponible
- **WHEN** se hace `POST /api/v1/scan/start`
- **THEN** la respuesta es `404`, porque ese router todavía no está montado

#### Scenario: El endpoint de salud conserva su contrato
- **WHEN** se hace `GET /health` con el router de auth montado
- **THEN** la respuesta sigue siendo `200` con body exactamente `{"status": "ok", "service": "wasa-fastapi-bridge"}`

## REMOVED Requirements

### Requirement: Superficie de API acotada al scaffold
**Reason**: La superficie dejó de estar acotada al scaffold. Este change monta el router de auth, de modo que `POST /api/v1/auth/register` y `POST /api/v1/auth/login` pasan de `404` a operativas, contradiciendo tanto el enunciado ("el servicio SHALL exponer únicamente el endpoint de salud") como su escenario "Endpoints de dominio aún no disponibles". Mantener el requisito con contenido corregido conservaría un título que ya no describe lo que exige.

**Migration**: Lo reemplaza el requisito "Superficie de API expuesta por el servicio" de esta misma capacidad, que fija la superficie vigente (salud + las dos operaciones de auth) y conserva la parte del requisito anterior que sigue siendo cierta: el router de scan existe como módulo pero no está montado, y sus rutas responden `404` hasta el change que lo implemente. Los dos tests que anclaban el contrato anterior (`tests/test_health.py::test_domain_routers_are_not_mounted_yet` y `tests/test_edge_policy_exclusions.py::test_domain_routers_still_return_404_on_production_app`) se reescriben en este change para afirmar el contrato nuevo, conservando en ambos el aserto sobre scan.
