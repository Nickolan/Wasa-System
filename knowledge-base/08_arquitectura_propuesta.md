# Arquitectura Propuesta

## Patrones aplicados

| Patrón | Dónde se usa | Por qué |
|---|---|---|
| Repository | `UserRepository`, `N8nRepository` | Los servicios no conocen SQLAlchemy ni httpx directamente. |
| Unit of Work | `AuthUoW` (sesión SQLAlchemy async), `ScanUoW` (cliente httpx async) | Ciclo de vida controlado de recursos async, incluso ante excepción. |
| JWT Bearer Auth | `core/security.py` + `core/dependencies.py` (`get_current_user`) | python-jose, HS256; protege `/scan/start`; secreto solo en env vars. |
| Password Hashing | `services/auth_service.py` | passlib + bcrypt (rounds=12); nunca compara texto plano. |
| Pydantic BaseSettings | `core/settings.py` | Toda config viene de `.env`, tipada. |
| RFC 7807 | `exceptions/handlers.py` | Formato uniforme de error en toda la API. |
| Fire-and-Forward | `ScanService` | El Bridge no espera el resultado del escaneo, solo confirma el disparo. |
| FSD (Feature-Sliced Design) | Frontend completo | Capas con dependencia unidireccional descendente. |
| Zustand + persist | `app/stores/authStore.ts` | Única fuente de verdad de auth, persistida en localStorage. |

**Regla de capas backend (estricta)**: Router → Service → UoW → Repository → (SQLAlchemy/httpx, Settings). El Router NUNCA contiene lógica de negocio; el Service NUNCA instancia httpx directamente; el Repository NUNCA importa FastAPI.

**Regla de capas frontend (estricta)**: `app → pages → widgets → features → entities → shared`. Una capa nunca importa de una capa superior; `shared/` no conoce nada de dominio WASA; `entities/` solo define tipos/schemas Zod.

## Estructura de directorios

```
fastapi_bridge/
├── main.py                       — app FastAPI, routers, CORS, limiter
├── core/
│   ├── settings.py               — Pydantic BaseSettings (.env)
│   ├── security.py               — JWT create/decode (python-jose, HS256)
│   └── dependencies.py           — get_current_user (Depends)
├── db/
│   ├── base.py                   — engine async (asyncpg) + Base, apunta a db_fuzzing
│   ├── session.py                — AsyncSession factory
│   └── models.py                 — ORM model: User
├── api/v1/
│   ├── auth/router.py            — POST /register, POST /login
│   └── scan/router.py            — POST /start (JWT protected)
├── services/
│   ├── auth_service.py           — bcrypt hash, JWT, verify credentials
│   └── scan_service.py           — genera UUID, llama UoW scan
├── uow/
│   ├── auth_unit_of_work.py      — context manager sesión SQLAlchemy
│   └── scan_unit_of_work.py      — context manager cliente httpx
├── repositories/
│   ├── user_repository.py        — get_by_email, create (PostgreSQL db_fuzzing)
│   └── n8n_repository.py         — forward_scan (httpx)
├── schemas/
│   ├── auth_schemas.py           — UserRegister, UserLogin, TokenResponse, TokenData
│   └── scan_schemas.py           — ScanRequest, ScanResponse, N8nPayload, ErrorDetail
└── exceptions/
    └── handlers.py               — RFC 7807 global handlers

wasa-landing/ (React FSD)
├── src/app/                      — main.tsx, App.tsx, providers, stores/authStore.ts
├── src/pages/LandingPage/        — composición de widgets
├── src/widgets/                  — hero, features-section, how-it-works, footer,
│                                    auth-modal (Login/Register), scan-form (gate)
├── src/features/                 — auth/login, auth/register, scan-form
├── src/entities/                 — user/ (types, loginSchema, registerSchema),
│                                    scan/ (types, scanSchema)
└── src/shared/                   — ui/ (Button, Input, Checkbox, Spinner, Modal),
                                     api/ (axiosInstance con interceptor Bearer),
                                     config/ (env.ts), lib/ (utils: cn, jwtIsExpired)
```

## Seguridad

- Autenticación: JWT HS256 (python-jose), expiración configurable (default 24h).
- Autorización: Bearer token en `Authorization` header, validado por `get_current_user` (Depends de FastAPI).
- Validación de input: Pydantic v2 en backend, Zod en frontend (doble validación, sin confiar solo en el cliente).
- Password hashing: bcrypt vía passlib, rounds=12. Nunca se compara ni almacena texto plano.
- Secrets management: `JWT_SECRET` y `N8N_WEBHOOK_TOKEN` viven exclusivamente en variables de entorno; nunca se loguean.
- Rate limiting: slowapi, 10 req/IP/60min sobre `/scan/start` únicamente (los endpoints de auth no están sujetos a este límite).
- CORS: solo orígenes listados en `CORS_ORIGINS`.
- Errores en producción: nunca exponen stack traces; siempre RFC 7807.

## Variables de entorno

| Variable | Descripción | Ejemplo | Sensible |
|---|---|---|---|
| `N8N_WEBHOOK_URL` | URL del Webhook Trigger en n8n | `https://n8n.local/webhook/wasa-scan` | No |
| `N8N_WEBHOOK_TOKEN` | Token secreto para autenticar el request a n8n | — | Sí |
| `JWT_SECRET` | Clave para firmar/verificar JWT (HS256) | — | Sí |
| `TOKEN_EXPIRE_HOURS` | Vida del JWT en horas | `24` | No |
| `DB_URL` | Conexión a PostgreSQL `db_fuzzing` (misma instancia que ya usa WASA) | `postgresql+asyncpg://user:pass@host:5432/db_fuzzing` | Sí (credenciales embebidas) |
| `CORS_ORIGINS` | Orígenes permitidos (URL de la Landing) | `https://wasa-landing.example.com` | No |
| `RATE_LIMIT_REQUESTS` | Requests permitidos por ventana | `10` | No |
| `RATE_LIMIT_WINDOW` | Ventana en segundos | `3600` | No |
| `APP_ENV` | Entorno | `development` \| `production` | No |
| `VITE_API_BASE_URL` (frontend) | URL base del FastAPI Bridge | `https://api.wasa.example.com` | No |
| `VITE_DASHBOARD_URL` (frontend) | URL del Dashboard existente | `https://dashboard.wasa.example.com` | No |

Los valores reales de `DB_URL`, `N8N_WEBHOOK_URL` y `N8N_WEBHOOK_TOKEN` (host, puerto, credenciales de la instancia PostgreSQL/n8n ya desplegada) no están documentados en las fuentes — ver `10_preguntas_abiertas.md`.
