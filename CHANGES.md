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
- **Estado**: `[x]` completado
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
  - [x] Al arrancar la app, la tabla `users` se crea automáticamente en `db_fuzzing`.
  - [x] La tabla `users` existe con las columnas correctas.
  - [x] La columna `email` tiene constraint UNIQUE.
  - [x] El engine es async (usa `asyncpg` como driver contra PostgreSQL).
  - [x] La creación es idempotente: arrancar dos veces no duplica la tabla.
  - [x] Las tablas `scans` y `vulnerabilities` existentes no se alteran ni se vacían.
- **Nota de implementación**: `engine`/`AsyncSessionLocal` se implementaron como factories perezosas cacheadas (`get_engine(settings)`, `get_session_factory(settings)`), no como objetos de nivel de módulo — desviación deliberada documentada en `design.md` D-1, requerida por el test AST de `bridge-bootstrap` que prohíbe `create_async_engine`/`create_all` en el import. Desbloquea CHANGE-02 (`auth-pydantic-schemas`) y CHANGE-03 (`user-repository`).

---

### [CHANGE-02] `auth-pydantic-schemas`
- **Estado**: `[x]` completado
- **Historias US**: HU-03-01, HU-03-02, HU-03-07
- **Scope**:
  - `schemas/auth_schemas.py`: `UserRegister` (email EmailStr, password str min_length=8,
    techo de 72 bytes UTF-8), `UserLogin` (email EmailStr, password str min_length=1,
    mismo techo de 72 bytes), `TokenResponse` (access_token, token_type Literal["bearer"],
    expires_in int), `TokenData` (email str | None = None — payload del JWT)
  - `schemas/error_schemas.py`: `ErrorDetail` (type, title, status, detail, instance — RFC 7807)
- **Dependencias**: CHANGE-01
- **Duración estimada**: 1 hora
- **Governance**: BAJO (implementado como MEDIO — override de `CLAUDE.md` para el dominio Auth CHANGE-01..07)
- **Leer antes**:
  - `knowledge-base/06_funcionalidades.md` §HU-03-01, HU-03-02, HU-03-07
  - `knowledge-base/05_reglas_de_negocio.md` §RN-WS-15 (password mínimo 8 chars)
- **Criterios de Aceptación**:
  - [x] `UserRegister` con password de 7 chars falla validación.
  - [x] `UserRegister` con email inválido falla validación.
  - [x] `TokenResponse` se puede serializar a JSON correctamente.
  - [x] `TokenData` acepta email None sin error.
  - [x] Tests unitarios de schemas pasan.
- **Nota de implementación**: dos desviaciones respecto del scope original de arriba, ambas
  aprobadas por el usuario en el checkpoint de governance de `tasks.md` 1.3 (ver
  `openspec/changes/auth-pydantic-schemas/design.md` D-2 y D-10):
  1. **Techo de 72 bytes UTF-8 en la contraseña** (`UserRegister.password` y
     `UserLogin.password`), no contemplado en el roadmap ni en la KB. Es el límite duro
     del algoritmo bcrypt instalado (bcrypt 5.0.0 lanza `ValueError` por encima de 72
     bytes en vez de truncar); sin el tope, una contraseña larga produciría un 500 en
     vez de un 422. Medido en bytes UTF-8 codificados, no en caracteres (`max_length`
     de Pydantic no sirve para esto). **CHANGE-14 (Zod) debe replicar esta regla** —
     ver tarea 8.4.
  2. **`ErrorDetail` vive en `schemas/error_schemas.py`** (módulo nuevo), no en
     `schemas/scan_schemas.py` como decía el scope original de arriba. Es un contrato
     transversal consumido por `exceptions/handlers.py` (CHANGE-07) y por el dominio
     auth, no solo por scan; alojarlo en `scan_schemas.py` habría sido una dependencia
     invertida. `schemas/scan_schemas.py` (CHANGE-08) ya no promete `ErrorDetail` en su
     scope ni en su docstring.

---

### [CHANGE-03] `user-repository`
- **Estado**: `[x]` completado
- **Historias US**: HU-03-01, HU-03-02
- **Scope**:
  - `repositories/user_repository.py`: clase `UserRepository`, constructor recibe
    `session: AsyncSession`
  - Método async `get_by_email(email: str) -> User | None`: normaliza el email a
    lowercase antes de consultar (ver Nota de implementación, D-4)
  - Método async `create(email: str, hashed_password: str) -> User`: normaliza email a
    lowercase antes de guardar; si hay IntegrityError (email duplicado) lanza
    `EmailAlreadyExistsError`
- **Dependencias**: CHANGE-01, CHANGE-02
- **Duración estimada**: 1 hora
- **Governance**: MEDIO
- **Leer antes**:
  - `knowledge-base/04_modelo_de_datos.md` §users
  - `knowledge-base/08_arquitectura_propuesta.md` §Patrones (Repository)
  - `knowledge-base/05_reglas_de_negocio.md` §RN-WS-13
- **Criterios de Aceptación**:
  - [x] `get_by_email` retorna el User si existe, None si no.
  - [x] `create` con email nuevo: INSERT exitoso, retorna User con id poblado.
  - [x] `create` con email duplicado: lanza `EmailAlreadyExistsError`.
  - [x] El email se guarda en lowercase (ej: "USER@TEST.COM" → "user@test.com").
  - [x] El repository no conoce nada de FastAPI ni de passlib.
- **Nota de implementación**: cuatro desviaciones/extensiones respecto del scope original
  de arriba, todas aprobadas por el usuario en el checkpoint de governance de `tasks.md`
  1.3 (ver `openspec/changes/user-repository/design.md` D-1, D-3, D-4, D-5, D-6):
  1. **Normalización de email simétrica**: el roadmap solo pedía normalizar en `create`;
     `get_by_email` también normaliza con la misma función (`_normalize_email`, definida
     una sola vez). Sin esto, un usuario registrado con mayúsculas quedaría inalcanzable
     al loguearse con la misma capitalización que usó al registrarse (D-4, R-1).
  2. **`EmailAlreadyExistsError` vive en un módulo nuevo, `exceptions/domain.py`**, con
     una base `DomainError` de la que hereda. El roadmap no especificaba ubicación; se
     descartó tanto el módulo del repositorio (dependencia invertida hacia la capa web)
     como `exceptions/handlers.py` (arrastraría Starlette/slowapi a una capa que debe ser
     reutilizable fuera del framework web) (D-1).
  3. **`create` hace `flush()` + `refresh()`, nunca `commit()`/`rollback()`**: el límite
     transaccional (confirmar en el camino feliz, deshacer ante excepción) queda a cargo
     de la `AuthUoW` de CHANGE-04, que es la dueña del alcance completo de la operación de
     negocio (D-5, R-4 — ver traspaso anotado en CHANGE-04 más abajo).
  4. **`aiosqlite` como dependencia de desarrollo nueva** (`requirements-dev.txt`, no
     `requirements.txt`): primera dependencia nueva desde CHANGE-00a, necesaria para
     ejercitar el repositorio contra un motor async real (incluida la violación de
     unicidad real, no simulada contra un doble) (D-6).
  5. **Corrección de governance**: esta sección figuraba como **CRITICO**; el `CLAUDE.md`
     del proyecto baja explícitamente todo el dominio Auth (CHANGE-01..07) a **MEDIO** por
     decisión del usuario — la misma corrección ya aplicada en CHANGE-02.

---

### [CHANGE-04] `auth-service`
- **Estado**: `[x]` hecho (2026-08-23)
- **Historias US**: HU-03-01, HU-03-02
- **Scope**:
  - `core/security.py`: `hash_password(plain) -> str` (bcrypt directo, ver nota R-1 abajo),
    `verify_password(plain, hashed) -> bool`, `create_access_token(data, expires_delta, settings) -> str`
    (python-jose, HS256, clave = settings.JWT_SECRET), `decode_access_token(token, settings) -> TokenData`
    (retorna TokenData con email=None si el token es inválido o expirado)
  - `services/auth_service.py`: clase `AuthService` (constructor recibe `uow: AuthUoW`),
    método async `register(data: UserRegister) -> TokenResponse`, método async
    `login(data: UserLogin) -> TokenResponse` (401 genérico si email no existe o
    contraseña no coincide, sin distinguir cuál falló — evita enumeración de usuarios)
- **Dependencias**: CHANGE-03
- **Duración estimada**: 1.5 horas
- **Governance**: MEDIO (corrección — ver nota de implementación 5 abajo; el `CLAUDE.md` del
  proyecto baja explícitamente todo el dominio Auth CHANGE-01..07 a MEDIO por decisión del
  usuario, misma corrección aplicada en CHANGE-02/CHANGE-03)
- **Leer antes**:
  - `knowledge-base/08_arquitectura_propuesta.md` §Seguridad
  - `knowledge-base/05_reglas_de_negocio.md` §RN-WS-12, RN-WS-14
  - `knowledge-base/03_actores_y_roles.md`
- **Criterios de Aceptación**:
  - [x] `hash_password("secret")` retorna string bcrypt (starts with "$2b$").
  - [x] `verify_password("secret", hash)` retorna True.
  - [x] `verify_password("wrong", hash)` retorna False.
  - [x] `create_access_token({"sub": "a@b.com"}, timedelta(hours=24), settings)` retorna JWT válido.
  - [x] `decode_access_token(valid_jwt, settings)` retorna TokenData con email correcto.
  - [x] `decode_access_token(expired_jwt, settings)` retorna TokenData(email=None).
  - [x] `AuthService.login` con credenciales inválidas lanza `InvalidCredentialsError`.
  - [x] `AuthService.register` con email duplicado lanza `EmailAlreadyExistsError`.
- **✅ R-1 cerrado (2026-08-22, checkpoint de governance MEDIUM)**: se eligió la opción (b) —
  usar la librería `bcrypt` directamente y sacar `passlib` de `requirements.txt`
  (`passlib[bcrypt]>=1.7` → `bcrypt>=4.1`). Reproducido en este repo antes de decidir:
  `bcrypt 5.0.0`, `passlib 1.7.4` → `AttributeError: module 'bcrypt' has no attribute
  '__about__'` (trapped por passlib) seguido de `ValueError: password cannot be longer
  than 72 bytes` al hashear `"secret"` — evidencia de que passlib degrada a una ruta de
  código incorrecta. `bcrypt 5.0.0` ya estaba instalado como dependencia transitiva de
  `passlib[bcrypt]`, así que el cambio de manifiesto no instaló nada nuevo, solo dejó de
  instalar `passlib`. `core/security.py` usa `bcrypt.hashpw`/`bcrypt.gensalt`/
  `bcrypt.checkpw` directamente. La fila `("repositories", "passlib")` de
  `tests/test_layer_boundaries.py` se conserva (costo cero, sigue siendo cierta) y se le
  suma `("repositories", "bcrypt")` + `("services", "bcrypt"/"passlib"/"jose")`.
- **✅ Traspaso de CHANGE-03 (`user-repository`, D-5, R-4, R-7) — cumplido**: `AuthUoW`
  (`uow/auth_unit_of_work.py`) hace `commit()` en `__aexit__` cuando el bloque termina sin
  excepción y `rollback()` ante cualquier excepción, incluidas las de dominio
  (`EmailAlreadyExistsError`), cerrando la sesión siempre. `AuthService.register` **no**
  antepone un chequeo con `get_by_email` — anclado por test AST (`test_register_does_not_
  call_get_by_email`, 7.9) — la garantía de unicidad la da la constraint del motor.
- **Notas de implementación**:
  1. **`AuthService.register`/`login` obtienen `Settings` vía `get_settings()` interno**, no
     por parámetro: a diferencia de `create_access_token`/`decode_access_token` (D-5 de
     `design.md`, que sí reciben `Settings` explícito por ser funciones puras de
     `core/security.py`), `AuthService` recibe únicamente la `AuthUoW` por constructor —tal
     como especifica esta sección y la spec `auth-session`— y usa el mismo `get_settings()`
     cacheado que el resto del Bridge. Desviación documentada de la firma abreviada de este
     documento (`create_access_token(data, expires_delta)`, sin `settings`): la firma real es
     `create_access_token(data, expires_delta, settings)` (D-5).
  2. **El hashing y la verificación se descargan a thread pool** (`anyio.to_thread.run_sync`)
     desde el primer commit de `AuthService`, no como optimización posterior (D-3): bcrypt con
     coste 12 es ~250-400ms de CPU, y sin el offload un solo registro concurrente serializaría
     todas las peticiones del servicio.
  3. **Hash señuelo para indistinguibilidad temporal del 401** (D-8): `_DUMMY_PASSWORD_HASH`,
     constante de módulo derivada una sola vez al importar `services/auth_service.py`. Cuando
     `login` no encuentra el email, igual verifica contra el señuelo y descarta el resultado,
     para que el camino "email inexistente" pague el mismo coste de CPU que "contraseña
     incorrecta" — sin esto, la latencia por sí sola permite enumerar usuarios.
  4. **`InvalidCredentialsError` se agregó a `exceptions/domain.py`** (junto a
     `EmailAlreadyExistsError`), sin atributos: a diferencia de la excepción de email
     duplicado, no lleva el email consultado (D-11), para que CHANGE-07 no pueda interpolarlo
     en el `detail` del RFC 7807 por accidente.
  5. **Corrección de governance**: esta sección figuraba como **CRITICO**; el `CLAUDE.md` del
     proyecto baja explícitamente todo el dominio Auth (CHANGE-01..07) a **MEDIO** por decisión
     del usuario — misma corrección ya aplicada en CHANGE-02/CHANGE-03.
  6. **Nota documental (Open Question 4 de `design.md`)**: `knowledge-base/08_arquitectura_
     propuesta.md` §Seguridad dice "Password hashing: bcrypt vía passlib, rounds=12" —
     desactualizado tras resolver R-1 con la opción (b). No se reescribe la KB dentro de este
     change (mismo precedente que la nota 8.1 de CHANGE-02); queda anotado acá para quien la
     actualice.
- **Traspaso a CHANGE-05/CHANGE-06/CHANGE-07**: `EmailAlreadyExistsError` → mapear a 409;
  `InvalidCredentialsError` → mapear a 401; `decode_access_token` devuelve siempre
  `TokenData(email=None)` ante cualquier token inválido/expirado/manipulado (nunca lanza), que
  es la base sobre la que `get_current_user` (CHANGE-06) puede responder 401 sin un `try/except`
  propio.

---

### [CHANGE-05] `auth-router`
- **Estado**: `[x]` completado
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
  - [x] POST /api/v1/auth/register con datos válidos: 201 + TokenResponse.
  - [x] POST /api/v1/auth/register con email duplicado: 409 RFC 7807.
  - [x] POST /api/v1/auth/register con password < 8 chars: 422 RFC 7807. (Corregido en CHANGE-07, D-2: el cuerpo es JSON válido que viola el schema declarado -- 422 "Unprocessable Entity", no 400 "Bad Request", que queda reservado para un cuerpo que ni siquiera es JSON parseable.)
  - [x] POST /api/v1/auth/login con credenciales correctas: 200 + TokenResponse.
  - [x] POST /api/v1/auth/login con credenciales incorrectas: 401 RFC 7807.
  - [x] Los endpoints aparecen en `/docs` con sus schemas correctos.
- **Traspaso a CHANGE-06**: `get_auth_service` vive en `core/dependencies.py` (no bajo `api/`) —
  `get_current_user` va en el mismo módulo. El `tokenUrl="/api/v1/auth/login"` que declare
  `OAuth2PasswordBearer` ya apunta a una ruta real, pero ambas rutas reciben cuerpo JSON
  (`UserRegister`/`UserLogin`), no `OAuth2PasswordRequestForm`: el botón "Authorize" de `/docs`
  no va a funcionar contra ellas — es un detalle de la UI de la documentación, no un bug.
- **Traspaso a CHANGE-16**: `UserRegister` declara `extra="forbid"` (CHANGE-02); el cliente debe
  mandar exactamente `{email, password}`, nunca el objeto completo del formulario con
  `confirmPassword`, o recibe 422 (ancla: `test_auth_router.py::
  test_register_validation_rejections_return_422[extra-field-forbidden]`).
- **Governance real aplicada**: MEDIUM (override explícito del usuario para el dominio Auth,
  CHANGE-01..07 — ver `CLAUDE.md` del proyecto), no CRÍTICO como marca la tabla de arriba.

---

### [CHANGE-06] `jwt-dependency`
- **Estado**: `[x]` completado
- **Historias US**: HU-03-03
- **Scope**:
  - `core/dependencies.py`: `oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)`
    (D-1: `auto_error=False`, no el default — ver docstring del módulo y `design.md`)
  - `get_current_user(token: str | None = Depends(oauth2_scheme), settings: Settings = Depends(get_settings)) -> str`:
    llama `security.decode_access_token(token, settings)`; si el token es `None` o
    `token_data.email is None` lanza `HTTPException(401)` RFC 7807 con `WWW-Authenticate`
    (RFC 6750); retorna el email del usuario autenticado. No consulta la base de datos (D-5).
  - `CurrentUserEmail = Annotated[str, Depends(get_current_user)]`: alias que CHANGE-12 debe
    usar para proteger `/api/v1/scan/start` (`user_email: CurrentUserEmail`, nunca
    `Depends(oauth2_scheme)`, que devuelve el token sin validar)
  - No se monta ninguna ruta en este change: `/api/v1/scan/start` sigue en 404 hasta CHANGE-12
- **Dependencias**: CHANGE-04
- **Duración estimada**: 1 hora
- **Governance**: CRITICO en este índice; bajado a **MEDIO** por override explícito del
  usuario para el dominio Auth completo (CHANGE-01..07) — ver `CLAUDE.md` del proyecto.
- **Leer antes**:
  - `knowledge-base/03_actores_y_roles.md` §RBAC — Matriz de permisos
  - `knowledge-base/08_arquitectura_propuesta.md` §Seguridad
  - `knowledge-base/05_reglas_de_negocio.md` §RN-WS-11
- **Criterios de Aceptación**:
  - [x] Request con JWT válido en header Authorization: `get_current_user` retorna email.
  - [x] Request sin header Authorization: 401 con RFC 7807.
  - [x] Request con JWT malformado: 401 con RFC 7807.
  - [x] Request con JWT expirado: 401 con RFC 7807.
  - [x] El email retornado coincide con el "sub" del JWT.
- **Traspaso a CHANGE-12** (`POST /api/v1/scan/start`): usar `user_email: CurrentUserEmail`,
  no `Depends(oauth2_scheme)`; sustituir `get_current_user` con `app.dependency_overrides` en
  los tests de `/scan/start`, mismo patrón que `test_dependency_override_lets_the_probe_respond_without_any_authorization_header`
  en `fastapi_bridge/tests/test_auth_dependencies.py`; el `401` sale con `type: about:blank`
  (D-2) y desafío `WWW-Authenticate` (D-3).
- **Traspaso a CHANGE-17** (interceptor de Axios): distinguir "sin sesión" de "sesión vencida"
  por el parámetro `invalid_token` del desafío `WWW-Authenticate`, no por el cuerpo — que es
  idéntico byte a byte en los cuatro rechazos con token presente (D-3, D-4).

---

### [CHANGE-07] `rfc7807-exception-handlers`
- **Estado**: `[x]` completado
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
- **⚠️ Traspaso de CHANGE-03 (`user-repository`, D-1, D-2)**: `EmailAlreadyExistsError`
  (`fastapi_bridge/exceptions/domain.py`) debe mapearse a **409 Conflict** vía
  `problem_detail_response(...)` de `exceptions/handlers.py`, usando `exc.email` (el email
  ya normalizado) para componer el `detail` sin volver a consultar la base. Conviene
  registrar el `exception_handler` sobre la base `DomainError` en vez de sobre la
  excepción concreta: CHANGE-04 (`InvalidCredentialsError`) y CHANGE-11 heredan de la
  misma base y quedarían cubiertos por el mismo handler.

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

> **Desviación registrada por CHANGE-16 (feature-auth, D-3/opción A, checkpoint 2026-08-23)**:
> `authStore.ts` se reubicó de `src/app/stores/` a `src/entities/user/model/authStore.ts`
> (exportado desde `entities/user/index.ts`). Motivo: `tests/fsd-boundaries.test.ts`
> prohíbe que `features/` (y `widgets/`) importen de `app/`, y `useLogin`/`useRegister`
> necesitan `authStore`. Sin cambio de comportamiento del store; ver `design.md` D-3 de
> CHANGE-16 para el detalle completo.

---

### [CHANGE-14] `auth-zod-schemas`
- **Estado**: `[x]` completado
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
  - [x] `loginSchema.parse({ email: "not-email", password: "x" })` lanza ZodError.
  - [x] `registerSchema.parse({ ..., password: "1234567", confirmPassword: "1234567" })` lanza ZodError (< 8 chars).
  - [x] `registerSchema.parse({ ..., password: "pass1234", confirmPassword: "diferente" })` lanza ZodError.
  - [x] `tsc --noEmit` sin errores en `entities/user/`.
- **⚠️ Paridad obligatoria con `schemas/auth_schemas.py` (CHANGE-02)**: `registerSchema`
  DEBE replicar exactamente las mismas reglas que `UserRegister` del backend —
  mismo mínimo de 8 caracteres, **mismo techo de 72 bytes UTF-8** en la contraseña
  (medido en bytes, no en `.length` de JS, que cuenta unidades UTF-16), mismos campos
  y sin campos extra (el backend usa `extra="forbid"`). El techo de 72 bytes no está
  en la KB — es una decisión de CHANGE-02 (D-2) — y si este change no lo replica, el
  formulario deja escribir una contraseña que el backend rechaza con un 422 opaco sin
  explicación visible en el form (R-2 en `openspec/changes/auth-pydantic-schemas/design.md`).
- **Nota de implementación**: la slice quedó con un cuarto módulo,
  `src/entities/user/model/passwordRules.ts` (`PASSWORD_MIN_LENGTH`, `PASSWORD_MAX_BYTES`,
  `utf8ByteLength`, `passwordWithByteCeiling`), compartido por `loginSchema` y
  `registerSchema` para no repetir el 8 ni el 72 en dos archivos (D-2), y un
  `src/entities/user/index.ts` como API pública de la slice (D-8) — cuatro archivos más
  uno, en vez de los tres listados en el scope original. Se agregó también
  `UserRegisterRequest = Omit<UserRegister, 'confirmPassword'>` para que la confirmación
  no viaje al Bridge (`extra="forbid"`). Paridad con `fastapi_bridge/schemas/auth_schemas.py`
  verificada por un test que lee el módulo Python real (`tests/auth-schemas-parity.test.ts`,
  D-7), no por un literal repetido. Se detectó y corrigió un defecto en el guard de tipo de
  D-6 propuesto en `design.md`: la rama negativa de `Equals<A,B>` resolvía a `never`, que
  satisface trivialmente cualquier restricción genérica y dejaba pasar sin error cualquier
  divergencia entre schema y tipo; se corrigió a `false` (verificado con `tsc` antes y
  después del fix). Suite final: 178 tests (baseline 137 + 41 nuevos), `tsc -b`, `oxlint` y
  `npm run build` en verde.

---

### [CHANGE-15] `shared-ui-atoms`
- **Estado**: `[x]` completado (2026-08-23)
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
  - [x] `<Button loading>` muestra Spinner y está deshabilitado.
  - [x] `<Input error="msg">` muestra borde rojo y mensaje.
  - [x] `<Modal isOpen onClose={fn}>` renderiza backdrop y cierra con Escape.
  - [x] Ningún componente importa de @features, @entities, @pages, @widgets.
  - [x] `npm run build` sin errores TypeScript.

---

### [CHANGE-16] `feature-auth`
- **Estado**: `[x]` completado
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
- **Estado**: `[x]` implementado
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
  - [x] `scanSchema.parse({ target_url: "not-a-url", ... })` lanza ZodError.
  - [x] `scanSchema.parse({ ..., ethical_consent: false })` lanza ZodError.
  - [x] `scanSchema.parse({ target_url: "http://dvwa.local", phpsessid: "abc" })` usa defaults.
  - [x] `tsc --noEmit` sin errores.
- **Notas de implementación** (ver `design.md` de este change para el detalle completo):
  - Tres desviaciones deliberadas de la letra de este scope, todas resueltas a favor de las reglas de negocio y del contrato del Bridge, no de la escritura literal de arriba:
    - `target_url` usa un único `.refine()` que subsume `url()` y restringe el esquema a `http:`/`https:` (D-1) — no `url().refine(...)` encadenado, que produce dos issues sobre el mismo campo y no cierra por sí solo `ftp:`/`file:`/`javascript:` (RN-WS-02).
    - `phpsessid` usa `trim().min(1)`, no `min(1).trim()` (D-3) — el orden inverso deja pasar una cadena de solo espacios como `""` (RN-WS-03).
    - `sqlmap_level`/`sqlmap_risk` **rechazan** el valor fuera de rango en vez de recortarlo ("clamping") — HU-02-04 mencionaba clamping, pero RN-WS-04/05 y `scan-payload-contract` exigen rechazo; se resolvió a favor del rechazo, alineado con el Bridge (D-5, Open Question 1 de `design.md`, confirmada por el usuario antes del `apply`).
  - Se agregó `src/entities/scan/index.ts` como API pública de la slice (no estaba listado en el scope original, sigue el mismo patrón que `entities/user`, D-8 de CHANGE-14).
  - **Nota de traspaso a CHANGE-18**: sin `z.coerce.number()` en los campos SQLMap (D-6) — el formulario debe registrar `sqlmap_level`/`sqlmap_risk` con `valueAsNumber: true` (o usar un `<select>` de valores numéricos), o un `<input type="number">` sin esa opción entregará un string que la validación rechazará.
  - **Nota de traspaso a CHANGE-18**: `ScanApiError` (nuevo) y `AuthApiError` (`entities/user`, CHANGE-14) están deliberadamente duplicados por ahora — FSD no permite que una slice de `entities/` importe otra — con un guard de tipo entre slices en `tests/scan-schema.test.ts`. Ese guard NO es un enforcement real de CI: `tsconfig.app.json` solo incluye `src/`, así que ni `npm run build` ni `npm run test:run` lo compilan — solo se ve como error en un editor con TS language server activo (verificado: cambiar el tipo de un campo pasa build y tests sin aviso). La unificación real en un `ProblemDetails` de `shared/api/` queda pendiente para cuando CHANGE-18 cree `axiosInstance.ts` (D-8, Open Question 2 de `design.md`).

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
  - [x] submitScan adjunta automáticamente el JWT (via interceptor, no manual). — `tests/submit-scan.test.ts` (6.7: el módulo no menciona `Authorization`/token/`authStore` y aun así la solicitud lleva la cabecera cuando hay sesión) + `tests/api-client.test.ts` (D-1/D-3: el interceptor de `axiosInstance` adjunta la credencial por petición).
  - [x] Si el servidor retorna 401: authStore.logout() y mensaje "Sesión expirada". El muro de auth vuelve a aparecer. — `tests/use-scan-form.test.tsx` (7.8: tras el 401 `useAuthStore.getState().isAuthenticated` queda en `false`, vía el interceptor — no el hook —, con `logout()` invocado una sola vez; 7.6: el mensaje mostrado es `SCAN_SUBMIT_MESSAGES.unauthorized`). El muro de auth en sí (que lee `authStore.isAuthenticated` para decidir qué mostrar) es scope de CHANGE-19 — acá se deja garantizado que la sesión efectivamente queda inválida, que es la señal de la que depende ese muro.
  - [x] Submit válido (202): redirección a VITE_DASHBOARD_URL. — `tests/use-scan-form.test.tsx` (8.1: tras `SUCCESS_REDIRECT_DELAY_MS`, `window.location.href` es `dashboardUrl`; 8.5: `dashboardUrl` es distinto de `apiBaseUrl`) + `tests/scan-form.test.tsx` (la confirmación `SCAN_SUCCESS_MESSAGE` es visible en la interfaz **antes** de la navegación, y el control queda no enviable tras la aceptación — HU-05-01 "mensaje de éxito ~2s").
  - [x] Botón "Escanear" deshabilitado sin checkbox ético marcado. — `tests/scan-form.test.tsx` (9.3: deshabilitado sin marcar, habilitado al marcar, deshabilitado de nuevo al desmarcar).
  - [x] Spinner durante isLoading. No hay doble submit. — `tests/scan-form.test.tsx` (9.4: `Spinner` visible y botón deshabilitado durante el envío; un doble clic produce una sola solicitud) + `tests/use-scan-form.test.tsx` (7.5, guard con `useRef`).
  - [x] `tsc --noEmit` sin errores. — `npx tsc -b` (equivalente de proyecto: `tsconfig.app.json` + `tsconfig.node.json` vía *build mode*) limpio; verificado también como parte de `npm run build`.
- **Notas de traspaso a CHANGE-16 y CHANGE-19**:
  - (a) El cliente HTTP (`src/shared/api/axiosInstance.ts`) y el contrato `ProblemDetails` (`src/shared/api/problemDetails.ts`) ya existen — CHANGE-16 los consume tal cual, sin modificarlos: `configureApiClient` ya está cableado desde `src/app/providers/httpClientProvider.ts` (punto único, verificado por test), y `AuthApiError` en `entities/user` ya es el alias `= ProblemDetails`.
  - (b) El interceptor de response cierra sesión ante **cualquier** `401`, incluido el de un login fallido de CHANGE-16 (`POST /auth/login` con credenciales incorrectas). Es inocuo por spec (`auth-session-state`: "cerrar sesión sin sesión abierta es inocuo"), así que CHANGE-16 no necesita ninguna excepción por ruta — pero si en algún momento se quisiera excluir esa ruta, el punto donde hacerlo es el interceptor (`shared/api/axiosInstance.ts`), no el formulario de login. Ver R-3 de `design.md` de este change.
  - (c) El mensaje del `429` no informa cuántos minutos faltan porque el `Retry-After` que emite el Bridge no está expuesto por CORS (`CORSMiddleware` en `fastapi_bridge/main.py` no lo declara en `expose_headers`). Es una limitación de backend, no del cliente — un change de backend que agregue `expose_headers=["Retry-After"]` habilitaría un mensaje específico sin tocar más que la constante del mensaje y el punto donde se lee el header. Ver R-1 de `design.md` de este change.
  - (d) `<ScanForm />` ya resuelve por sí solo el feedback de aceptación: muestra `SCAN_SUCCESS_MESSAGE` (`role="status"`) durante `SUCCESS_REDIRECT_DELAY_MS` y deja el botón deshabilitado hasta que el navegador se va al Dashboard. CHANGE-19 lo monta tal cual dentro del `ScanFormWidget`: no tiene que agregar ni su propio cartel de éxito ni su propio bloqueo del botón.

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
- **Estado**: `[x]` archivado (2026-08-24)
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
  - [x] POST manual al webhook (curl/Thunder Client) dispara el workflow completo.
  - [x] Los nodos downstream reciben target_url, phpsessid, sqlmap_level, sqlmap_risk. (`scan_id`, UUID del Bridge, se descarta dentro de n8n — `scans.id` es SERIAL sin columna para un UUID externo; n8n sigue generando su propio id, ver `openspec/changes/n8n-webhook-trigger/design.md` D-1 y `tasks.md` 2.4.)
  - [x] El webhook responde 200 OK inmediatamente.
  - [x] El Schedule Trigger está desactivado.
  - [x] Sin `X-WASA-TOKEN` correcto: el webhook retorna 403. (Corregido de 401 a 403 — comportamiento nativo no configurable del Header Auth de n8n, ver design.md D-1 "Aprendizaje".)

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
