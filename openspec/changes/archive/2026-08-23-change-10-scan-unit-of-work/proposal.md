## Why

CHANGE-09 dejó implementado `N8nRepository`, el único punto del sistema que hace I/O contra n8n — pero deliberadamente **no** construye el `httpx.AsyncClient` que necesita para funcionar: lo recibe ya armado y su ciclo de vida es responsabilidad de otro. Hoy ese "otro" no existe. `fastapi_bridge/uow/scan_unit_of_work.py` sigue siendo el docstring placeholder del scaffold de CHANGE-00a, así que **nadie en el repo puede instanciar `N8nRepository` todavía**: el repositorio está escrito, testeado y archivado, y es inalcanzable desde código de producción.

Ese hueco bloquea la cadena entera de la Fase 2 (`11 scan-service → 12 scan-router-protected`) y, con ella, RN-WS-07: el Bridge valida el escaneo pero no lo delega. Además hay una regla dura del proyecto que sin este eslabón no se puede cumplir sin romperla: *"el Service NUNCA instancia `httpx` directamente → siempre a través del UoW correspondiente"*. Sin `ScanUoW`, la única forma de que `ScanService` (CHANGE-11) llegue a n8n sería abrir el cliente él mismo — exactamente lo prohibido.

Este change implementa ese eslabón y nada más: el gobierno del ciclo de vida del canal de comunicación saliente. Sin service, sin router, sin tocar el endpoint HTTP ni el repositorio ya archivado.

## What Changes

- Se implementa **`ScanUoW`** en `fastapi_bridge/uow/scan_unit_of_work.py`, reemplazando el docstring placeholder. Es un **async context manager** cuya única responsabilidad es abrir y cerrar el canal de comunicación saliente alrededor de una operación de scan:
  - `__init__(self, settings: Settings | None = None) -> None`: resuelve la configuración. Si no se le inyecta una `Settings`, la toma de `core.settings.get_settings()` (la instancia cacheada de la app). Esto permite tanto el uso de producción `async with ScanUoW() as uow:` que fija `CHANGES.md` como la inyección explícita en tests, sin `cache_clear()` ni `monkeypatch`.
  - `__aenter__`: construye el `httpx.AsyncClient` y el `N8nRepository(client, settings)` (firma real confirmada en CHANGE-09, D-1 — el roadmap listaba sólo `client`), y devuelve `self`.
  - `__aexit__`: cierra el cliente con `await client.aclose()` **siempre**, haya o no excepción dentro del bloque, y **no** suprime la excepción: la deja propagar hacia `ScanService`.
  - Propiedad `n8n -> N8nRepository`: expone el repositorio construido. Accederla fuera del contexto (antes de entrar o después de salir) levanta `RuntimeError` con un mensaje explícito, en vez de devolver `None` o reventar con un `AttributeError` opaco.
- Se agrega **`fastapi_bridge/tests/test_scan_unit_of_work.py`**: batería unitaria del ciclo de vida (entrada, salida limpia, salida con excepción, propagación, exposición del repositorio, acceso fuera de contexto). Sin red real: se usa `httpx.MockTransport` cuando hace falta una respuesta, y se inspecciona `client.is_closed` para verificar el cierre.
- Se extiende la tabla `LAYER_IMPORT_RULES` de `fastapi_bridge/tests/test_layer_boundaries.py` con `("uow", "fastapi")`, `("uow", "starlette")` y `("uow", "slowapi")`. La capa UoW pertenece al mismo lado de la frontera que Repository —debe ser usable desde un script sin levantar la app web— y hoy esa regla no está verificada por nada.
- **Sin cambios de comportamiento HTTP observable**: no se toca ningún router, service, `main.py`, middleware, `exceptions/handlers.py` ni `core/settings.py`. `POST /api/v1/scan/start` sigue exactamente como lo dejó el scaffold. Nadie instancia `ScanUoW` en código de producción todavía — el primer consumidor es `ScanService` en CHANGE-11.
- No hay breaking changes: el archivo que se reescribe es un placeholder sin importadores.

## Capabilities

### New Capabilities
- `scan-resource-lifecycle`: define quién gobierna el **ciclo de vida del canal de comunicación saliente** que usa la entrega de escaneos — cuándo se abre, cuándo se cierra, qué garantías de cierre existen ante una salida por excepción, cómo se obtiene la configuración que ese canal y su mecanismo de entrega necesitan, y cómo queda expuesto el mecanismo de entrega al consumidor. Es la contraparte de *gobierno de recursos* de `scan-forwarding`: aquella define **cómo viaja** el mensaje asumiendo un canal ya abierto; ésta define **quién abre y cierra ese canal** y bajo qué garantías.

### Modified Capabilities
<!-- Ninguna.
     `scan-forwarding` NO cambia: su requirement "El canal de comunicación se recibe, no se crea"
     ya anticipaba exactamente a este componente; este change lo satisface desde el otro lado sin
     alterar un solo requirement de esa capability. La firma y el comportamiento de `forward_scan`
     quedan intactos.
     `scan-payload-contract` tampoco cambia: este change no construye ni valida payloads.
     `runtime-configuration` tampoco: no se agrega, quita ni renombra ninguna variable de entorno,
     y `test_env_contract.py` (paridad exacta `.env.example` ↔ `Settings`) sigue verde sin tocarlo.
     `api-edge-security`, `bridge-bootstrap` y `landing-bootstrap`: sin contacto. -->

## Impact

**Código afectado**
- `fastapi_bridge/uow/scan_unit_of_work.py` — se reemplaza el placeholder por la implementación de `ScanUoW`.
- `fastapi_bridge/tests/test_scan_unit_of_work.py` — archivo nuevo, tests unitarios.
- `fastapi_bridge/tests/test_layer_boundaries.py` — tres entradas nuevas en la tabla `LAYER_IMPORT_RULES`.

**Código NO afectado (explícito)**
- `repositories/n8n_repository.py`: **no se modifica**. CHANGE-09 está archivado y su contrato se consume tal cual, incluida la firma `N8nRepository(client, settings)`.
- `services/scan_service.py`, `api/v1/scan/router.py`, `main.py`, `exceptions/`, `core/`, `db/`, `schemas/`: sin cambios.
- `uow/auth_unit_of_work.py`: **no se toca**. Sigue siendo el placeholder de CHANGE-02/CHANGE-04. Este change no establece por decreto la forma de `AuthUoW` — sí deja un precedente estructural que aquél puede seguir o divergir con justificación.
- PostgreSQL `db_fuzzing`: sin contacto. Este change no abre conexiones a base de datos ni toca las tablas existentes `scans`/`vulnerabilities`.
- El workflow de n8n y el Dashboard existente: sin cambios.

**Red y entorno**
- Los tests **no** hacen red real y **no** requieren n8n levantado: el ciclo de vida se verifica inspeccionando `client.is_closed`, y cuando hace falta ejercitar una entrega se monta `httpx.MockTransport`.
- No se inventan ni se escriben valores de `N8N_WEBHOOK_URL` / `N8N_WEBHOOK_TOKEN`: los tests construyen `Settings` con valores de prueba y ninguno assertea credenciales reales (misma política que `test_env_contract.py` y `test_n8n_repository.py`).

**Dependencias**
- No se agregan dependencias nuevas, ni de runtime ni de desarrollo. `httpx>=0.27` ya está en `requirements.txt` y `asyncio_mode = auto` en `pytest.ini` permite tests `async def` sin decorador.

**Consumidores aguas abajo (habilitados por este change, no implementados acá)**
- CHANGE-11 `scan-service`: `ScanService.start_scan` hará `async with ScanUoW() as uow: await uow.n8n.forward_scan(payload)`. La interfaz se diseña pensando en que ese change **mockee** el UoW: superficie mínima (constructor sin argumentos obligatorios, `__aenter__`/`__aexit__`, una sola propiedad `n8n`), fácil de sustituir por un doble de prueba.
- CHANGE-12 `scan-router-protected`: mapea `N8nUnavailableError` —que este change deja propagar sin tocar— a 502 RFC 7807.

**Seguridad**
- Este change no maneja el secreto directamente: pasa la instancia de `Settings` al repositorio, que es quien desenvuelve `N8N_WEBHOOK_TOKEN` sólo para el header (D-8 de CHANGE-09). `ScanUoW` **no** loguea, no imprime ni incluye la configuración en ninguna representación textual, y no define un `__repr__` que pudiera exponerla.
- Cierre garantizado del cliente = sin sockets colgados por request fallida. Un `AsyncClient` que no se cierra es una fuga de descriptores de archivo que, bajo carga, degrada el proceso entero — por eso el cierre ante excepción es un criterio de aceptación y no un detalle de implementación.

**Governance**
- Nivel **MEDIO**: gobierno de ciclo de vida de un recurso de infraestructura. Se implementa en pasos con checkpoints y se surfacean al usuario las decisiones no obvias (de dónde sale la `Settings` cuando no se inyecta, si el `AsyncClient` lleva timeout propio, qué pasa si `aclose()` falla mientras ya hay una excepción en vuelo, guarda de acceso fuera de contexto). No es dominio Auth y no requiere aprobación previa línea por línea.
