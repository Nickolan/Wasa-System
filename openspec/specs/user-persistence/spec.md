## ADDED Requirements

### Requirement: Entidad `users` declarada como modelo ORM
El FastAPI Bridge SHALL declarar la entidad de usuario del SaaS como una única clase `User` en `fastapi_bridge/db/models.py`, mapeada a la tabla `users` y heredando de la `DeclarativeBase` del proyecto definida en `fastapi_bridge/db/base.py`. La clase SHALL usar el estilo tipado de SQLAlchemy 2.0 (`Mapped` / `mapped_column`), con type hints explícitos en cada columna.

#### Scenario: Nombre de tabla y columnas del modelo
- **WHEN** se inspecciona `User.__table__`
- **THEN** el nombre de la tabla es `users` y sus columnas son exactamente `id`, `email`, `hashed_password` y `created_at`

#### Scenario: Clave primaria autoincremental
- **WHEN** se inspecciona la columna `id`
- **THEN** es entera, es clave primaria y es autoincremental (el valor lo genera la base, no la aplicación)

#### Scenario: Columnas obligatorias
- **WHEN** se inspeccionan las columnas `email` y `hashed_password`
- **THEN** ambas son `NOT NULL` (`nullable is False`)

#### Scenario: Marca temporal de alta generada por la base
- **WHEN** se inspecciona la columna `created_at`
- **THEN** es de tipo fecha-hora con zona horaria y tiene un `server_default` que resuelve al reloj de PostgreSQL, de modo que insertar un usuario sin pasar `created_at` produce igualmente un valor

#### Scenario: El modelo hereda de la Base del proyecto
- **WHEN** se inspecciona `Base.metadata.tables`
- **THEN** `users` es la única tabla registrada en el metadata del proyecto

### Requirement: Unicidad de email a nivel de base de datos
La columna `email` SHALL tener una restricción de unicidad **en el motor**, no solamente validación en la capa de aplicación. Esta restricción es la que garantiza RN-WS-13 (un registro con email duplicado retorna 409 Conflict) incluso ante inserciones concurrentes que la validación previa en el Service no puede detectar.

#### Scenario: Constraint UNIQUE declarada en el modelo
- **WHEN** se inspecciona la columna `email` de `User.__table__`
- **THEN** está marcada como única, y esa unicidad se materializa en el DDL emitido

#### Scenario: El DDL emitido contiene la unicidad
- **WHEN** se compila el `CREATE TABLE` de `User.__table__` contra el dialecto PostgreSQL
- **THEN** el SQL resultante declara la unicidad de `email` (constraint `UNIQUE` o índice único equivalente)

#### Scenario: La unicidad soporta la búsqueda por email
- **WHEN** un change posterior consulte usuarios por `email` (`get_by_email`)
- **THEN** la columna ya está respaldada por un índice único, sin necesidad de declarar un índice adicional

### Requirement: Engine asíncrono contra la instancia compartida
El acceso a datos SHALL realizarse mediante un engine asíncrono de SQLAlchemy construido con `create_async_engine` sobre `settings.DB_URL`, que apunta a la instancia PostgreSQL compartida `db_fuzzing` con el driver `asyncpg`. La URL de conexión SHALL provenir exclusivamente de `fastapi_bridge/core/settings.py`; ningún módulo SHALL hardcodear host, credenciales ni nombre de base.

#### Scenario: Driver asíncrono
- **WHEN** se construye el engine a partir de `settings.DB_URL`
- **THEN** el engine es un `AsyncEngine` y su dialecto usa el driver `asyncpg`, no un driver síncrono

#### Scenario: Origen único de la URL de conexión
- **WHEN** se inspecciona el código de `db/base.py` y `db/session.py`
- **THEN** la URL se obtiene del objeto `Settings` y no aparece ninguna cadena de conexión literal en el código

#### Scenario: El engine no se construye al importar el módulo
- **WHEN** se importa `fastapi_bridge.db.base` sin que PostgreSQL esté accesible
- **THEN** el import se completa sin errores y no se invoca `create_async_engine` a nivel de módulo: el engine se obtiene a través de una factory explícita

#### Scenario: Un único engine por proceso
- **WHEN** se pide el engine dos veces dentro del mismo proceso con la misma configuración
- **THEN** se obtiene la misma instancia, de modo que el servicio mantiene un solo pool de conexiones contra `db_fuzzing`

### Requirement: Factory de sesiones asíncronas
`fastapi_bridge/db/session.py` SHALL exponer una factory de `AsyncSession` ligada al engine, configurada de modo que los objetos sigan siendo utilizables después de un `commit` (sin recarga implícita que dispare I/O fuera del contexto async). Esta factory es el único punto desde el que las Unit of Work de changes posteriores SHALL obtener sesiones.

#### Scenario: La factory produce sesiones asíncronas
- **WHEN** se invoca la factory de sesiones
- **THEN** devuelve una `AsyncSession` ligada al engine asíncrono del servicio

#### Scenario: Sin expiración de atributos al commitear
- **WHEN** se inspecciona la configuración de la factory
- **THEN** está construida con `expire_on_commit=False`, de modo que leer atributos de un objeto ya commiteado no dispara una consulta implícita

#### Scenario: Obtener la factory no abre conexión
- **WHEN** se obtiene la factory de sesiones con PostgreSQL inaccesible
- **THEN** la operación tiene éxito: la conexión se abre recién cuando una sesión ejecuta su primera sentencia

### Requirement: Creación idempotente de la tabla en el arranque
Durante el `lifespan` de arranque, el servicio SHALL crear la tabla `users` en `db_fuzzing` si no existe, mediante `Base.metadata.create_all` ejecutado a través de `run_sync` sobre una conexión asíncrona. La operación SHALL ser idempotente: arrancar el servicio repetidamente no SHALL duplicar la tabla ni fallar. En el apagado, el servicio SHALL liberar el pool de conexiones.

#### Scenario: La tabla se crea en el primer arranque
- **WHEN** arranca el servicio contra una `db_fuzzing` donde `users` no existe
- **THEN** al terminar el arranque la tabla `users` existe con sus cuatro columnas y la unicidad de `email`

#### Scenario: Arranques sucesivos no duplican ni fallan
- **WHEN** el servicio arranca por segunda vez contra la misma base, con `users` ya existente
- **THEN** el arranque termina sin error, no se emite un `CREATE TABLE` que falle y la tabla sigue siendo una sola

#### Scenario: Los datos existentes sobreviven al arranque
- **WHEN** el servicio arranca contra una base donde `users` ya contiene registros
- **THEN** ningún registro se borra ni se altera: el arranque no ejecuta `DROP`, `TRUNCATE` ni `ALTER`

#### Scenario: El pool se libera en el apagado
- **WHEN** el servicio completa su ciclo de `lifespan` (arranque y apagado)
- **THEN** el engine se cierra con `dispose()` y no quedan conexiones abiertas contra `db_fuzzing`

### Requirement: El DDL emitido se restringe a la tabla propia
La creación de tablas SHALL acotarse explícitamente a `User.__table__`, en lugar de delegar en el contenido completo del metadata. Esta restricción es defensiva: garantiza que si un change futuro registra otro modelo en la misma `Base`, el arranque no empiece a emitir DDL inesperado sobre la base compartida sin una decisión deliberada.

#### Scenario: El alcance del create_all es explícito
- **WHEN** se inspecciona la llamada de creación de tablas en el arranque
- **THEN** recibe explícitamente la lista de tablas a crear, conteniendo únicamente la tabla `users`

#### Scenario: Un modelo nuevo no se crea por arrastre
- **WHEN** se registra hipotéticamente un segundo modelo en la misma `Base` sin tocar el arranque
- **THEN** el DDL del arranque sigue emitiendo solamente la tabla `users`

### Requirement: Las tablas del sistema WASA existente permanecen intactas
El FastAPI Bridge SHALL convivir con `scans` y `vulnerabilities` en `db_fuzzing` sin declararlas, sin mapearlas, sin leerlas y sin escribirlas. El servicio NO SHALL introducir Alembic ni ninguna otra herramienta de migración sobre esta base: el único mecanismo de DDL permitido es la creación idempotente de `users` (DD-02).

#### Scenario: Las tablas ajenas no están declaradas
- **WHEN** se inspecciona el código de producción de `fastapi_bridge/` fuera de los docstrings
- **THEN** no aparece ninguna referencia a `scans` ni a `vulnerabilities`: ni como modelo, ni como nombre de tabla, ni como SQL literal

#### Scenario: Sin migraciones sobre la base compartida
- **WHEN** se inspecciona el árbol del proyecto
- **THEN** no existe configuración ni directorio de migraciones de Alembic, y ningún archivo emite `ALTER`, `DROP` o `TRUNCATE` contra `db_fuzzing`

#### Scenario: El esquema ajeno sobrevive al arranque
- **WHEN** el servicio arranca contra una `db_fuzzing` que ya contiene `scans` y `vulnerabilities` con datos
- **THEN** ambas tablas conservan su definición y su contenido exactos después del arranque

### Requirement: Fallo ruidoso si la base no está disponible
Si `db_fuzzing` no es alcanzable durante el arranque, el servicio SHALL fallar de forma explícita en lugar de quedar levantado sin su tabla. Un arranque exitoso SHALL implicar que la persistencia de usuarios está operativa.

#### Scenario: Arranque con la base caída
- **WHEN** el servicio intenta arrancar y `settings.DB_URL` apunta a una base inaccesible
- **THEN** el arranque falla con el error de conexión propagado, y la aplicación no queda sirviendo peticiones

#### Scenario: El error de conexión no se silencia
- **WHEN** se inspecciona el hook de arranque
- **THEN** la creación de tablas no está envuelta en un `except` que descarte el error y continúe
