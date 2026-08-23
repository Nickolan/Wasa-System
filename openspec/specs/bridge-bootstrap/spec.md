## ADDED Requirements

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

### Requirement: Endpoint de salud
El servicio SHALL exponer `GET /health` como endpoint público, sin autenticación, que reporte el estado del propio proceso.

#### Scenario: Health check exitoso
- **WHEN** se hace `GET /health`
- **THEN** la respuesta tiene status `200` y body exactamente `{"status": "ok", "service": "wasa-fastapi-bridge"}`

#### Scenario: Health check no requiere autenticación
- **WHEN** se hace `GET /health` sin header `Authorization`
- **THEN** la respuesta es `200` y nunca `401`

#### Scenario: Health check no consulta dependencias externas
- **WHEN** se hace `GET /health` con PostgreSQL y n8n inaccesibles
- **THEN** la respuesta sigue siendo `200` (es un liveness check del proceso, no un readiness check de dependencias)

### Requirement: Configuración tipada desde el entorno
Toda la configuración del servicio SHALL resolverse a través de una única clase `Settings` basada en Pydantic `BaseSettings` en `fastapi_bridge/core/settings.py`, leída de variables de entorno y de un archivo `.env`. Ningún módulo del servicio SHALL leer `os.environ` directamente ni hardcodear valores de configuración.

#### Scenario: Campos del contrato de configuración
- **WHEN** se instancia `Settings`
- **THEN** expone al menos los campos `JWT_SECRET`, `TOKEN_EXPIRE_HOURS`, `DB_URL`, `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_TOKEN`, `CORS_ORIGINS`, `RATE_LIMIT_REQUESTS`, `RATE_LIMIT_WINDOW` y `APP_ENV`, cada uno con type hint explícito

#### Scenario: Los valores del entorno tienen precedencia
- **WHEN** la variable de entorno `TOKEN_EXPIRE_HOURS` vale `48`
- **THEN** `Settings().TOKEN_EXPIRE_HOURS == 48` como entero, no como cadena

#### Scenario: Arranque sin .env presente
- **WHEN** no existe archivo `.env` y no hay variables de entorno definidas
- **THEN** `Settings()` se instancia con los defaults de desarrollo declarados y el servicio arranca igualmente

#### Scenario: Acceso único a la configuración
- **WHEN** se buscan lecturas de configuración en el paquete `fastapi_bridge/`
- **THEN** no aparece ninguna llamada a `os.environ` / `os.getenv` fuera de `core/settings.py`

#### Scenario: Los secretos no se exponen
- **WHEN** se serializa o loguea el objeto `Settings`
- **THEN** los valores de `JWT_SECRET` y `N8N_WEBHOOK_TOKEN` no aparecen en texto plano

### Requirement: Estructura de capas del backend
El paquete `fastapi_bridge/` SHALL materializar en el filesystem la arquitectura de capas Router → Service → UoW → Repository, con módulos separados por los dos dominios del sistema (`auth` y `scan`), de modo que cada change posterior tenga un destino inequívoco para su código.

#### Scenario: Directorios y módulos presentes
- **WHEN** se inspecciona el árbol de `fastapi_bridge/`
- **THEN** existen `main.py`, `core/settings.py`, `core/security.py`, `core/dependencies.py`, `db/base.py`, `db/session.py`, `db/models.py`, `api/v1/auth/router.py`, `api/v1/scan/router.py`, `services/auth_service.py`, `services/scan_service.py`, `uow/auth_unit_of_work.py`, `uow/scan_unit_of_work.py`, `repositories/user_repository.py`, `repositories/n8n_repository.py`, `schemas/auth_schemas.py`, `schemas/scan_schemas.py` y `exceptions/handlers.py`

#### Scenario: Paquetes Python importables
- **WHEN** se importa cualquiera de los módulos del árbol anterior
- **THEN** el import tiene éxito sin errores (cada directorio contiene su `__init__.py`)

#### Scenario: Simetría de dominios
- **WHEN** se comparan los módulos de `auth` y de `scan`
- **THEN** ambos dominios tienen su router, su service, su UoW, su repository y su módulo de schemas, sin que uno tenga capas que al otro le falten

### Requirement: Fronteras de import entre capas
Las capas SHALL respetar una dirección de dependencia única. En particular, ningún módulo bajo `repositories/` SHALL importar nada de FastAPI, para que la capa de acceso a datos sea reutilizable fuera del framework web. Además, la criptografía del servicio SHALL estar concentrada en `core/security.py`: ningún módulo bajo `services/`, `repositories/`, `api/` o `schemas/` SHALL importar directamente la librería de hashing de contraseñas ni la librería de JWT, de modo que el hashing, la firma y la verificación tengan una única superficie auditable.

#### Scenario: Repository libre de FastAPI
- **WHEN** se inspeccionan los imports de `repositories/user_repository.py` y `repositories/n8n_repository.py`
- **THEN** no aparece ningún import de `fastapi` (ni `Request`, `Response`, `Depends`, `HTTPException`)

#### Scenario: Router sin acceso directo a infraestructura
- **WHEN** se inspeccionan los imports de `api/v1/auth/router.py` y `api/v1/scan/router.py`
- **THEN** no aparece ningún import de `sqlalchemy` ni de `httpx`

#### Scenario: Service sin instanciación directa de infraestructura
- **WHEN** se inspeccionan `services/auth_service.py` y `services/scan_service.py`
- **THEN** no instancian `httpx.AsyncClient` ni sesiones de SQLAlchemy directamente; el acceso se declara a través de la UoW correspondiente

#### Scenario: Service sin criptografía propia
- **WHEN** se inspeccionan los imports de todos los módulos de `services/`
- **THEN** ninguno importa la librería de hashing de contraseñas ni la librería de JWT: el acceso pasa por `core/security.py`

#### Scenario: Repository sin la librería de hashing
- **WHEN** se inspeccionan los imports de todos los módulos de `repositories/`
- **THEN** ninguno importa la librería de hashing de contraseñas que el proyecto declare en su manifiesto de dependencias: el repositorio recibe el hash ya calculado y lo trata como texto opaco

#### Scenario: Las fronteras están ancladas por tests, no solo documentadas
- **WHEN** un change futuro agregue a una capa un import prohibido por alguna de estas reglas
- **THEN** la suite de tests falla, señalando el archivo y el paquete prohibido

### Requirement: Manifiesto de dependencias
El proyecto SHALL declarar sus dependencias de runtime y de desarrollo en manifiestos versionados, separando lo que el servicio necesita para correr de lo que sólo se necesita para probarlo. Las dependencias declaradas SHALL ser instalables y funcionales en conjunto: una combinación de versiones que instale sin conflictos pero falle al invocarse NO SHALL considerarse un manifiesto válido.

#### Scenario: Dependencias de runtime declaradas
- **WHEN** se lee `fastapi_bridge/requirements.txt`
- **THEN** contiene `fastapi`, `pydantic[email]`, `pydantic-settings`, `python-jose[cryptography]`, `bcrypt`, `sqlalchemy`, `asyncpg`, `httpx`, `slowapi`, `uvicorn` y `python-dotenv`

#### Scenario: Dependencias de test separadas
- **WHEN** se lee `fastapi_bridge/requirements-dev.txt`
- **THEN** contiene al menos `pytest` y `pytest-asyncio`, y ninguna de ellas aparece en `requirements.txt`

#### Scenario: Instalación limpia
- **WHEN** se ejecuta `pip install -r fastapi_bridge/requirements.txt` en un entorno virgen
- **THEN** la instalación termina sin conflictos de resolución y `uvicorn fastapi_bridge.main:app` arranca

#### Scenario: El hashing de contraseñas funciona con las versiones declaradas
- **WHEN** se instala el manifiesto de runtime en un entorno virgen y se deriva un hash de contraseña con la librería declarada
- **THEN** la operación tiene éxito: el manifiesto no admite una combinación de versiones que instale pero rompa al hashear

#### Scenario: Sin dependencias sin mantenimiento para la criptografía
- **WHEN** se lee `fastapi_bridge/requirements.txt`
- **THEN** no declara `passlib`, cuya última publicación es anterior al proyecto y cuya integración con las versiones actuales de bcrypt está rota

### Requirement: Superficie de API acotada al scaffold
En este estadio el servicio SHALL exponer únicamente el endpoint de salud. Los routers de dominio existen como módulos pero NO SHALL estar montados en la aplicación hasta que sus changes correspondientes los implementen.

#### Scenario: Sólo /health está expuesto
- **WHEN** se inspecciona `app.routes` descartando las rutas internas de FastAPI (`/docs`, `/openapi.json`, `/redoc`)
- **THEN** la única ruta de aplicación registrada es `GET /health`

#### Scenario: Endpoints de dominio aún no disponibles
- **WHEN** se hace `POST /api/v1/auth/register` o `POST /api/v1/scan/start`
- **THEN** la respuesta es `404`, porque esos routers todavía no están montados

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
