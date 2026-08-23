## Why

`AuthService.register` / `AuthService.login` (CHANGE-04) ya implementan las dos operaciones de negocio del dominio auth, y `exceptions/handlers.py` (CHANGE-07) ya sabe traducir `EmailAlreadyExistsError` → 409 y `InvalidCredentialsError` → 401 en formato RFC 7807. Nada de eso es alcanzable desde afuera: la aplicación sigue exponiendo **únicamente** `GET /health`, y `POST /api/v1/auth/register` responde 404 porque el router de auth existe como módulo pero no está montado (D-8 de CHANGE-00a).

Este change cierra esa brecha: monta la superficie HTTP del dominio auth. Es el primer change que expone lógica de negocio del Bridge por la red, y el que desbloquea al frontend (CHANGE-15/16, modales de registro y login) y a CHANGE-06 (`get_current_user`, cuyo `tokenUrl` apunta a `/api/v1/auth/login`).

## What Changes

- **Se declaran las dos operaciones del router de auth** en `fastapi_bridge/api/v1/auth/router.py` (hoy un `APIRouter` con prefijo y sin rutas):
  - `POST /api/v1/auth/register` → `201 Created` + `TokenResponse`, cuerpo `UserRegister`.
  - `POST /api/v1/auth/login` → `200 OK` + `TokenResponse`, cuerpo `UserLogin`.
- **Se agrega el proveedor de dependencia `get_auth_service`**, que compone `AuthService(AuthUoW(get_session_factory(settings)))` por petición y lo inyecta en ambas rutas vía `Depends`. Es el único punto del change que conoce el cableado entre capas; el router no construye nada.
- **El router no captura errores de dominio**: `EmailAlreadyExistsError` e `InvalidCredentialsError` se propagan hasta `domain_error_handler` (CHANGE-07), que ya las mapea a 409 y 401 RFC 7807. Ningún `try/except` ni `HTTPException` a mano en la capa de router — es la forma concreta de la regla dura "el Router nunca contiene lógica de negocio".
- **Se monta el router en `create_app()`** (`main.py`) con `include_router`. **BREAKING** respecto del contrato declarado por CHANGE-00a/CHANGE-00d: `POST /api/v1/auth/register` deja de responder 404. Los dos tests que hoy anclan ese 404 (`test_health.py::test_domain_routers_are_not_mounted_yet` y `test_edge_policy_exclusions.py::test_domain_routers_still_return_404_on_production_app`) se reescriben para afirmar el contrato nuevo: auth montado, scan todavía no.
- **Se documentan las respuestas de error en OpenAPI**: ambas rutas declaran sus respuestas de error (`409`/`422` en registro, `401`/`422` en login) con el modelo `ErrorDetail` y el media type `application/problem+json`, para que `/docs` muestre el contrato real y no un `HTTPValidationError` genérico que el proyecto no emite.
- **No se aplica rate limiting a estas rutas**: se mantiene la decisión ya especificada en `api-edge-security` (CHANGE-00d) de que el cupo alcanza solamente al disparo de escaneos. Ver §Decisiones abiertas de `design.md`.

## Capabilities

### New Capabilities
- `auth-endpoints`: la superficie HTTP del dominio auth — rutas, métodos, códigos de estado, contratos de entrada y salida, traducción de los errores de dominio a respuestas RFC 7807, composición del servicio por `Depends` y presencia documentada en OpenAPI.

### Modified Capabilities
- `bridge-bootstrap`: el requisito "Superficie de API acotada al scaffold" deja de ser cierto — la superficie ya no es sólo `GET /health`. Se reemplaza por un requisito que fija la superficie vigente: health + las dos rutas de auth montadas, scan todavía sin montar.
- `api-edge-security`: el escenario "Los routers de dominio siguen sin montarse" del requisito "La política de borde no altera la superficie de API" queda obsoleto para auth. Se actualiza para afirmar lo que sigue siendo el punto real de ese requisito: la política de borde (CORS + rate limit) no altera el contrato de los endpoints, y las rutas de auth recién montadas **no** quedan sujetas al cupo de escaneos.

## Impact

**Código de producción**
- `fastapi_bridge/api/v1/auth/router.py` — se completan las dos operaciones (hoy sólo declara el `APIRouter`).
- `fastapi_bridge/core/dependencies.py` — se agrega `get_auth_service` (hoy es un placeholder con docstring; `get_current_user` sigue siendo de CHANGE-06).
- `fastapi_bridge/main.py` — `include_router(auth_router)` dentro de `create_app()`.

**Se consume sin modificar**: `services/auth_service.py`, `uow/auth_unit_of_work.py`, `db/session.py`, `schemas/auth_schemas.py`, `schemas/error_schemas.py`, `exceptions/domain.py`, `exceptions/handlers.py`, `core/settings.py`.

**Tests**
- Nuevo `fastapi_bridge/tests/test_auth_router.py` (las seis condiciones de aceptación de CHANGE-05, más el cableado por `Depends` y la forma de los errores).
- Se actualizan `tests/test_health.py` y `tests/test_edge_policy_exclusions.py` (los dos asertos de 404 sobre auth).
- Fixture nueva en `tests/conftest.py`: una app con `dependency_overrides[get_auth_service]` apuntando a un `AuthService` sobre SQLite en memoria, para ejercitar los endpoints sin `db_fuzzing` ni `lifespan`.

**APIs y consumidores**
- Frontend (CHANGE-15/16): `registerApi`/`loginApi` pasan a tener endpoints reales contra los que integrar.
- CHANGE-06: `OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")` pasa a apuntar a una ruta que existe.

**Sin impacto**: dependencias (no se agrega ninguna), esquema de base de datos (ninguna DDL nueva), tablas compartidas `scans`/`vulnerabilities`, dominio scan.
