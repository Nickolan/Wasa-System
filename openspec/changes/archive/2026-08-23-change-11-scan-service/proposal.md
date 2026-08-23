## Why

Las tres piezas del camino de escaneo ya existen y están archivadas —`scan_schemas.py` (CHANGE-08) define la forma del mensaje, `n8n_repository.py` (CHANGE-09) sabe entregarlo, `scan_unit_of_work.py` (CHANGE-10) sabe abrir y cerrar el canal— pero **nadie las conecta**. `fastapi_bridge/services/scan_service.py` sigue siendo el docstring placeholder del scaffold de CHANGE-00a. Hoy el repo tiene un contrato de datos sin quien lo construya, un mecanismo de entrega sin quien lo dispare y un identificador de escaneo que ningún módulo de producción genera: `uuid` no aparece una sola vez en `fastapi_bridge/` fuera de `.venv`.

Ese hueco es el que traduce una solicitud validada en un escaneo disparado, y sin él RN-WS-07 ("el Bridge no ejecuta herramientas de seguridad: valida y delega al webhook de n8n en modo fire-and-forward") no está implementada por nada. También bloquea CHANGE-12 `scan-router-protected`, que necesita un `ScanService.start_scan` al que delegar para no meter lógica de negocio en el Router — la regla dura más citada del proyecto.

Hay además una regla dura que hoy se cumple sólo por vacuidad: `test_layer_boundaries.py` prohíbe `httpx` y `sqlalchemy` en `services/`, pero `services/` no contiene todavía una sola línea de código de producción, así que la regla no ha protegido nada. Este change es el primero que la pone a prueba de verdad: escribe el módulo que *tendría* la tentación de abrir el cliente HTTP por su cuenta, y demuestra que no hace falta.

## What Changes

- Se implementa **`ScanService`** en `fastapi_bridge/services/scan_service.py`, reemplazando el docstring placeholder. Es la capa de lógica de negocio del disparo de escaneo, con una sola operación pública:
  - `async def start_scan(self, request: ScanRequest) -> ScanResponse`:
    1. **genera** el identificador del escaneo (`str(uuid.uuid4())`) — es la única pieza de información que el Bridge aporta y que no vino del cliente;
    2. **arma** el `N8nPayload` a partir de la `ScanRequest` ya validada más ese identificador, incluida la conversión `str(request.target_url)` que D-5 de CHANGE-08 dejó explícitamente reservada para esta capa;
    3. **delega** la entrega abriendo exactamente un ámbito de recursos por operación: `async with ScanUoW() as uow: await uow.n8n.forward_scan(payload)`;
    4. **retorna** la `ScanResponse` de aceptación (`status="queued"`, mismo `scan_id` que viajó en el payload, mensaje legible) cuando la entrega fue aceptada;
    5. **no captura** `N8nUnavailableError`: la deja propagar intacta hacia el borde HTTP, que en CHANGE-12 la mapeará a 502 RFC 7807.
  - `__init__(self, uow_factory: Callable[[], ScanUoW] = ScanUoW) -> None`: fábrica de ámbitos de recursos inyectable, con `ScanUoW` como valor por defecto. El uso de producción sigue siendo `ScanService()` sin argumentos y el call site sigue siendo literalmente `async with ScanUoW() as uow:`; la inyección existe para que el criterio de aceptación "el test unitario mockea `ScanUoW`" no requiera parchear atributos de módulo (ver D-2 en `design.md` — decisión no obvia, se surfacea para revisión).
- Se agrega **`fastapi_bridge/tests/test_scan_service.py`**: batería unitaria completa con un doble de prueba del ámbito de recursos (nada de red, nada de n8n levantado, ningún `httpx.AsyncClient` real). Cubre: forma y unicidad del identificador, mapeo campo a campo `ScanRequest → N8nPayload`, que el `scan_id` de la respuesta es exactamente el que viajó en el payload, exactamente una entrega por solicitud, propagación de `N8nUnavailableError` con su tipo original, y cierre del ámbito también en el camino de error.
- **Sin cambios de comportamiento HTTP observable**: no se toca `api/v1/scan/router.py`, `main.py`, middlewares, `exceptions/handlers.py` ni `core/settings.py`. El router de scan sigue sin operaciones registradas y sin montarse en la app. Nadie llama a `ScanService` desde código de producción todavía — el primer consumidor es el Router en CHANGE-12.
- No hay breaking changes: el archivo que se reescribe es un placeholder sin importadores de producción.

## Capabilities

### New Capabilities
- `scan-initiation`: define la **iniciación de un escaneo** como acto de negocio — qué produce el Bridge por su cuenta (el identificador único del escaneo), cómo se compone el mensaje al orquestador a partir de una solicitud ya validada, cuántas entregas genera una solicitud, qué respuesta recibe el cliente cuando la entrega fue aceptada, y qué le llega cuando el orquestador no estuvo disponible. Es la pieza que faltaba entre `scan-payload-contract` (**qué forma** tienen los mensajes), `scan-resource-lifecycle` (**quién abre y cierra** el canal) y `scan-forwarding` (**cómo viaja** el mensaje): esta capability define **quién decide iniciar** y **qué se le responde a quien lo pidió**.

### Modified Capabilities
<!-- Ninguna.
     `scan-payload-contract` NO cambia: este change consume `ScanRequest`, `ScanResponse` y
     `N8nPayload` exactamente como los dejó CHANGE-08. Su requirement "El mensaje se deriva de una
     solicitud validada" ya anticipaba a este consumidor; acá se satisface desde el otro lado sin
     alterar un solo requirement. No se agregan campos, métodos ni validadores a los schemas.
     `scan-resource-lifecycle` NO cambia: se consume el contrato de `ScanUoW` tal cual — constructor
     sin argumentos obligatorios, protocolo async context manager, propiedad `n8n`.
     `scan-forwarding` NO cambia: `forward_scan` se llama con su firma actual y su veredicto
     (2xx = aceptación, cualquier otra cosa = `N8nUnavailableError`) se respeta sin reinterpretar.
     `runtime-configuration` NO cambia: no se agrega, quita ni renombra ninguna variable de entorno;
     `test_env_contract.py` (paridad exacta `.env.example` ↔ `Settings`) sigue verde sin tocarlo.
     `api-edge-security`, `bridge-bootstrap` y `landing-bootstrap`: sin contacto. El mapeo a 502
     RFC 7807 y el guard JWT son de CHANGE-12. -->

## Impact

**Código afectado**
- `fastapi_bridge/services/scan_service.py` — se reemplaza el placeholder por la implementación de `ScanService`.
- `fastapi_bridge/tests/test_scan_service.py` — archivo nuevo, tests unitarios.

**Código NO afectado (explícito)**
- `schemas/scan_schemas.py`, `repositories/n8n_repository.py`, `uow/scan_unit_of_work.py`: **no se modifican**. CHANGE-08/09/10 están archivados y sus contratos se consumen tal cual.
- `api/v1/scan/router.py`, `main.py`, `exceptions/`, `core/`, `db/`: sin cambios. El endpoint `POST /api/v1/scan/start` sigue sin existir hasta CHANGE-12.
- `services/auth_service.py`, `uow/auth_unit_of_work.py`: no se tocan. Siguen siendo placeholders de CHANGE-04/CHANGE-02. Este change deja un precedente estructural para el Service (fábrica inyectable con default de producción) que aquél puede seguir o divergir con justificación.
- `fastapi_bridge/tests/test_layer_boundaries.py`: **no se modifica**. Las reglas que este change necesita —`("services", "httpx")` y `("services", "sqlalchemy")`— ya están en la tabla desde antes; lo que cambia es que pasan a proteger código real en vez de un directorio de placeholders. La conveniencia de agregar `("services", "fastapi")` queda planteada como Open Question en `design.md`, no se decide acá: afectaría también a CHANGE-04.
- PostgreSQL `db_fuzzing`: sin contacto. Este change no abre conexiones a base de datos ni toca las tablas existentes `scans`/`vulnerabilities`.
- El workflow de n8n y el Dashboard existente: sin cambios.

**Red y entorno**
- Los tests **no** hacen red real y **no** requieren n8n levantado: el ámbito de recursos se sustituye por un doble de prueba que captura el payload entregado. Ni un `httpx.AsyncClient` real se instancia en toda la suite de este change.
- No se inventan ni se escriben valores de `N8N_WEBHOOK_URL` / `N8N_WEBHOOK_TOKEN`, y ningún test de este change los necesita: al sustituir el ámbito completo, la configuración nunca entra en juego (misma política que `test_env_contract.py`, `test_n8n_repository.py` y `test_scan_unit_of_work.py`).

**Dependencias**
- No se agregan dependencias nuevas, ni de runtime ni de desarrollo. `uuid` es de la biblioteca estándar y `asyncio_mode = auto` en `pytest.ini` permite tests `async def` sin decorador.

**Consumidores aguas abajo (habilitados por este change, no implementados acá)**
- CHANGE-12 `scan-router-protected`: `POST /api/v1/scan/start` llamará a `ScanService().start_scan(request)` detrás de `Depends(get_current_user)` y del rate limit, devolverá 202 con la `ScanResponse` y mapeará `N8nUnavailableError` → 502 RFC 7807. La interfaz se diseña para que ese change **sustituya el `ScanService` completo** en sus tests de router: nota heredada de CHANGE-10 (D-2), `app.dependency_overrides[get_settings]` no alcanza al UoW porque éste resuelve la configuración por su cuenta.

**Seguridad**
- Este change no maneja secretos: no toca `Settings`, no construye headers y no ve el `N8N_WEBHOOK_TOKEN` en ningún momento — la configuración la resuelve `ScanUoW` y la desenvuelve `N8nRepository`.
- El identificador de escaneo se genera con `uuid.uuid4()` (aleatorio), no con un contador ni con `uuid1()` (que filtra dirección MAC y marca de tiempo). No es un secreto ni un token de autorización —la autorización es el JWT de CHANGE-12— pero sí un valor que viaja al orquestador y que un cliente no debe poder predecir ni colisionar.
- `ScanService` no loguea la solicitud entrante: `phpsessid` es una credencial de sesión de la aplicación objetivo y no debe aparecer en logs (ver `design.md`, Risks).

**Governance**
- Nivel **MEDIO**: lógica de negocio del pipeline de escaneo. Se implementa en pasos con checkpoints y se surfacean al usuario las decisiones no obvias (cómo se inyecta/mockea el ámbito de recursos, si el generador de UUID es inyectable, de dónde sale el texto del mensaje de la respuesta, qué se hace con el booleano que devuelve `forward_scan`). No es dominio Auth y no requiere aprobación previa línea por línea.
