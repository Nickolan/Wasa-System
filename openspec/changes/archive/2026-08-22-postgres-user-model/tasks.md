> **Governance: MEDIUM** (override del proyecto para el dominio Auth, CHANGE-01..07 — ver `design.md` §Context).
> Implementar en pasos y surfacear al usuario las decisiones no obvias (D-3 tipos de columna, D-6 fallo ruidoso, hallazgos del grupo 6). No requiere aprobación línea por línea.
>
> **Strict TDD**: cada tarea de implementación arranca por el test (RED), sigue con el mínimo código (GREEN), triangula y refactoriza. Los grupos 2 a 5 están ordenados para que el test de cada uno se pueda escribir antes que su implementación.

## 1. Red de seguridad y preparación

- [x] 1.1 Correr la suite existente de `fastapi_bridge/tests/` y registrar el baseline (`N passed`). Si algo ya falla, reportarlo como falla preexistente y no arreglarlo dentro de este change.
- [x] 1.2 Confirmar que `sqlalchemy>=2.0` y `asyncpg>=0.29` están instalados en el venv del proyecto — ya declarados en `requirements.txt` desde CHANGE-00a; no se agrega ninguna dependencia nueva.
- [x] 1.3 Releer `fastapi_bridge/tests/test_no_shared_db_impact.py` y anotar cuáles de sus tests siguen vigentes (referencias a tablas ajenas, llamadas a nivel de módulo, `os.environ`) y cuál queda obsoleto por este change (`test_lifespan_cycle_opens_no_network_or_db_connection`, ver D-9).

## 2. Modelo ORM `User` (`db/base.py` + `db/models.py`)

- [x] 2.1 RED — escribir `tests/test_user_model.py` con la introspección de `User.__table__`: nombre de tabla `users`, columnas exactamente `{id, email, hashed_password, created_at}`, `id` PK autoincremental, `email` y `hashed_password` con `nullable is False`, `email` con `unique is True`, `created_at` con `server_default` y tipo con `timezone=True`.
- [x] 2.2 GREEN — implementar `Base(DeclarativeBase)` en `db/base.py` y `class User(Base)` en `db/models.py` con estilo tipado SQLAlchemy 2.0 (`Mapped` / `mapped_column`), tipos según D-3 (`String(320)` email, `String(255)` hashed_password) y `created_at` según D-4 (`DateTime(timezone=True)`, `server_default=func.now()`).
- [x] 2.3 TRIANGULATE — agregar el test del DDL real (D-8 punto 2): compilar `CreateTable(User.__table__)` contra el dialecto `postgresql` y afirmar que el SQL contiene la tabla `users`, la unicidad de `email` y el default de servidor de `created_at`.
- [x] 2.4 TRIANGULATE — afirmar que `Base.metadata.tables` contiene únicamente `users`: ningún otro modelo se cuela en el metadata del proyecto.
- [x] 2.5 REFACTOR — reemplazar el docstring placeholder de ambos módulos por documentación real (y corregir su referencia obsoleta a "CHANGE-02", que en el roadmap actual es CHANGE-01), manteniendo la mención explícita de la restricción de DD-02.

## 3. Engine asíncrono (`db/base.py`)

- [x] 3.1 RED — escribir los tests del engine: `get_engine(settings)` devuelve un `AsyncEngine` cuyo dialecto usa `asyncpg`; dos llamadas con la misma `Settings` devuelven la misma instancia (cacheada); importar `fastapi_bridge.db.base` no invoca `create_async_engine` (el test AST existente ya cubre el nivel de módulo — verificar que sigue verde).
- [x] 3.2 GREEN — implementar `get_engine(settings: Settings) -> AsyncEngine` con `@lru_cache`, construido sobre `settings.DB_URL` (D-1). Type hints obligatorios; sin ninguna cadena de conexión literal en el código.
- [x] 3.3 TRIANGULATE — verificar que dos `Settings` distintas (con `DB_URL` distinto) producen engines distintos, y que obtener el engine con la base inaccesible no lanza: construir un engine no conecta.
- [x] 3.4 REFACTOR — cerrar en los tests todo engine construido a mano (`await engine.dispose()`) para no dejar pools colgados (riesgo anotado en `design.md`).

## 4. Factory de sesiones (`db/session.py`)

- [x] 4.1 RED — escribir los tests: `get_session_factory(settings)` devuelve un `async_sessionmaker` ligado al engine del servicio, configurado con `expire_on_commit=False`, y obtenerlo con PostgreSQL inaccesible no abre conexión.
- [x] 4.2 GREEN — implementar `get_session_factory(settings: Settings) -> async_sessionmaker[AsyncSession]` sobre `get_engine(settings)`, cacheada, con `expire_on_commit=False` (D-7).
- [x] 4.3 TRIANGULATE — verificar que la sesión producida es una `AsyncSession` y que `db/session.py` no importa nada de FastAPI (la capa `db/` queda por debajo de la frontera del framework, igual que `repositories/`).
- [x] 4.4 REFACTOR — reemplazar el docstring placeholder por documentación real, señalando que esta factory es el único punto desde el que la `AuthUoW` (CHANGE-03) obtiene sesiones.

## 5. Creación de la tabla en el arranque (`main.py`)

- [x] 5.1 RED — escribir el test del `lifespan` con un doble del engine (D-8 punto 3): ejercitar el ciclo completo y afirmar que se llamó `run_sync` con `Base.metadata.create_all` y `tables=[User.__table__]`, y que se llamó `dispose()` en el shutdown.
- [x] 5.2 GREEN — implementar el `lifespan`: obtener settings vía `get_settings()`, obtener el engine, `async with engine.begin() as conn: await conn.run_sync(Base.metadata.create_all, tables=[User.__table__])`, ceder el control, y `await engine.dispose()` en el apagado.
- [x] 5.3 TRIANGULATE — test de fallo ruidoso (D-6): si la conexión falla, el `lifespan` propaga la excepción y no la silencia; verificar además que el hook no contiene ningún `except` que descarte el error.
- [x] 5.4 TRIANGULATE — verificar que `GET /health` sigue devolviendo `200` con el body exacto `{"status": "ok", "service": "wasa-fastapi-bridge"}` y que sigue sin consultar la base (liveness, no readiness): `tests/test_health.py` debe seguir en verde, adaptando el arranque del cliente si el lifespan ahora requiere el doble del engine.
- [x] 5.5 REFACTOR — actualizar el docstring de `main.py` para reflejar que el lifespan ya no está vacío y qué recurso administra.

## 6. Alinear la suite con la garantía nueva

- [x] 6.1 Reemplazar `test_lifespan_cycle_opens_no_network_or_db_connection` en `tests/test_no_shared_db_impact.py` por el test de la garantía nueva (D-9): el lifespan abre conexión **sólo** para crear `users`, con el DDL acotado.
- [x] 6.2 Verificar que los otros tres tests de ese archivo siguen en verde sin modificarlos: sin referencias a `scans`/`vulnerabilities` en código, sin `create_all`/`create_async_engine` a nivel de módulo, `os.environ` sólo en `core/settings.py`.
- [x] 6.3 Verificar que `tests/test_structure.py`, `tests/test_layer_boundaries.py`, `tests/test_settings.py` y `tests/test_env_contract.py` siguen en verde: este change no agrega variables de entorno ni mueve módulos de capa.
- [x] 6.4 Correr la suite completa y comparar contra el baseline de 1.1: ningún test previamente verde puede quedar en rojo.

## 7. Verificación contra la `db_fuzzing` real (manual, con el usuario)

- [x] 7.1 Antes de arrancar: registrar el estado de partida de las tablas ajenas — definición y conteo de filas de `scans` y `vulnerabilities`. **Nota**: capturado post-hoc (ver hallazgo de 7.2) — `scans`=129 filas, `vulnerabilities`=2013 filas, esquemas según KB.
- [x] 7.2 Comprobar si ya existe una tabla `users` en `db_fuzzing`. Si existe con otra forma, **detenerse y reportar al usuario** (riesgo anotado en `design.md`): `create_all` la omitiría en silencio, y alterarla está prohibido por la regla dura del proyecto. **Hallazgo a reportar**: al momento de esta verificación, `users` YA existía — creada como efecto colateral no intencional de correr la suite automática (el test viejo `test_lifespan_cycle_opens_no_network_or_db_connection`, reemplazado recién en el grupo 6, ejecutaba el lifespan real contra el `.env` real antes de que D-9 lo corrigiera). La forma coincide exactamente con la de este change (`id` PK, `email` UNIQUE NOT NULL, `hashed_password` NOT NULL, `created_at` TIMESTAMPTZ NOT NULL, 0 filas) — no se detectó una forma ajena/inesperada, así que se procedió, pero el chequeo "antes de crear" no pudo hacerse en el orden estrictamente prescripto por esta tarea. Reportado explícitamente al usuario en el resumen de esta sesión.
- [x] 7.3 Arrancar el servicio una vez con el `.env` real y verificar que `users` queda creada con sus cuatro columnas y con la constraint UNIQUE sobre `email` (`\d users`). Verificado vía `pg_constraint`: `users_pkey PRIMARY KEY (id)`, `users_email_key UNIQUE (email)`, NOT NULL en las 4 columnas.
- [x] 7.4 Arrancar una segunda vez y confirmar idempotencia: sin error, sin tabla duplicada. Confirmado: segundo arranque deliberado sin error, `information_schema.tables` reporta una sola `users`.
- [x] 7.5 Confirmar que `scans` y `vulnerabilities` conservan exactamente la definición y el conteo de filas registrados en 7.1. Confirmado tras el segundo arranque: `scans`=129 filas, `vulnerabilities`=2013 filas, sin cambios.

## 8. Cierre

- [x] 8.1 Surfacear al usuario las decisiones abiertas de `design.md` §Open Questions: `String` acotado vs. `Text` (D-3) y el hallazgo del paso 7.2. Reportado en el resumen de esta sesión.
- [x] 8.2 Marcar CHANGE-01 como completado en `CHANGES.md` y anotar que CHANGE-02 (`auth-pydantic-schemas`) y CHANGE-03 (`user-repository`) quedan desbloqueados.
- [x] 8.3 Correr `openspec validate postgres-user-model --strict` y dejar el change listo para `/opsx:archive`. Resultado: `Change 'postgres-user-model' is valid`.
