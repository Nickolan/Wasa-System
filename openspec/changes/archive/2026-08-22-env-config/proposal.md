## Why

CHANGE-00a dejó `fastapi_bridge/core/settings.py` con el **contrato tipado** de configuración (`Settings` de Pydantic `BaseSettings`, nueve campos, `SecretStr` en los sensibles) pero con **defaults de desarrollo inventados**: `DB_URL` apunta a `wasa:wasa@localhost`, `JWT_SECRET` y `N8N_WEBHOOK_TOKEN` valen literalmente `dev-only-insecure-change-me`. CHANGE-00b dejó `wasa-landing/src/shared/config/` vacío con un `.gitkeep` que dice `# CHANGE-00c — env.ts`: el frontend hoy **no tiene ninguna forma de saber a qué URL hablar**.

El contrato existe; los **valores** no. Este change es el que los materializa. Hasta ahora estaba bloqueado por las dos preguntas de prioridad **Alta** de `knowledge-base/10_preguntas_abiertas.md` (credenciales reales de PostgreSQL `db_fuzzing`, valores reales del webhook n8n): **ambas ya fueron respondidas por el usuario** y este change las consume. Sin él, CHANGE-01 (Auth) no puede conectarse a la base, CHANGE-12/21 no pueden llamar a n8n y CHANGE-16 no tiene contra qué apuntar Axios.

## What Changes

- **`fastapi_bridge/.env` (real, no versionado)** — se completa con los valores confirmados por el usuario: `DB_URL=postgresql+asyncpg://postgres:nikolan@localhost:5432/db_fuzzing`, `N8N_WEBHOOK_URL=http://localhost:5678/webhook/wasa-scan`, `N8N_WEBHOOK_TOKEN=wasapikey`; más `JWT_SECRET` **generado criptográficamente** en tiempo de apply (`secrets.token_hex(32)`, nunca un literal escrito a mano ni copiado de este documento), `TOKEN_EXPIRE_HOURS=24`, `CORS_ORIGINS=http://localhost:5173`, `RATE_LIMIT_REQUESTS=10`, `RATE_LIMIT_WINDOW=3600`, `APP_ENV=development`.
- **`fastapi_bridge/.env.example` (versionado)** — mismas nueve claves, en el mismo orden, con placeholders inertes y un comentario por variable. Es la documentación ejecutable del contrato de `Settings`.
- **`wasa-landing/.env` (real, no versionado)** — `VITE_API_BASE_URL=http://localhost:8000` (puerto por defecto de Uvicorn) y `VITE_DASHBOARD_URL` apuntando al Dashboard React existente (ver `design.md`, D-4: hay una **colisión de puerto 5173** entre `wasa-landing` y `dashboard/dashboard-fuzzing`, ambos Vite).
- **`wasa-landing/.env.example` (versionado)** — las dos claves `VITE_*` con placeholders.
- **`wasa-landing/src/shared/config/env.ts` (nuevo)** — único punto de lectura de `import.meta.env` en todo el frontend. Exporta `apiBaseUrl` y `dashboardUrl` ya validados: si una variable falta o está vacía, **falla ruidosamente en el arranque** en vez de propagar `undefined` hacia un `axios.create({ baseURL: undefined })` (CHANGE-16). Es la contraparte frontend de la regla dura "NUNCA hardcodear configuración".
- **`wasa-landing/src/vite-env.d.ts` (nuevo)** — augmenta `ImportMetaEnv` para que `VITE_API_BASE_URL` y `VITE_DASHBOARD_URL` sean `string` tipados y no `any`. Hoy el archivo **no existe** (fue omitido en el scaffold de CHANGE-00b), y sin él TypeScript no conoce las variables.
- **`.gitignore`** — ya cubre `.env`, `fastapi_bridge/.env` y `wasa-landing/.env`; se verifica y se agrega una excepción explícita (`!*.env.example`) para garantizar que los ejemplos sí se versionen.
- **Tests nuevos** en ambos proyectos (`fastapi_bridge/tests/test_env_contract.py`, `wasa-landing/tests/env.test.ts`) que verifican el contrato, no los valores: que `.env.example` cubra exactamente los campos de `Settings`, que ningún `.env` real esté trackeado por git, y que `env.ts` valide y falle ante variables ausentes.

No hay **BREAKING**: `Settings` conserva sus defaults, por lo que el servicio sigue arrancando sin `.env` presente (escenario ya especificado en `bridge-bootstrap`).

## Capabilities

### New Capabilities
- `runtime-configuration`: el contrato de configuración en tiempo de ejecución de los dos proyectos — qué variables existen, dónde viven los valores reales frente a los ejemplos versionados, cómo se accede a ellos desde cada stack (una sola puerta por proyecto: `core/settings.py` en el backend, `shared/config/env.ts` en el frontend) y qué garantías de secretos aplican (nunca en el repositorio, nunca en logs).

### Modified Capabilities
- `landing-bootstrap`: el escenario *"Sin cliente HTTP configurado ni variables de entorno"* del requisito **"El scaffold no implementa funcionalidad de dominio"** afirma que no existe `env.ts` ni configuración de entorno. Este change lo vuelve falso en su mitad de entorno. El requisito se modifica para acotar ese escenario al cliente Axios (que sigue perteneciendo a CHANGE-16) y quitar la parte de variables de entorno.

`bridge-bootstrap` **no** se modifica: su requisito "Configuración tipada desde el entorno" describe la clase `Settings` y sus escenarios (incluido "Arranque sin `.env` presente") siguen siendo verdaderos después de este change.

## Impact

- **Código nuevo**: `wasa-landing/src/shared/config/env.ts`, `wasa-landing/src/vite-env.d.ts`, `fastapi_bridge/tests/test_env_contract.py`, `wasa-landing/tests/env.test.ts`.
- **Código modificado**: `.gitignore` (excepción para `.env.example`); `wasa-landing/src/shared/config/.gitkeep` se elimina (la carpeta deja de estar vacía).
- **Archivos no versionados creados/completados**: `fastapi_bridge/.env`, `wasa-landing/.env`.
- **Sin impacto en `fastapi_bridge/core/settings.py`**: el contrato ya está implementado y probado; este change sólo lo alimenta.
- **Sin impacto en la base compartida**: no se abre conexión ni se ejecuta DDL. `DB_URL` queda declarada; quien la consuma es CHANGE-02.
- **Desbloquea**: CHANGE-01/02 (Auth + persistencia), CHANGE-11 (CORS + rate limiting), CHANGE-12/21 (n8n), CHANGE-16 (cliente Axios), CHANGE-19/20 (redirección al Dashboard).
- **Riesgo operativo conocido**: la configuración de permisos del agente (`.claude/settings.json`) deniega lectura/escritura sobre rutas `.env` reales. Ver `design.md`, D-6 — puede requerir intervención manual del usuario durante el apply.
