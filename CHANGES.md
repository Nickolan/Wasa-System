# CHANGES — Secuencia de Implementación

> Índice canónico de todos los changes del proyecto **WASA Landing Page & FastAPI Bridge**.
> Cada change es atómico: un agente puede implementarlo en una sesión (~1-3.5 horas).
> **Leer este archivo antes de ejecutar cualquier `/opsx:propose`.**
>
> Este archivo es la adaptación 1:1, al formato de `roadmap-generator`, del roadmap original
> escrito a mano en [`docs_wasa_sdd/CHANGES.md`](docs_wasa_sdd/CHANGES.md) (fuente autoritativa
> de alcance, criterios de aceptación y orden). No se rediseñó, reordenó, fusionó ni se
> eliminó ningún change ni criterio de aceptación — solo se tradujo su estructura al
> formato `CHANGES.md` / OpenSpec (gates de paralelismo, governance, "Leer antes" hacia la
> `knowledge-base/`). Los identificadores `CHANGE-00a`..`CHANGE-22` se conservan tal cual
> para mantener trazabilidad 1:1 con `docs_wasa_sdd/CHANGES.md` y `docs_wasa_sdd/INTEGRADOR.txt`.

---

## Cómo usar este documento

1. Identificar el change a implementar (verificar que sus dependencias están en `openspec/changes/archive/`).
2. Leer los docs de la knowledge-base indicados en "Leer antes" de ese change.
3. Ejecutar `/opsx:propose <nombre-del-change>` (usar el nombre kebab-case indicado, no el código `CHANGE-NN`).
4. Al terminar el change, archivarlo con `/opsx:archive <nombre-del-change>`.
5. Marcar el checkbox `[x]` en la fila **Estado** de este archivo (y, si corresponde, los checkboxes de sus Criterios de Aceptación).

---

## Árbol de dependencias

```
CHANGE-00a (fastapi-bridge-scaffold)
CHANGE-00b (react-landing-scaffold)
    │
    ├── CHANGE-00c (env-config) ──────────────────── depende de 00a, 00b
    │       │
    │       └── CHANGE-00d (fastapi-cors-ratelimit) ─ depende de 00a, 00c
    │
    ├── CHANGE-01 (postgres-user-model) ──────────── depende de 00a
    │       │
    │       ├── CHANGE-02 (auth-pydantic-schemas) ── depende de 01
    │       │       │
    │       │       └── CHANGE-03 (user-repository) ─ depende de 01, 02
    │       │               │
    │       │               └── CHANGE-04 (auth-service) ─ depende de 03
    │       │                       │
    │       │                       ├── CHANGE-05 (auth-router) ─────── depende de 04, 07
    │       │                       │
    │       │                       └── CHANGE-06 (jwt-dependency) ──── depende de 04
    │       │
    │       └── CHANGE-07 (rfc7807-exception-handlers) ── depende de 00a
    │
    ├── CHANGE-08 (pydantic-scan-schemas) ─────────── depende de 00a
    │       │
    │       └── CHANGE-09 (n8n-repository) ───────── depende de 08
    │               │
    │               └── CHANGE-10 (scan-unit-of-work) ── depende de 09
    │                       │
    │                       └── CHANGE-11 (scan-service) ── depende de 10
    │                               │
    │                               └── CHANGE-12 (scan-router-protected) ─ depende de 11, 06, 00d
    │
    ├── CHANGE-13 (zustand-auth-store) ───── depende de 00b
    │       │
    │       ├── CHANGE-14 (auth-zod-schemas) ─ depende de 13
    │       │
    │       └── CHANGE-15 (shared-ui-atoms) ── depende de 00b
    │               │
    │               ├── CHANGE-16 (feature-auth) ─────────── depende de 13, 14, 15
    │               │
    │               ├── CHANGE-17 (scan-zod-schema) ────────── depende de 00b
    │               │       │
    │               │       └── CHANGE-18 (feature-scan-form) ─ depende de 13, 15, 17
    │               │
    │               └── CHANGE-19 (landing-widgets) ─ depende de 16, 18
    │                       │
    │                       └── CHANGE-20 (landing-page-composition) ─ depende de 19
    │
    ├── CHANGE-21 (n8n-webhook-trigger) ──── depende de 12
    │
    └── CHANGE-22 (e2e-smoke-test) ─── depende de 12, 20, 21
```

### Paralelismo por fase

> Cada "gate" es un punto de sincronización calculado a partir de las dependencias declaradas
> en `docs_wasa_sdd/CHANGES.md` (gate = 1 + el gate máximo de sus dependencias). Los changes
> dentro de un mismo gate no dependen entre sí y pueden ejecutarse en paralelo.

```
GATE 0: ninguna                                    ← PRIMER FORK
  → CHANGE-00a fastapi-bridge-scaffold             [Agente A — Backend]
  → CHANGE-00b react-landing-scaffold              [Agente C — Frontend]

GATE 1: CHANGE-00a ✓, CHANGE-00b ✓
  → CHANGE-00c env-config                          [Agente A — necesita 00a + 00b]
  → CHANGE-01 postgres-user-model                  [Agente A]
  → CHANGE-07 rfc7807-exception-handlers           [Agente B]
  → CHANGE-08 pydantic-scan-schemas                [Agente B]
  → CHANGE-13 zustand-auth-store                   [Agente C]
  → CHANGE-15 shared-ui-atoms                       [Agente C]
  → CHANGE-17 scan-zod-schema                       [Agente C]

GATE 2: CHANGE-00c ✓, CHANGE-01 ✓, CHANGE-08 ✓, CHANGE-13 ✓, CHANGE-15 ✓, CHANGE-17 ✓
  → CHANGE-00d fastapi-cors-ratelimit               [Agente A]
  → CHANGE-02 auth-pydantic-schemas                 [Agente A]
  → CHANGE-09 n8n-repository                        [Agente B]
  → CHANGE-14 auth-zod-schemas                      [Agente C]
  → CHANGE-18 feature-scan-form                     [Agente C — si 13 ✓, 15 ✓, 17 ✓]

GATE 3: CHANGE-02 ✓, CHANGE-09 ✓, CHANGE-14 ✓
  → CHANGE-03 user-repository                       [Agente A]
  → CHANGE-10 scan-unit-of-work                     [Agente B]
  → CHANGE-16 feature-auth                          [Agente C — si 13 ✓, 14 ✓, 15 ✓]

GATE 4: CHANGE-03 ✓, CHANGE-10 ✓, CHANGE-16 ✓
  → CHANGE-04 auth-service                          [Agente A]
  → CHANGE-11 scan-service                          [Agente B]
  → CHANGE-19 landing-widgets                       [Agente C — si 16 ✓, 18 ✓]

GATE 5: CHANGE-04 ✓, CHANGE-11 ✓, CHANGE-19 ✓
  → CHANGE-05 auth-router                           [Agente A — si 04 ✓, 07 ✓]
  → CHANGE-06 jwt-dependency                        [Agente A]
  → CHANGE-20 landing-page-composition              [Agente C]

GATE 6: CHANGE-06 ✓, CHANGE-00d ✓, CHANGE-11 ✓
  → CHANGE-12 scan-router-protected                 [Agente B — si 11 ✓, 06 ✓, 00d ✓]

GATE 7: CHANGE-12 ✓
  → CHANGE-21 n8n-webhook-trigger                   [Agente B]

GATE 8: CHANGE-12 ✓, CHANGE-20 ✓, CHANGE-21 ✓        ← CIERRE
  → CHANGE-22 e2e-smoke-test                        [Agente A/B/C — validación conjunta]
```

Nota: `CHANGE-05` (auth-router) no es una dependencia estructural de `CHANGE-12`, pero
`/register` y `/login` **deben** estar implementados y desplegados antes de correr
`CHANGE-22`, ya que el smoke test E2E ejercita el flujo completo de registro/login. Se
recomienda completar `CHANGE-05` a más tardar en el mismo gate que `CHANGE-06` (GATE 5).

### Camino crítico (9 changes — mínimo irreducible)

```
CHANGE-00a → CHANGE-01 → CHANGE-02 → CHANGE-03 → CHANGE-04 → CHANGE-06 → CHANGE-12 → CHANGE-21 → CHANGE-22
```

Es la cadena de backend (Auth core + Scan + n8n) más larga hasta producción; determina la
duración mínima del proyecto. La rama frontend (`00b → 13 → 14 → 16 → 19 → 20`, 6 gates) y
la rama scan-backend (`00a → 08 → 09 → 10 → 11 → 12`, 6 gates) corren en paralelo y terminan
antes que el camino crítico.

### Plan óptimo con 3 agentes

```
Paso │ Agente A (Backend Core — Auth)     │ Agente B (Backend Aux — Scan/n8n)   │ Agente C (Frontend)
─────┼─────────────────────────────────────┼───────────────────────────────────────┼──────────────────────────────────
  1  │ CHANGE-00a fastapi-bridge-scaffold  │            —                         │ CHANGE-00b react-landing-scaffold
  2  │ CHANGE-00c env-config               │ CHANGE-07 rfc7807-exception-handlers │ CHANGE-13 zustand-auth-store
     │ CHANGE-01 postgres-user-model       │ CHANGE-08 pydantic-scan-schemas      │ CHANGE-15 shared-ui-atoms
     │                                      │                                        │ CHANGE-17 scan-zod-schema
  3  │ CHANGE-00d fastapi-cors-ratelimit   │ CHANGE-09 n8n-repository             │ CHANGE-14 auth-zod-schemas
     │ CHANGE-02 auth-pydantic-schemas     │                                        │ CHANGE-18 feature-scan-form
  4  │ CHANGE-03 user-repository           │ CHANGE-10 scan-unit-of-work          │ CHANGE-16 feature-auth
  5  │ CHANGE-04 auth-service              │ CHANGE-11 scan-service               │ CHANGE-19 landing-widgets
  6  │ CHANGE-05 auth-router               │            —                         │ CHANGE-20 landing-page-composition
     │ CHANGE-06 jwt-dependency            │                                        │
  7  │            —                        │ CHANGE-12 scan-router-protected      │            —
  8  │            —                        │ CHANGE-21 n8n-webhook-trigger        │            —
  9  │ CHANGE-22 e2e-smoke-test (conjunto: Agente A + Agente B + Agente C)                                         │
```

---

## FASE 0 — Scaffolding Inicial

> `CHANGE-00a` y `CHANGE-00b` son independientes entre sí (primer fork). `CHANGE-00c`
> necesita ambos. `CHANGE-00d` cierra la fase.

### [CHANGE-00a] `fastapi-bridge-scaffold`
- **Estado**: `[x]` completo
- **Historias US**: HU-03-01, HU-03-02
- **Scope**:
  - Carpeta raíz `fastapi_bridge/` con estructura completa: `main.py`, `core/settings.py`,
    `core/security.py`, `core/dependencies.py`, `db/base.py`, `db/session.py`, `db/models.py`,
    `api/v1/auth/router.py`, `api/v1/scan/router.py`, `services/auth_service.py`,
    `services/scan_service.py`, `uow/auth_unit_of_work.py`, `uow/scan_unit_of_work.py`,
    `repositories/user_repository.py`, `repositories/n8n_repository.py`,
    `schemas/auth_schemas.py`, `schemas/scan_schemas.py`, `exceptions/handlers.py`
  - `requirements.txt`: fastapi, pydantic[email], pydantic-settings, python-jose[cryptography],
    passlib[bcrypt], sqlalchemy, asyncpg, httpx, slowapi, uvicorn, python-dotenv
  - `requirements-dev.txt`: pytest, pytest-asyncio, anyio (runner de tests, requerido por
    el modo TDD estricto desde este primer change; no se incluye en el manifiesto de runtime)
  - `main.py` con app FastAPI básica (solo `GET /health`)
- **Dependencias**: ninguna
- **Duración estimada**: 1 hora
- **Governance**: BAJO
- **Leer antes**:
  - `knowledge-base/08_arquitectura_propuesta.md` §Estructura de directorios (`fastapi_bridge/`)
  - `knowledge-base/02_descripcion_general.md` §Stack
  - `knowledge-base/01_vision_y_objetivos.md`
- **Criterios de Aceptación**:
  - [x] `uvicorn fastapi_bridge.main:app --reload` arranca sin errores.
  - [x] GET /health retorna `{"status": "ok", "service": "wasa-fastapi-bridge"}`.
  - [x] La estructura de carpetas refleja exactamente los dos dominios (auth + scan).
  - [x] `requirements.txt` contiene todas las dependencias.
  - [x] `core/settings.py` tiene campos para JWT_SECRET, TOKEN_EXPIRE_HOURS, DB_URL.

---

### [CHANGE-00b] `react-landing-scaffold`
- **Estado**: `[x]` completado
- **Historias US**: HU-01-01, HU-06-01
- **Scope**:
  - `npm create vite@latest wasa-landing -- --template react-ts` (React 19.x, Vite 8.x, TS ~6.0.x —
    lo que scaffoldea el comando al momento de implementar, sin downgrade a versiones fijas;
    ver `knowledge-base/02_descripcion_general.md` y D-2 en `openspec/changes/react-landing-scaffold/design.md`)
  - Instalar: tailwindcss@^4, @tailwindcss/vite@^4, react-hook-form, zod,
    @hookform/resolvers, axios, zustand (sin postcss ni autoprefixer — Tailwind 4 no los usa)
  - Configurar Tailwind 4 (plugin `@tailwindcss/vite` en `vite.config.ts`, `@import "tailwindcss";`
    en `src/app/index.css` — sin `tailwind.config.ts` ni `postcss.config.*`)
  - Estructura FSD: `src/app/stores/`, `src/pages/`, `src/widgets/`, `src/features/`,
    `src/entities/`, `src/shared/`
  - Path aliases en `vite.config.ts` y `tsconfig.app.json` (no en `tsconfig.json` raíz, que en el
    template de Vite es solo de `references`)
  - `src/app/App.tsx` renderiza `<LandingPage />` placeholder
- **Dependencias**: ninguna
- **Duración estimada**: 1 hora
- **Governance**: BAJO
- **Leer antes**:
  - `knowledge-base/08_arquitectura_propuesta.md` §Estructura de directorios (`wasa-landing/` FSD)
  - `knowledge-base/02_descripcion_general.md` §Stack
  - `knowledge-base/01_vision_y_objetivos.md`
- **Criterios de Aceptación**:
  - [x] `npm run dev` arranca sin errores en puerto 5173.
  - [x] `npm run build` genera build sin errores TypeScript.
  - [x] La estructura de carpetas FSD (incluyendo `app/stores/`) existe.
  - [x] Zustand instalado y verificado (importación sin error).
  - [x] Tailwind CSS funciona en un componente de prueba.
  - [x] Los path aliases funcionan.

---

### [CHANGE-00c] `env-config`
- **Estado**: `[x]` implementado (ver nota de permisos abajo)
- **Historias US**: HU-03-01, HU-06-02
- **Scope**:
  - `fastapi_bridge/.env`: N8N_WEBHOOK_URL, N8N_WEBHOOK_TOKEN, JWT_SECRET,
    TOKEN_EXPIRE_HOURS=24, DB_URL=`postgresql+asyncpg://user:pass@host:5432/db_fuzzing`
    (misma instancia PostgreSQL que ya usa el sistema WASA), CORS_ORIGINS,
    RATE_LIMIT_REQUESTS=10, RATE_LIMIT_WINDOW=3600, APP_ENV=development
  - `fastapi_bridge/.env.example` (valores placeholder)
  - `wasa-landing/.env`: VITE_API_BASE_URL, VITE_DASHBOARD_URL
  - `wasa-landing/.env.example` (valores placeholder)
  - Ambos `.env` reales en `.gitignore`
- **Dependencias**: CHANGE-00a, CHANGE-00b
- **Duración estimada**: 30 minutos
- **Governance**: BAJO
- **Leer antes**:
  - `knowledge-base/08_arquitectura_propuesta.md` §Variables de entorno
  - `knowledge-base/09_decisiones_y_supuestos.md`
  - `knowledge-base/10_preguntas_abiertas.md` (valores reales de DB_URL/N8N_WEBHOOK_URL no documentados)
- **Criterios de Aceptación**:
  - [x] `core/settings.py` lee JWT_SECRET y DB_URL correctamente del `.env` (verificado inyectando los valores reales vía variables de entorno de shell, sin escribir el archivo — ver nota de permisos).
  - [x] `src/shared/config/env.ts` exporta las dos variables Vite correctamente (TDD completo, `wasa-landing/tests/env.test.ts`, 5/5 verde).
  - [x] Los `.env` reales NO están en el repositorio (`git check-ignore` + `git ls-files` verificado, tests de contrato).
  - [ ] Los `.env.example` están en el repositorio — **pendiente**: el agente no pudo escribir ningún archivo `.env*` (ni siquiera `.env.example`) por la configuración de permisos; el usuario debe pegar el contenido entregado en el apply y hacer `git add` de los cuatro archivos `.env*` (2 reales + 2 example).

---

### [CHANGE-00d] `fastapi-cors-ratelimit`
- **Estado**: `[x]` implementado (109/109 tests verdes; ver nota del criterio 429 abajo)
- **Historias US**: HU-03-06
- **Scope**:
  - `CORSMiddleware` con `allow_origins` desde `settings.CORS_ORIGINS`
  - `slowapi` Limiter con `key_func=get_remote_address`
  - Rate limit aplicado solo sobre `/api/v1/scan/start` (no sobre auth)
  - Handler para `RateLimitExceeded` → RFC 7807 + `Retry-After`
- **Dependencias**: CHANGE-00a, CHANGE-00c
- **Duración estimada**: 1 hora
- **Governance**: MEDIO
- **Leer antes**:
  - `knowledge-base/08_arquitectura_propuesta.md` §Seguridad (CORS, rate limiting)
  - `knowledge-base/05_reglas_de_negocio.md` §RN-WS-06
  - `knowledge-base/08_arquitectura_propuesta.md` §Variables de entorno (`CORS_ORIGINS`, `RATE_LIMIT_*`)
- **Criterios de Aceptación**:
  - [x] Request desde origen no en CORS_ORIGINS recibe bloqueo CORS (semántica real verificada, D-3: ausencia de `Access-Control-Allow-Origin` en solicitud simple, `400` en preflight — CORS no es un "403 del servidor").
  - [x] Request desde origen permitido recibe headers CORS correctos.
  - [x] La solicitud 11 a /scan/start (misma IP, misma ventana) recibe 429 — **verificado sobre la política, no sobre el path real**: `POST /api/v1/scan/start` todavía no se monta en este change (D-8, `bridge-bootstrap`); los tests de `fastapi_bridge/tests/test_rate_limit.py` montan una ruta desechable decorada con el mismo `scan_rate_limit` exportado que CHANGE-12 aplicará sobre `POST /start`. La verificación end-to-end sobre el path real queda a cargo de CHANGE-12.
  - [x] La respuesta 429 incluye header `Retry-After`.
  - [x] Los endpoints de auth NO están sujetos al rate limit del scan.

---

## FASE 1 — Auth Backend (PostgreSQL db_fuzzing + JWT)

> Cadena lineal crítica (`01 → 02 → 03 → 04`), con `07` corriendo en paralelo desde el
> inicio de la fase (solo depende de `00a`) y confluyendo en `05`.

### [CHANGE-01] `postgres-user-model`
- **Estado**: `[ ]` pendiente
- **Historias US**: HU-03-01, HU-06-02
- **Scope**:
  - `db/base.py`: `Base = DeclarativeBase()`, `engine = create_async_engine(settings.DB_URL)`
    apuntando a la MISMA base `db_fuzzing` (driver `asyncpg`)
  - `db/session.py`: `AsyncSessionLocal = async_sessionmaker(engine, ...)`
  - `db/models.py`: clase `User(Base)` con columnas `id` (Integer PK Auto),
    `email` (String unique, nullable=False), `hashed_password` (String, nullable=False),
    `created_at` (DateTime, default=now)
  - `main.py`: en startup event, `async with engine.begin() as conn: await conn.run_sync(Base.metadata.create_all)`
  - La tabla `users` se crea en `db_fuzzing` si no existe; `scans` y `vulnerabilities`
    existentes NO se ven afectadas (SQLAlchemy solo declara el modelo `User`)
- **Dependencias**: CHANGE-00a
- **Duración estimada**: 1.5 horas
- **Governance**: CRITICO
- **Leer antes**:
  - `knowledge-base/04_modelo_de_datos.md` §users (NUEVA)
  - `knowledge-base/05_reglas_de_negocio.md` §RN-WS-12, RN-WS-13
  - `knowledge-base/09_decisiones_y_supuestos.md` (decisión: PostgreSQL `db_fuzzing` compartida, no SQLite)
- **Criterios de Aceptación**:
  - [ ] Al arrancar la app, la tabla `users` se crea automáticamente en `db_fuzzing`.
  - [ ] La tabla `users` existe con las columnas correctas.
  - [ ] La columna `email` tiene constraint UNIQUE.
  - [ ] El engine es async (usa `asyncpg` como driver contra PostgreSQL).
  - [ ] La creación es idempotente: arrancar dos veces no duplica la tabla.
  - [ ] Las tablas `scans` y `vulnerabilities` existentes no se alteran ni se vacían.

---

### [CHANGE-02] `auth-pydantic-schemas`
- **Estado**: `[ ]` pendiente
- **Historias US**: HU-03-01, HU-03-02, HU-03-07
- **Scope**:
  - `schemas/auth_schemas.py`: `UserRegister` (email EmailStr, password str min_length=8),
    `UserLogin` (email EmailStr, password str min_length=1), `TokenResponse`
    (access_token, token_type Literal["bearer"], expires_in int), `TokenData`
    (email str | None = None — payload del JWT)
  - `schemas/scan_schemas.py`: `ErrorDetail` (type, title, status, detail, instance — RFC 7807)
- **Dependencias**: CHANGE-01
- **Duración estimada**: 1 hora
- **Governance**: BAJO
- **Leer antes**:
  - `knowledge-base/06_funcionalidades.md` §HU-03-01, HU-03-02, HU-03-07
  - `knowledge-base/05_reglas_de_negocio.md` §RN-WS-15 (password mínimo 8 chars)
- **Criterios de Aceptación**:
  - [ ] `UserRegister` con password de 7 chars falla validación.
  - [ ] `UserRegister` con email inválido falla validación.
  - [ ] `TokenResponse` se puede serializar a JSON correctamente.
  - [ ] `TokenData` acepta email None sin error.
  - [ ] Tests unitarios de schemas pasan.

---

### [CHANGE-03] `user-repository`
- **Estado**: `[ ]` pendiente
- **Historias US**: HU-03-01, HU-03-02
- **Scope**:
  - `repositories/user_repository.py`: clase `UserRepository`, constructor recibe
    `session: AsyncSession`
  - Método async `get_by_email(email: str) -> User | None`
  - Método async `create(email: str, hashed_password: str) -> User`: normaliza email a
    lowercase antes de guardar; si hay IntegrityError (email duplicado) lanza
    `EmailAlreadyExistsError`
- **Dependencias**: CHANGE-01, CHANGE-02
- **Duración estimada**: 1 hora
- **Governance**: CRITICO
- **Leer antes**:
  - `knowledge-base/04_modelo_de_datos.md` §users
  - `knowledge-base/08_arquitectura_propuesta.md` §Patrones (Repository)
  - `knowledge-base/05_reglas_de_negocio.md` §RN-WS-13
- **Criterios de Aceptación**:
  - [ ] `get_by_email` retorna el User si existe, None si no.
  - [ ] `create` con email nuevo: INSERT exitoso, retorna User con id poblado.
  - [ ] `create` con email duplicado: lanza `EmailAlreadyExistsError`.
  - [ ] El email se guarda en lowercase (ej: "USER@TEST.COM" → "user@test.com").
  - [ ] El repository no conoce nada de FastAPI ni de passlib.

---

### [CHANGE-04] `auth-service`
- **Estado**: `[ ]` pendiente
- **Historias US**: HU-03-01, HU-03-02
- **Scope**:
  - `core/security.py`: `hash_password(plain) -> str` (bcrypt via passlib CryptContext),
    `verify_password(plain, hashed) -> bool`, `create_access_token(data, expires_delta) -> str`
    (python-jose, HS256, clave = settings.JWT_SECRET), `decode_access_token(token) -> TokenData`
    (retorna TokenData con email=None si el token es inválido o expirado)
  - `services/auth_service.py`: clase `AuthService` (constructor recibe `uow: AuthUoW`),
    método async `register(data: UserRegister) -> TokenResponse`, método async
    `login(data: UserLogin) -> TokenResponse` (401 genérico si email no existe o
    contraseña no coincide, sin distinguir cuál falló — evita enumeración de usuarios)
- **Dependencias**: CHANGE-03
- **Duración estimada**: 1.5 horas
- **Governance**: CRITICO
- **Leer antes**:
  - `knowledge-base/08_arquitectura_propuesta.md` §Seguridad
  - `knowledge-base/05_reglas_de_negocio.md` §RN-WS-12, RN-WS-14
  - `knowledge-base/03_actores_y_roles.md`
- **Criterios de Aceptación**:
  - [ ] `hash_password("secret")` retorna string bcrypt (starts with "$2b$").
  - [ ] `verify_password("secret", hash)` retorna True.
  - [ ] `verify_password("wrong", hash)` retorna False.
  - [ ] `create_access_token({"sub": "a@b.com"}, timedelta(hours=24))` retorna JWT válido.
  - [ ] `decode_access_token(valid_jwt)` retorna TokenData con email correcto.
  - [ ] `decode_access_token(expired_jwt)` retorna TokenData(email=None).
  - [ ] `AuthService.login` con credenciales inválidas lanza `InvalidCredentialsError`.
  - [ ] `AuthService.register` con email duplicado lanza `EmailAlreadyExistsError`.

---

### [CHANGE-05] `auth-router`
- **Estado**: `[ ]` pendiente
- **Historias US**: HU-03-01, HU-03-02, HU-03-07
- **Scope**:
  - `api/v1/auth/router.py`: APIRouter con prefix `/api/v1/auth`
  - `POST /register`: recibe `UserRegister`, llama `AuthService.register()`, retorna 201 + `TokenResponse`
  - `POST /login`: recibe `UserLogin`, llama `AuthService.login()`, retorna 200 + `TokenResponse`
  - Manejar `EmailAlreadyExistsError` → 409 RFC 7807
  - Manejar `InvalidCredentialsError` → 401 RFC 7807
  - Registrar el router en `main.py`
- **Dependencias**: CHANGE-04, CHANGE-07
- **Duración estimada**: 1 hora
- **Governance**: CRITICO
- **Leer antes**:
  - `knowledge-base/07_flujos_principales.md` §Flujo 1: Registro de usuario, §Flujo 2: Login
  - `knowledge-base/06_funcionalidades.md` §HU-03-01, HU-03-02, HU-03-07
- **Criterios de Aceptación**:
  - [ ] POST /api/v1/auth/register con datos válidos: 201 + TokenResponse.
  - [ ] POST /api/v1/auth/register con email duplicado: 409 RFC 7807.
  - [ ] POST /api/v1/auth/register con password < 8 chars: 400 RFC 7807.
  - [ ] POST /api/v1/auth/login con credenciales correctas: 200 + TokenResponse.
  - [ ] POST /api/v1/auth/login con credenciales incorrectas: 401 RFC 7807.
  - [ ] Los endpoints aparecen en `/docs` con sus schemas correctos.

---

### [CHANGE-06] `jwt-dependency`
- **Estado**: `[ ]` pendiente
- **Historias US**: HU-03-03
- **Scope**:
  - `core/dependencies.py`: `oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")`
  - `get_current_user(token: str = Depends(oauth2_scheme)) -> str`: llama
    `security.decode_access_token(token)`; si `token_data.email is None` lanza HTTPException 401;
    retorna el email del usuario autenticado
  - Esta dependency se inyecta en `/api/v1/scan/start` para protegerlo
- **Dependencias**: CHANGE-04
- **Duración estimada**: 1 hora
- **Governance**: CRITICO
- **Leer antes**:
  - `knowledge-base/03_actores_y_roles.md` §RBAC — Matriz de permisos
  - `knowledge-base/08_arquitectura_propuesta.md` §Seguridad
  - `knowledge-base/05_reglas_de_negocio.md` §RN-WS-11
- **Criterios de Aceptación**:
  - [ ] Request con JWT válido en header Authorization: `get_current_user` retorna email.
  - [ ] Request sin header Authorization: 401 con RFC 7807.
  - [ ] Request con JWT malformado: 401 con RFC 7807.
  - [ ] Request con JWT expirado: 401 con RFC 7807.
  - [ ] El email retornado coincide con el "sub" del JWT.

---

### [CHANGE-07] `rfc7807-exception-handlers`
- **Estado**: `[ ]` pendiente
- **Historias US**: HU-03-07
- **Scope**:
  - `exceptions/handlers.py`: handler `RequestValidationError` → 400/422 RFC 7807; handler
    `HTTPException` → formato RFC 7807 (wrapping); handler `RateLimitExceeded` → 429 RFC
    7807 + `Retry-After`; handler `Exception` genérica → 500 RFC 7807 (sin stack trace)
  - Registrar handlers en `main.py` con `app.add_exception_handler`
- **Dependencias**: CHANGE-00a
- **Duración estimada**: 1 hora
- **Governance**: MEDIO
- **Leer antes**:
  - `knowledge-base/05_reglas_de_negocio.md` §RN-WS-09, §Dominio: Excepciones globales
  - `knowledge-base/06_funcionalidades.md` §HU-03-07
- **Criterios de Aceptación**:
  - [ ] Error de validación Pydantic produce JSON RFC 7807 con type/title/status/detail/instance.
  - [ ] Error 429 produce RFC 7807 con header `Retry-After`.
  - [ ] Error 500 produce RFC 7807 con mensaje genérico (sin stack trace).
  - [ ] El campo `instance` refleja el path del endpoint que falló.
  - [ ] Los errores 401 y 409 también pasan por el handler.

---

## FASE 2 — Scan Backend (FastAPI protegido)

> Cadena lineal `08 → 09 → 10 → 11 → 12`; `12` es el punto de confluencia con la Fase 1
> (necesita `06` y `00d`).

### [CHANGE-08] `pydantic-scan-schemas`
- **Estado**: `[x]` hecho
- **Historias US**: HU-03-04, HU-03-05
- **Scope**:
  - `schemas/scan_schemas.py`: `ScanRequest` (target_url HttpUrl, phpsessid str min=1,
    sqlmap_level int ge=1 le=5 default=1, sqlmap_risk int ge=1 le=3 default=1),
    `ScanResponse` (scan_id str, status Literal["queued"], message str), `N8nPayload`
    (target_url str, phpsessid str, sqlmap_level int, sqlmap_risk int, scan_id str)
- **Dependencias**: CHANGE-00a
- **Duración estimada**: 1 hora
- **Governance**: BAJO
- **Leer antes**:
  - `knowledge-base/06_funcionalidades.md` §HU-02-01 a HU-02-05
  - `knowledge-base/05_reglas_de_negocio.md` §RN-WS-02 a RN-WS-05
- **Criterios de Aceptación**:
  - [x] `ScanRequest` con target_url sin http/https falla validación. (`test_scan_request_rejects_target_url_without_scheme`)
  - [x] `ScanRequest` con phpsessid vacío falla validación. (`test_scan_request_rejects_empty_phpsessid`)
  - [x] `ScanRequest` con sqlmap_level=6 falla validación. (`test_scan_request_rejects_sqlmap_level_above_range`)
  - [x] `ScanRequest` sin sqlmap_level usa default=1. (`test_scan_request_sqlmap_level_defaults_to_one_when_omitted`)
  - [x] Tests unitarios de schemas pasan. (`fastapi_bridge/tests/test_scan_schemas.py`, 42 tests, todos verdes)

---

### [CHANGE-09] `n8n-repository`
- **Estado**: `[x]` hecho
- **Historias US**: HU-03-05
- **Scope**:
  - `repositories/n8n_repository.py`: clase `N8nRepository`, constructor recibe
    `client: httpx.AsyncClient, settings: Settings` (D-1: divergencia deliberada
    respecto de la firma sólo-`client` listada arriba — confirmada por el usuario;
    ver `openspec/changes/change-09-n8n-repository/design.md`)
  - Método async `forward_scan(payload: N8nPayload) -> bool`: POST httpx a
    `settings.N8N_WEBHOOK_URL`, header `X-WASA-TOKEN: settings.N8N_WEBHOOK_TOKEN`,
    timeout 10s, retorna `True` si n8n responde 2xx (D-4: ablandado de `== 200`
    exacto a cualquier 2xx tras revisión del usuario — el código de respuesta real
    del Webhook Trigger de n8n no se puede confirmar desde el repo), lanza
    `N8nUnavailableError` si timeout, falla de transporte o respuesta fuera de 2xx
- **Dependencias**: CHANGE-08
- **Duración estimada**: 1.5 horas
- **Governance**: MEDIO
- **Leer antes**:
  - `knowledge-base/08_arquitectura_propuesta.md` §Patrones (Repository, Fire-and-Forward)
  - `knowledge-base/05_reglas_de_negocio.md` §RN-WS-07
  - `knowledge-base/07_flujos_principales.md` §Flujo 3: Escaneo
- **Criterios de Aceptación**:
  - [x] Con n8n mockeado respondiendo 2xx (200, 201, 204): retorna True. (`test_forward_scan_returns_true_when_n8n_responds_200`, `test_forward_scan_returns_true_for_other_2xx_status_codes`)
  - [x] Con n8n mockeado respondiendo un código fuera de 2xx (302, 401, 404, 500): lanza `N8nUnavailableError`. (`test_forward_scan_raises_n8n_unavailable_for_non_2xx_status_codes`)
  - [x] Con n8n inaccesible (timeout, conexión rechazada, falla de transporte): lanza `N8nUnavailableError`. (`test_forward_scan_raises_n8n_unavailable_on_read_timeout`, `test_forward_scan_raises_n8n_unavailable_for_other_transport_errors`)
  - [x] El header `X-WASA-TOKEN` se envía en cada request, desenvuelto. (`test_forward_scan_sends_the_unwrapped_token_never_the_secretstr_obfuscated_form`, `test_forward_scan_header_travels_on_every_delivery_not_only_the_first`)
  - [x] El repository no importa nada de FastAPI/Starlette/slowapi. (`fastapi_bridge/tests/test_layer_boundaries.py::test_layer_respects_import_boundary[repositories-fastapi/starlette/slowapi]`)

---

### [CHANGE-10] `scan-unit-of-work`
- **Estado**: `[x]` hecho
- **Historias US**: HU-03-05
- **Scope**:
  - `uow/scan_unit_of_work.py`: clase `ScanUoW` (async context manager), constructor
    `__init__(self, settings: Settings | None = None)` (D-2 de CHANGE-10: extensión
    deliberada respecto de la firma sin argumentos listada originalmente acá — resuelve
    `get_settings()` como fallback cuando no se inyecta una `Settings` explícita)
  - `__aenter__`: instancia `httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS)` y
    `N8nRepository(client, settings)` — firma real de dos argumentos confirmada en
    CHANGE-09 (ver Scope de CHANGE-09 abajo), no la firma sólo-`client` que este
    documento listaba originalmente
  - `__aexit__`: cierra el cliente httpx (`aclose()`) incluso si hay excepción, sin
    suprimirla (`-> None`, nunca `-> bool`)
  - Expone propiedad `n8n: N8nRepository`, que levanta `RuntimeError` si se accede
    fuera del ámbito (antes de `__aenter__` o después de `__aexit__`)
  - `pytest.ini`: una línea agregada (`asyncio_default_fixture_loop_scope = function`),
    detectada y corregida en la re-verificación de este change — sin ella, la suite
    completa con `test_scan_unit_of_work.py` incluido emite un `PytestDeprecationWarning`
    de `pytest-asyncio` bajo `pytest -W error` (ver nota en `tasks.md` 8.5)
- **Dependencias**: CHANGE-09
- **Duración estimada**: 1 hora
- **Governance**: MEDIO
- **Leer antes**:
  - `knowledge-base/08_arquitectura_propuesta.md` §Patrones (Unit of Work)
- **Criterios de Aceptación**:
  - [x] Uso via `async with ScanUoW() as uow:` funciona sin errores. (`test_scan_uow_can_be_constructed_with_no_arguments_at_all`, `test_entering_the_scope_yields_the_uow_instance_itself`)
  - [x] El cliente httpx se cierra correctamente al salir. (`test_normal_exit_closes_the_channel`, `test_channel_closes_even_when_no_delivery_was_ever_made`)
  - [x] Si ocurre excepción dentro del bloque, httpx igual se cierra. (`test_exit_by_arbitrary_exception_still_closes_the_channel_and_propagates_it`, `test_exit_by_n8n_unavailable_error_closes_the_channel_and_preserves_the_original_type`)
  - [x] `uow.n8n` expone el N8nRepository instanciado. (`test_n8n_property_exposes_an_n8n_repository_instance`, `test_accessing_n8n_before_entering_the_scope_raises_runtime_error`)

---

### [CHANGE-11] `scan-service`
- **Estado**: `[x]` hecho (⚠️ ver nota de regresión no resuelta al final de esta sección)
- **Historias US**: HU-03-04, HU-03-05
- **Scope**:
  - `services/scan_service.py`: clase `ScanService`, constructor
    `__init__(self, uow_factory: Callable[[], ScanUoW] = ScanUoW) -> None` (D-2 de
    CHANGE-11: extensión deliberada respecto del constructor sin argumentos listado
    originalmente acá — fábrica inyectable con `ScanUoW` como default de producción,
    de modo que el call site real siga siendo `async with ScanUoW() as uow:`; evita
    reentrar la misma instancia de `ScanUoW`, prohibido por CHANGE-10)
  - Método async `start_scan(request: ScanRequest) -> ScanResponse`: genera
    `scan_id = str(uuid.uuid4())`, construye `N8nPayload` desde `ScanRequest` + `scan_id`
    campo a campo, usa `async with self._uow_factory() as uow:` → `uow.n8n.forward_scan(payload)`,
    retorna `ScanResponse` si la entrega fue aceptada; no captura `N8nUnavailableError`,
    se propaga sin envolver
- **Dependencias**: CHANGE-10
- **Duración estimada**: 1 hora
- **Governance**: MEDIO
- **Leer antes**:
  - `knowledge-base/07_flujos_principales.md` §Flujo 3: Escaneo
  - `knowledge-base/05_reglas_de_negocio.md` §RN-WS-07
- **Criterios de Aceptación**:
  - [x] `start_scan` con ScanRequest válida retorna ScanResponse con UUID v4. (`test_start_scan_returns_a_scan_response`, `test_scan_id_has_the_shape_of_a_uuid_v4`)
  - [x] Si N8nRepository lanza N8nUnavailableError, el Service lo propaga. (`test_n8n_unavailable_error_reaches_the_caller_with_its_original_type`, `test_propagated_exception_type_is_exactly_n8n_unavailable_error_not_a_subclass`)
  - [x] El Service no importa httpx directamente. (`test_scan_service_module_does_not_import_httpx_sqlalchemy_asyncpg_or_the_db_layer`, `fastapi_bridge/tests/test_layer_boundaries.py::test_layer_respects_import_boundary[services-httpx]`, `[services-sqlalchemy]`)
  - [x] Test unitario mockea ScanUoW y verifica que el scan_id llega al payload. (`test_response_scan_id_is_identical_to_the_scan_id_captured_in_the_delivered_payload`, `test_injected_uow_factory_wins_over_the_default`)

  **Falso positivo detectado y corregido (fuera del scope de dos archivos del change, aprobado puntualmente por el usuario)**:
  al escribir `class ScanService` como código real (no docstring), `fastapi_bridge/tests/test_no_shared_db_impact.py::test_no_reference_to_existing_shared_tables`
  (CHANGE-00a, `bridge-bootstrap`) empezó a fallar. Esa prueba buscaba la subcadena
  literal `"scans"` en el código en minúsculas; `"class ScanService:"` en minúsculas
  es `"class scanservice:"`, que **contiene** `"scans"` como subcadena — falso
  positivo del checker (no hay ninguna referencia real a la tabla `scans` de
  `db_fuzzing`; `ScanRequest`, `ScanResponse` y `ScanUoW` no colisionan, sólo
  `ScanService` lo hace). Se endureció el checker a un patrón con límite de
  palabra (`\bscans\b` / `\bvulnerabilities\b`) en `test_no_shared_db_impact.py`,
  como excepción puntual aprobada por el usuario a la regla de dos archivos de
  este change. `pytest` completo queda en 248 passed, 0 failed (215 baseline +
  33 tests nuevos de este change).

---

### [CHANGE-12] `scan-router-protected`
- **Estado**: `[ ]` pendiente
- **Historias US**: HU-03-03, HU-03-04, HU-03-05, HU-03-06
- **Scope**:
  - `api/v1/scan/router.py`: APIRouter con prefix `/api/v1/scan`
  - `POST /start` con `current_user: str = Depends(get_current_user)` (JWT guard),
    `@limiter.limit(...)` (rate limit), recibe `ScanRequest`, llama
    `ScanService.start_scan()`, retorna `JSONResponse(..., status_code=202)`,
    maneja `N8nUnavailableError` → 502 RFC 7807
  - Registrar el router en `main.py`
  - **Nota heredada de CHANGE-11**: el Router llama `await ScanService().start_scan(request)`
    sin construir nada de infraestructura — `ScanService()` sin argumentos ya abre
    `async with ScanUoW() as uow:` por default (D-2). `N8nUnavailableError` llega sin
    envolver y es el **único** caso a mapear a 502 RFC 7807; la respuesta 202 se arma
    con la `ScanResponse` devuelta tal cual, sin transformarla. Los tests de router de
    este change deben sustituir el `ScanService` completo (vía `dependency_overrides`
    del Router), no sólo `get_settings`, porque `ScanUoW` resuelve su propia
    configuración y `app.dependency_overrides[get_settings]` no lo alcanza (nota
    heredada de CHANGE-10, D-2).
- **Dependencias**: CHANGE-11, CHANGE-06, CHANGE-00d
- **Duración estimada**: 1 hora
- **Governance**: ALTO
- **Leer antes**:
  - `knowledge-base/03_actores_y_roles.md` §RBAC — Matriz de permisos
  - `knowledge-base/05_reglas_de_negocio.md` §RN-WS-06, RN-WS-11
  - `knowledge-base/07_flujos_principales.md` §Flujo 3: Escaneo
- **Criterios de Aceptación**:
  - [ ] POST con JWT válido y body válido: 202 + ScanResponse JSON.
  - [ ] POST sin JWT: 401 RFC 7807.
  - [ ] POST con JWT expirado: 401 RFC 7807.
  - [ ] POST con body inválido (y JWT válido): 400/422 RFC 7807.
  - [ ] POST desde IP con rate limit excedido: 429 RFC 7807.
  - [ ] POST cuando n8n no responde: 502 RFC 7807.
  - [ ] La documentación Swagger en `/docs` muestra el endpoint con el lock de auth.

---

## FASE 3 — Auth Frontend (Zustand + Login/Register)

> `13` y `15` corren en paralelo (ambos solo dependen de `00b`); `14` depende de `13`;
> `16` cierra la fase.

### [CHANGE-13] `zustand-auth-store`
- **Estado**: `[x]` completo
- **Historias US**: HU-06-04, HU-06-05
- **Scope**:
  - `src/app/stores/authStore.ts`: state `token: string | null`, `email: string | null`,
    `isAuthenticated: boolean`; actions `login(token, email)` (guarda en state +
    localStorage), `logout()` (limpia state + localStorage), `hydrate()` (al arrancar, lee
    localStorage y valida si token no expiró usando `jwtIsExpired(token)`)
  - `src/shared/lib/utils.ts`: función `jwtIsExpired(token: string): boolean` que parsea
    el claim `exp` del JWT sin librería adicional (atob + JSON.parse)
  - `src/app/App.tsx`: llama `authStore.hydrate()` en useEffect al montar
- **Dependencias**: CHANGE-00b
- **Duración estimada**: 1.5 horas
- **Governance**: ALTO
- **Leer antes**:
  - `knowledge-base/06_funcionalidades.md` §HU-06-04, HU-06-05
  - `knowledge-base/08_arquitectura_propuesta.md` §Zustand + persist
  - `knowledge-base/05_reglas_de_negocio.md` §RN-WS-14
- **Criterios de Aceptación**:
  - [x] `authStore.login(token, email)` actualiza isAuthenticated a true.
  - [x] `authStore.logout()` limpia token, email, isAuthenticated y localStorage.
  - [x] Al recargar la app, hydrate() restaura la sesión si el token no expiró.
  - [x] Al recargar con token expirado, hydrate() limpia el authStore.
  - [x] `jwtIsExpired(token)` retorna true si el claim `exp` está en el pasado.
  - [x] `tsc --noEmit` sin errores en authStore y utils.

---

### [CHANGE-14] `auth-zod-schemas`
- **Estado**: `[ ]` pendiente
- **Historias US**: HU-06-02, HU-06-03
- **Scope**:
  - `src/entities/user/model/types.ts`: `UserRegister` (email, password, confirmPassword),
    `UserLogin` (email, password), `TokenResponse` (access_token, token_type, expires_in),
    `AuthApiError` (type, title, status, detail, instance)
  - `src/entities/user/model/loginSchema.ts` (Zod): email válido, password min(1)
  - `src/entities/user/model/registerSchema.ts` (Zod): email válido, password min(8),
    confirmPassword min(1), superRefine verifica password === confirmPassword
- **Dependencias**: CHANGE-13
- **Duración estimada**: 1 hora
- **Governance**: BAJO
- **Leer antes**:
  - `knowledge-base/06_funcionalidades.md` §HU-06-02, HU-06-03
  - `knowledge-base/05_reglas_de_negocio.md` §RN-WS-15
- **Criterios de Aceptación**:
  - [ ] `loginSchema.parse({ email: "not-email", password: "x" })` lanza ZodError.
  - [ ] `registerSchema.parse({ ..., password: "1234567", confirmPassword: "1234567" })` lanza ZodError (< 8 chars).
  - [ ] `registerSchema.parse({ ..., password: "pass1234", confirmPassword: "diferente" })` lanza ZodError.
  - [ ] `tsc --noEmit` sin errores en `entities/user/`.

---

### [CHANGE-15] `shared-ui-atoms`
- **Estado**: `[ ]` pendiente
- **Historias US**: HU-02-01, HU-06-02, HU-06-03, HU-05-02
- **Scope**:
  - `src/shared/ui/Button.tsx`: variants (primary, secondary), loading state
  - `src/shared/ui/Input.tsx`: label, error message, helper, valid/error borders
  - `src/shared/ui/Checkbox.tsx`: label embebido, estado error
  - `src/shared/ui/Spinner.tsx`: SVG animado
  - `src/shared/ui/Modal.tsx`: backdrop, cierre con Escape, children slot (sin
    conocimiento de contenido de auth ni scan)
  - `src/shared/lib/utils.ts`: función `cn()` (clsx + tailwind-merge) + función
    `jwtIsExpired()` (para authStore)
- **Dependencias**: CHANGE-00b
- **Duración estimada**: 2 horas
- **Governance**: BAJO
- **Leer antes**:
  - `knowledge-base/08_arquitectura_propuesta.md` §Regla de capas frontend (estricta)
- **Criterios de Aceptación**:
  - [ ] `<Button loading>` muestra Spinner y está deshabilitado.
  - [ ] `<Input error="msg">` muestra borde rojo y mensaje.
  - [ ] `<Modal isOpen onClose={fn}>` renderiza backdrop y cierra con Escape.
  - [ ] Ningún componente importa de @features, @entities, @pages, @widgets.
  - [ ] `npm run build` sin errores TypeScript.

---

### [CHANGE-16] `feature-auth`
- **Estado**: `[ ]` pendiente
- **Historias US**: HU-06-02, HU-06-03
- **Scope**:
  - `src/features/auth/login/api/loginApi.ts`: POST /api/v1/auth/login → retorna
    TokenResponse, lanza AuthApiError si 401
  - `src/features/auth/login/model/useLogin.ts`: useForm + zodResolver(loginSchema),
    handleSubmit → loginApi → authStore.login → cierra modal (via prop onSuccess);
    estado isLoading, serverError
  - `src/features/auth/login/ui/LoginForm.tsx`: campos email + password, botón
    "Ingresar" con loading, link "¿No tenés cuenta? Registrate"
  - `src/features/auth/register/api/registerApi.ts`: POST /api/v1/auth/register →
    201 + TokenResponse, lanza AuthApiError con status 409 si email duplicado
  - `src/features/auth/register/model/useRegister.ts`: useForm + zodResolver(registerSchema),
    handleSubmit → registerApi → authStore.login → onSuccess; estado isLoading, serverError
  - `src/features/auth/register/ui/RegisterForm.tsx`: campos email + password +
    confirmPassword, botón "Registrarme", link "¿Ya tenés cuenta? Iniciá sesión"
- **Dependencias**: CHANGE-13, CHANGE-14, CHANGE-15
- **Duración estimada**: 3 horas
- **Governance**: ALTO
- **Leer antes**:
  - `knowledge-base/07_flujos_principales.md` §Flujo 1: Registro de usuario, §Flujo 2: Login
  - `knowledge-base/06_funcionalidades.md` §HU-06-02, HU-06-03
  - `knowledge-base/05_reglas_de_negocio.md` §RN-WS-12 a RN-WS-15
- **Criterios de Aceptación**:
  - [ ] Login exitoso (200): authStore.isAuthenticated = true.
  - [ ] Login fallido (401): mensaje "Credenciales incorrectas." visible.
  - [ ] Register exitoso (201): authStore.isAuthenticated = true.
  - [ ] Register con email duplicado (409): mensaje "Este email ya está registrado."
  - [ ] Register con password < 8 chars: error inline en el campo (client-side).
  - [ ] Confirmación de password distinta: error inline (client-side).
  - [ ] Botón muestra Spinner durante el request (no hay doble submit).
  - [ ] `tsc --noEmit` sin errores.

---

## FASE 4 — Scan Frontend + Composición Landing

> `17` es independiente (solo depende de `00b`); `18` confluye `13`, `15`, `17`; `19`
> confluye `16` y `18`; `20` cierra la fase.

### [CHANGE-17] `scan-zod-schema`
- **Estado**: `[ ]` pendiente
- **Historias US**: HU-02-02, HU-02-03, HU-02-04, HU-02-05
- **Scope**:
  - `src/entities/scan/model/types.ts`: ScanRequest, ScanResponse, ScanApiError
  - `src/entities/scan/model/scanSchema.ts` (Zod): target_url url() con mensaje custom,
    phpsessid min(1).trim(), sqlmap_level int min(1).max(5).default(1), sqlmap_risk
    int min(1).max(3).default(1), ethical_consent literal(true) con errorMap
- **Dependencias**: CHANGE-00b
- **Duración estimada**: 1 hora
- **Governance**: BAJO
- **Leer antes**:
  - `knowledge-base/06_funcionalidades.md` §HU-02-01 a HU-02-05
  - `knowledge-base/05_reglas_de_negocio.md` §RN-WS-01 a RN-WS-05
- **Criterios de Aceptación**:
  - [ ] `scanSchema.parse({ target_url: "not-a-url", ... })` lanza ZodError.
  - [ ] `scanSchema.parse({ ..., ethical_consent: false })` lanza ZodError.
  - [ ] `scanSchema.parse({ target_url: "http://dvwa.local", phpsessid: "abc" })` usa defaults.
  - [ ] `tsc --noEmit` sin errores.

---

### [CHANGE-18] `feature-scan-form`
- **Estado**: `[ ]` pendiente
- **Historias US**: HU-02-01 a HU-02-05, HU-03-04, HU-05-01 a HU-05-03
- **Scope**:
  - `src/shared/api/axiosInstance.ts`: instancia Axios con baseURL = VITE_API_BASE_URL;
    interceptor de request agrega `Authorization: Bearer <token>` desde authStore;
    interceptor de response: si 401 → authStore.logout()
  - `src/features/scan-form/api/submitScan.ts`: POST /api/v1/scan/start (axiosInstance ya
    adjunta el JWT), retorna ScanResponse si 202, lanza ScanApiError si 401/400/429/502
  - `src/features/scan-form/model/useScanForm.ts`: useForm + zodResolver(scanSchema),
    isLoading, serverError; en éxito (202): `window.location.href = VITE_DASHBOARD_URL`;
    si 401: authStore.logout() + mensaje "Sesión expirada"
  - `src/features/scan-form/ui/ScanForm.tsx`: renderiza campos con @shared/ui, botón
    deshabilitado si !ethical_consent || isLoading
- **Dependencias**: CHANGE-13, CHANGE-15, CHANGE-17
- **Duración estimada**: 2.5 horas
- **Governance**: ALTO
- **Leer antes**:
  - `knowledge-base/07_flujos_principales.md` §Flujo 3: Escaneo
  - `knowledge-base/06_funcionalidades.md` §HU-05-01 a HU-05-03
  - `knowledge-base/05_reglas_de_negocio.md` §RN-WS-08
- **Criterios de Aceptación**:
  - [ ] submitScan adjunta automáticamente el JWT (via interceptor, no manual).
  - [ ] Si el servidor retorna 401: authStore.logout() y mensaje "Sesión expirada". El muro de auth vuelve a aparecer.
  - [ ] Submit válido (202): redirección a VITE_DASHBOARD_URL.
  - [ ] Botón "Escanear" deshabilitado sin checkbox ético marcado.
  - [ ] Spinner durante isLoading. No hay doble submit.
  - [ ] `tsc --noEmit` sin errores.

---

### [CHANGE-19] `landing-widgets`
- **Estado**: `[ ]` pendiente
- **Historias US**: HU-01-01 a HU-01-04, HU-06-01 a HU-06-03, HU-02-01
- **Scope**:
  - `widgets/hero/HeroWidget.tsx`: CTA "Comenzar" — si autenticado hace scroll a
    `#scan-form`, si no abre LoginModal
  - `widgets/features-section/FeaturesWidget.tsx`: 4 tarjetas (ZAP, Nuclei, ffuf, SQLMap)
  - `widgets/how-it-works/HowItWorksWidget.tsx`: 4 pasos, incluye "Crear cuenta" como primer paso
  - `widgets/auth-modal/LoginModal.tsx`: Modal base + LoginForm; props isOpen, onClose, onSwitchToRegister
  - `widgets/auth-modal/RegisterModal.tsx`: Modal base + RegisterForm; props isOpen, onClose, onSwitchToLogin
  - `widgets/scan-form/ScanFormWidget.tsx`: lee authStore.isAuthenticated; si false → AuthWall
    (texto + botones "Iniciar Sesión"/"Crear Cuenta" que abren LoginModal/RegisterModal);
    si true → aviso ético + `<ScanForm />` con id="scan-form"; botón "Cerrar sesión" visible
  - `widgets/footer/FooterWidget.tsx`
- **Dependencias**: CHANGE-16, CHANGE-18
- **Duración estimada**: 3.5 horas
- **Governance**: MEDIO
- **Leer antes**:
  - `knowledge-base/06_funcionalidades.md` §Épica 1, §HU-06-01
  - `knowledge-base/03_actores_y_roles.md` §RBAC — Matriz de permisos
  - `knowledge-base/05_reglas_de_negocio.md` §RN-WS-10
- **Criterios de Aceptación**:
  - [ ] HeroWidget CTA abre LoginModal si usuario no está autenticado.
  - [ ] HeroWidget CTA hace scroll a #scan-form si está autenticado.
  - [ ] LoginModal y RegisterModal se alternan via los links de cada form.
  - [ ] Al login/register exitoso: el modal se cierra y el scan form aparece.
  - [ ] ScanFormWidget no renderiza ningún campo del form si !isAuthenticated.
  - [ ] El botón "Cerrar sesión" ejecuta authStore.logout() y muestra muro.
  - [ ] Todos los widgets son responsive (375px y 1280px).
  - [ ] `npm run build` sin errores.

---

### [CHANGE-20] `landing-page-composition`
- **Estado**: `[ ]` pendiente
- **Historias US**: HU-01-01 a HU-01-04, HU-06-01, HU-02-01
- **Scope**:
  - `src/pages/LandingPage/index.tsx`: HeroWidget → FeaturesWidget → HowItWorksWidget →
    ScanFormWidget (contiene auth gate) → FooterWidget
  - `src/app/App.tsx`: renderiza LandingPage + llama authStore.hydrate() en useEffect
  - `src/app/index.css`: fuentes Google + variables CSS globales
- **Dependencias**: CHANGE-19
- **Duración estimada**: 1 hora
- **Governance**: BAJO
- **Leer antes**:
  - `knowledge-base/06_funcionalidades.md` §Épica 1
  - `knowledge-base/08_arquitectura_propuesta.md` §Estructura de directorios (frontend)
- **Criterios de Aceptación**:
  - [ ] La Landing renderiza todas las secciones en orden correcto.
  - [ ] Al cargar la app, hydrate() restaura la sesión si el JWT en localStorage es válido.
  - [ ] La página no tiene errores en consola del navegador.
  - [ ] Lighthouse Performance > 80 en desktop.

---

## FASE 5 — Integración n8n + Validación E2E

### [CHANGE-21] `n8n-webhook-trigger`
- **Estado**: `[ ]` pendiente
- **Historias US**: HU-04-01, HU-04-02
- **Scope**:
  - En n8n: agregar nodo Webhook Trigger (POST, `/webhook/wasa-scan`, Header Auth
    `X-WASA-TOKEN`, Respond Immediately)
  - Desactivar el nodo Schedule Trigger existente
  - Verificar que variables del webhook ($json.*) llegan a nodos downstream
  - Actualizar `N8N_WEBHOOK_URL` en el `.env` del FastAPI Bridge
- **Dependencias**: CHANGE-12 (el Bridge ya envía el POST protegido)
- **Duración estimada**: 1.5 horas
- **Governance**: ALTO
- **Leer antes**:
  - `knowledge-base/06_funcionalidades.md` §HU-04-01, HU-04-02
  - `knowledge-base/07_flujos_principales.md` §Flujo 3: Escaneo (paso 10 — ejecución n8n en background)
  - `knowledge-base/08_arquitectura_propuesta.md` §Variables de entorno (N8N_WEBHOOK_URL, N8N_WEBHOOK_TOKEN)
- **Criterios de Aceptación**:
  - [ ] POST manual al webhook (curl) dispara el workflow completo.
  - [ ] Los nodos downstream reciben target_url, phpsessid, sqlmap_level, sqlmap_risk, scan_id.
  - [ ] El webhook responde 200 OK inmediatamente.
  - [ ] El Schedule Trigger está desactivado.
  - [ ] Sin `X-WASA-TOKEN` correcto: el webhook retorna 401.

---

### [CHANGE-22] `e2e-smoke-test`
- **Estado**: `[ ]` pendiente
- **Historias US**: Todas
- **Scope**:
  - Validar el flujo completo incluyendo registro, login y scan (checklist de smoke test
    manual/automatizado, ver Criterios de Aceptación)
- **Dependencias**: CHANGE-12, CHANGE-20, CHANGE-21
- **Duración estimada**: 2 horas
- **Governance**: MEDIO
- **Leer antes**:
  - `knowledge-base/07_flujos_principales.md` (todos los flujos)
  - `knowledge-base/06_funcionalidades.md` (todas las épicas)
  - `knowledge-base/03_actores_y_roles.md`
- **Criterios de Aceptación (Smoke Test Checklist)**:
  - AUTENTICACIÓN:
    - [ ] La Landing Page carga en < 3 segundos.
    - [ ] El muro de auth es visible sin sesión activa.
    - [ ] El formulario de escaneo NO es visible sin sesión.
    - [ ] Registro con email nuevo → modal cierra → scan form visible.
    - [ ] Email duplicado → mensaje "Este email ya está registrado."
    - [ ] Login con credenciales incorrectas → mensaje "Credenciales incorrectas."
    - [ ] Login correcto → modal cierra → scan form visible.
    - [ ] Recarga de página con sesión activa → scan form sigue visible.
    - [ ] Botón "Cerrar sesión" → muro de auth vuelve a aparecer.
  - ESCANEO:
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
| :-------------- | :----------------- |
| CHANGE-00a      | 1 hora              |
| CHANGE-00b      | 1 hora              |
| CHANGE-00c      | 30 minutos          |
| CHANGE-00d      | 1 hora              |
| CHANGE-01       | 1.5 horas           |
| CHANGE-02       | 1 hora              |
| CHANGE-03       | 1 hora              |
| CHANGE-04       | 1.5 horas           |
| CHANGE-05       | 1 hora              |
| CHANGE-06       | 1 hora              |
| CHANGE-07       | 1 hora              |
| CHANGE-08       | 1 hora              |
| CHANGE-09       | 1.5 horas           |
| CHANGE-10       | 1 hora              |
| CHANGE-11       | 1 hora              |
| CHANGE-12       | 1 hora              |
| CHANGE-13       | 1.5 horas           |
| CHANGE-14       | 1 hora              |
| CHANGE-15       | 2 horas             |
| CHANGE-16       | 3 horas             |
| CHANGE-17       | 1 hora              |
| CHANGE-18       | 2.5 horas           |
| CHANGE-19       | 3.5 horas           |
| CHANGE-20       | 1 hora              |
| CHANGE-21       | 1.5 horas           |
| CHANGE-22       | 2 horas             |
| **TOTAL**       | **~34 horas**       |

## Sprints Sugeridos (agrupación alternativa, secuencial — ver también los GATEs de paralelismo arriba)

### Sprint 1 — Base (3.5h): Scaffolding + Config
```
CHANGE-00a → CHANGE-00b → CHANGE-00c → CHANGE-00d
```

### Sprint 2 — Auth Backend (7h): PostgreSQL (db_fuzzing) + JWT completo
```
CHANGE-01 → CHANGE-02 → CHANGE-07 → CHANGE-03 → CHANGE-04 → CHANGE-05 → CHANGE-06
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

### [CHANGE-00a] `fastapi-bridge-scaffold` — Archivado 2026-08-22

- **Cambio**: Scaffold inicial del FastAPI Bridge
- **Archivado en**: `openspec/changes/archive/2026-08-22-fastapi-bridge-scaffold/`
- **Spec sincronizado a**: `openspec/specs/bridge-bootstrap/spec.md`
- **Estado**: Completado con 63 tests verdes, todos los 5 criterios de aceptación verificados en vivo

---

## Trazabilidad con la fuente original

Este archivo es la traducción 1:1 (mismo alcance, mismas dependencias, mismos criterios de
aceptación) de [`docs_wasa_sdd/CHANGES.md`](docs_wasa_sdd/CHANGES.md) v1.2 al formato
`roadmap-generator`. Para el detalle narrativo de historias de usuario ver
`docs_wasa_sdd/HISTORIAS_DE_USUARIO.txt`; para el documento integrador completo, ver
`docs_wasa_sdd/INTEGRADOR.txt`.
