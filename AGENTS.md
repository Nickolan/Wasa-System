# WASA Landing Page & FastAPI Bridge — Instrucciones para Agentes

> Este archivo (y su copia `CLAUDE.md`) es lo PRIMERO que todo agente lee al entrar al repo.
> Generado a partir de `knowledge-base/` y `CHANGES.md`. No editar a mano sin re-sincronizar ambos archivos.

---

## Stack Tecnológico

| Capa | Tecnología | Versión |
|------|------------|---------|
| Frontend | React + TypeScript + Vite / Tailwind CSS 4 / React Hook Form + Zod / Axios / Zustand | React 19.x, TS 5.9.x, Vite 7.x, Tailwind 4.x |
| Backend | Python + FastAPI / Pydantic v2 / python-jose + passlib[bcrypt] / SQLAlchemy async + asyncpg / httpx / slowapi / Uvicorn | Python 3.11+, FastAPI 0.111+ |
| Persistencia | PostgreSQL `db_fuzzing` (instancia **compartida** con el sistema WASA existente) | — |
| Orquestación (existente, no se modifica) | n8n self-hosted (Webhook Trigger), Redis/Memurai, Python SQLMap Worker | — |
| Dashboard (existente, no se modifica) | React + Node.js/Express | — |

Detalle completo: [knowledge-base/02_descripcion_general.md](knowledge-base/02_descripcion_general.md)

---

## Base de Conocimiento

La fuente de verdad del dominio vive en `knowledge-base/`. **Leé el archivo relevante ANTES de implementar.**

| Archivo | Cuándo leerlo |
|---------|---------------|
| [01_vision_y_objetivos.md](knowledge-base/01_vision_y_objetivos.md) | Entender propósito, alcance v1.2 y fuera de alcance |
| [03_actores_y_roles.md](knowledge-base/03_actores_y_roles.md) | Auth, RBAC (autenticado vs. anónimo), rutas públicas |
| [04_modelo_de_datos.md](knowledge-base/04_modelo_de_datos.md) | Entidad `users` (nueva) + `scans`/`vulnerabilities` (existentes) en PostgreSQL `db_fuzzing` |
| [05_reglas_de_negocio.md](knowledge-base/05_reglas_de_negocio.md) | Reglas codificadas RN-WS-01..16 |
| [06_funcionalidades.md](knowledge-base/06_funcionalidades.md) | 6 épicas, 27 historias de usuario (HU-EE-NN, incl. HU-04-03 de CHANGE-23) |
| [07_flujos_principales.md](knowledge-base/07_flujos_principales.md) | Flujos E2E: registro, login, escaneo |
| [08_arquitectura_propuesta.md](knowledge-base/08_arquitectura_propuesta.md) | Patrones, estructura de directorios, seguridad, variables de entorno |
| [10_preguntas_abiertas.md](knowledge-base/10_preguntas_abiertas.md) | ⚠️ Inconsistencias/preguntas a resolver ANTES de codear |

> ⚠️ Antes de arrancar CHANGE-00c/CHANGE-01, resolver las preguntas de prioridad **Alta** de `10_preguntas_abiertas.md`: credenciales reales de conexión a PostgreSQL `db_fuzzing` y valores reales de `N8N_WEBHOOK_URL`/`N8N_WEBHOOK_TOKEN`. No inventar placeholders en `.env` reales.

---

## Skills Disponibles

| Agente | Rol | Skills que carga |
|--------|-----|------------------|
| **Backend Core** | FastAPI, capas Router/Service/UoW/Repository, async | `fastapi-templates`, `fastapi-async-patterns`, `pydantic` |
| **Backend Datos** | SQLAlchemy async sobre PostgreSQL `db_fuzzing` compartida | `sqlalchemy-alembic-expert-best-practices-code-review` |
| **Backend Seguridad** | JWT, bcrypt, rate limiting (dominio CRÍTICO) | `auth-security-reviewer`, `implementing-api-rate-limiting-and-throttling` |
| **Frontend** | React FSD, Tailwind, Zustand (authStore) | `tailwind-design-system`, `zustand` |
| **Integración** | Webhook Trigger n8n | `n8n-workflow` |

Cargá la skill correspondiente al contexto ANTES de escribir código.

> Los compact rules de cada skill los resuelve el orquestador desde `.atl/skill-registry.md` (generado por `skill-registry`; no versionado — no está en el repo). Esta tabla solo mapea skill→rol.

---

## Roadmap de Changes

El plan de implementación completo está en [CHANGES.md](CHANGES.md). Resumen:

- **Total**: 26 changes (CHANGE-00a..CHANGE-00d, CHANGE-01..CHANGE-22).
- **Camino crítico**: `CHANGE-00a → 01 → 02 → 03 → 04 → 06 → 12 → 21 → 22` (backend Auth + Scan + n8n; CHANGE-05 no está estructuralmente en este camino pero es requisito funcional del smoke test de CHANGE-22).
- **Primer change**: `CHANGE-00a` (fastapi-bridge-scaffold — estructura inicial del microservicio FastAPI Bridge).

**Antes de cualquier `/opsx:propose`**: leé [CHANGES.md](CHANGES.md), identificá las dependencias del change y los archivos de "Leer antes".

---

## Reglas Duras (específicas del proyecto)

> Reglas **globales** ya definidas en `~/.claude/CLAUDE.md` (orquestador OPSX, governance por dominio, Engram, TDD estricto): el proyecto las **hereda**, no se repiten acá.

Reglas específicas confirmadas con el usuario:

- **NUNCA** el Router contiene lógica de negocio → toda lógica va en `Service`; el Router solo orquesta `Depends` y llama al Service.
- **NUNCA** el Service instancia `httpx`/`SQLAlchemy` directamente → siempre a través del `UoW` correspondiente (`AuthUoW`, `ScanUoW`).
- **NUNCA** el Repository importa nada de FastAPI (`Request`, `Response`, `Depends`) → debe ser reutilizable fuera del framework web.
- **NUNCA** hardcodear configuración → toda config viene de `core/settings.py` (Pydantic `BaseSettings`, leído de `.env`).
- **NUNCA** un error de la API se retorna fuera de formato RFC 7807 → todos pasan por `exceptions/handlers.py`.
- Python: `snake_case` en funciones/variables/archivos, `PascalCase` en clases y schemas Pydantic, `UPPER_SNAKE_CASE` en variables de entorno, type hints obligatorios en toda función (sin excepción), async en toda la capa de I/O.
- TypeScript/React: componentes `PascalCase.tsx`, hooks `camelCase` prefijados con `use`, funciones utilitarias `camelCase.ts`, tipos/interfaces `PascalCase`.
- FSD (frontend): **NUNCA** una capa importa de una capa superior (`app → pages → widgets → features → entities → shared` es unidireccional); `shared/` no conoce nada de dominio WASA; `entities/` solo define tipos y schemas Zod, sin lógica de UI.
- **NUNCA** modificar, migrar o escribir sobre las tablas existentes `scans`/`vulnerabilities` de PostgreSQL `db_fuzzing` desde el FastAPI Bridge → el Bridge únicamente usa `Base.metadata.create_all` para su propio modelo `User`; no se corren migraciones Alembic sobre el esquema existente (ver [knowledge-base/04_modelo_de_datos.md](knowledge-base/04_modelo_de_datos.md) y DD-02 en [09_decisiones_y_supuestos.md](knowledge-base/09_decisiones_y_supuestos.md)).
- **Governance del dominio Auth (CHANGE-01 a CHANGE-07)**: por decisión explícita del usuario, este proyecto aplica nivel **MEDIUM** (no CRITICAL) a la implementación de Auth — se implementa en pasos, surfaceando al usuario las decisiones no obvias (algoritmo JWT, rounds de bcrypt, expiración de tokens) para revisión, sin requerir aprobación previa a cada línea de código. Esto es una excepción puntual a la tabla de governance global (que clasifica Auth/Security como CRITICAL por defecto) — aplica SOLO a estos 7 changes de este proyecto, no cambia el default global.

---

## Flujo de Trabajo

```
1. Leer la KB relevante (knowledge-base/)        → entender el dominio
2. Identificar el change en CHANGES.md           → respetar dependencias
3. /opsx:propose <nombre-del-change>             → proposal + design + specs + tasks
4. Implementar las tasks (cargando skills)       → respetando las reglas duras
5. /opsx:archive <nombre-del-change> + marcar [x] → cerrar el change
```

Aplicar TODAS las reglas duras en cada paso. Ante conflicto entre la KB y este archivo, las reglas duras prevalecen.
