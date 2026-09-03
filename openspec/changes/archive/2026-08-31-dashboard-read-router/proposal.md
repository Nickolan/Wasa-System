## Why

Hoy el dashboard de resultados es un sistema aparte: `dashboard/server-fuzzing` (Node/Express, 65 líneas) levanta un backend propio en el puerto 5000 con credenciales de PostgreSQL hardcodeadas, y `dashboard/dashboard-fuzzing` (React/Vite) lo consume. Para usar WASA de punta a punta hay que levantar **dos backends y dos frontends**, con dos configuraciones de conexión a la misma base `db_fuzzing` que pueden divergir entre sí.

Este change traslada al FastAPI Bridge la **única** capacidad que `server-fuzzing` aporta —leer los escaneos y las vulnerabilidades ya persistidos por el sistema WASA existente y devolverlos filtrados— para que el frontend unificado (CHANGE-26) tenga a qué apuntar. Es la mitad backend de la unificación; sin ella, CHANGE-26 no tiene endpoint que consumir.

## What Changes

- **Nuevo endpoint `GET /api/v1/dashboard`**, réplica del contrato de `GET /api/dashboard` de `dashboard/server-fuzzing/index.js`:
  - Query params opcionales `scan_id`, `severity`, `source`; se combinan con `AND` cuando hay más de uno presente.
  - Respuesta `200` con `{"scans": [...], "vulnerabilities": [...]}`.
  - `scans` siempre completo (sin filtrar) y ordenado por `scan_date` ascendente; los filtros aplican **sólo** a `vulnerabilities`.
  - `severity` se normaliza a minúsculas antes de comparar (los valores almacenados son `low|medium|high|critical`, mientras que el frontend envía `Critical`/`High`/…); `scan_id` y `source` se comparan tal cual llegan.
- **Sin autenticación.** Decisión explícita del usuario: el dashboard unificado debe comportarse *exactamente igual* que el actual, que es abierto y muestra los escaneos de todos los usuarios sin filtrar por dueño. Es un riesgo **heredado** del sistema existente, no introducido por este change; queda documentado en `design.md` (Risks) y en el spec, no mitigado acá.
- **Nueva capa de lectura de solo-lectura sobre `db_fuzzing`**: la conexión sale de `settings.DB_URL` (nunca credenciales hardcodeadas como en `server-fuzzing`), y el acceso se hace por SQLAlchemy Core sobre una `MetaData` privada — **sin** declarar modelos ORM sobre la `Base` del proyecto, para que `Base.metadata.create_all` siga sin poder alcanzar `scans` ni `vulnerabilities`.
- **BREAKING (a nivel de garantía interna, no de API pública)**: la garantía vigente "ninguna sentencia del servicio referencia `scans` o `vulnerabilities`" deja de ser cierta y se reemplaza por una más precisa: "el servicio **lee** esas tablas y NO emite sobre ellas ninguna escritura ni DDL". El test que ancla la garantía vieja (`tests/test_no_shared_db_impact.py::test_no_reference_to_existing_shared_tables`) debe reescribirse en consecuencia, no borrarse.
- **Se monta el router en `create_app()`**, lo que cambia la superficie de API declarada del servicio.
- Fuera de alcance: el frontend (CHANGE-26), el retiro de `dashboard/` del flujo de arranque (CHANGE-26), y cualquier operación de escritura sobre `scans`/`vulnerabilities`.

## Capabilities

### New Capabilities

- `dashboard-endpoint`: el borde HTTP de la consulta de resultados — ruta, verbo admitido, ausencia de autenticación, ausencia de límite de tasa, contrato de los query params, códigos de respuesta y forma del error.
- `dashboard-projection`: qué datos devuelve esa consulta y con qué semántica — el conjunto de escaneos y de vulnerabilidades expuesto, el orden, la semántica exacta de cada filtro y su combinación, y la garantía de que la lectura nunca escribe ni altera la base compartida.

### Modified Capabilities

- `bridge-bootstrap`: dos requirements cambian.
  1. *El scaffold no toca la base de datos compartida* — deja de prohibir toda referencia a `scans`/`vulnerabilities` y pasa a prohibir únicamente escritura, DDL y mapeo ORM sobre ellas, permitiendo explícitamente la lectura.
  2. *Superficie de API expuesta por el servicio con scan montado* — la lista de rutas registradas incorpora `GET /api/v1/dashboard`.

## Impact

**Código nuevo** (`fastapi_bridge/`):
- `api/v1/dashboard/router.py` + `api/v1/dashboard/__init__.py` — borde HTTP.
- `services/dashboard_service.py` — lógica de la consulta (traducción de filtros).
- `uow/dashboard_unit_of_work.py` — ámbito de sesión de solo lectura.
- `repositories/dashboard_repository.py` — las dos consultas `SELECT` sobre las tablas compartidas.
- `schemas/dashboard_schemas.py` — contrato de filtros y de respuesta.
- `core/dependencies.py` — un proveedor `get_dashboard_service` más.
- `main.py` — `include_router(dashboard_router)`.

**Código existente afectado**:
- `fastapi_bridge/tests/test_no_shared_db_impact.py` — el test de "cero referencias" se reemplaza por tests de "cero escrituras y cero mapeo ORM" (ver `design.md`, D-6).
- `fastapi_bridge/tests/test_app_wiring.py` / `test_edge_policy_exclusions.py` — asertos sobre la superficie de rutas, si enumeran rutas exactas.

**Sistemas y datos**: lectura sobre la instancia PostgreSQL compartida `db_fuzzing` (tablas `scans`, `vulnerabilities`), propiedad del sistema WASA existente. Sin migraciones, sin Alembic, sin escrituras. No se agregan dependencias nuevas: SQLAlchemy y asyncpg ya están en `requirements.txt`.

**Consumidores**: CHANGE-26 (`dashboard-frontend-migration`) depende de este contrato; `dashboard/server-fuzzing` queda funcionalmente redundante pero se retira recién en CHANGE-26.
