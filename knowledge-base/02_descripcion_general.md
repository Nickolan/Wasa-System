# Descripción General

## Stack tecnológico

| Capa | Tecnologías | Versión mínima |
|---|---|---|
| Frontend — Landing | React + TypeScript + Vite | React 19.x, TS 5.9.x, Vite 7.x |
| Frontend — estilos/forms | Tailwind CSS, React Hook Form, Zod | 4.x / 7.x / 3.x |
| Frontend — HTTP/estado | Axios, Zustand | 1.x / 4.x |
| Backend — Bridge | Python + FastAPI | Python 3.11+, FastAPI 0.111+ |
| Backend — validación | Pydantic v2 | 2.x |
| Backend — auth | python-jose[cryptography] (JWT), passlib[bcrypt] | 3.x / 1.x |
| Backend — datos | SQLAlchemy (async) + asyncpg | SQLAlchemy 2.x, asyncpg 0.29+ |
| Backend — HTTP/rate limit | httpx (async), slowapi | 0.27+ / 0.1.x |
| Backend — server | Uvicorn | 0.29+ |
| Orquestación (existente) | n8n self-hosted, Webhook Trigger node | latest |
| Infra (existente) | Redis / Memurai (cola `sqlmap_tasks`) | — |
| Persistencia (existente, compartida) | PostgreSQL `db_fuzzing` | — |
| Dashboard (existente) | React + Node.js/Express | ya validado en tesis, no se modifica |
| Herramientas de escaneo (existente) | OWASP ZAP, Nuclei, ffuf, SQLMap | — |

> **Nota de versionado del frontend (decisión del usuario, CHANGE-00b).** El stack de la Landing sigue lo que
> `npm create vite@latest -- --template react-ts` scaffoldea hoy (React 19 / Vite 7 / TS 5.9) y Tailwind CSS 4.
> No se hace downgrade a React 18 / Vite 5 / Tailwind 3. Consecuencia práctica: Tailwind 4 se configura con el
> plugin `@tailwindcss/vite` + `@import "tailwindcss"` en el CSS y tokens bajo `@theme`; **no** hay
> `tailwind.config.ts`, `postcss.config.*` ni `autoprefixer`. Ver `openspec/changes/react-landing-scaffold/design.md` (D-2).

## Arquitectura general

```
USUARIO (Anónimo o Autenticado)
   │ HTTP
   ▼
CAPA 0/PRESENTACIÓN PÚBLICA — React Landing (FSD)
   │ POST /api/v1/auth/register | /login | POST /api/v1/scan/start (Bearer JWT)
   ▼
CAPA 1/PUENTE — FastAPI Bridge (Auth domain + Scan domain, 5 capas c/u)
   │                                  │
   │ SQLAlchemy async (asyncpg)       │ httpx POST
   ▼                                  ▼
PostgreSQL db_fuzzing            CAPA 2/ORQUESTACIÓN — n8n Workflow
(tablas: users [nueva],          Webhook Trigger → ZAP → Nuclei → ffuf
 scans, vulnerabilities)         → LPUSH sqlmap_tasks (Redis)
        ▲                                  │
        │ INSERT                    BLPOP  ▼
        └──────────────────  CAPA 3/EJECUCIÓN — Python SQLMap Worker
        │
        ▼ SELECT
CAPA 5/PRESENTACIÓN INTERNA — Dashboard React/Node.js (existente)
```

**Decisión clave de arquitectura**: el FastAPI Bridge NO levanta un motor de base de datos propio. Se conecta a la misma instancia PostgreSQL `db_fuzzing` que ya usa n8n/Worker para `scans`/`vulnerabilities`, y agrega ahí la tabla `users`. Esto evita mantener dos motores de datos y centraliza la persistencia (ver `09_decisiones_y_supuestos.md`, DD-02).

## Integraciones externas

| Servicio | Propósito | Tipo |
|---|---|---|
| n8n Webhook Trigger | Disparar el workflow de escaneo (ZAP/Nuclei/ffuf/SQLMap) | Webhook (POST + header `X-WASA-TOKEN`) |
| PostgreSQL `db_fuzzing` | Persistir usuarios (`users`, nueva) y leer/escribir resultados de escaneo (`scans`, `vulnerabilities`, ya existentes, fuera del alcance del Bridge) | SQLAlchemy async (asyncpg) |
| Dashboard React/Node.js | Destino de redirección tras iniciar un escaneo | Redirección de navegador (no API directa desde el Bridge) |

## API REST (FastAPI Bridge)

- `POST /api/v1/auth/register` — registra usuario, emite JWT (201).
- `POST /api/v1/auth/login` — verifica credenciales, emite JWT (200).
- `POST /api/v1/scan/start` — protegido con Bearer JWT + rate limit, delega a n8n (202).
- `GET /health` — healthcheck (200).

Todos los errores siguen RFC 7807 (Problem Details). Ver `04_modelo_de_datos.md` y `08_arquitectura_propuesta.md` para detalle de schemas y contratos completos.
