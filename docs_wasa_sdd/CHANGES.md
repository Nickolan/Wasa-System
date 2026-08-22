# WASA Landing Page & FastAPI Bridge — Roadmap de Implementación
**Metodología**: SDD (Spec-Driven Development)
**Última actualización**: 2026-08-21 (rev: autenticación JWT + tabla users en PostgreSQL db_fuzzing)
**Versión**: 1.2

---

## Convenciones de este documento

- Cada **Change** es una unidad atómica de implementación con alcance claro.
- Los cambios deben implementarse en el orden indicado (respetando dependencias).
- Cada change tiene criterios de aceptación verificables antes de pasar al siguiente.
- El estado avanza: `⬜ Pendiente` → `🔄 En progreso` → `✅ Hecho (YYYY-MM-DD)`

---

## Árbol de Dependencias

```
CHANGE-00a (FastAPI scaffold)
CHANGE-00b (React Landing scaffold + Zustand)
CHANGE-00c (.env ambos proyectos — incluye JWT_SECRET, DB_URL)
    │
    ├── CHANGE-00d (CORS + Rate Limiting) ──────────── depende de 00a
    │
    ├── CHANGE-01 (PostgreSQL db_fuzzing + ORM model User) ── depende de 00a
    │       │
    │       ├── CHANGE-02 (Auth Pydantic schemas) ──── depende de 01
    │       │       │
    │       │       └── CHANGE-03 (User repository) ── depende de 01, 02
    │       │               │
    │       │               └── CHANGE-04 (Auth service: bcrypt + JWT) ─ depende de 03
    │       │                       │
    │       │                       ├── CHANGE-05 (Auth router: /register, /login) ─ depende de 04
    │       │                       │
    │       │                       └── CHANGE-06 (JWT dependency: get_current_user) ─ depende de 04
    │       │
    │       └── CHANGE-07 (RFC 7807 exception handlers) ─── depende de 00a
    │
    ├── CHANGE-08 (Scan Pydantic schemas) ──────────── depende de 00a
    │       │
    │       └── CHANGE-09 (N8n repository) ─────────── depende de 08
    │               │
    │               └── CHANGE-10 (Scan UoW) ──────── depende de 09
    │                       │
    │                       └── CHANGE-11 (Scan service) ── depende de 10
    │                               │
    │                               └── CHANGE-12 (Scan router — JWT protected) ─ depende de 11, 06, 00d
    │
    ├── CHANGE-13 (authStore Zustand + tipos TS) ───── depende de 00b
    │       │
    │       ├── CHANGE-14 (Auth Zod schemas + tipos) ─ depende de 13
    │       │
    │       └── CHANGE-15 (Shared UI atoms + Modal) ── depende de 00b
    │               │
    │               ├── CHANGE-16 (Feature auth: login + register) ─ depende de 13, 14, 15
    │               │
    │               ├── CHANGE-17 (Scan Zod schema + tipos) ────────── depende de 00b
    │               │       │
    │               │       └── CHANGE-18 (Feature scan-form + JWT attach) ─ depende de 13, 15, 17
    │               │
    │               └── CHANGE-19 (Widgets: auth-modal + scan-form + info) ─ depende de 16, 18
    │                       │
    │                       └── CHANGE-20 (LandingPage composition) ─ depende de 19
    │
    ├── CHANGE-21 (n8n Webhook Trigger) ──── depende de 12
    │
    └── CHANGE-22 (E2E smoke test) ─── depende de 12, 20, 21
```

---

## CHANGE-00: SCAFFOLDING INICIAL

### CHANGE-00a — Estructura inicial FastAPI Bridge

| Campo              | Valor                                                                     |
| :----------------- | :------------------------------------------------------------------------ |
| **Nombre**         | fastapi-bridge-scaffold                                                   |
| **Historias US**   | HU-03-01, HU-03-02                                                        |
| **Funcionalidad**  | Crear la estructura de carpetas y archivos base del microservicio FastAPI  |
| **Dependencias**   | Ninguna                                                                   |
| **Duración est.**  | 1 hora                                                                    |
| **Estado**         | ⬜ Pendiente                                                              |

**Alcance:**
- Carpeta raíz: `fastapi_bridge/`
- Estructura completa: `main.py`, `core/settings.py`, `core/security.py`,
  `core/dependencies.py`, `db/base.py`, `db/session.py`, `db/models.py`,
  `api/v1/auth/router.py`, `api/v1/scan/router.py`,
  `services/auth_service.py`, `services/scan_service.py`,
  `uow/auth_unit_of_work.py`, `uow/scan_unit_of_work.py`,
  `repositories/user_repository.py`, `repositories/n8n_repository.py`,
  `schemas/auth_schemas.py`, `schemas/scan_schemas.py`,
  `exceptions/handlers.py`
- `requirements.txt` con: fastapi, pydantic[email], python-jose[cryptography],
  passlib[bcrypt], sqlalchemy, asyncpg, httpx, slowapi, uvicorn, python-dotenv
- `main.py` con app FastAPI básica (solo GET /health)

**Criterios de Aceptación:**
- [ ] `uvicorn fastapi_bridge.main:app --reload` arranca sin errores.
- [ ] GET /health retorna `{"status": "ok", "service": "wasa-fastapi-bridge"}`.
- [ ] La estructura de carpetas refleja exactamente los dos dominios (auth + scan).
- [ ] `requirements.txt` contiene todas las dependencias.
- [ ] `core/settings.py` tiene campos para JWT_SECRET, TOKEN_EXPIRE_HOURS, DB_URL.

---

### CHANGE-00b — Estructura inicial React Landing Page

| Campo              | Valor                                                     |
| :----------------- | :-------------------------------------------------------- |
| **Nombre**         | react-landing-scaffold                                    |
| **Historias US**   | HU-01-01, HU-06-01                                        |
| **Funcionalidad**  | Crear el proyecto React con Vite, FSD y Zustand           |
| **Dependencias**   | Ninguna                                                   |
| **Duración est.**  | 1 hora                                                    |
| **Estado**         | ⬜ Pendiente                                              |

**Alcance:**
- `npm create vite@latest wasa-landing -- --template react-ts`
- Instalar: tailwindcss, postcss, autoprefixer, react-hook-form, zod,
  @hookform/resolvers, axios, zustand
- Configurar Tailwind (tailwind.config.ts, postcss.config.ts, index.css)
- Crear estructura FSD:
  `src/app/stores/`, `src/pages/`, `src/widgets/`, `src/features/`,
  `src/entities/`, `src/shared/`
- Path aliases en `vite.config.ts` y `tsconfig.json`
- `src/app/App.tsx` renderiza `<LandingPage />` placeholder

**Criterios de Aceptación:**
- [ ] `npm run dev` arranca sin errores en puerto 5173.
- [ ] `npm run build` genera build sin errores TypeScript.
- [ ] La estructura de carpetas FSD (incluyendo `app/stores/`) existe.
- [ ] Zustand instalado y verificado (importación sin error).
- [ ] Tailwind CSS funciona en un componente de prueba.
- [ ] Los path aliases funcionan.

---

### CHANGE-00c — Variables de entorno

| Campo              | Valor                                                     |
| :----------------- | :-------------------------------------------------------- |
| **Nombre**         | env-config                                                |
| **Historias US**   | HU-03-01, HU-06-02                                        |
| **Funcionalidad**  | Crear archivos .env con variables de auth, JWT y bridge   |
| **Dependencias**   | CHANGE-00a, CHANGE-00b                                    |
| **Duración est.**  | 30 minutos                                                |
| **Estado**         | ⬜ Pendiente                                              |

**Alcance:**
- `fastapi_bridge/.env` con: N8N_WEBHOOK_URL, N8N_WEBHOOK_TOKEN,
  JWT_SECRET, TOKEN_EXPIRE_HOURS=24,
  DB_URL=postgresql+asyncpg://user:pass@host:5432/db_fuzzing (misma
  instancia PostgreSQL que ya usa el sistema WASA),
  CORS_ORIGINS, RATE_LIMIT_REQUESTS=10, RATE_LIMIT_WINDOW=3600,
  APP_ENV=development
- `fastapi_bridge/.env.example` (valores placeholder)
- `wasa-landing/.env` con: VITE_API_BASE_URL, VITE_DASHBOARD_URL
- `wasa-landing/.env.example` (valores placeholder)
- Ambos `.env` reales en `.gitignore`

**Criterios de Aceptación:**
- [ ] `core/settings.py` lee JWT_SECRET y DB_URL correctamente del `.env`.
- [ ] `src/shared/config/env.ts` exporta las dos variables Vite correctamente.
- [ ] Los `.env` reales NO están en el repositorio.
- [ ] Los `.env.example` están en el repositorio.

---

### CHANGE-00d — CORS y Rate Limiting en FastAPI

| Campo              | Valor                                                     |
| :----------------- | :-------------------------------------------------------- |
| **Nombre**         | fastapi-cors-ratelimit                                    |
| **Historias US**   | HU-03-06                                                  |
| **Funcionalidad**  | CORS middleware + slowapi rate limiter sobre /scan/start  |
| **Dependencias**   | CHANGE-00a, CHANGE-00c                                    |
| **Duración est.**  | 1 hora                                                    |
| **Estado**         | ⬜ Pendiente                                              |

**Alcance:**
- `CORSMiddleware` con `allow_origins` desde `settings.CORS_ORIGINS`
- `slowapi` Limiter con `key_func=get_remote_address`
- Rate limit aplicado solo sobre `/api/v1/scan/start` (no sobre auth)
- Handler para `RateLimitExceeded` → RFC 7807 + `Retry-After`

**Criterios de Aceptación:**
- [ ] Request desde origen no en CORS_ORIGINS recibe bloqueo CORS.
- [ ] Request desde origen permitido recibe headers CORS correctos.
- [ ] La solicitud 11 a /scan/start (misma IP, misma ventana) recibe 429.
- [ ] La respuesta 429 incluye header `Retry-After`.
- [ ] Los endpoints de auth NO están sujetos al rate limit del scan.

---

## CHANGE-01: POSTGRESQL DB_FUZZING + ORM MODEL USER (FastAPI Backend)

| Campo              | Valor                                                     |
| :----------------- | :-------------------------------------------------------- |
| **Nombre**         | postgres-user-model                                       |
| **Historias US**   | HU-03-01, HU-06-02                                        |
| **Funcionalidad**  | Engine SQLAlchemy async + modelo ORM User + tabla users, sobre la misma instancia PostgreSQL db_fuzzing ya usada por el sistema WASA |
| **Dependencias**   | CHANGE-00a                                                |
| **Duración est.**  | 1.5 horas                                                 |
| **Estado**         | ⬜ Pendiente                                              |

**Alcance:**
- `db/base.py`: `Base = DeclarativeBase()`, `engine = create_async_engine(settings.DB_URL)`
  donde `DB_URL` apunta a la MISMA base `db_fuzzing` (driver `asyncpg`).
- `db/session.py`: `AsyncSessionLocal = async_sessionmaker(engine, ...)`
- `db/models.py`: clase `User(Base)` con columnas:
  `id` (Integer PK Auto), `email` (String unique, nullable=False),
  `hashed_password` (String, nullable=False), `created_at` (DateTime, default=now)
- `main.py`: en startup event, `async with engine.begin() as conn: await conn.run_sync(Base.metadata.create_all)`
- La tabla `users` se crea en `db_fuzzing` al iniciar si no existe. Las tablas
  existentes (`scans`, `vulnerabilities`) NO se ven afectadas por este
  `create_all` porque SQLAlchemy solo declara el modelo `User`.

**Criterios de Aceptación:**
- [ ] Al arrancar la app, la tabla `users` se crea automáticamente en `db_fuzzing`.
- [ ] La tabla `users` existe con las columnas correctas.
- [ ] La columna `email` tiene constraint UNIQUE.
- [ ] El engine es async (usa `asyncpg` como driver contra PostgreSQL).
- [ ] La creación es idempotente: arrancar dos veces no duplica la tabla.
- [ ] Las tablas `scans` y `vulnerabilities` existentes no se alteran ni se vacían.

---

## CHANGE-02: AUTH PYDANTIC SCHEMAS (FastAPI Backend)

| Campo              | Valor                                                     |
| :----------------- | :-------------------------------------------------------- |
| **Nombre**         | auth-pydantic-schemas                                     |
| **Historias US**   | HU-03-01, HU-03-02, HU-03-07                              |
| **Funcionalidad**  | Definir UserRegister, UserLogin, TokenResponse, TokenData |
| **Dependencias**   | CHANGE-01                                                 |
| **Duración est.**  | 1 hora                                                    |
| **Estado**         | ⬜ Pendiente                                              |

**Alcance:**
- `schemas/auth_schemas.py`:
  - `UserRegister`: email (EmailStr), password (str, min_length=8)
  - `UserLogin`: email (EmailStr), password (str, min_length=1)
  - `TokenResponse`: access_token (str), token_type (Literal["bearer"]),
    expires_in (int)
  - `TokenData`: email (str | None = None) — payload del JWT
- `schemas/scan_schemas.py`:
  - `ErrorDetail`: type, title, status, detail, instance (RFC 7807)

**Criterios de Aceptación:**
- [ ] `UserRegister` con password de 7 chars falla validación.
- [ ] `UserRegister` con email inválido falla validación.
- [ ] `TokenResponse` se puede serializar a JSON correctamente.
- [ ] `TokenData` acepta email None sin error.
- [ ] Tests unitarios de schemas pasan.

---

## CHANGE-03: USER REPOSITORY (FastAPI Backend)

| Campo              | Valor                                                     |
| :----------------- | :-------------------------------------------------------- |
| **Nombre**         | user-repository                                           |
| **Historias US**   | HU-03-01, HU-03-02                                        |
| **Funcionalidad**  | CRUD sobre tabla users en PostgreSQL db_fuzzing (get_by_email, create) |
| **Dependencias**   | CHANGE-01, CHANGE-02                                      |
| **Duración est.**  | 1 hora                                                    |
| **Estado**         | ⬜ Pendiente                                              |

**Alcance:**
- `repositories/user_repository.py`: clase `UserRepository`
- Constructor recibe `session: AsyncSession`
- Método async `get_by_email(email: str) -> User | None`
- Método async `create(email: str, hashed_password: str) -> User`
  - Normaliza email a lowercase antes de guardar
  - Si hay IntegrityError (email duplicado): lanza `EmailAlreadyExistsError`

**Criterios de Aceptación:**
- [ ] `get_by_email` retorna el User si existe, None si no.
- [ ] `create` con email nuevo: INSERT exitoso, retorna User con id poblado.
- [ ] `create` con email duplicado: lanza `EmailAlreadyExistsError`.
- [ ] El email se guarda en lowercase (ej: "USER@TEST.COM" → "user@test.com").
- [ ] El repository no conoce nada de FastAPI ni de passlib.

---

## CHANGE-04: AUTH SERVICE — BCRYPT + JWT (FastAPI Backend)

| Campo              | Valor                                                     |
| :----------------- | :-------------------------------------------------------- |
| **Nombre**         | auth-service                                              |
| **Historias US**   | HU-03-01, HU-03-02                                        |
| **Funcionalidad**  | Hasheo bcrypt, verificación y creación/decodificación JWT |
| **Dependencias**   | CHANGE-03                                                 |
| **Duración est.**  | 1.5 horas                                                 |
| **Estado**         | ⬜ Pendiente                                              |

**Alcance:**
- `core/security.py`:
  - `hash_password(plain: str) -> str`: bcrypt via passlib CryptContext
  - `verify_password(plain: str, hashed: str) -> bool`
  - `create_access_token(data: dict, expires_delta: timedelta) -> str`:
    usa python-jose, algoritmo HS256, clave = settings.JWT_SECRET
  - `decode_access_token(token: str) -> TokenData`:
    retorna TokenData con email=None si el token es inválido o expirado
- `services/auth_service.py`: clase `AuthService`
  - Constructor recibe `uow: AuthUoW`
  - Método async `register(data: UserRegister) -> TokenResponse`
  - Método async `login(data: UserLogin) -> TokenResponse`
    Retorna 401 si email no existe o contraseña no coincide (mismo error,
    sin distinguir cuál falló — evita enumeración de usuarios).

**Criterios de Aceptación:**
- [ ] `hash_password("secret")` retorna string bcrypt (starts with "$2b$").
- [ ] `verify_password("secret", hash)` retorna True.
- [ ] `verify_password("wrong", hash)` retorna False.
- [ ] `create_access_token({"sub": "a@b.com"}, timedelta(hours=24))` retorna JWT válido.
- [ ] `decode_access_token(valid_jwt)` retorna TokenData con email correcto.
- [ ] `decode_access_token(expired_jwt)` retorna TokenData(email=None).
- [ ] `AuthService.login` con credenciales inválidas lanza `InvalidCredentialsError`.
- [ ] `AuthService.register` con email duplicado lanza `EmailAlreadyExistsError`.

---

## CHANGE-05: AUTH ROUTER — /register Y /login (FastAPI Backend)

| Campo              | Valor                                                     |
| :----------------- | :-------------------------------------------------------- |
| **Nombre**         | auth-router                                               |
| **Historias US**   | HU-03-01, HU-03-02, HU-03-07                              |
| **Funcionalidad**  | Endpoints POST /api/v1/auth/register y /api/v1/auth/login |
| **Dependencias**   | CHANGE-04, CHANGE-07                                      |
| **Duración est.**  | 1 hora                                                    |
| **Estado**         | ⬜ Pendiente                                              |

**Alcance:**
- `api/v1/auth/router.py`: APIRouter con prefix `/api/v1/auth`
- `POST /register`: recibe `UserRegister`, llama `AuthService.register()`,
  retorna 201 + `TokenResponse`
- `POST /login`: recibe `UserLogin`, llama `AuthService.login()`,
  retorna 200 + `TokenResponse`
- Manejar `EmailAlreadyExistsError` → 409 RFC 7807
- Manejar `InvalidCredentialsError` → 401 RFC 7807
- Registrar el router en `main.py`

**Criterios de Aceptación:**
- [ ] POST /api/v1/auth/register con datos válidos: 201 + TokenResponse.
- [ ] POST /api/v1/auth/register con email duplicado: 409 RFC 7807.
- [ ] POST /api/v1/auth/register con password < 8 chars: 400 RFC 7807.
- [ ] POST /api/v1/auth/login con credenciales correctas: 200 + TokenResponse.
- [ ] POST /api/v1/auth/login con credenciales incorrectas: 401 RFC 7807.
- [ ] Los endpoints aparecen en `/docs` con sus schemas correctos.

---

## CHANGE-06: JWT DEPENDENCY — get_current_user (FastAPI Backend)

| Campo              | Valor                                                     |
| :----------------- | :-------------------------------------------------------- |
| **Nombre**         | jwt-dependency                                            |
| **Historias US**   | HU-03-03                                                  |
| **Funcionalidad**  | Dependency FastAPI que extrae y valida el JWT del header  |
| **Dependencias**   | CHANGE-04                                                 |
| **Duración est.**  | 1 hora                                                    |
| **Estado**         | ⬜ Pendiente                                              |

**Alcance:**
- `core/dependencies.py`:
  - `oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")`
  - `get_current_user(token: str = Depends(oauth2_scheme)) -> str`:
    - Llama `security.decode_access_token(token)`
    - Si `token_data.email is None`: lanza HTTPException 401
    - Retorna el email del usuario autenticado (str)
- Esta dependency se inyecta en `/api/v1/scan/start` para protegerlo

**Criterios de Aceptación:**
- [ ] Request con JWT válido en header Authorization: `get_current_user` retorna email.
- [ ] Request sin header Authorization: 401 con RFC 7807.
- [ ] Request con JWT malformado: 401 con RFC 7807.
- [ ] Request con JWT expirado: 401 con RFC 7807.
- [ ] El email retornado coincide con el "sub" del JWT.

---

## CHANGE-07: EXCEPTION HANDLERS RFC 7807 (FastAPI Backend)

| Campo              | Valor                                                     |
| :----------------- | :-------------------------------------------------------- |
| **Nombre**         | rfc7807-exception-handlers                                |
| **Historias US**   | HU-03-07                                                  |
| **Funcionalidad**  | Global exception handlers para todos los errores del API  |
| **Dependencias**   | CHANGE-00a                                                |
| **Duración est.**  | 1 hora                                                    |
| **Estado**         | ⬜ Pendiente                                              |

**Alcance:**
- `exceptions/handlers.py`:
  - Handler `RequestValidationError` → 400/422 RFC 7807
  - Handler `HTTPException` → formato RFC 7807 (wrapping)
  - Handler `RateLimitExceeded` → 429 RFC 7807 + `Retry-After`
  - Handler `Exception` genérica → 500 RFC 7807 (sin stack trace)
- Registrar handlers en `main.py` con `app.add_exception_handler`

**Criterios de Aceptación:**
- [ ] Error de validación Pydantic produce JSON RFC 7807 con type/title/status/detail/instance.
- [ ] Error 429 produce RFC 7807 con header `Retry-After`.
- [ ] Error 500 produce RFC 7807 con mensaje genérico (sin stack trace).
- [ ] El campo `instance` refleja el path del endpoint que falló.
- [ ] Los errores 401 y 409 también pasan por el handler.

---

## CHANGE-08: SCAN PYDANTIC SCHEMAS (FastAPI Backend)

| Campo              | Valor                                                     |
| :----------------- | :-------------------------------------------------------- |
| **Nombre**         | pydantic-scan-schemas                                     |
| **Historias US**   | HU-03-04, HU-03-05                                        |
| **Funcionalidad**  | Definir ScanRequest, ScanResponse, N8nPayload             |
| **Dependencias**   | CHANGE-00a                                                |
| **Duración est.**  | 1 hora                                                    |
| **Estado**         | ⬜ Pendiente                                              |

**Alcance:**
- `schemas/scan_schemas.py`:
  - `ScanRequest`: target_url (HttpUrl), phpsessid (str, min=1),
    sqlmap_level (int, ge=1, le=5, default=1), sqlmap_risk (int, ge=1, le=3, default=1)
  - `ScanResponse`: scan_id (str), status (Literal["queued"]), message (str)
  - `N8nPayload`: target_url (str), phpsessid (str), sqlmap_level (int),
    sqlmap_risk (int), scan_id (str)

**Criterios de Aceptación:**
- [ ] `ScanRequest` con target_url sin http/https falla validación.
- [ ] `ScanRequest` con phpsessid vacío falla validación.
- [ ] `ScanRequest` con sqlmap_level=6 falla validación.
- [ ] `ScanRequest` sin sqlmap_level usa default=1.
- [ ] Tests unitarios de schemas pasan.

---

## CHANGE-09: N8N REPOSITORY (FastAPI Backend)

| Campo              | Valor                                                     |
| :----------------- | :-------------------------------------------------------- |
| **Nombre**         | n8n-repository                                            |
| **Historias US**   | HU-03-05                                                  |
| **Funcionalidad**  | N8nRepository que hace POST httpx al webhook de n8n       |
| **Dependencias**   | CHANGE-08                                                 |
| **Duración est.**  | 1.5 horas                                                 |
| **Estado**         | ⬜ Pendiente                                              |

**Alcance:**
- `repositories/n8n_repository.py`: clase `N8nRepository`
- Constructor recibe `client: httpx.AsyncClient`
- Método async `forward_scan(payload: N8nPayload) -> bool`
- POST httpx a `settings.N8N_WEBHOOK_URL`
- Header `X-WASA-TOKEN: settings.N8N_WEBHOOK_TOKEN`
- Timeout: 10 segundos
- Retorna `True` si n8n responde 200 OK
- Lanza `N8nUnavailableError` si timeout o respuesta != 200

**Criterios de Aceptación:**
- [ ] Con n8n mockeado respondiendo 200: retorna True.
- [ ] Con n8n mockeado respondiendo 500: lanza `N8nUnavailableError`.
- [ ] Con n8n inaccesible (timeout): lanza `N8nUnavailableError`.
- [ ] El header `X-WASA-TOKEN` se envía en cada request.
- [ ] El repository no importa nada de FastAPI.

---

## CHANGE-10: SCAN UNIT OF WORK (FastAPI Backend)

| Campo              | Valor                                                     |
| :----------------- | :-------------------------------------------------------- |
| **Nombre**         | scan-unit-of-work                                         |
| **Historias US**   | HU-03-05                                                  |
| **Funcionalidad**  | ScanUoW como context manager para N8nRepository + httpx   |
| **Dependencias**   | CHANGE-09                                                 |
| **Duración est.**  | 1 hora                                                    |
| **Estado**         | ⬜ Pendiente                                              |

**Alcance:**
- `uow/scan_unit_of_work.py`: clase `ScanUoW` (async context manager)
- `__aenter__`: instancia httpx.AsyncClient y N8nRepository
- `__aexit__`: cierra el cliente httpx (aclose) incluso si hay excepción
- Expone propiedad `n8n: N8nRepository`

**Criterios de Aceptación:**
- [ ] Uso via `async with ScanUoW() as uow:` funciona sin errores.
- [ ] El cliente httpx se cierra correctamente al salir.
- [ ] Si ocurre excepción dentro del bloque, httpx igual se cierra.
- [ ] `uow.n8n` expone el N8nRepository instanciado.

---

## CHANGE-11: SCAN SERVICE (FastAPI Backend)

| Campo              | Valor                                                     |
| :----------------- | :-------------------------------------------------------- |
| **Nombre**         | scan-service                                              |
| **Historias US**   | HU-03-04, HU-03-05                                        |
| **Funcionalidad**  | ScanService: genera UUID y orquesta ScanUoW               |
| **Dependencias**   | CHANGE-10                                                 |
| **Duración est.**  | 1 hora                                                    |
| **Estado**         | ⬜ Pendiente                                              |

**Alcance:**
- `services/scan_service.py`: clase `ScanService`
- Método async `start_scan(request: ScanRequest) -> ScanResponse`
  - Genera `scan_id = str(uuid.uuid4())`
  - Construye N8nPayload desde ScanRequest + scan_id
  - Usa `async with ScanUoW() as uow:` → `uow.n8n.forward_scan(payload)`
  - Retorna ScanResponse si éxito; relanza N8nUnavailableError si falla

**Criterios de Aceptación:**
- [ ] `start_scan` con ScanRequest válida retorna ScanResponse con UUID v4.
- [ ] Si N8nRepository lanza N8nUnavailableError, el Service lo propaga.
- [ ] El Service no importa httpx directamente.
- [ ] Test unitario mockea ScanUoW y verifica que el scan_id llega al payload.

---

## CHANGE-12: SCAN ROUTER — /scan/start PROTEGIDO (FastAPI Backend)

| Campo              | Valor                                                     |
| :----------------- | :-------------------------------------------------------- |
| **Nombre**         | scan-router-protected                                     |
| **Historias US**   | HU-03-03, HU-03-04, HU-03-05, HU-03-06                   |
| **Funcionalidad**  | POST /api/v1/scan/start con JWT guard + rate limit        |
| **Dependencias**   | CHANGE-11, CHANGE-06, CHANGE-00d                          |
| **Duración est.**  | 1 hora                                                    |
| **Estado**         | ⬜ Pendiente                                              |

**Alcance:**
- `api/v1/scan/router.py`: APIRouter con prefix `/api/v1/scan`
- `POST /start` con:
  - `current_user: str = Depends(get_current_user)` (JWT guard)
  - `@limiter.limit(...)` (rate limit)
  - Recibe `ScanRequest`, llama `ScanService.start_scan()`
  - Retorna `JSONResponse(..., status_code=202)`
  - Maneja `N8nUnavailableError` → 502 RFC 7807
- Registrar el router en `main.py`

**Criterios de Aceptación:**
- [ ] POST con JWT válido y body válido: 202 + ScanResponse JSON.
- [ ] POST sin JWT: 401 RFC 7807.
- [ ] POST con JWT expirado: 401 RFC 7807.
- [ ] POST con body inválido (y JWT válido): 400/422 RFC 7807.
- [ ] POST desde IP con rate limit excedido: 429 RFC 7807.
- [ ] POST cuando n8n no responde: 502 RFC 7807.
- [ ] La documentación Swagger en `/docs` muestra el endpoint con el lock de auth.

---

## CHANGE-13: AUTHSTORE ZUSTAND + TIPOS TS (React Landing)

| Campo              | Valor                                                     |
| :----------------- | :-------------------------------------------------------- |
| **Nombre**         | zustand-auth-store                                        |
| **Historias US**   | HU-06-04, HU-06-05                                        |
| **Funcionalidad**  | authStore Zustand con persistencia en localStorage        |
| **Dependencias**   | CHANGE-00b                                                |
| **Duración est.**  | 1.5 horas                                                 |
| **Estado**         | ⬜ Pendiente                                              |

**Alcance:**
- `src/app/stores/authStore.ts`:
  - State: `token: string | null`, `email: string | null`,
    `isAuthenticated: boolean`
  - Actions:
    - `login(token: string, email: string)`: guarda en state + localStorage
    - `logout()`: limpia state + localStorage
    - `hydrate()`: al arrancar, lee localStorage y valida si token no expiró
      usando `jwtIsExpired(token)` de shared/lib/utils.ts
- `src/shared/lib/utils.ts`: función `jwtIsExpired(token: string): boolean`
  que parsea el claim `exp` del JWT sin librería adicional (atob + JSON.parse)
- `src/app/App.tsx`: llama `authStore.hydrate()` en useEffect al montar

**Criterios de Aceptación:**
- [ ] `authStore.login(token, email)` actualiza isAuthenticated a true.
- [ ] `authStore.logout()` limpia token, email, isAuthenticated y localStorage.
- [ ] Al recargar la app, hydrate() restaura la sesión si el token no expiró.
- [ ] Al recargar con token expirado, hydrate() limpia el authStore.
- [ ] `jwtIsExpired(token)` retorna true si el claim `exp` está en el pasado.
- [ ] `tsc --noEmit` sin errores en authStore y utils.

---

## CHANGE-14: AUTH ZOD SCHEMAS + TIPOS TS (React Landing)

| Campo              | Valor                                                     |
| :----------------- | :-------------------------------------------------------- |
| **Nombre**         | auth-zod-schemas                                          |
| **Historias US**   | HU-06-02, HU-06-03                                        |
| **Funcionalidad**  | Tipos y schemas Zod para login y register                 |
| **Dependencias**   | CHANGE-13                                                 |
| **Duración est.**  | 1 hora                                                    |
| **Estado**         | ⬜ Pendiente                                              |

**Alcance:**
- `src/entities/user/model/types.ts`:
  - `UserRegister`: email, password, confirmPassword
  - `UserLogin`: email, password
  - `TokenResponse`: access_token, token_type, expires_in
  - `AuthApiError`: type, title, status, detail, instance
- `src/entities/user/model/loginSchema.ts` (Zod):
  - email: z.string().email("Email inválido")
  - password: z.string().min(1, "Contraseña requerida")
- `src/entities/user/model/registerSchema.ts` (Zod):
  - email: z.string().email("Email inválido")
  - password: z.string().min(8, "Mínimo 8 caracteres")
  - confirmPassword: z.string().min(1)
  - superRefine: verifica que password === confirmPassword

**Criterios de Aceptación:**
- [ ] `loginSchema.parse({ email: "not-email", password: "x" })` lanza ZodError.
- [ ] `registerSchema.parse({ ..., password: "1234567", confirmPassword: "1234567" })` lanza ZodError (< 8 chars).
- [ ] `registerSchema.parse({ ..., password: "pass1234", confirmPassword: "diferente" })` lanza ZodError.
- [ ] `tsc --noEmit` sin errores en `entities/user/`.

---

## CHANGE-15: SHARED UI ATOMS + MODAL BASE (React Landing)

| Campo              | Valor                                                     |
| :----------------- | :-------------------------------------------------------- |
| **Nombre**         | shared-ui-atoms                                           |
| **Historias US**   | HU-02-01, HU-06-02, HU-06-03, HU-05-02                   |
| **Funcionalidad**  | Button, Input, Checkbox, Spinner, Modal base con Tailwind |
| **Dependencias**   | CHANGE-00b                                                |
| **Duración est.**  | 2 horas                                                   |
| **Estado**         | ⬜ Pendiente                                              |

**Alcance:**
- `src/shared/ui/Button.tsx`: variants (primary, secondary), loading state
- `src/shared/ui/Input.tsx`: label, error message, helper, valid/error borders
- `src/shared/ui/Checkbox.tsx`: label embebido, estado error
- `src/shared/ui/Spinner.tsx`: SVG animado
- `src/shared/ui/Modal.tsx`: backdrop, cierre con Escape, children slot.
  Sin conocimiento de contenido (auth ni scan).
- `src/shared/lib/utils.ts`: función `cn()` (clsx + tailwind-merge)
  + función `jwtIsExpired()` (para authStore)

**Criterios de Aceptación:**
- [ ] `<Button loading>` muestra Spinner y está deshabilitado.
- [ ] `<Input error="msg">` muestra borde rojo y mensaje.
- [ ] `<Modal isOpen onClose={fn}>` renderiza backdrop y cierra con Escape.
- [ ] Ningún componente importa de @features, @entities, @pages, @widgets.
- [ ] `npm run build` sin errores TypeScript.

---

## CHANGE-16: FEATURE AUTH — LOGIN + REGISTER (React Landing)

| Campo              | Valor                                                     |
| :----------------- | :-------------------------------------------------------- |
| **Nombre**         | feature-auth                                              |
| **Historias US**   | HU-06-02, HU-06-03                                        |
| **Funcionalidad**  | Forms, hooks y API calls de login y registro              |
| **Dependencias**   | CHANGE-13, CHANGE-14, CHANGE-15                           |
| **Duración est.**  | 3 horas                                                   |
| **Estado**         | ⬜ Pendiente                                              |

**Alcance:**
- `src/features/auth/login/api/loginApi.ts`:
  POST /api/v1/auth/login → retorna TokenResponse. Lanza AuthApiError si 401.
- `src/features/auth/login/model/useLogin.ts`:
  useForm + zodResolver(loginSchema). handleSubmit → loginApi → authStore.login
  → cierra modal (via prop onSuccess). Estado: isLoading, serverError.
- `src/features/auth/login/ui/LoginForm.tsx`:
  Campos email + password. Botón "Ingresar" con loading.
  Link a "¿No tenés cuenta? Registrate" (prop onSwitchToRegister).
- `src/features/auth/register/api/registerApi.ts`:
  POST /api/v1/auth/register → 201 + TokenResponse.
  Lanza AuthApiError con status 409 si email duplicado.
- `src/features/auth/register/model/useRegister.ts`:
  useForm + zodResolver(registerSchema). handleSubmit → registerApi
  → authStore.login → onSuccess. Estado: isLoading, serverError.
- `src/features/auth/register/ui/RegisterForm.tsx`:
  Campos email + password + confirmPassword. Botón "Registrarme".
  Link a "¿Ya tenés cuenta? Iniciá sesión" (prop onSwitchToLogin).

**Criterios de Aceptación:**
- [ ] Login exitoso (200): authStore.isAuthenticated = true.
- [ ] Login fallido (401): mensaje "Credenciales incorrectas." visible.
- [ ] Register exitoso (201): authStore.isAuthenticated = true.
- [ ] Register con email duplicado (409): mensaje "Este email ya está registrado."
- [ ] Register con password < 8 chars: error inline en el campo (client-side).
- [ ] Confirmación de password distinta: error inline (client-side).
- [ ] Botón muestra Spinner durante el request (no hay doble submit).
- [ ] `tsc --noEmit` sin errores.

---

## CHANGE-17: SCAN ZOD SCHEMA + TIPOS TS (React Landing)

| Campo              | Valor                                                     |
| :----------------- | :-------------------------------------------------------- |
| **Nombre**         | scan-zod-schema                                           |
| **Historias US**   | HU-02-02, HU-02-03, HU-02-04, HU-02-05                   |
| **Funcionalidad**  | Tipos y schema Zod para el formulario de escaneo          |
| **Dependencias**   | CHANGE-00b                                                |
| **Duración est.**  | 1 hora                                                    |
| **Estado**         | ⬜ Pendiente                                              |

**Alcance:**
- `src/entities/scan/model/types.ts`:
  ScanRequest, ScanResponse, ScanApiError
- `src/entities/scan/model/scanSchema.ts` (Zod):
  - target_url: z.string().url({ message: "Debe ser URL con http:// o https://" })
  - phpsessid: z.string().min(1, "PHPSESSID es requerido").trim()
  - sqlmap_level: z.number().int().min(1).max(5).default(1)
  - sqlmap_risk: z.number().int().min(1).max(3).default(1)
  - ethical_consent: z.literal(true, { errorMap: () => ({ message: "Debes aceptar" }) })

**Criterios de Aceptación:**
- [ ] `scanSchema.parse({ target_url: "not-a-url", ... })` lanza ZodError.
- [ ] `scanSchema.parse({ ..., ethical_consent: false })` lanza ZodError.
- [ ] `scanSchema.parse({ target_url: "http://dvwa.local", phpsessid: "abc" })` usa defaults.
- [ ] `tsc --noEmit` sin errores.

---

## CHANGE-18: FEATURE SCAN FORM + JWT ATTACH (React Landing)

| Campo              | Valor                                                     |
| :----------------- | :-------------------------------------------------------- |
| **Nombre**         | feature-scan-form                                         |
| **Historias US**   | HU-02-01..05, HU-03-04, HU-05-01..03                      |
| **Funcionalidad**  | Hook useScanForm, submitScan con Bearer JWT, ScanForm UI  |
| **Dependencias**   | CHANGE-13, CHANGE-15, CHANGE-17                           |
| **Duración est.**  | 2.5 horas                                                 |
| **Estado**         | ⬜ Pendiente                                              |

**Alcance:**
- `src/shared/api/axiosInstance.ts`:
  Instancia Axios con baseURL = VITE_API_BASE_URL.
  Interceptor de request: agrega `Authorization: Bearer <token>` desde authStore.
  Interceptor de response: si 401 → authStore.logout().
- `src/features/scan-form/api/submitScan.ts`:
  POST /api/v1/scan/start (axiosInstance ya adjunta el JWT).
  Retorna ScanResponse si 202. Lanza ScanApiError si 401/400/429/502.
- `src/features/scan-form/model/useScanForm.ts`:
  useForm + zodResolver(scanSchema). isLoading, serverError.
  En éxito (202): `window.location.href = VITE_DASHBOARD_URL`.
  Si 401: authStore.logout() + mensaje "Sesión expirada".
- `src/features/scan-form/ui/ScanForm.tsx`:
  Renderiza campos con @shared/ui. Botón deshabilitado si !ethical_consent || isLoading.

**Criterios de Aceptación:**
- [ ] submitScan adjunta automáticamente el JWT (via interceptor, no manual).
- [ ] Si el servidor retorna 401: authStore.logout() y mensaje "Sesión expirada".
  El muro de auth vuelve a aparecer.
- [ ] Submit válido (202): redirección a VITE_DASHBOARD_URL.
- [ ] Botón "Escanear" deshabilitado sin checkbox ético marcado.
- [ ] Spinner durante isLoading. No hay doble submit.
- [ ] `tsc --noEmit` sin errores.

---

## CHANGE-19: WIDGETS — AUTH MODAL + SCAN FORM + INFO (React Landing)

| Campo              | Valor                                                     |
| :----------------- | :-------------------------------------------------------- |
| **Nombre**         | landing-widgets                                           |
| **Historias US**   | HU-01-01..04, HU-06-01..03, HU-02-01                      |
| **Funcionalidad**  | Todos los widgets: info pública, auth modales, scan gate  |
| **Dependencias**   | CHANGE-16, CHANGE-18                                      |
| **Duración est.**  | 3.5 horas                                                 |
| **Estado**         | ⬜ Pendiente                                              |

**Alcance:**
- `widgets/hero/HeroWidget.tsx`:
  CTA "Comenzar": si autenticado → scroll a #scan-form;
  si no → abre LoginModal.
- `widgets/features-section/FeaturesWidget.tsx`:
  4 tarjetas: ZAP, Nuclei, ffuf, SQLMap.
- `widgets/how-it-works/HowItWorksWidget.tsx`:
  4 pasos (incluir "Crear cuenta" como primer paso).
- `widgets/auth-modal/LoginModal.tsx`:
  Modal base + LoginForm. Prop: isOpen, onClose, onSwitchToRegister.
- `widgets/auth-modal/RegisterModal.tsx`:
  Modal base + RegisterForm. Prop: isOpen, onClose, onSwitchToLogin.
- `widgets/scan-form/ScanFormWidget.tsx`:
  Lee authStore.isAuthenticated.
  Si false → AuthWall: texto + botones "Iniciar Sesión" / "Crear Cuenta"
  que setean estado local para abrir LoginModal / RegisterModal.
  Si true → aviso ético + `<ScanForm />` con id="scan-form".
  Botón "Cerrar sesión" visible cuando autenticado.
- `widgets/footer/FooterWidget.tsx`

**Criterios de Aceptación:**
- [ ] HeroWidget CTA abre LoginModal si usuario no está autenticado.
- [ ] HeroWidget CTA hace scroll a #scan-form si está autenticado.
- [ ] LoginModal y RegisterModal se alternan via los links de cada form.
- [ ] Al login/register exitoso: el modal se cierra y el scan form aparece.
- [ ] ScanFormWidget no renderiza ningún campo del form si !isAuthenticated.
- [ ] El botón "Cerrar sesión" ejecuta authStore.logout() y muestra muro.
- [ ] Todos los widgets son responsive (375px y 1280px).
- [ ] `npm run build` sin errores.

---

## CHANGE-20: LANDING PAGE — COMPOSICIÓN FINAL (React Landing)

| Campo              | Valor                                                     |
| :----------------- | :-------------------------------------------------------- |
| **Nombre**         | landing-page-composition                                  |
| **Historias US**   | HU-01-01..04, HU-06-01, HU-02-01                          |
| **Funcionalidad**  | LandingPage compone todos los widgets en orden            |
| **Dependencias**   | CHANGE-19                                                 |
| **Duración est.**  | 1 hora                                                    |
| **Estado**         | ⬜ Pendiente                                              |

**Alcance:**
- `src/pages/LandingPage/index.tsx`:
  HeroWidget → FeaturesWidget → HowItWorksWidget →
  ScanFormWidget (contiene auth gate) → FooterWidget
- `src/app/App.tsx`: renderiza LandingPage + llama authStore.hydrate() en useEffect
- `src/app/index.css`: fuentes Google + variables CSS globales

**Criterios de Aceptación:**
- [ ] La Landing renderiza todas las secciones en orden correcto.
- [ ] Al cargar la app, hydrate() restaura la sesión si el JWT en localStorage es válido.
- [ ] La página no tiene errores en consola del navegador.
- [ ] Lighthouse Performance > 80 en desktop.

---

## CHANGE-21: n8n WEBHOOK TRIGGER (Infraestructura n8n)

| Campo              | Valor                                                     |
| :----------------- | :-------------------------------------------------------- |
| **Nombre**         | n8n-webhook-trigger                                       |
| **Historias US**   | HU-04-01, HU-04-02                                        |
| **Funcionalidad**  | Agregar Webhook Trigger al workflow n8n                   |
| **Dependencias**   | CHANGE-12 (el Bridge ya envía el POST protegido)          |
| **Duración est.**  | 1.5 horas                                                 |
| **Estado**         | ⬜ Pendiente                                              |

**Alcance:**
- En n8n: agregar nodo Webhook Trigger (POST, `/webhook/wasa-scan`,
  Header Auth `X-WASA-TOKEN`, Respond Immediately)
- Desactivar el nodo Schedule Trigger existente
- Verificar que variables del webhook ($json.*) llegan a nodos downstream
- Actualizar `N8N_WEBHOOK_URL` en el `.env` del FastAPI Bridge

**Criterios de Aceptación:**
- [ ] POST manual al webhook (curl) dispara el workflow completo.
- [ ] Los nodos downstream reciben target_url, phpsessid, sqlmap_level, sqlmap_risk, scan_id.
- [ ] El webhook responde 200 OK inmediatamente.
- [ ] El Schedule Trigger está desactivado.
- [ ] Sin `X-WASA-TOKEN` correcto: el webhook retorna 401.

---

## CHANGE-22: INTEGRACIÓN END-TO-END + SMOKE TEST

| Campo              | Valor                                                     |
| :----------------- | :-------------------------------------------------------- |
| **Nombre**         | e2e-smoke-test                                            |
| **Historias US**   | Todas                                                     |
| **Funcionalidad**  | Validar el flujo completo incluyendo registro, login y scan |
| **Dependencias**   | CHANGE-12, CHANGE-20, CHANGE-21                           |
| **Duración est.**  | 2 horas                                                   |
| **Estado**         | ⬜ Pendiente                                              |

**Criterios de Aceptación (Smoke Test Checklist):**

  AUTENTICACIÓN:
  - [ ] La Landing Page carga en < 3 segundos.
  - [ ] El muro de auth es visible sin sesión activa.
  - [ ] El formulario de escaneo NO es visible sin sesión.
  - [ ] Registro con email nuevo → modal cierra → scan form visible.
  - [ ] Email duplicado → mensaje "Este email ya está registrado."
  - [ ] Login con credenciales incorrectas → mensaje "Credenciales incorrectas."
  - [ ] Login correcto → modal cierra → scan form visible.
  - [ ] Recarga de página con sesión activa → scan form sigue visible.
  - [ ] Botón "Cerrar sesión" → muro de auth vuelve a aparecer.

  ESCANEO:
  - [ ] El formulario valida campos inválidos antes de enviar.
  - [ ] Botón "Escanear" deshabilitado sin checkbox ético.
  - [ ] POST a /scan/start sin JWT: 401 en consola del navegador, mensaje visible.
  - [ ] POST a /scan/start con JWT válido y body correcto: 202 en < 3 segundos.
  - [ ] Redirección al Dashboard ocurre tras el 202.
  - [ ] En n8n UI: el workflow aparece en execution history.
  - [ ] En PostgreSQL db_fuzzing: SELECT en tabla users confirma el usuario registrado.
  - [ ] En PostgreSQL db_fuzzing: SELECT en tabla scans confirma el escaneo iniciado.
  - [ ] Rate limiting: solicitud 11 recibe 429 desde la misma IP.

---

## Estimación Total de Duración

| Change          | Duración estimada |
| :-------------- | :---------------- |
| CHANGE-00a      | 1 hora            |
| CHANGE-00b      | 1 hora            |
| CHANGE-00c      | 30 minutos        |
| CHANGE-00d      | 1 hora            |
| CHANGE-01       | 1.5 horas         |
| CHANGE-02       | 1 hora            |
| CHANGE-03       | 1 hora            |
| CHANGE-04       | 1.5 horas         |
| CHANGE-05       | 1 hora            |
| CHANGE-06       | 1 hora            |
| CHANGE-07       | 1 hora            |
| CHANGE-08       | 1 hora            |
| CHANGE-09       | 1.5 horas         |
| CHANGE-10       | 1 hora            |
| CHANGE-11       | 1 hora            |
| CHANGE-12       | 1 hora            |
| CHANGE-13       | 1.5 horas         |
| CHANGE-14       | 1 hora            |
| CHANGE-15       | 2 horas           |
| CHANGE-16       | 3 horas           |
| CHANGE-17       | 1 hora            |
| CHANGE-18       | 2.5 horas         |
| CHANGE-19       | 3.5 horas         |
| CHANGE-20       | 1 hora            |
| CHANGE-21       | 1.5 horas         |
| CHANGE-22       | 2 horas           |
| **TOTAL**       | **~34 horas**     |

---

## Sprints Sugeridos

### Sprint 1 — Base (3.5h): Scaffolding + Config
```
CHANGE-00a → CHANGE-00b → CHANGE-00c → CHANGE-00d
```

### Sprint 2 — Auth Backend (7h): PostgreSQL (db_fuzzing) + JWT completo
```
CHANGE-01 → CHANGE-02 → CHANGE-07 → CHANGE-03 → CHANGE-04
→ CHANGE-05 → CHANGE-06
```

### Sprint 3 — Scan Backend (6.5h): FastAPI protegido
```
CHANGE-08 → CHANGE-09 → CHANGE-10 → CHANGE-11 → CHANGE-12
```

### Sprint 4 — Auth Frontend (7.5h): Zustand + Login + Register
```
CHANGE-13 → CHANGE-14 → CHANGE-15 → CHANGE-16
```

### Sprint 5 — Scan Frontend (7h): Scan Form + Landing
```
CHANGE-17 → CHANGE-18 → CHANGE-19 → CHANGE-20
```

### Sprint 6 — Integración (3.5h): n8n + Validación E2E
```
CHANGE-21 → CHANGE-22
```

---

## Ya realizado (archivado)

_Ningún change archivado aún. Esta sección se actualizará a medida que se completen los changes._
