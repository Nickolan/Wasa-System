## Why

El FastAPI Bridge ya envía el `POST` protegido de disparo de escaneo al webhook del orquestador (CHANGE-12: `scan-forwarding`, header `X-WASA-TOKEN`, cuerpo con los cinco campos del contrato). Pero del lado de n8n todavía no existe la puerta de entrada que reciba ese `POST`: el workflow WASA se dispara hoy por un **Schedule Trigger** (ejecución periódica), no por evento. Sin un Webhook Trigger que reciba el escaneo, autentique el token y arranque el workflow con los datos de la solicitud, el escaneo iniciado por un usuario nunca llega a ejecutarse en el momento que lo pide. Este change cierra esa brecha: convierte el disparo del workflow de periódico a bajo demanda, alineado con lo que el Bridge ya emite (HU-04-01, HU-04-02).

## What Changes

- **En n8n (sistema externo existente, no se reconstruye)**: agregar un nodo **Webhook Trigger** como nueva entrada del workflow WASA, con verbo `POST`, ruta `/webhook/wasa-scan`, autenticación por **Header Auth** sobre `X-WASA-TOKEN` (credencial gestionada por el credential manager de n8n, nunca embebida en parámetros del nodo) y modo de respuesta **Respond Immediately** (200 OK al recibir; el workflow ejecuta en background).
- **Desactivar el nodo Schedule Trigger existente**: el disparo pasa de periódico a por evento; el Schedule queda inactivo, no borrado (reversible).
- **Cablear las variables del webhook a los nodos downstream**: verificar que `$json.target_url`, `$json.phpsessid`, `$json.sqlmap_level`, `$json.sqlmap_risk` y `$json.scan_id` estén disponibles en los nodos que hoy los consumen (ZAP/Nuclei/ffuf, LPUSH a Redis, INSERT en `scans`), reemplazando la fuente que antes proveía el Schedule Trigger.
- **Actualizar `N8N_WEBHOOK_URL`** en el `.env` del FastAPI Bridge para que apunte a la ruta real del Webhook Trigger recién creado. Es un cambio de **valor operativo** (no de contrato): la variable ya está declarada en `runtime-configuration` y el mecanismo de entrega ya la lee tipada desde `settings`.

Este change no toca código de aplicación del Bridge (routers, services, repositorios): el lado emisor ya está implementado y archivado. El grueso del trabajo es **configuración de n8n** más una actualización de un valor de entorno.

## Capabilities

### New Capabilities
- `orchestrator-scan-webhook`: el contrato de la puerta de entrada del orquestador — la operación por la que n8n recibe un disparo de escaneo del Bridge. Define la ruta y verbo aceptados, la exigencia de credencial `X-WASA-TOKEN` (rechazo sin ella), la respuesta inmediata de aceptación (200 OK antes de ejecutar), la disponibilidad de los cinco campos del escaneo para los nodos downstream, y que el disparo por evento reemplaza al disparo periódico. Es la contraparte de recepción de `scan-forwarding` (que define qué envía el Bridge).

### Modified Capabilities
<!-- Ninguna. La actualización de N8N_WEBHOOK_URL es un cambio de valor operativo, no de requisito:
     runtime-configuration ya declara la variable y su lectura tipada, y scan-forwarding ya
     declara que el destino y el header provienen de configuración. Ningún requisito cambia. -->

## Impact

- **Sistema n8n (externo)**: nuevo nodo Webhook Trigger; Schedule Trigger desactivado; recableado de la fuente de datos de los nodos downstream. No es código de este repositorio — es configuración del orquestador ya desplegado.
- **`fastapi_bridge/.env`**: actualización del valor de `N8N_WEBHOOK_URL` a la ruta real del webhook. Sin cambios en `settings.py` ni en el código de entrega.
- **Credential manager de n8n**: alta de la credencial Header Auth `X-WASA-TOKEN`, cuyo valor debe coincidir con `N8N_WEBHOOK_TOKEN` del Bridge.
- **Dependencia satisfecha**: CHANGE-12 (`scan-forwarding`) ya archivado — el Bridge ya emite el `POST` protegido con el header y el cuerpo esperados.
- **Habilita**: CHANGE-22 (`e2e-smoke-test`), que valida el flujo completo registro → login → scan → ejecución en background.
- **Riesgo de gobernanza ALTO**: la puerta de entrada del orquestador es un borde de seguridad (autenticación de webhook, superficie expuesta). Las decisiones de configuración se surfacean en `design.md` para revisión humana antes de aplicar.
