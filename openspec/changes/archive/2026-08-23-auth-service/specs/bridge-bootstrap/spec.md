## MODIFIED Requirements

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
