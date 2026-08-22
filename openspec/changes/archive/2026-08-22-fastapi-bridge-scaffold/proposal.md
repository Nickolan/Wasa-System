## Why

El FastAPI Bridge es el microservicio que la Landing Page necesita para autenticar usuarios y delegar escaneos al Webhook Trigger de n8n, pero hoy no existe ni una sola línea de él. `CHANGE-00a` es el nodo raíz del roadmap (`CHANGE-00a → 01 → 02 → 03 → 04 → 06 → 12 → 21 → 22`): sin su esqueleto de capas, ningún change posterior de Auth, Scan o integración n8n tiene dónde escribirse.

El objetivo de este change es **exclusivamente estructural**: dejar un servicio que arranca, responde `/health` y expone la arquitectura de capas (Router → Service → UoW → Repository) ya materializada en el filesystem, de modo que cada change siguiente sólo tenga que rellenar módulos que ya están en su lugar correcto. No se implementa ninguna regla de negocio.

## What Changes

- **Nuevo paquete `fastapi_bridge/`** con la estructura de directorios completa de `knowledge-base/08_arquitectura_propuesta.md`, materializada como paquetes Python importables (`__init__.py` en cada nivel):
  - `main.py` — instancia FastAPI con `lifespan`, título/versión, y un único endpoint `GET /health`.
  - `core/` — `settings.py` (Pydantic `BaseSettings` tipado, campos `JWT_SECRET`, `TOKEN_EXPIRE_HOURS`, `DB_URL`, y el resto del contrato de entorno), más `security.py` y `dependencies.py` como stubs documentados.
  - `db/` — `base.py`, `session.py`, `models.py` como stubs (sin engine real, sin modelo `User`, sin conexión: eso es CHANGE-01/CHANGE-02).
  - `api/v1/auth/router.py` y `api/v1/scan/router.py` — `APIRouter` vacíos con prefijo y tags, **no montados todavía** en `main.py`.
  - `services/`, `uow/`, `repositories/`, `schemas/`, `exceptions/` — módulos placeholder por dominio (auth + scan), cada uno con su docstring de responsabilidad y firma prevista.
- **`requirements.txt`** con el runtime del roadmap: `fastapi`, `pydantic[email]`, `pydantic-settings`, `python-jose[cryptography]`, `passlib[bcrypt]`, `sqlalchemy`, `asyncpg`, `httpx`, `slowapi`, `uvicorn[standard]`, `python-dotenv`.
- **`requirements-dev.txt`** (adición sobre el scope literal del roadmap) con `pytest`, `pytest-asyncio`, `anyio` — necesario porque el proyecto opera en modo TDD estricto y sin runner no hay ciclo RED/GREEN posible desde este change en adelante.
- **Suite de tests inicial** `fastapi_bridge/tests/` con el test del contrato de `/health` y del import limpio de todas las capas (guardia anti-regresión de estructura).
- **NO incluye**: lógica de auth, hashing, JWT, modelo ORM `User`, conexión real a PostgreSQL, cliente httpx a n8n, rate limiting, CORS con orígenes reales, handlers RFC 7807 poblados ni archivos `.env` (todo eso llega en CHANGE-00c y CHANGE-01+).

## Capabilities

### New Capabilities
- `bridge-bootstrap`: arranque y estructura del microservicio FastAPI Bridge — endpoint de salud, configuración tipada desde entorno, manifiesto de dependencias y la topología de capas (Router → Service → UoW → Repository) con sus fronteras de import.

### Modified Capabilities
<!-- Ninguna: `openspec/specs/` está vacío; este es el primer change del proyecto. -->

## Impact

- **Código nuevo**: todo bajo `fastapi_bridge/` (paquete raíz nuevo, sin colisión con `dashboard/` ni con el sistema WASA existente).
- **APIs**: se expone únicamente `GET /health` → `{"status": "ok", "service": "wasa-fastapi-bridge"}`. Ningún endpoint de negocio.
- **Dependencias**: se introduce el stack Python del backend (ver `requirements.txt`). Se asume Python 3.11+.
- **Base de datos**: **cero impacto**. Este change no abre conexión, no crea tablas y no toca `scans`/`vulnerabilities` de `db_fuzzing`.
- **Sistemas externos**: cero impacto sobre n8n, Redis/Memurai, el SQLMap Worker y el Dashboard existente.
- **Desbloquea**: CHANGE-00c (`env-config`), CHANGE-01, CHANGE-02, CHANGE-03 y CHANGE-11 (todos declaran `CHANGE-00a` como dependencia).
- **Governance**: BAJO — trabajo de scaffolding sin lógica de negocio ni superficie de seguridad.
