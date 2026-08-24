## Why

Los 25 changes anteriores validaron cada pieza del sistema **en aislamiento** (unit tests con dobles: `httpx.MockTransport`, SQLite en memoria, jsdom, n8n verificado a mano con curl). Nadie ejecutó todavía el recorrido real **registro → login → escaneo** de punta a punta contra la infraestructura viva (FastAPI Bridge + PostgreSQL `db_fuzzing` + n8n + navegador). Este es el último change del roadmap: su función es cerrar esa brecha y producir la evidencia de aceptación del proyecto — un smoke test **repetible** que cualquiera pueda correr antes de una defensa, una demo o un deploy, y que falle ruidosamente si alguna costura entre capas se rompió.

## What Changes

- **Nuevo suite E2E automatizado de backend** (`fastapi_bridge/tests/e2e/`): ejercita el flujo HTTP real contra un Bridge levantado con `uvicorn` y la PostgreSQL `db_fuzzing` real — registro, email duplicado (409), login OK/KO (200/401), `POST /scan/start` sin JWT (401), con JWT (202), rate limit (429 en la solicitud 11) y verificación por `SELECT` de la fila en `users` y de la fila en `scans` que produce n8n.
- **Opt-in por diseño**: el suite se marca `@pytest.mark.e2e` y se auto-skipea salvo que `WASA_E2E=1` esté presente. `pytest` sin esa variable sigue corriendo exactamente los 34 archivos de tests unitarios de hoy, sin tocar infraestructura viva ni la red.
- **Nuevo runbook de smoke test manual** (`docs/e2e-smoke-test-runbook.md`, en un directorio `docs/` nuevo en la raíz del repo — ver D-8): checklist ejecutable con los pasos de navegador y de UI de n8n que no vale la pena automatizar para un solo recorrido — carga < 3 s, muro de auth, apertura/cierre de modales, persistencia de sesión tras recarga, logout, gating del checkbox ético, redirección al Dashboard, y la inspección del execution history de n8n. Incluye tabla de registro de resultados (fecha, operador, PASS/FAIL, evidencia).
- **Cobertura 1:1 de los 18 criterios del CHANGE-22**: cada ítem del checklist del roadmap queda asignado explícitamente a un test automatizado o a un paso numerado del runbook. Ninguno queda huérfano.
- **Guion de preparación y limpieza**: usuario desechable con email único por corrida (`smoke+<uuid>@wasa.test`), target de escaneo apuntando a la **aplicación vulnerable local del propio operador** (`http://localhost:8081/`) con su `phpsessid` de sesión, ambos leídos del entorno (`WASA_E2E_TARGET_URL`, `WASA_E2E_PHPSESSID` — nunca versionados, ver D-7), y limpieza que borra **solo** la fila propia de `users`.
- **NO** se agrega, modifica ni elimina código de producción del Bridge ni de `wasa-landing/`. Si el smoke test encuentra un defecto, se documenta como hallazgo; su corrección es una decisión aparte del usuario, no parte del alcance de este change.

## Capabilities

### New Capabilities
- `e2e-smoke-validation`: define qué significa que el sistema WASA esté "verde de punta a punta" — el contrato del suite E2E opt-in y del runbook manual, la cobertura obligatoria de los 18 criterios de aceptación, el aislamiento respecto de la suite unitaria, y las garantías de no-daño sobre el esquema compartido `db_fuzzing`.

### Modified Capabilities

Ninguna. Este change **valida** comportamiento ya especificado (`auth-endpoints`, `scan-endpoint`, `api-edge-security`, `auth-wall`, `landing-composition`, `orchestrator-scan-webhook`, …) sin cambiar ningún requirement existente. No se emiten delta specs sobre capabilities previas.

## Impact

**Código nuevo**
- `fastapi_bridge/tests/e2e/__init__.py`, `conftest.py`, `test_smoke_auth_flow.py`, `test_smoke_scan_flow.py`
- `pytest.ini`: registro del marker `e2e` (evita el warning de marker desconocido)
- `fastapi_bridge/requirements-dev.txt`: sin cambios esperados — `httpx` ya está en `requirements.txt` y `asyncpg` también; se confirma durante el apply

**Documentación**
- `docs/e2e-smoke-test-runbook.md` (directorio `docs/` nuevo en la raíz — no confundir con `docs_wasa_sdd/`, que es material de la tesis)
- `openspec/changes/e2e-smoke-test/RESULTS.md`: la tabla firmada de **esta** corrida (evidencia fechada, se archiva con el change)
- `CHANGES.md`: firma de los 18 criterios del CHANGE-22 con su evidencia

**Sistemas tocados en tiempo de ejecución (solo al correr con `WASA_E2E=1`)**
- PostgreSQL `db_fuzzing`: `INSERT`/`DELETE` sobre `users` (tabla propia del Bridge); `SELECT` **read-only** sobre `scans` y `vulnerabilities`. Se respeta la regla dura: el Bridge nunca escribe ni migra el esquema compartido preexistente.
- n8n: una ejecución real del workflow por corrida, disparada por el Webhook Trigger del CHANGE-21.
- Red externa: **ninguna**. El escaneo apunta a `http://localhost:8081/`, la aplicación vulnerable que el operador corre en su propia máquina; el tráfico de ZAP/Nuclei/ffuf/SQLMap no sale del host.

**Riesgos**
- El suite E2E depende de infraestructura viva; sin ella debe **skipear**, nunca fallar en rojo. Ese es un requirement, no un detalle. (Para **esta** corrida la infraestructura ya está confirmada arriba y alcanzable — PostgreSQL `db_fuzzing`, n8n con el webhook del CHANGE-21 activo, `.env` real y el target local en `:8081`; la guarda de skip se conserva para quien corra el suite más adelante en otra máquina.)
- Correr el suite repetidamente consume presupuesto de rate limit (10 req/IP/60 min sobre `/scan/start`); el test de 429 agota la ventana a propósito y el runbook documenta cómo resetearla.
