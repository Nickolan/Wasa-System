# WASA — Landing Page & FastAPI Bridge

> Capa de presentación pública y puente de autenticación para **WASA** (Web Application
> Security Assessment): una plataforma de seguridad automatizada que orquesta ZAP, Nuclei,
> ffuf y SQLMap sobre objetivos web autorizados. Este repositorio agrega registro/login y un
> muro de autenticación delante del disparo de escaneos — reemplazando el Schedule Trigger
> manual de n8n de la tesis original por un flujo web con JWT.
>
> Proyecto de tesis — Universidad Tecnológica Nacional (UTN), Mendoza, Argentina.
> Desarrollado por **Nicolas Navarrete** y **Lautaro Ferreira**.

---

## Índice

- [¿Qué es esto?](#qué-es-esto)
- [Arquitectura](#arquitectura)
- [Estructura del repositorio](#estructura-del-repositorio)
- [Stack tecnológico](#stack-tecnológico)
- [Puesta en marcha](#puesta-en-marcha)
- [Variables de entorno](#variables-de-entorno)
- [API del FastAPI Bridge](#api-del-fastapi-bridge)
- [Testing](#testing)
- [Metodología del proyecto (OpenSpec / OPSX)](#metodología-del-proyecto-openspec--opsx)
- [Documentación](#documentación)
- [Alcance y no-alcance](#alcance-y-no-alcance)

---

## ¿Qué es esto?

WASA ya existía como sistema (n8n + ZAP/Nuclei/ffuf + Worker SQLMap + Dashboard) antes de
este proyecto — ver [`Herramientas/README.md`](Herramientas/README.md) para el laboratorio
de fuzzing original. Ese sistema se disparaba a mano desde n8n. Este repo agrega la pieza que
faltaba para exponerlo como producto:

- Una **Landing Page** en React donde un usuario anónimo entiende qué hace WASA y un usuario
  autenticado puede lanzar un escaneo desde un formulario.
- Un **FastAPI Bridge** que autentica usuarios (JWT), valida el pedido de escaneo y lo
  reenvía al Webhook Trigger de n8n — sin ejecutar ninguna herramienta de seguridad él mismo.

El Bridge **no** reemplaza ni toca el pipeline de escaneo existente (n8n → ZAP/Nuclei/ffuf →
Redis → Worker SQLMap → PostgreSQL); solo agrega autenticación delante y una tabla `users`
nueva en la misma base de datos.

## Arquitectura

```
USUARIO (Anónimo o Autenticado)
   │ HTTP
   ▼
CAPA 0 — React Landing (FSD)                              wasa-landing/
   │ POST /api/v1/auth/register | /login
   │ POST /api/v1/scan/start (Bearer JWT)
   ▼
CAPA 1 — FastAPI Bridge (dominio Auth + dominio Scan)      fastapi_bridge/
   │  Router → Service → UoW → Repository, en cada dominio
   │                                  │
   │ SQLAlchemy async (asyncpg)       │ httpx POST + X-WASA-TOKEN
   ▼                                  ▼
PostgreSQL db_fuzzing            CAPA 2 — n8n Workflow (existente, no se modifica)
(tablas: users [nueva],          Webhook Trigger → ZAP → Nuclei → ffuf
 scans, vulnerabilities                             → LPUSH sqlmap_tasks (Redis)
 [existentes])                                                    │
        ▲                                                  BLPOP  ▼
        │ INSERT                          CAPA 3 — Worker Python (SQLMap)    Herramientas/
        └───────────────────────────────────────────┘
        │
        ▼ SELECT
CAPA 5 — Dashboard React/Node.js (existente, no se modifica)      dashboard/
```

**Decisión clave**: el Bridge no levanta un motor de base de datos propio. Se conecta a la
misma instancia PostgreSQL `db_fuzzing` que ya usa n8n/Worker para `scans`/`vulnerabilities`,
y solo agrega ahí la tabla `users` (vía `Base.metadata.create_all`, sin migraciones Alembic
sobre el esquema existente). Detalle completo:
[`knowledge-base/08_arquitectura_propuesta.md`](knowledge-base/08_arquitectura_propuesta.md).

## Estructura del repositorio

```
LandingPage_Tesis/
├── wasa-landing/          Frontend — React + Vite, arquitectura FSD
│   └── src/
│       ├── app/               bootstrap, stores globales
│       ├── pages/              composición de página (LandingPage)
│       ├── widgets/             bloques grandes (Hero, Features, ScanForm, etc.)
│       ├── features/            auth (login/registro), scan (formulario de escaneo)
│       ├── entities/            tipos, schemas Zod, estado de dominio (authStore)
│       └── shared/               ui/, lib/, config/ — sin conocimiento de dominio
│
├── fastapi_bridge/         Backend — FastAPI, 5 capas por dominio (auth, scan)
│   ├── api/v1/{auth,scan}/     routers — solo orquestan Depends, sin lógica de negocio
│   ├── services/                lógica de negocio (AuthService, ScanService)
│   ├── uow/                     Unit of Work (AuthUoW, ScanUoW) — únicos que instancian I/O
│   ├── repositories/             UserRepository, N8nRepository — sin nada de FastAPI
│   ├── schemas/                  contratos Pydantic v2 (request/response/error RFC 7807)
│   ├── core/                     settings.py (config), security.py (JWT/bcrypt), dependencies.py
│   ├── exceptions/                handlers.py — todo error sale en formato RFC 7807
│   └── tests/                     unit + integración + e2e/ (opt-in, ver Testing)
│
├── Herramientas/           Laboratorio de fuzzing preexistente (n8n + ZAP + Nuclei +
│                           ffuf + SQLMap Worker) — ver su propio README para instalación
├── dashboard/               Dashboard React/Node.js preexistente (no se modifica en este proyecto)
├── docs/                    Runbooks operativos (ej. e2e-smoke-test-runbook.md)
├── docs_wasa_sdd/            Documentación fuente original de la tesis (roadmap, historias de usuario)
├── knowledge-base/           Base de conocimiento del dominio — fuente de verdad, leer antes de implementar
├── openspec/                 Artefactos de planificación por change (proposal/design/specs/tasks) + specs archivadas
├── CHANGES.md                Índice operativo de los 26 changes del roadmap, con dependencias y criterios
├── CLAUDE.md / AGENTS.md     Instrucciones para agentes IA que trabajan en este repo
└── pytest.ini                Config de pytest para fastapi_bridge/
```

## Stack tecnológico

| Capa | Tecnología | Versión |
|------|------------|---------|
| Frontend | React + TypeScript + Vite | React 19.x, TS 5.9.x/6.x, Vite 7–8.x |
| Frontend — estilos/forms | Tailwind CSS 4, React Hook Form + Zod | 4.x / 7.x / 3.x |
| Frontend — HTTP/estado | Axios, Zustand | 1.x / 5.x |
| Backend | Python + FastAPI, Pydantic v2 | Python 3.11+, FastAPI 0.111+ |
| Backend — auth | python-jose (JWT), bcrypt directo | 3.x / 4.x+ |
| Backend — datos | SQLAlchemy async + asyncpg | SQLAlchemy 2.x, asyncpg 0.29+ |
| Backend — HTTP/rate limit | httpx (async), slowapi | 0.27+ / 0.1.x |
| Backend — server | Uvicorn | 0.30+ |
| Persistencia | PostgreSQL `db_fuzzing` (instancia **compartida** con el sistema WASA existente) | — |
| Orquestación (existente) | n8n self-hosted, Redis/Memurai, Python SQLMap Worker | — |
| Dashboard (existente) | React + Node.js/Express | — |
| Herramientas de escaneo (existente) | OWASP ZAP, Nuclei, ffuf, SQLMap | — |

## Puesta en marcha

### 1. Sistema WASA base (n8n + herramientas de escaneo)

Este proyecto asume que el laboratorio de fuzzing ya está corriendo. Seguí
[`Herramientas/README.md`](Herramientas/README.md) para instalar n8n, PostgreSQL, Memurai
(Redis), OWASP ZAP, Nuclei, ffuf y SQLMap, y para levantar el Worker de Python y el flujo de
n8n (`Flujo_Fuzzing_N8N.json`).

### 2. FastAPI Bridge

```bash
cd fastapi_bridge
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
pip install -r requirements-dev.txt   # solo para correr tests

# completar .env (ver Variables de entorno más abajo)
uvicorn fastapi_bridge.main:app --reload --port 8000
```

Verificación: `GET http://localhost:8000/health` → `{"status": "ok", "service": "wasa-fastapi-bridge"}`.

### 3. Landing Page

```bash
cd wasa-landing
npm install

# completar .env (ver Variables de entorno más abajo)
npm run dev      # http://localhost:5173
```

Build de producción:

```bash
npm run build && npm run preview -- --port 5173 --strictPort
```

> ⚠️ `vite preview` sirve por defecto en el puerto `4173`, que **no** está en
> `CORS_ORIGINS` del Bridge. Usá siempre `--port 5173 --strictPort` (o el puerto que hayas
> configurado en `CORS_ORIGINS`) al previsualizar el build.

## Variables de entorno

Ninguna se versiona con valores reales (`.gitignore` excluye `.env`, `fastapi_bridge/.env`,
`wasa-landing/.env`; solo `*.env.example` se versiona como documentación ejecutable del
contrato de configuración).

**`fastapi_bridge/.env`**

| Variable | Descripción |
|---|---|
| `DB_URL` | `postgresql+asyncpg://user:pass@host:5432/db_fuzzing` — misma instancia que usa el sistema WASA existente |
| `JWT_SECRET` | Clave de firma HS256 para los access tokens |
| `TOKEN_EXPIRE_HOURS` | Expiración del JWT (default `24`) |
| `N8N_WEBHOOK_URL` | URL del Webhook Trigger de n8n (`/webhook/wasa-scan`) |
| `N8N_WEBHOOK_TOKEN` | Token enviado en el header `X-WASA-TOKEN` |
| `CORS_ORIGINS` | Orígenes permitidos (debe incluir la URL del frontend) |
| `RATE_LIMIT_REQUESTS` / `RATE_LIMIT_WINDOW` | Rate limit de `/scan/start` (default `10` req / `3600` s por IP) |
| `APP_ENV` | `development` / `production` |

**`wasa-landing/.env`**

| Variable | Descripción |
|---|---|
| `VITE_API_BASE_URL` | URL base del FastAPI Bridge |
| `VITE_DASHBOARD_URL` | URL del Dashboard, destino de redirección tras iniciar un escaneo |

## API del FastAPI Bridge

| Endpoint | Auth | Descripción |
|---|---|---|
| `GET /health` | — | Healthcheck |
| `POST /api/v1/auth/register` | — | Registra usuario, retorna `201` + JWT |
| `POST /api/v1/auth/login` | — | Verifica credenciales, retorna `200` + JWT |
| `POST /api/v1/scan/start` | Bearer JWT | Valida y reenvía el pedido de escaneo a n8n, `202`; sujeto a rate limit |

Todos los errores siguen **RFC 7807** (`application/problem+json`: `type`, `title`, `status`,
`detail`, `instance`). Documentación interactiva en `/docs` una vez levantado el Bridge.

## Testing

```bash
# Backend (desde la raíz del repo)
pytest

# Frontend
cd wasa-landing
npm run test:run
```

El backend incluye además una **suite E2E opt-in** (`fastapi_bridge/tests/e2e/`) que ejercita
el sistema completo contra infraestructura viva (PostgreSQL, n8n, Bridge, y un objetivo de
escaneo real) — nunca corre en CI ni por accidente. Se activa explícitamente:

```bash
WASA_E2E=1 WASA_E2E_TARGET_URL=... WASA_E2E_PHPSESSID=... pytest fastapi_bridge/tests/e2e -m e2e -v
```

Ver [`docs/e2e-smoke-test-runbook.md`](docs/e2e-smoke-test-runbook.md) para el detalle
completo (variables requeridas, orden de fases, y los pasos manuales de navegador que
complementan la suite automatizada).

## Metodología del proyecto (OpenSpec / OPSX)

El proyecto se construyó con desarrollo dirigido por specs (**OpenSpec**, orquestado con el
flujo **OPSX**) y **TDD estricto**. Cada unidad de trabajo es un *change* atómico:

```
/opsx:explore   → (opcional) pensar antes de comprometerse
/opsx:propose   → crear el change + proposal/design/specs/tasks
/opsx:apply     → implementar las tasks bajo TDD
/opsx:archive   → sincronizar specs + cerrar el change
```

- **[`CHANGES.md`](CHANGES.md)** — índice operativo de los 26 changes (`CHANGE-00a`..`CHANGE-22`),
  con árbol de dependencias, gates de paralelismo, camino crítico y criterios de aceptación
  por change. Es el punto de partida para entender qué está hecho y qué falta.
- **[`knowledge-base/`](knowledge-base/)** — fuente de verdad del dominio (visión, actores,
  modelo de datos, reglas de negocio, funcionalidades, flujos, arquitectura, decisiones).
- **`openspec/specs/`** — specs vivas por capacidad, sincronizadas al archivar cada change.
- **`openspec/changes/archive/`** — historial completo de proposal/design/tasks de cada change
  ya cerrado.
- **[`CLAUDE.md`](CLAUDE.md)** / **`AGENTS.md`** — reglas duras del proyecto (capas del
  Bridge, límites de FSD, governance por dominio, convenciones de nombres).

Al momento de escribir esto, el camino crítico (`CHANGE-00a → 01 → 02 → 03 → 04 → 06 → 12 →
21 → 22`) está completo; el último change del roadmap (`CHANGE-22`, smoke test E2E) tiene su
suite automatizada en verde y quedan pendientes los pasos manuales de navegador antes de
archivarlo — ver `openspec/changes/e2e-smoke-test/RESULTS.md`.

## Documentación

| Recurso | Contenido |
|---|---|
| [`knowledge-base/01_vision_y_objetivos.md`](knowledge-base/01_vision_y_objetivos.md) | Propósito, alcance v1.2, métricas de éxito |
| [`knowledge-base/02_descripcion_general.md`](knowledge-base/02_descripcion_general.md) | Stack completo, arquitectura, API REST |
| [`knowledge-base/03_actores_y_roles.md`](knowledge-base/03_actores_y_roles.md) | Auth, RBAC, rutas públicas vs. protegidas |
| [`knowledge-base/04_modelo_de_datos.md`](knowledge-base/04_modelo_de_datos.md) | Entidad `users` + `scans`/`vulnerabilities` existentes |
| [`knowledge-base/05_reglas_de_negocio.md`](knowledge-base/05_reglas_de_negocio.md) | Reglas de negocio codificadas RN-WS-01..15 |
| [`knowledge-base/06_funcionalidades.md`](knowledge-base/06_funcionalidades.md) | 6 épicas, 24 historias de usuario |
| [`knowledge-base/07_flujos_principales.md`](knowledge-base/07_flujos_principales.md) | Flujos E2E: registro, login, escaneo |
| [`knowledge-base/08_arquitectura_propuesta.md`](knowledge-base/08_arquitectura_propuesta.md) | Patrones, estructura de directorios, seguridad |
| [`docs/e2e-smoke-test-runbook.md`](docs/e2e-smoke-test-runbook.md) | Runbook de validación E2E manual + automatizada |
| [`Herramientas/README.md`](Herramientas/README.md) | Instalación del laboratorio de fuzzing (n8n, ZAP, Nuclei, ffuf, SQLMap, Worker) |

## Alcance y no-alcance

**En alcance (v1.2):**
- Landing Page pública (Hero, Features, HowItWorks, aviso ético, Footer) + muro de
  autenticación + formulario de escaneo protegido.
- Autenticación JWT (register/login) sobre PostgreSQL `db_fuzzing`.
- Rate limiting (10 req/IP/60min) sobre `/scan/start`, forwarding a n8n vía Webhook Trigger.

**Fuera de alcance:**
- El workflow interno de n8n (solo se agregó el nodo Webhook Trigger).
- Redis/Memurai y el Worker de Python SQLMap — no se modifican.
- Las tablas existentes `scans`/`vulnerabilities` — el Bridge solo las lee, nunca las escribe
  ni las migra.
- El Dashboard React/Node.js — ya validado en la tesis original, no se reconstruye.
- Recuperación de contraseña, verificación de email, refresh tokens.

---

Proyecto desarrollado para la UTN Mendoza — 2026.
