> **Modo TDD estricto activo.** Cada tarea de implementación sigue el ciclo
> RED → GREEN → TRIANGULATE → REFACTOR. No se escribe código de producción antes de un test que
> falle. El grupo 0 (red de seguridad) es obligatorio y va primero: los tres módulos que este
> change modifica ya tienen suites existentes, y la firma nueva de `start_scan` (D-2) las rompe
> deliberadamente — sin baseline no se distingue esa rotura esperada de una regresión real.
>
> Comando de referencia del proyecto: `pytest` desde la raíz del repo (`pytest.ini`,
> `testpaths = fastapi_bridge/tests`, `asyncio_mode = auto`).
>
> ✅ **O-1 y O-2 de `design.md` ya están resueltas (2026-08-28)**: el agente edita
> `Herramientas/Flujo_Fuzzing_N8N.json` en el repo durante este `apply` (el usuario lo importa
> después en su instancia real de n8n — el `apply` no toca la instancia en ejecución); el
> respaldo `WASA_NOTIFICATION_EMAIL` es `lautiferreria@gmail.com`. El grupo 4 ya no está
> bloqueado.

## 0. Red de seguridad (obligatoria, antes de tocar cualquier archivo)

- [x] 0.1 Correr `pytest fastapi_bridge/tests/test_scan_schemas.py fastapi_bridge/tests/test_scan_service.py fastapi_bridge/tests/test_scan_router.py -q` y anotar el baseline exacto (`N passed`) en las notas del change; verificar que **todo está en verde** antes de empezar. Si algo falla acá, DETENERSE y reportar el fallo como pre-existente sin arreglarlo.
  - Baseline: **121 passed** (14 warnings de deprecación de `datetime.utcnow()`, preexistentes).
- [x] 0.2 Correr `pytest -q` (suite completo, sin `e2e`) y anotar el total en verde, para tener también el baseline global; verificar que no hay fallos previos fuera de los tres módulos anteriores.
  - Baseline global: **618 passed, 1 skipped** (e2e es opt-in vía `WASA_E2E=1`, no corre por defecto).
- [x] 0.3 Confirmar leyendo `fastapi_bridge/repositories/n8n_repository.py` que `forward_scan` serializa con `payload.model_dump(mode="json")` sin enumerar campos (D-3); verificar que el módulo **no** necesita modificación y dejarlo intacto.
  - Confirmado: `forward_scan` serializa genéricamente. Módulo sin cambios.

## 1. Contrato del mensaje: `N8nPayload` gana `email`

- [x] 1.1 **RED** — En `fastapi_bridge/tests/test_scan_schemas.py`, escribir un test que construya un `N8nPayload` con los seis campos (incluido `email`) y verificar que **falla** con `ValidationError`/`TypeError` porque el campo todavía no existe en el modelo.
  - Falló con `AttributeError: 'N8nPayload' object has no attribute 'email'` (el modelo ignora el kwarg desconocido por `extra="ignore"` implícito de Pydantic v2, no lo rechaza — el fallo real es al leer el atributo, no al construir).
- [x] 1.2 **GREEN** — Agregar `email: str` a `N8nPayload` en `fastapi_bridge/schemas/scan_schemas.py` (D-4: `str`, no `EmailStr`) y verificar que el test de 1.1 pasa.
- [x] 1.3 **TRIANGULATE** — Agregar los casos borde del contrato y verificar que todos pasan: (a) omitir `email` produce `ValidationError` con el campo señalado como requerido; (b) `model_dump(mode="json")` devuelve exactamente las seis claves `{target_url, phpsessid, sqlmap_level, sqlmap_risk, scan_id, email}` con `email` como `str`; (c) el email viaja tal cual, sin normalización ni transformación.
- [x] 1.4 Actualizar las construcciones de `N8nPayload` ya existentes en `test_scan_schemas.py` (4 sitios) y renombrar los tests que dicen "five"/"cinco" para que reflejen los seis campos; verificar que `pytest fastapi_bridge/tests/test_scan_schemas.py -q` queda en verde con al menos el conteo del baseline de 0.1.
  - `pytest fastapi_bridge/tests/test_scan_schemas.py -q` → **47 passed**.
- [x] 1.5 **RED→GREEN** — Escribir un test que verifique que `ScanRequest` **no** declara ningún campo de email (inspección de `model_fields`) y que un `ScanRequest(..., email="atacante@example.com")` descarta ese campo por `extra="ignore"`; verificar que pasa sin modificar `ScanRequest` (es una garantía a fijar, no una función a implementar).
- [x] 1.6 **REFACTOR** — Actualizar el docstring de `N8nPayload` para documentar el origen del `email` (JWT, no cliente — D-1/RN-WS-16) y verificar que la suite del módulo sigue en verde.

## 2. Iniciación: `ScanService.start_scan` recibe y traslada el email

- [x] 2.1 **RED** — En `fastapi_bridge/tests/test_scan_service.py`, escribir un test que llame `await service.start_scan(build_request(), "usuario@test.local")` y verifique que el payload entregado al doble de repositorio lleva `email == "usuario@test.local"`; verificar que **falla** porque la firma actual no acepta el segundo argumento.
  - Falló con `TypeError: ScanService.start_scan() takes 2 positional arguments but 3 were given`.
- [x] 2.2 **GREEN** — Cambiar la firma a `async def start_scan(self, request: ScanRequest, user_email: str) -> ScanResponse` en `fastapi_bridge/services/scan_service.py` (D-2: obligatorio, sin default) y pasar `email=user_email` al construir el `N8nPayload`; verificar que el test de 2.1 pasa.
- [x] 2.3 Actualizar las ~23 invocaciones existentes de `start_scan(...)` en `test_scan_service.py` para pasar un email de prueba (constante `TEST_USER_EMAIL` en el módulo) y actualizar el test que fija el conjunto exacto de claves del payload a las seis del contrato nuevo; verificar que `pytest fastapi_bridge/tests/test_scan_service.py -q` vuelve al verde con conteo ≥ baseline.
  - `pytest fastapi_bridge/tests/test_scan_service.py -q` → **39 passed** (tras 2.3; 34 tras solo actualizar los call sites).
- [x] 2.4 **TRIANGULATE** — Agregar y verificar en verde: (a) dos emails distintos con solicitudes idénticas producen dos payloads con destinatarios distintos; (b) llamar `start_scan` sin el segundo argumento lanza `TypeError` (no continúa con destinatario vacío ni fijo); (c) un campo `email` presente en la `ScanRequest` cruda no influye el `email` del payload — gana siempre el parámetro; (d) el `email` no aparece en `ScanResponse` (ni en `scan_id`, ni en `status`, ni en `message`).
- [x] 2.5 **TRIANGULATE (seguridad)** — Agregar y verificar: el email no aparece en el mensaje de una `N8nUnavailableError` propagada, en el mismo espíritu que el test ya existente del `phpsessid`.
- [x] 2.6 **REFACTOR** — Actualizar el docstring del módulo/método para dejar asentado que el email lo aporta el llamador desde la identidad autenticada y que el Service no lo valida ni lo sustituye (D-1/D-2); correr los tests de pureza de capa ya existentes (`test_scan_service_module_does_not_import_...`) y verificar que siguen en verde.

## 3. Borde HTTP: el router reenvía la identidad autenticada

- [x] 3.1 **RED** — En `fastapi_bridge/tests/test_scan_router.py`, actualizar el doble `FakeScanService.start_scan` para que acepte y registre `user_email`, y escribir un test que con `app.dependency_overrides[get_current_user] = lambda: "scan-user@test.com"` dispare un `POST /api/v1/scan/start` válido y verifique que el Service recibió ese email; verificar que **falla** porque el router hoy descarta `current_user`.
  - Falló con `TypeError: FakeScanService.start_scan() missing 1 required positional argument: 'user_email'` (el router llamaba `service.start_scan(scan_request)` con un solo argumento).
- [x] 3.2 **GREEN** — En `fastapi_bridge/api/v1/scan/router.py` cambiar la llamada a `await service.start_scan(scan_request, current_user)` y adoptar la anotación canónica `current_user: CurrentUserEmail` (D-5); verificar que el test de 3.1 pasa. El handler sigue siendo cableado puro: sin lógica, sin validación, sin transformación del email.
- [x] 3.3 **VERIFICACIÓN (D-5)** — Correr los tests de OpenAPI ya existentes (`test_scan_start_declares_a_bearer_security_requirement`, `test_scan_start_declares_202_response_and_request_body_schemas`) y verificar que siguen en verde con la anotación nueva. Si alguno falla, revertir sólo la anotación a `Depends(get_current_user)` dejando intacto el reenvío del email, y verificar de nuevo.
  - Ambos siguen en verde con `CurrentUserEmail`; no fue necesario revertir. (Nota: el módulo tuvo un fallo transitorio de cuota de rate-limit por reusar el host por defecto `10.0.0.9` del test nuevo — corregido asignándole un `client_host` propio, `10.0.0.42`, mismo patrón que `test_rate_limit.py`.)
- [x] 3.4 **TRIANGULATE** — Agregar y verificar en verde: (a) dos overrides distintos de `get_current_user` con cuerpos idénticos producen dos invocaciones del Service con emails distintos; (b) un cuerpo que incluye `"email": "atacante@example.com"` llega al Service con el email del JWT y el valor del atacante no aparece en el payload entregado; (c) un `POST` sin credencial válida sigue devolviendo `401` y **no** alcanza al Service (el test existente `test_no_401_path_reaches_the_fake_scan_service` debe seguir verde).
- [x] 3.5 **TRIANGULATE (no filtración)** — Verificar que el email no aparece en el cuerpo `202` de aceptación, ni en el cuerpo RFC 7807 del `502` de orquestador no disponible, ni en el del `422` de validación — extendiendo el test ya existente que hace esta comprobación para el `phpsessid`.
- [x] 3.6 **VERIFICACIÓN INTEGRAL** — Correr `pytest -q` completo y verificar que el total en verde es ≥ el baseline global de 0.2, sin fallos en ningún otro módulo (auth, e2e no-opt-in, límites de capa).
  - **Desviación encontrada y corregida**: `design.md`/`tasks.md` no listaban `test_n8n_repository.py` ni `test_scan_unit_of_work.py` entre los tests a actualizar, pero ambos construyen `N8nPayload` directamente en su propio helper `build_payload()` y en dos asserts de claves exactas — rotos por el sexto campo obligatorio. Se agregó `email` al fixture y a los dos `assert set(body.keys()) == {...}` de cada archivo (4 ediciones puramente de test, cero cambios de producción; `N8nRepository`/`ScanUoW` quedaron intactos, confirmando D-3). `pytest -q` final: **632 passed, 1 skipped** (≥ baseline 618 passed, 1 skipped).

## 4. Workflow n8n (edición local del export en el repo — O-1/O-2 resueltas)

- [x] 4.1 ~~Confirmar O-1~~ — **Resuelto**: el agente edita `Herramientas/Flujo_Fuzzing_N8N.json` en el repo como parte de este `apply`. El archivo del repo es un export: esta edición no toca la instancia de n8n en ejecución; el usuario se encarga de importarlo después.
- [x] 4.2 ~~Confirmar O-2~~ — **Resuelto**: valor de respaldo `WASA_NOTIFICATION_EMAIL = lautiferreria@gmail.com`.
- [x] 4.3 Nodo `URL Ejemplo`: agregar la constante de respaldo con el helper `getEnv` ya presente en el nodo (`getEnv('WASA_NOTIFICATION_EMAIL', 'lautiferreria@gmail.com')`) y propagar `email` en **las dos** ramas del `jsCode` — la del webhook (`webhookPayload.email ?? respaldo`) y la Manual/Schedule (`respaldo`); verificar sobre el JSON resultante que ambos objetos devueltos incluyen la clave `email`.
- [x] 4.4 Nodo `Send email`: reemplazar `"toEmail": "tu-correo@example.com"` por `"toEmail": "={{ $('URL Ejemplo').first().json.email }}"` (D-6) dejando `fromEmail`, `subject` y `html` intactos (D-7); verificar sobre el JSON que `toEmail` es una expresión y que no queda ningún literal de destinatario en el nodo.
- [x] 4.5 Verificar que el JSON del workflow sigue siendo válido y que el resto del archivo no cambió: parsear el archivo con `json.load` y comparar el diff de git para confirmar que sólo cambian los dos nodos previstos.
  - `python -c "import json; json.load(open(...))"` → válido, 23 nodos. `git diff --stat` → `1 file changed, 2 insertions(+), 2 deletions(-)`: sólo `toEmail` en `Send email` y el `jsCode` de `URL Ejemplo`.
- [ ] 4.6 **Fuera del alcance del `apply` local** (acción del usuario sobre su instancia real de n8n, no del agente): importar el JSON actualizado en la instancia de n8n en ejecución y definir ahí la variable de entorno `WASA_NOTIFICATION_EMAIL=lautiferreria@gmail.com`; verificar en una ejecución manual que el nodo `URL Ejemplo` la resuelve (el `email` aparece en la salida del nodo).

## 5. Verificación de aceptación (contra los criterios de CHANGE-23 en `CHANGES.md`)

- [x] 5.1 Con n8n mockeado (doble de repositorio o receptor HTTP local), disparar un escaneo autenticado y verificar que el cuerpo POST recibido incluye `email` con el valor del usuario que disparó el escaneo.
  - Verificado por la cadena de tests con doble en la capa adyacente (D-9, mismo criterio que el resto del suite: nunca un solo test full-stack, sino un doble por capa con la capa bajo prueba real):
    - `test_scan_router.py::test_service_receives_the_authenticated_user_email` — Router real + JWT real (`get_current_user` real vía override sólo del valor) → Service (doble) recibe el email.
    - `test_scan_service.py::test_start_scan_forwards_the_caller_supplied_email_to_the_payload` — Service real → `N8nPayload` entregado al repositorio (doble) lleva el email.
    - `test_n8n_repository.py::test_forward_scan_body_has_exactly_the_six_contract_keys_as_json` — Repository real + transporte HTTP local mockeado (`mount_mock_transport`) → el cuerpo JSON efectivamente serializado y "enviado" incluye `email`.
  - No se agregó un cuarto test full-stack (Router→Service→UoW→HTTP todo real): el UoW abre su propio `httpx.AsyncClient` internamente (sin punto de inyección expuesto) y el patrón establecido en todo el módulo (`D-9`) es verificar cada frontera de capa por separado, no simular red real de punta a punta.
- [x] 5.2 Verificar los seis criterios de aceptación listados en `CHANGES.md` §CHANGE-23 uno por uno y marcarlos; dejar registrado cuál se verificó por test automático y cuál por inspección manual.
  - Los seis quedaron marcados `[x]` en `CHANGES.md` (ver detalle debajo, en el reporte de la sesión); cinco por test automático, uno (el nodo `Send email` de n8n) por inspección directa del JSON + `git diff` (no hay runtime de n8n en este `apply`, ver 4.5).
- [ ] 5.3 Re-ejercitar manualmente el criterio "POST a /scan/start con JWT válido" del smoke test de CHANGE-22 contra la infraestructura viva y verificar que el reporte llega a la casilla del usuario de prueba, **sin** reabrir ni modificar los criterios ya registrados de CHANGE-22 (nota de CHANGE-23 en `CHANGES.md`).
  - **No ejecutado por el agente**: requiere n8n vivo + el JSON importado + una casilla de correo real para confirmar la recepción — infraestructura fuera del alcance de este `apply`. Queda pendiente para el usuario.
- [x] 5.4 Correr `pytest -q` una última vez y registrar el conteo final en verde; marcar `[x]` el estado de CHANGE-23 en `CHANGES.md`.
  - `pytest -q` final: **632 passed, 1 skipped** (0 fallos, 43 warnings preexistentes de `datetime.utcnow()`). Estado de CHANGE-23 en `CHANGES.md` actualizado a `[~]` (apply ejecutado y verificado automáticamente; 5.3 y CHANGE-22 vivo pendientes; archivado NO ejecutado, requiere autorización explícita separada).

## 6. Revalidación adversarial post-apply (2026-08-28)

Auditoría independiente de los 6 criterios de aceptación, las 8 decisiones de `design.md`,
los 4 delta specs, las reglas duras del proyecto y la integridad del suite. Resultado: los 6
criterios y las 8 decisiones se confirman implementados. Se encontraron y corrigieron tres
problemas, ninguno funcional del camino del email:

- [x] 6.1 **`CHANGES.md` citaba un test inexistente** como evidencia del criterio 1
  (`test_n8n_payload_accepts_and_exposes_the_email_field`). Corregido a los tests que
  realmente existen: `test_n8n_payload_valid_with_all_six_fields`,
  `test_n8n_payload_missing_email_is_required_error` y
  `test_n8n_payload_serializes_to_exactly_six_keys_with_plain_string_url_and_email`. Se
  verificaron uno por uno los 7 nombres de test citados en los criterios: los otros 6
  existen.
- [x] 6.2 **La tarea 3.4(b) afirmaba más de lo que el test asertaba**:
  `test_an_email_field_in_the_request_body_does_not_reach_the_service_as_the_recipient`
  verificaba el destinatario y el cuerpo de la respuesta, pero no que el valor del atacante
  no llegara al Service por la vía de la `ScanRequest`. Agregadas las dos aserciones
  faltantes (`not hasattr(received, "email")` y ausencia del valor en `received.model_dump()`).
- [x] 6.3 **Landmine de rate limit en `test_scan_router.py`** (preexistente a CHANGE-23, ya
  observado una vez durante 3.3): el singleton de módulo `limiter` comparte almacenamiento
  en memoria en toda la sesión de pytest, y los ~10 tests del módulo que alcanzan el handler
  desde el `client_host` por defecto (`10.0.0.9`) consumían **exactamente 10/10** del cupo de
  producción antes de la sección 9 — cero margen. Medido con una sonda sobre
  `limiter._storage.storage`. Corregido con una fixture `autouse` (`_isolated_scan_quota`)
  que hace `limiter.reset()` antes y después de cada test del módulo; la sonda tras el
  arreglo mide **1/10**. No debilita la cobertura de la sección 9 (ejercita el cupo dentro de
  un mismo test) ni de 9.7 (`reset()` no toca `_dynamic_route_limits`).
- [x] 6.4 Consistencia de la KB: se corrigieron los conteos ya desactualizados que CHANGE-23
  volvió a mover — `RN-WS-01..15` → `RN-WS-01..16` y `24 historias` → `27 historias` en
  `CLAUDE.md`, `AGENTS.md` y `knowledge-base/README.md`.
- [x] 6.5 Verificado con `json.load` + comparación estructural contra `HEAD` que en
  `Herramientas/Flujo_Fuzzing_N8N.json` **sólo** cambian los nodos `URL Ejemplo` y
  `Send email` (23 nodos, `connections`/`pinData`/`settings`/resto idénticos), que `email`
  está presente en **las dos** ramas de `URL Ejemplo`, y que `URL Ejemplo` es ancestro real
  de `Send email` (3 caminos, todos vía `AddHTML`) — la expresión
  `$('URL Ejemplo').first().json.email` resuelve. `pinData` está vacío, así que ningún nodo
  fijado puede shadowear la salida de `URL Ejemplo`.
- [x] 6.6 `pytest -q` corrido dos veces tras las correcciones: **632 passed, 1 skipped** en
  ambas (conteo estable). `openspec validate change-23-scan-report-user-email --strict`: OK.
