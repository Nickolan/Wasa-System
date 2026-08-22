> **Modo TDD estricto activo.** Cada grupo marcado `(TDD)` sigue el ciclo
> RED → GREEN → TRIANGULATE → REFACTOR. No escribir código de producción sin un
> test que falle primero. El grupo 1 es infraestructura de tooling (no hay ciclo
> TDD posible antes de tener runner) y el grupo 7 es verificación manual.
>
> Referencias: `design.md` (decisiones D-1..D-14), `specs/bridge-bootstrap/spec.md`
> (requirements y escenarios = criterios de aceptación).

## 1. Preparación del entorno y tooling

- [x] 1.1 Verificar Python 3.11+ disponible (`python --version`) y crear el entorno virtual del proyecto en la raíz del repo
- [x] 1.2 Crear `fastapi_bridge/__init__.py` y `fastapi_bridge/tests/__init__.py` (mínimo indispensable para que el paquete sea importable y pytest pueda arrancar)
- [x] 1.3 Crear `fastapi_bridge/requirements.txt` con el runtime: `fastapi>=0.111`, `pydantic[email]>=2.7`, `pydantic-settings>=2.2` (D-2), `python-jose[cryptography]`, `passlib[bcrypt]`, `sqlalchemy>=2.0`, `asyncpg`, `httpx`, `slowapi`, `uvicorn[standard]`, `python-dotenv`
- [x] 1.4 Crear `fastapi_bridge/requirements-dev.txt` con `pytest`, `pytest-asyncio`, `anyio` (D-3). Verificar que ninguna de estas aparece también en `requirements.txt`
- [x] 1.5 Instalar ambos manifiestos (`pip install -r fastapi_bridge/requirements.txt -r fastapi_bridge/requirements-dev.txt`) y confirmar que la resolución termina sin conflictos
- [x] 1.6 Crear `pytest.ini` en la raíz del repo con `testpaths = fastapi_bridge/tests` y `asyncio_mode = auto` (D-13); verificar que `pytest` corre y reporta "no tests ran" sin errores de configuración
- [x] 1.7 Agregar al `.gitignore` del repo las entradas Python del scaffold (`__pycache__/`, `*.pyc`, `.pytest_cache/`, el directorio del venv) si no están ya

## 2. Aplicación ASGI y endpoint de salud (TDD)

> Requirements cubiertos: *El servicio arranca como aplicación ASGI*, *Endpoint de salud*.

- [x] 2.1 **RED** — Escribir `fastapi_bridge/tests/test_health.py` con un test async que, vía `httpx.AsyncClient` + `ASGITransport` sobre `fastapi_bridge.main:app`, haga `GET /health` y afirme status `200`. Ejecutar: debe fallar por `ModuleNotFoundError` sobre `fastapi_bridge.main`
- [x] 2.2 **GREEN** — Crear `fastapi_bridge/main.py` con la instancia `FastAPI` y el endpoint `GET /health` mínimo. Ejecutar tests: debe pasar
- [x] 2.3 **TRIANGULATE** — Agregar caso: el body de la respuesta es exactamente `{"status": "ok", "service": "wasa-fastapi-bridge"}` (no sólo status 200). Ejecutar: si el GREEN fue "Fake It", generalizar
- [x] 2.4 **TRIANGULATE** — Agregar caso: `GET /health` sin header `Authorization` sigue devolviendo `200` (nunca `401`) — el endpoint es público
- [x] 2.5 **TRIANGULATE** — Agregar caso: `from fastapi_bridge.main import app` produce una instancia de `fastapi.FastAPI`, y el import no abre ninguna conexión (verificable porque no hay engine ni cliente httpx creado a nivel de módulo)
- [x] 2.6 **REFACTOR** — Introducir el modelo Pydantic `HealthResponse` con campos `Literal` en `main.py` y declararlo como `response_model` del endpoint (D-11). Agregar `title`, `version` y el `lifespan` async vacío vía `@asynccontextmanager` (D-10). Ejecutar tests después de cada paso: deben seguir verdes
- [x] 2.7 **TRIANGULATE** — Agregar test que afirme que `GET /api/v1/auth/register` y `POST /api/v1/scan/start` devuelven `404` en este estadio (D-8: los routers de dominio existen pero no se montan; es contrato, no bug)

## 3. Configuración tipada — `core/settings.py` (TDD)

> Requirement cubierto: *Configuración tipada desde el entorno*.

- [x] 3.1 **RED** — Escribir `fastapi_bridge/tests/test_settings.py` con un test que importe `Settings` desde `fastapi_bridge.core.settings`, la instancie sin `.env` presente y afirme que expone `JWT_SECRET`, `TOKEN_EXPIRE_HOURS` y `DB_URL`. Ejecutar: debe fallar
- [x] 3.2 **GREEN** — Crear `fastapi_bridge/core/__init__.py` y `fastapi_bridge/core/settings.py` con `class Settings(BaseSettings)` (de `pydantic_settings`) y esos tres campos con type hints y defaults de desarrollo (D-5). Ejecutar: debe pasar
- [x] 3.3 **TRIANGULATE** — Agregar el resto del contrato de entorno (`N8N_WEBHOOK_URL`, `N8N_WEBHOOK_TOKEN`, `CORS_ORIGINS`, `RATE_LIMIT_REQUESTS`, `RATE_LIMIT_WINDOW`, `APP_ENV`) con su test correspondiente sobre presencia y tipo de cada campo
- [x] 3.4 **TRIANGULATE** — Agregar test de precedencia y coerción: con `monkeypatch.setenv("TOKEN_EXPIRE_HOURS", "48")`, `Settings().TOKEN_EXPIRE_HOURS == 48` como `int`, no como `str`
- [x] 3.5 **TRIANGULATE** — Agregar test de `CORS_ORIGINS` (D-7): un string `"http://a.com,http://b.com"` en el entorno se resuelve como `["http://a.com", "http://b.com"]`. Implementar el `@field_validator(mode="before")` para hacerlo pasar. Agregar el caso borde de un único origen sin comas
- [x] 3.6 **TRIANGULATE** — Agregar test de no-filtración de secretos: `JWT_SECRET` y `N8N_WEBHOOK_TOKEN` son `SecretStr` (D-6); su valor real no aparece en `repr(settings)` ni en `settings.model_dump()`, y sólo es accesible vía `.get_secret_value()`
- [x] 3.7 **RED/GREEN** — Escribir el test de `get_settings()`: dos llamadas devuelven **la misma instancia** (`is`), confirmando el `@lru_cache` (D-4). Implementar `@lru_cache def get_settings() -> Settings`
- [x] 3.8 **REFACTOR** — Configurar `model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")`; verificar que la suite sigue verde y que la ausencia de `.env` no rompe la instanciación

## 4. Estructura de capas — módulos placeholder (TDD estructural)

> Requirement cubierto: *Estructura de capas del backend*. Cada módulo lleva ÚNICAMENTE
> un docstring con su responsabilidad, la regla de capa que lo gobierna y el change
> que lo implementa (D-9). Sin stubs con `NotImplementedError`, sin código muerto.

- [x] 4.1 **RED** — Escribir `fastapi_bridge/tests/test_structure.py` con un test parametrizado que afirme la existencia de los 18 módulos del árbol de la KB (`main.py`, `core/{settings,security,dependencies}.py`, `db/{base,session,models}.py`, `api/v1/{auth,scan}/router.py`, `services/{auth_service,scan_service}.py`, `uow/{auth,scan}_unit_of_work.py`, `repositories/{user_repository,n8n_repository}.py`, `schemas/{auth,scan}_schemas.py`, `exceptions/handlers.py`). Ejecutar: debe fallar por los que aún no existen
- [x] 4.2 **GREEN** — Crear los módulos faltantes de `core/` (`security.py`, `dependencies.py`) y `db/` (`base.py`, `session.py`, `models.py`) con su `__init__.py` y su docstring de responsabilidad. Ejecutar tests
- [x] 4.3 **GREEN** — Crear `api/__init__.py`, `api/v1/__init__.py`, `api/v1/auth/router.py` y `api/v1/scan/router.py`, cada uno con su `APIRouter(prefix="/api/v1/auth" | "/api/v1/scan", tags=[...])` sin operaciones registradas. **No** hacer `include_router` en `main.py` (D-8)
- [x] 4.4 **GREEN** — Crear `services/`, `uow/`, `repositories/`, `schemas/` y `exceptions/` con sus `__init__.py` y los módulos placeholder por dominio, cada uno con docstring. Ejecutar tests: el test de estructura debe pasar completo
- [x] 4.5 **TRIANGULATE** — Agregar test de importabilidad: cada uno de los 18 módulos se importa (`importlib.import_module`) sin lanzar excepción, confirmando que todos los niveles tienen su `__init__.py`
- [x] 4.6 **TRIANGULATE** — Agregar test de simetría de dominios: para cada capa que tiene módulos por dominio (`api`, `services`, `uow`, `schemas`), existe la contraparte tanto de `auth` como de `scan` — ninguno de los dos dominios tiene capas que al otro le falten

## 5. Fronteras de import entre capas (TDD estructural)

> Requirement cubierto: *Fronteras de import entre capas*. Se verifica parseando cada
> módulo con `ast` de la stdlib, sin importarlo (D-12).

- [x] 5.1 **RED** — Escribir `fastapi_bridge/tests/test_layer_boundaries.py` con un helper que extraiga los nombres de módulo importados por un archivo usando `ast.parse` (cubriendo `import x` y `from x import y`). Escribir el primer test: ningún módulo bajo `repositories/` importa `fastapi`. Ejecutar
- [x] 5.2 **TRIANGULATE** — Agregar test: ningún módulo bajo `api/` importa `sqlalchemy` ni `httpx` (el Router no accede a infraestructura directamente)
- [x] 5.3 **TRIANGULATE** — Agregar test: ningún módulo bajo `services/` importa `httpx` ni `sqlalchemy` (el Service accede a infraestructura sólo vía UoW)
- [x] 5.4 **TRIANGULATE** — Agregar caso negativo que valide el propio helper: un fragmento de código de prueba con un import prohibido es efectivamente detectado (evita que los tests de frontera pasen por no detectar nada)
- [x] 5.5 **REFACTOR** — Extraer la tabla de reglas (directorio → paquetes prohibidos) a una constante única y parametrizar los tests sobre ella, de modo que agregar una regla nueva en changes futuros sea una línea. Verificar que la suite sigue verde

## 6. No-impacto sobre la base compartida (TDD)

> Requirement cubierto: *El scaffold no toca la base de datos compartida*.

- [x] 6.1 **RED/GREEN** — Escribir test que afirme que el árbol `fastapi_bridge/` no contiene ninguna referencia a las tablas `scans` ni `vulnerabilities`, ni ninguna llamada a `create_all` o a un `create_async_engine` ejecutado a nivel de módulo
- [x] 6.2 **TRIANGULATE** — Agregar test que afirme que importar `fastapi_bridge.main` y arrancar el ciclo de `lifespan` no abre conexión de red ni de base de datos (con PostgreSQL y n8n inaccesibles la app levanta igual)
- [x] 6.3 **TRIANGULATE** — Agregar test que afirme que ningún módulo fuera de `core/settings.py` usa `os.environ` / `os.getenv` (regla dura: toda config pasa por `Settings`)

## 7. Verificación de criterios de aceptación

- [x] 7.1 Ejecutar la suite completa (`pytest`) y confirmar 100% verde, registrando el conteo final de tests
- [x] 7.2 Ejecutar `uvicorn fastapi_bridge.main:app --reload` y confirmar arranque sin errores ni warnings de deprecación
- [x] 7.3 Con el servidor arriba, hacer `GET /health` y verificar manualmente el body exacto `{"status": "ok", "service": "wasa-fastapi-bridge"}`
- [x] 7.4 Abrir `/docs` y confirmar que la única operación de aplicación documentada es `GET /health`, con su `HealthResponse` como schema
- [x] 7.5 Confirmar que ningún `.env` real fue creado ni versionado en este change (corresponde a CHANGE-00c)
- [x] 7.6 Revisar los 4 criterios de aceptación de `CHANGE-00a` en `CHANGES.md` y marcarlos; actualizar el estado del change a `[x]`
- [x] 7.7 Reportar al usuario las Open Questions de `design.md` que requieren su decisión: el default de `JWT_SECRET` (OQ-1), y la adición de `pydantic-settings` y `requirements-dev.txt` respecto del scope literal del roadmap (OQ-2, OQ-3), para que `CHANGES.md` refleje el manifiesto real
