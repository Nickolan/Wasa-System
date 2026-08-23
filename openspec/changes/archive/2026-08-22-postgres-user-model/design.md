## Context

CHANGE-00a dejó el árbol de capas del FastAPI Bridge completo pero con `db/base.py`, `db/session.py` y `db/models.py` como docstrings vacíos, y con una garantía explícita codificada en spec y en tests: *el scaffold no abre conexión ni emite DDL*. CHANGE-00c cerró el contrato de configuración: `Settings.DB_URL` ya resuelve a un `postgresql+asyncpg://…/db_fuzzing` real, provisto por el usuario en un `.env` no versionado.

Este change es el primero que **escribe** en `db_fuzzing`. Esa base no es un entorno limpio del proyecto: es la instancia viva que el sistema WASA existente (n8n + SQLMap Worker + dashboard) usa para `scans` y `vulnerabilities`. DD-02 fijó que `users` viviera ahí y no en un SQLite aparte; la contrapartida es que cualquier DDL que emitamos cae sobre infraestructura de terceros.

Restricciones heredadas que condicionan el diseño:

- Regla dura del proyecto: nunca Alembic ni modificación de `scans`/`vulnerabilities`; el único DDL permitido es `create_all` para el modelo propio.
- Regla dura del proyecto: toda config viene de `core/settings.py`; nada de cadenas de conexión literales.
- Spec vigente `bridge-bootstrap`: `create_async_engine` y `create_all` no pueden ejecutarse a nivel de módulo (hay un test AST que lo verifica sobre todo el paquete).
- El Repository no puede importar FastAPI; `db/` queda por debajo de esa frontera y tampoco debe conocerla.

**Governance**: este change pertenece al dominio Auth (CHANGE-01..07). `CHANGES.md` lo etiqueta `CRITICO`, pero ese valor es previo al override; el `CLAUDE.md` del proyecto baja explícitamente el dominio Auth a **MEDIUM** para estos siete changes. Se implementa en pasos, surfaceando al usuario las decisiones no obvias (acá: tipos y longitudes de columna, comportamiento ante base caída, y qué pasa si `users` ya existe con otra forma), sin requerir aprobación línea por línea. `openspec-apply-change` hereda esta expectativa: MEDIUM, no CRITICAL.

## Goals / Non-Goals

**Goals:**

- Materializar `users` en `db_fuzzing` con la forma exacta de `knowledge-base/04_modelo_de_datos.md`, con unicidad de `email` garantizada por el motor.
- Dejar engine async + factory de sesiones listos para que la `AuthUoW` de CHANGE-03 los consuma sin refactor.
- Mantener el import del paquete libre de infraestructura, para no romper los tests de arranque de `bridge-bootstrap` ni la posibilidad de testear sin PostgreSQL.
- Hacer verificable **sin base de datos** que el DDL emitido es el correcto y que está acotado a `users`.

**Non-Goals:**

- Schemas Pydantic de auth (CHANGE-02), `UserRepository` (CHANGE-03), `AuthUoW` / `AuthService` / hashing bcrypt (CHANGE-04+), montaje de routers (CHANGE-06).
- Normalización a lowercase del email antes de persistir: es regla de negocio de la capa Service (RN-WS-12/13 se implementan en CHANGE-04). Acá sólo se provee el constraint que la respalda.
- Migraciones, versionado de esquema, seed data, pooling tuning, réplicas.
- Cualquier lectura o escritura de `scans` / `vulnerabilities`.

## Decisions

### D-1 — Engine y sessionmaker como factories perezosas, no como objetos de módulo

`CHANGES.md` describe el scope como `engine = create_async_engine(settings.DB_URL)` a nivel de módulo. **Se desvía deliberadamente**: `db/base.py` expone `get_engine(settings) -> AsyncEngine` cacheada con `@lru_cache`, y `db/session.py` expone `get_session_factory(settings) -> async_sessionmaker[AsyncSession]`, también cacheada.

- *Por qué*: un `create_async_engine` a nivel de módulo obliga a instanciar `Settings()` en el import y rompe el test `test_no_module_level_create_all_or_create_engine` de `bridge-bootstrap`, que no es un detalle sino la garantía de que importar el paquete no arrastra infraestructura (tests, herramientas, `--help` de uvicorn).
- *Alternativa descartada*: engine de módulo + excepción en el test. Cambia una garantía real por comodidad sintáctica.
- *Alternativa descartada*: guardar el engine en `app.state`. Ata `db/` al objeto FastAPI, y `db/`/`repositories/` deben ser usables fuera del framework.
- *Consecuencia*: `@lru_cache` sobre el parámetro `settings` exige que `Settings` sea hasheable. `get_settings()` ya devuelve una instancia única cacheada, así que la identidad alcanza; los tests pueden pasar otra instancia para obtener otro engine. Si `Settings` resultara no hasheable, se cachea sobre la cadena `DB_URL` en vez del objeto.

### D-2 — `create_all` acotado explícitamente a `User.__table__`

La llamada del arranque es `conn.run_sync(Base.metadata.create_all, tables=[User.__table__])`, no `create_all` a secas.

- *Por qué*: `create_all` sin argumentos crea **todo** lo que haya en el metadata. Hoy sólo hay `User`, así que es equivalente; pero el día que alguien agregue un modelo a la misma `Base`, el arranque empezaría a emitir DDL nuevo sobre una base de producción compartida sin que nadie lo haya decidido. Acotar convierte ese futuro descuido en una decisión explícita.
- `checkfirst=True` es el default y es lo que da la idempotencia: SQLAlchemy consulta el catálogo y omite la tabla si ya existe.

### D-3 — Tipos de columna: `String` acotado, no `Text`

`knowledge-base/04_modelo_de_datos.md` dice TEXT; se implementa como `String(320)` para `email` y `String(255)` para `hashed_password`.

- *Por qué*: en PostgreSQL `VARCHAR(n)` y `TEXT` tienen el mismo rendimiento y almacenamiento, así que el límite no cuesta nada y sí agrega una barrera de sanidad en el motor. 320 es el máximo de un email por RFC 5321 (64 local + @ + 255 dominio); 255 cubre holgadamente los 60 caracteres de un hash bcrypt de passlib y deja margen si en el futuro cambia el esquema de hashing.
- **Confirmado por el usuario**: se mantiene `String(320)`/`String(255)` (no `Text`).

### D-4 — `created_at` con `server_default=func.now()` y `timezone=True`

Se usa `DateTime(timezone=True)` con `server_default=func.now()`, no un `default=datetime.utcnow` de Python.

- *Por qué server_default*: la KB especifica `DEFAULT CURRENT_TIMESTAMP`, o sea el default vive en el DDL. Así una fila insertada por fuera del ORM también obtiene su marca, y el reloj de referencia es el del motor, único para todos los procesos.
- *Por qué timezone=True*: `TIMESTAMPTZ` evita la ambigüedad de un timestamp naive cuando el Bridge y PostgreSQL corren en husos distintos. Es la elección segura por defecto en PostgreSQL.

### D-5 — Unicidad vía `unique=True` en la columna, sin índice adicional

`email` se declara `unique=True`, lo que hace que el `CREATE TABLE` incluya la restricción y PostgreSQL cree el índice único que la respalda.

- *Por qué no un `Index(..., unique=True)` separado*: sería un índice único redundante sobre la misma columna.
- *Nota sobre la skill de SQLAlchemy/Alembic*: sus reglas de índices `CONCURRENTLY` y de constraints en dos pasos aplican a migraciones sobre tablas vivas con datos. Acá no hay migración: es un `CREATE TABLE` de una tabla nueva y vacía, donde el índice se construye en el mismo DDL sin lock relevante. Lo que sí se toma de esa skill es el principio de fondo: la unicidad tiene que ser del motor, no una validación de aplicación — porque dos registros concurrentes con el mismo email pasan la validación previa del Service y sólo el constraint los frena (RN-WS-13).
- *Consecuencia conocida*: la unicidad de PostgreSQL es sensible a mayúsculas, así que `A@x.com` y `a@x.com` conviven. La normalización a lowercase que exige la KB queda a cargo del Service en CHANGE-04; no se resuelve con `CITEXT` ni con un índice funcional para no introducir una extensión ni un índice extra en la base compartida.

### D-6 — Fallo ruidoso si `db_fuzzing` no responde en el arranque

El `create_all` del `lifespan` no se envuelve en `try/except`: si la conexión falla, la excepción propaga y el arranque aborta.

- *Por qué*: la alternativa —loguear y seguir— produce un servicio "sano" según `/health` que devolvería 500 en el primer `POST /register`. Un fallo de arranque es inmediato, visible y diagnosticable; un fallo diferido no.
- *Trade-off aceptado, a surfacear*: esto **cambia** la garantía de `bridge-bootstrap` de arrancar sin infraestructura externa. A partir de acá, `docker compose up` / `uvicorn` requieren PostgreSQL alcanzable. Es la consecuencia natural de DD-02 (con SQLite local esto no pasaba) y por eso el proposal la marca como BREAKING operacional.
- `/health` sigue siendo un liveness check del proceso y no consulta la base: esa parte de la spec no cambia.

### D-7 — `expire_on_commit=False` en la factory de sesiones

- *Por qué*: con el default (`True`), leer un atributo de un objeto después del `commit` dispara un refresh implícito. En SQLAlchemy async ese I/O implícito es exactamente la fuente del error `MissingGreenlet`. Desactivarlo es la configuración estándar recomendada para `AsyncSession` y evita que CHANGE-03/04 tropiecen con ello al devolver el `User` recién creado.

### D-8 — Verificar el DDL sin base de datos

Los tests del change no requieren un PostgreSQL vivo. Se verifican tres cosas por separado:

1. **Forma del modelo**: introspección de `User.__table__` (nombre, columnas, nullability, PK, unicidad, `server_default`).
2. **DDL real emitido**: compilar `CreateTable(User.__table__)` contra el dialecto `postgresql` y afirmar sobre el SQL resultante (incluye `UNIQUE`). Esto verifica el DDL de verdad sin conectarse.
3. **Alcance y ciclo del arranque**: ejercitar el `lifespan` con un doble del engine (una `AsyncEngine` simulada) y afirmar que `run_sync` recibió `create_all` con `tables=[users]` y que se llamó `dispose()`.

- *Alternativa descartada*: SQLite en memoria para los tests. Agregaría `aiosqlite` como dependencia, y su DDL difiere del de PostgreSQL justamente en lo que importa (tipos, `TIMESTAMPTZ`, `SERIAL`), o sea verificaría el dialecto equivocado.
- *Alternativa descartada*: exigir PostgreSQL en la suite. Rompe la posibilidad de correr tests sin infraestructura, que es una propiedad que el proyecto ya tiene y conviene conservar.
- La verificación **contra la base real** (tabla creada, idempotencia entre dos arranques, `scans`/`vulnerabilities` intactas) se hace como paso manual documentado en `tasks.md`, porque son criterios de aceptación que por definición necesitan la instancia real.

### D-9 — Actualizar el test que codifica la garantía vieja

`tests/test_no_shared_db_impact.py::test_lifespan_cycle_opens_no_network_or_db_connection` afirma que el ciclo de lifespan no abre conexión. Este change lo vuelve falso a propósito. Se reemplaza por un test que afirma la garantía nueva y más fuerte: el lifespan abre conexión **sólo** para crear `users`, con el DDL acotado. Los otros tres tests del archivo (sin referencias a tablas ajenas, sin llamadas a nivel de módulo, `os.environ` sólo en settings) siguen vigentes sin cambios y deben permanecer en verde.

## Risks / Trade-offs

- **`users` ya existe en `db_fuzzing` con otra forma** (por ejemplo, creada a mano o por un experimento previo) → `create_all` con `checkfirst` la ve, la omite en silencio y el servicio arranca creyendo que todo está bien; después fallarían los inserts. Mitigación: la tarea de verificación manual contra la base real incluye inspeccionar `\d users` y comparar columnas y constraint. No se agrega corrección automática: alterar una tabla existente en la base compartida es exactamente lo que la regla dura prohíbe.
- **DDL sobre infraestructura de producción compartida** → Mitigación en capas: `checkfirst` (no re-crea), `tables=[...]` (no toca nada más), ausencia total de Alembic (no puede emitir `ALTER`/`DROP`), y el test AST que impide que aparezca cualquier referencia a `scans`/`vulnerabilities` en el código.
- **Rollback**: no hay rollback automático. Si hubiera que revertir, es un `DROP TABLE users` manual ejecutado por una persona sobre `db_fuzzing`. El servicio nunca emite `DROP`. Como `users` arranca vacía y sin FKs hacia ella ni desde ella, revertir no arrastra nada.
- **El arranque ahora depende de la red** → arranques más lentos y un modo de falla nuevo en despliegue. Aceptado conscientemente (D-6); es el costo de DD-02.
- **`@lru_cache` sobre el engine** guarda una referencia viva por proceso: en tests que crean y descartan configuraciones, puede quedar un engine sin `dispose()`. Mitigación: los tests que construyen engines propios los cierran, y el lifespan siempre hace `dispose()` en el shutdown.
- **Unicidad sensible a mayúsculas** hasta que CHANGE-04 normalice a lowercase: en esa ventana, dos cuentas que difieren sólo en capitalización serían posibles. No hay usuarios reales todavía (la tabla arranca vacía, sin seed data), así que la ventana es inofensiva. Queda registrado como dependencia funcional de CHANGE-04.

## Migration Plan

1. Implementar y correr la suite sin PostgreSQL: verifica forma del modelo, DDL compilado y alcance del `create_all` (D-8).
2. Con `fastapi_bridge/.env` apuntando a la `db_fuzzing` real, arrancar el servicio una vez y verificar a mano: `users` existe con las cuatro columnas, `email` tiene UNIQUE, y `scans`/`vulnerabilities` conservan su definición y su conteo de filas.
3. Arrancar una segunda vez y confirmar que no hay error ni tabla duplicada (idempotencia).
4. Rollback, si hiciera falta: `DROP TABLE users;` manual. No afecta a ninguna otra tabla — `users` no tiene relaciones.

## Open Questions

- ¿Existe ya alguna tabla `users` en la `db_fuzzing` desplegada? El paso 2 del plan de migración lo responde antes de que sea un problema.
