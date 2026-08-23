## Why

El scaffold del FastAPI Bridge (CHANGE-00a) dejó `db/base.py`, `db/session.py` y `db/models.py` como placeholders vacíos, y el contrato de configuración (CHANGE-00c) ya declara un `DB_URL` real apuntando a la instancia PostgreSQL compartida `db_fuzzing`. Falta el eslabón que convierte esa configuración en persistencia: sin la entidad `users` ni un engine async, ningún change de Auth posterior (repository, service, registro, login) tiene dónde escribir — CHANGE-02 a CHANGE-07 están bloqueados detrás de este.

## What Changes

- **Nueva capacidad de persistencia de usuarios**: se materializa la entidad `users` descrita en `knowledge-base/04_modelo_de_datos.md` como modelo ORM SQLAlchemy 2.0 (`User`), con `id` (PK autoincremental), `email` (UNIQUE, NOT NULL), `hashed_password` (NOT NULL) y `created_at` (default en el servidor).
- **Engine async y factory de sesiones**: `db/base.py` provee la `DeclarativeBase` del proyecto y un engine `postgresql+asyncpg` construido a partir de `settings.DB_URL`; `db/session.py` provee el `async_sessionmaker` que consumirá la `AuthUoW` en CHANGE-03. Ambos se exponen como **factories perezosas**, no como objetos de nivel de módulo: importar el paquete sigue sin abrir ninguna conexión.
- **DDL idempotente en el arranque**: el hook `lifespan` de `main.py` — hoy vacío por diseño — pasa a ejecutar `Base.metadata.create_all` restringido explícitamente a la tabla `users`, y a cerrar el pool (`engine.dispose()`) en el shutdown.
- **BREAKING (operacional, no de API)**: arrancar el servicio pasa a requerir que PostgreSQL `db_fuzzing` sea alcanzable. Hasta ahora el Bridge levantaba sin ninguna infraestructura externa; a partir de este change, si la base no responde el arranque falla de forma ruidosa en lugar de levantar un servicio que devolvería 500 en el primer registro. El *import* del módulo sigue siendo libre de infraestructura.
- **Sin Alembic y sin tocar lo ajeno**: no se introduce ninguna migración. El único DDL que este servicio emite en `db_fuzzing` es el `CREATE TABLE` de `users`; `scans` y `vulnerabilities` no se declaran, no se referencian y no se alteran (DD-02 y regla dura del proyecto).

Fuera de alcance explícito (llega en changes posteriores): schemas Pydantic de auth (CHANGE-02), `UserRepository` (CHANGE-03), `AuthUoW`/`AuthService` y la normalización a lowercase del email (CHANGE-04+), hashing bcrypt (CHANGE-04), montaje de los routers de auth (CHANGE-06).

## Capabilities

### New Capabilities
- `user-persistence`: la entidad `users` en la instancia compartida `db_fuzzing` — su forma (columnas, tipos, constraint UNIQUE sobre `email`), el engine async `asyncpg` derivado de `settings.DB_URL`, la factory de `AsyncSession` sobre la que se apoyarán las UoW de Auth, y la creación idempotente de la tabla en el arranque sin afectar el esquema preexistente.

### Modified Capabilities
- `bridge-bootstrap`: cambian dos requirements del scaffold que este change deja obsoletos por diseño:
  - *"El servicio arranca como aplicación ASGI"* — la garantía de arrancar sin infraestructura externa se acota: el **import** del paquete sigue sin abrir conexiones, pero el **arranque efectivo** del servidor ahora depende de que `db_fuzzing` sea alcanzable.
  - *"El scaffold no toca la base de datos compartida"* — deja de ser "no se abre ninguna conexión ni se ejecuta ningún DDL" y pasa a ser la garantía más fuerte y duradera del proyecto: el Bridge abre conexión y emite DDL **exclusivamente** para su propia tabla `users`, nunca para `scans` ni `vulnerabilities`.

## Impact

- **Código**: `fastapi_bridge/db/base.py`, `fastapi_bridge/db/session.py`, `fastapi_bridge/db/models.py` (los tres pasan de placeholder a implementación), `fastapi_bridge/main.py` (hook `lifespan`).
- **Tests**: `fastapi_bridge/tests/test_no_shared_db_impact.py` — el test `test_lifespan_cycle_opens_no_network_or_db_connection` codifica la garantía que este change modifica y debe actualizarse; los tests que prohíben `create_async_engine`/`create_all` a nivel de módulo siguen vigentes y deben seguir en verde. Se agregan tests nuevos de forma de tabla y de alcance del DDL.
- **Dependencias**: ninguna nueva — `sqlalchemy>=2.0` y `asyncpg>=0.29` ya están en `fastapi_bridge/requirements.txt` desde CHANGE-00a.
- **Infraestructura compartida (riesgo real)**: el Bridge escribe por primera vez en `db_fuzzing`, una base viva que el sistema WASA existente usa en producción. El DDL se acota a `users` y es idempotente (`checkfirst`), pero la operación no es reversible desde el propio servicio.
- **Configuración**: consume `settings.DB_URL` de `core/settings.py`; no agrega variables al contrato de `.env` ni modifica `.env.example`.
- **Desbloquea**: CHANGE-02 (schemas), CHANGE-03 (`UserRepository`) y con ellos todo el camino crítico de Auth.
