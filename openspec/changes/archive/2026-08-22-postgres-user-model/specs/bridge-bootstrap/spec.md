## MODIFIED Requirements

### Requirement: El servicio arranca como aplicación ASGI
El FastAPI Bridge SHALL exponerse como una instancia ASGI importable en `fastapi_bridge.main:app`. El **import** del paquete SHALL seguir siendo libre de infraestructura: importar cualquier módulo del servicio no SHALL abrir conexiones de red ni de base de datos, ni requerir que PostgreSQL, n8n o Redis estén disponibles. El **arranque efectivo** del servidor, en cambio, ahora depende de la instancia PostgreSQL `db_fuzzing`, porque el ciclo de `lifespan` crea allí la tabla `users` (ver capacidad `user-persistence`). n8n y Redis siguen sin ser requisitos de arranque.

#### Scenario: Arranque con Uvicorn
- **WHEN** se ejecuta `uvicorn fastapi_bridge.main:app --reload` con `db_fuzzing` alcanzable
- **THEN** el servidor levanta sin errores ni tracebacks y queda escuchando peticiones

#### Scenario: Import sin infraestructura externa
- **WHEN** se importa `fastapi_bridge.main` sin que PostgreSQL `db_fuzzing`, n8n o Redis estén accesibles
- **THEN** el import se completa correctamente y no se intenta ninguna conexión de red ni de base de datos: la conexión ocurre recién en el `lifespan`, no en el import

#### Scenario: Arranque sin la base de datos
- **WHEN** se intenta arrancar el servidor con `db_fuzzing` inaccesible
- **THEN** el arranque falla de forma explícita con el error de conexión, en lugar de levantar un servicio sin su tabla de usuarios

#### Scenario: Arranque sin n8n ni Redis
- **WHEN** se arranca el servidor con `db_fuzzing` alcanzable pero n8n y Redis caídos
- **THEN** el servidor levanta normalmente: esas dependencias no participan del arranque

#### Scenario: Import de la app como objeto
- **WHEN** se ejecuta `from fastapi_bridge.main import app`
- **THEN** `app` es una instancia de `fastapi.FastAPI`

### Requirement: El scaffold no toca la base de datos compartida
El FastAPI Bridge SHALL convivir con el sistema WASA existente sobre la instancia PostgreSQL `db_fuzzing` sin alterar lo que no le pertenece. El servicio SHALL abrir conexión y emitir DDL **exclusivamente** para su propia tabla `users`; las tablas preexistentes `scans` y `vulnerabilities` NO SHALL ser declaradas, mapeadas, leídas, escritas ni migradas desde este servicio.

#### Scenario: Sin conexión en el import
- **WHEN** se importan los módulos del servicio
- **THEN** no se construye ningún engine ni se abre ningún pool a nivel de módulo: `create_async_engine` y `create_all` no se invocan en el cuerpo de ningún módulo

#### Scenario: El único DDL del arranque es la tabla propia
- **WHEN** arranca la aplicación contra `db_fuzzing`
- **THEN** el único DDL emitido es el `CREATE TABLE` idempotente de `users`, acotado explícitamente a esa tabla

#### Scenario: Tablas existentes intactas
- **WHEN** se revisa el código de producción del servicio fuera de los docstrings
- **THEN** no existe ninguna sentencia, modelo ni migración que referencie las tablas `scans` o `vulnerabilities`

#### Scenario: Sin herramientas de migración sobre la base compartida
- **WHEN** se inspecciona el árbol del proyecto
- **THEN** no hay configuración de Alembic ni ningún otro mecanismo que pueda emitir `ALTER`, `DROP` o `TRUNCATE` sobre `db_fuzzing`
