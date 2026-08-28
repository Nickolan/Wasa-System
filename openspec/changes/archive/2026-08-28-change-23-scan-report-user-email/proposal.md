## Why

Hoy el reporte de vulnerabilidades que emite el workflow de n8n al terminar un escaneo llega
siempre a la misma casilla: el nodo `Send email` tiene el destinatario (`toEmail`) escrito a
mano como literal fijo (`tu-correo@example.com`), sin importar qué usuario disparó el escaneo.
El Bridge ya sabe quién es ese usuario —`get_current_user` resuelve su email desde el JWT en
cada `POST /api/v1/scan/start`— pero ese dato se descarta: el router lo resuelve y no lo
reenvía al Service, y el mensaje que viaja al orquestador no lo transporta. El resultado es que
el usuario que pidió el escaneo no se entera de sus propios hallazgos salvo que entre al
Dashboard, y quien administra la casilla fija recibe reportes de escaneos ajenos.

Este change cierra ese hueco de punta a punta: el email del usuario autenticado viaja con el
escaneo hasta n8n, y n8n envía el reporte a esa dirección. (HU-04-03, RN-WS-16, DD-05.)

## What Changes

- **`N8nPayload` gana un sexto campo obligatorio `email: str`** — el email del usuario
  autenticado que inició el escaneo. El contrato del mensaje al orquestador deja de tener
  cinco campos y pasa a tener seis.
- **`ScanService.start_scan` gana un segundo parámetro obligatorio** con el email del usuario
  autenticado (`start_scan(self, request: ScanRequest, user_email: str) -> ScanResponse`) y lo
  incluye al componer el `N8nPayload`. **BREAKING** para los llamadores internos: toda llamada
  existente a `start_scan` con un único argumento deja de compilar/pasar (router de producción
  y suites de tests que hoy invocan `start_scan(request)`). No es breaking para ningún cliente
  HTTP: el contrato de entrada y el de salida del endpoint no cambian.
- **El router `POST /api/v1/scan/start` reenvía `current_user` al Service** — el valor que ya
  resuelve `Depends(get_current_user)` y hoy descarta. Sigue siendo cableado puro: no lee, no
  valida ni transforma el email.
- **`ScanRequest` NO cambia** y explícitamente **no** gana ningún campo de email: el cliente
  nunca puede elegir ni sobrescribir el destinatario del reporte (RN-WS-16, DD-05). La
  ausencia de ese campo es una garantía verificada por tests, no un olvido.
- **Workflow n8n (`Herramientas/Flujo_Fuzzing_N8N.json`)**:
  - Nodo `URL Ejemplo` (único punto de normalización del flujo): propaga
    `email: webhookPayload.email` en la rama disparada por Webhook, con fallback por variable
    de entorno (`WASA_NOTIFICATION_EMAIL`) para la rama Manual/Schedule usada en las corridas
    de prueba, siguiendo el mismo patrón que ya usa para `ZAP_API_KEY` / `WASA_PHPSESSID`.
  - Nodo `Send email`: `toEmail` deja de ser el literal fijo y pasa a resolverse por expresión
    contra el email propagado.
- **`N8nRepository` NO cambia**: `forward_scan` serializa `payload.model_dump(mode="json")`
  genéricamente, así que el nuevo campo viaja solo. Se verifica, no se modifica.
- **No se agregan rutas, códigos de estado ni caminos de error nuevos.** El endpoint sigue
  respondiendo `202` / `401` / `422` / `429` / `502` exactamente como hoy.

## Capabilities

### New Capabilities

Ninguna. Este change no introduce una capacidad nueva: extiende cuatro capacidades ya
existentes del camino de escaneo.

### Modified Capabilities

- `scan-payload-contract`: el contrato del mensaje al orquestador pasa de cinco a seis campos
  obligatorios (se agrega el email del usuario autenticado); se declara además que el contrato
  de solicitud del cliente SHALL NOT admitir ningún campo de destinatario.
- `scan-initiation`: la composición del mensaje deja de derivarse exclusivamente de la
  solicitud validada más el identificador generado, y pasa a incorporar también la identidad
  autenticada que la iniciación recibe de su llamador — nunca un valor tomado de la solicitud.
- `scan-endpoint`: el borde HTTP SHALL reenviar a la iniciación la identidad autenticada que
  el guard ya resuelve, en vez de descartarla.
- `orchestrator-scan-webhook`: el email SHALL quedar disponible como variable para los nodos
  downstream, y el envío del reporte SHALL dirigirse a esa dirección en vez de a un
  destinatario fijo embebido en el workflow.

## Impact

**Código del Bridge (3 archivos de producción):**

- `fastapi_bridge/schemas/scan_schemas.py` — `N8nPayload` agrega `email: str`. `ScanRequest`
  intocado.
- `fastapi_bridge/services/scan_service.py` — `start_scan` agrega el parámetro `user_email` y
  lo pasa a `N8nPayload`.
- `fastapi_bridge/api/v1/scan/router.py` — `service.start_scan(scan_request, current_user)`.

**Tests existentes que deben actualizarse (rompen por la firma nueva):**

- `fastapi_bridge/tests/test_scan_service.py` — toda invocación `start_scan(build_request())`
  y el test que fija el conjunto exacto de claves del payload en cinco.
- `fastapi_bridge/tests/test_scan_router.py` — el doble `FakeScanService.start_scan`.
- `fastapi_bridge/tests/test_scan_schemas.py` — construcciones de `N8nPayload` sin `email`.

**Fuera del Bridge:**

- `Herramientas/Flujo_Fuzzing_N8N.json` — nodos `URL Ejemplo` y `Send email`. ⚠️ Editar este
  archivo en el repo NO actualiza por sí solo la instancia de n8n que corre el workflow; ver
  Open Question O-1 en `design.md`.
- Variable de entorno nueva **sólo del lado de n8n**: `WASA_NOTIFICATION_EMAIL` (fallback de
  la rama Manual/Schedule). El Bridge no la conoce ni la necesita: su `core/settings.py` no
  cambia.

**Sin impacto:**

- Frontend (`wasa-landing/`): el formulario de escaneo no cambia — no hay campo de email que
  agregar, precisamente por RN-WS-16.
- `fastapi_bridge/repositories/n8n_repository.py`, `uow/scan_unit_of_work.py`,
  `core/dependencies.py`, `core/settings.py`, `exceptions/`: sin cambios.
- Base de datos `db_fuzzing`: sin migraciones, sin tablas nuevas.
