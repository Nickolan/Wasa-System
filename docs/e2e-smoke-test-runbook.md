# Runbook de smoke test E2E — WASA Landing + FastAPI Bridge

> Checklist operativo del smoke test end-to-end (CHANGE-22, `e2e-smoke-test`).
> Documentación **viva**: se abre antes de una demo, una defensa o un deploy,
> potencialmente meses después de que el change que la creó se archive. No
> contiene datos de ninguna corrida concreta — esos van a
> `openspec/changes/e2e-smoke-test/RESULTS.md` (D-8 de `design.md`).
>
> **Nunca pegues acá un valor real de las variables de entorno.** Este
> archivo se versiona en git; solo nombra las variables, nunca sus valores.

## 1. Prerrequisitos

Antes de correr cualquier parte de esta validación, confirmá que está
levantado y alcanzable:

- **PostgreSQL `db_fuzzing`**: la base compartida del sistema WASA. El suite
  automatizado solo lee (`SELECT`) sobre `scans`/`vulnerabilities` y escribe
  únicamente sobre `users` (fila propia, desechable).
- **n8n**, con el Webhook Trigger de `CHANGE-21` **activo** (`POST
  /webhook/wasa-scan`) y el Schedule Trigger **desactivado** (verificación
  manual en la UI de n8n — no hay forma no interactiva de confirmarlo sin
  una API key de n8n).
- **FastAPI Bridge**, levantado con su `.env` real:
  ```
  uvicorn fastapi_bridge.main:app --host 127.0.0.1 --port 8000
  ```
  (desde la raíz del repo, o con `--app-dir fastapi_bridge` según el cwd).
  Confirmar `GET /health` → `200`.
- **Landing Page**, como build de producción servido, **no** `npm run dev`:
  ```
  cd wasa-landing
  npm run build
  npm run preview -- --port 5173 --strictPort
  ```
  El puerto **debe** coincidir con `CORS_ORIGINS` del Bridge (por defecto
  `http://localhost:5173`); `vite preview` sin `--port` sirve en `4173` por
  defecto y el navegador vería errores de CORS.
- **Aplicación vulnerable objetivo**, corriendo en la máquina del operador
  (por defecto `http://localhost:8081/`) con una sesión autenticada vigente
  (`phpsessid`).

### Variables de entorno requeridas

Ninguna de estas se versiona con su valor real — solo se documentan acá los
nombres:

| Variable | Dónde se usa | Significado |
|---|---|---|
| `WASA_E2E` | suite automatizado | `1` habilita la colección de `fastapi_bridge/tests/e2e/`; cualquier otro valor (o ausente) hace que se omita entero (opt-in, D-2) |
| `WASA_E2E_BASE_URL` | suite automatizado | URL base del Bridge ya levantado; default `http://127.0.0.1:8000` si no se define |
| `WASA_E2E_TARGET_URL` | suite automatizado + runbook manual (§6.13) | URL de la aplicación vulnerable objetivo del operador; sin default de red — falta → skip |
| `WASA_E2E_PHPSESSID` | suite automatizado + runbook manual (§6.13) | Identificador de sesión vigente de esa aplicación; sin default de red — falta → skip |
| `WASA_E2E_RATELIMIT` | fase de rate limit (§5) | `1` habilita `test_smoke_rate_limit.py`; agota el presupuesto de la IP del operador por la ventana configurada |
| `DATABASE_URL` | suite automatizado (`conftest.py::db_conn`) | Cadena de conexión `asyncpg` cruda (`postgresql://user:pass@host:puerto/db_fuzzing`) — **distinta** del `DB_URL` del Bridge (que es formato SQLAlchemy `postgresql+asyncpg://...`); es un oráculo independiente a propósito (D-6), no reutiliza la configuración de producción |

## 2. Orden de las fases

1. **Preparación** (§1 de arriba): infraestructura viva + variables de entorno.
2. **Suite automatizado — autenticación**: `WASA_E2E=1 pytest fastapi_bridge/tests/e2e/test_smoke_auth_flow.py -m e2e -v`
3. **Suite automatizado — escaneo**: `WASA_E2E=1 pytest fastapi_bridge/tests/e2e/test_smoke_scan_flow.py -m e2e -v` (dispara un escaneo real contra el objetivo local)
4. **Runbook manual** (§6 de abajo): navegador + UI de n8n.
5. **Fase de rate limit** (§5, va **última** — ver advertencia):

   ```
   # a) Levantar el receptor local trivial:
   python fastapi_bridge/tests/e2e/local_receiver.py --port 9999

   # b) Reiniciar el Bridge apuntando el webhook al receptor local
   #    (override por variable de entorno del proceso, NO edita el .env real):
   N8N_WEBHOOK_URL=http://127.0.0.1:9999/webhook/wasa-scan \
     uvicorn fastapi_bridge.main:app --host 127.0.0.1 --port 8000

   # c) Correr la fase:
   WASA_E2E=1 WASA_E2E_RATELIMIT=1 \
     pytest fastapi_bridge/tests/e2e/test_smoke_rate_limit.py -m e2e_ratelimit -v

   # d) Cierre obligatorio — restaurar el Bridge original y confirmar salud:
   uvicorn fastapi_bridge.main:app --host 127.0.0.1 --port 8000
   curl http://127.0.0.1:8000/health   # debe responder 200
   ```

6. **Registro de evidencia**: completar la tabla de §7 de este runbook (o,
   para la corrida oficial de un change, `openspec/changes/<nombre>/RESULTS.md`).

> ⚠️ **Advertencia de rate limit.** La fase 5 agota el presupuesto de
> `RATE_LIMIT_REQUESTS`/IP/`RATE_LIMIT_WINDOW` (10 solicitudes/60 min por
> defecto) para `127.0.0.1`. Cualquier escaneo posterior desde esta misma
> máquina —automatizado o manual— recibirá `429` hasta que se reinicie el
> proceso `uvicorn` (paso d de arriba). Por eso corre **última**.

## 3. Cobertura declarada

Este runbook cubre los pasos de **navegador y UI de n8n** (§6). El recorrido
HTTP + persistencia está cubierto por el suite automatizado en
`fastapi_bridge/tests/e2e/` (`test_smoke_auth_flow.py`,
`test_smoke_scan_flow.py`, `test_smoke_rate_limit.py`). Ver D-1 de
`openspec/changes/e2e-smoke-test/design.md` para la tabla completa de qué
criterio vive en cuál de las dos partes.

## 4. Limpieza

- El suite automatizado limpia su propio usuario desechable
  (`smoke+<uuid>@example.com`) al finalizar la sesión de `pytest` — no
  requiere intervención manual.
- Las filas de `scans` que produce un escaneo real (automatizado o manual)
  **no se borran**: pertenecen al sistema WASA preexistente y esta
  validación nunca escribe ni borra sobre esa tabla.
- Si se corrió la fase de rate limit, confirmar el cierre del paso "d" de
  §2 antes de dar la corrida por terminada.

## 5. Pasos manuales numerados

> Ejecutar en una ventana de incógnito/privada, con DevTools abierto
> (pestaña Network) desde el paso 1. Usar un email de prueba **distinto**
> del que usó el suite automatizado en la misma corrida.

1. **Carga < 3 s.** Abrir la Landing Page servida en producción (§1). En la
   pestaña Network de DevTools, anotar el tiempo de `Load`. Debe ser
   < 3000 ms.
2. **Estado anónimo.** Sin haber iniciado sesión: confirmar que el muro de
   autenticación ("Iniciar Sesión" / "Crear Cuenta") es visible, **y**
   que el formulario de escaneo NO está presente en el DOM (no solo oculto
   por CSS — inspeccionar el árbol de elementos).
3. **Registro con email nuevo.** Registrar un email de prueba que no se
   haya usado antes en esta base. El modal debe cerrarse solo y el
   formulario de escaneo debe pasar a ser visible.
4. **Email duplicado.** Repetir el registro con el mismo email del paso 3.
   Debe aparecer el mensaje "Este email ya está registrado."
5. **Login incorrecto.** Cerrar sesión (si corresponde) e intentar loguear
   con una contraseña incorrecta. Debe aparecer el mensaje "Credenciales
   incorrectas."
6. **Login correcto.** Loguear con las credenciales correctas del paso 3.
   El modal debe cerrarse y el formulario de escaneo debe reaparecer.
7. **Persistencia de sesión.** Con sesión activa, recargar la página (F5).
   El formulario de escaneo debe seguir visible, sin pedir credenciales de
   nuevo.
8. **Logout.** Usar el control de "Cerrar sesión". El muro de autenticación
   debe reaparecer y el formulario de escaneo debe desaparecer.
9. **Validación de formulario.** Con sesión activa, intentar enviar el
   formulario con una URL objetivo inválida y el campo de sesión vacío.
   Deben aparecer errores inline por campo, y la pestaña Network **no**
   debe mostrar ninguna solicitud saliente hacia el Bridge.
10. **Gate ético.** Completar el formulario correctamente pero dejar sin
    marcar el checkbox de declaración ética. El botón "Escanear" debe
    permanecer deshabilitado.
11. **401 visible al usuario.** Con sesión activa, corromper o borrar el
    token guardado en `localStorage` desde DevTools → Application, y
    enviar el formulario de escaneo. Debe verse un `401` en la pestaña
    Network **y** un mensaje de sesión expirada/inválida en la interfaz.
12. **Escaneo real y pantalla de espera.** Loguear de nuevo (o refrescar
    sesión), completar el formulario con `WASA_E2E_TARGET_URL` y pegar a
    mano el valor vigente de `WASA_E2E_PHPSESSID` (nunca lo transcribas a
    este archivo ni a ningún otro archivo versionado), marcar el checkbox
    ético y enviar. Debe verse la pantalla de espera (`scan-pending-screen`)
    con la referencia del escaneo, y su salida "Ver el Dashboard" debe
    navegar internamente a `/dashboard` dentro de esta misma Landing (sin
    abrir pestaña nueva ni depender de ninguna variable de entorno —
    CHANGE-26 retiró `VITE_DASHBOARD_URL`).
13. **Execution history de n8n.** Abrir la UI de n8n y confirmar que la
    ejecución del escaneo del paso 12 aparece en el historial, disparada
    por el Webhook Trigger (no por el Schedule Trigger). Anotar el id de
    ejecución como evidencia.

## 6. Plantilla — registro de la corrida

> Copiar esta sección (vacía) a `openspec/changes/<nombre-del-change>/RESULTS.md`
> para cada corrida oficial y completarla ahí. **No** completar acá.

**Fecha:** _______________
**Operador:** _______________
**Entorno:** _______________
**Resultado de `pytest` (fase automatizada):** ____ passed, ____ skipped, ____ failed

### Criterios de aceptación (CHANGE-22)

| # | Criterio | Responsable (test / paso) | Veredicto | Evidencia |
|---|---|---|---|---|
| 1 | Landing Page carga en < 3 s | Runbook §5.1 | | |
| 2 | Muro de auth visible sin sesión | Runbook §5.2 | | |
| 3 | Scan form NO visible sin sesión | Runbook §5.2 | | |
| 4 | Registro con email nuevo → modal cierra → scan form visible | Runbook §5.3 | | |
| 5 | Email duplicado → "Este email ya está registrado." | Runbook §5.4 | | |
| 6 | Login incorrecto → "Credenciales incorrectas." | Runbook §5.5 | | |
| 7 | Login correcto → modal cierra → scan form visible | Runbook §5.6 | | |
| 8 | Recarga con sesión activa → scan form sigue visible | Runbook §5.7 | | |
| 9 | "Cerrar sesión" → vuelve el muro de auth | Runbook §5.8 | | |
| 10 | Formulario valida campos inválidos | Runbook §5.9 | | |
| 11 | "Escanear" deshabilitado sin checkbox ético | Runbook §5.10 | | |
| 12 | `POST /scan/start` sin JWT → 401 + mensaje visible | `test_scan_without_jwt_returns_401` + Runbook §5.11 | | |
| 13 | `POST /scan/start` con JWT válido → 202 en < 3 s | `test_scan_with_valid_jwt_returns_202_under_3s` | | |
| 14 | Redirección al Dashboard tras el 202 | Runbook §5.12 | | |
| 15 | n8n: ejecución en execution history | Runbook §5.13 | | |
| 16 | PostgreSQL: SELECT en `users` confirma el registro | `test_registered_user_row_exists_in_db` | | |
| 17 | PostgreSQL: SELECT en `scans` confirma el escaneo | `test_scan_row_appears_in_shared_db` | | |
| 18 | Rate limiting: solicitud 11 → 429 | `test_eleventh_request_returns_429` | | |

### Hallazgos (si los hubo)

| Severidad | Descripción | Reproducción | Criterio afectado |
|---|---|---|---|
| | | | |
