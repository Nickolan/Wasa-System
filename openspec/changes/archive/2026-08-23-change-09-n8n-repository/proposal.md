## Why

CHANGE-08 dejó definido *qué forma* tiene el mensaje que el Bridge le manda al orquestador (`N8nPayload`), pero no hay nada que lo **entregue**: `fastapi_bridge/repositories/n8n_repository.py` sigue siendo el docstring placeholder del scaffold de CHANGE-00a. Hoy el FastAPI Bridge no tiene una sola línea de código capaz de hablar con n8n.

Ese hueco bloquea el resto de la Fase 2 en cadena (`10 scan-unit-of-work → 11 scan-service → 12 scan-router-protected`) y, con ella, el criterio central del sistema: RN-WS-07 dice que el Bridge no ejecuta herramientas de seguridad, sólo valida y **delega** al webhook de n8n. Sin el delegador, el Bridge valida y no delega nada.

Este change implementa exactamente ese eslabón —el único punto del sistema que hace I/O contra n8n— y nada más: sin UoW, sin service, sin router, sin tocar el endpoint HTTP.

## What Changes

- Se implementa **`N8nRepository`** en `fastapi_bridge/repositories/n8n_repository.py`, reemplazando el docstring placeholder:
  - Constructor: recibe el `httpx.AsyncClient` cuyo ciclo de vida gobierna el `ScanUoW` (CHANGE-10) y la instancia de `Settings` con la configuración del webhook. El repositorio **no** crea ni cierra el cliente, y **no** lee `os.environ`.
  - `async def forward_scan(payload: N8nPayload) -> bool`: hace `POST` del payload serializado a `settings.N8N_WEBHOOK_URL`, autenticado con el header `X-WASA-TOKEN` tomado de `settings.N8N_WEBHOOK_TOKEN`, con un límite de espera de 10 segundos. Devuelve `True` cuando n8n acepta el disparo (200 OK); levanta `N8nUnavailableError` cuando n8n responde cualquier otra cosa o cuando no responde a tiempo / no es alcanzable.
- Se agrega **`fastapi_bridge/exceptions/errors.py`**: módulo nuevo con las excepciones de dominio del Bridge, empezando por `N8nUnavailableError`. Es Python puro, sin imports de framework, para que la capa Repository pueda levantarla sin violar su regla de pureza (`exceptions/handlers.py` importa Starlette y slowapi, y por eso **no** puede ser el hogar de esta excepción).
- Se agrega **`fastapi_bridge/tests/test_n8n_repository.py`**: batería unitaria con n8n simulado mediante `httpx.MockTransport` (sin dependencias nuevas y sin red real).
- Se extiende la tabla `LAYER_IMPORT_RULES` de `fastapi_bridge/tests/test_layer_boundaries.py` para que `repositories/` tampoco pueda importar `starlette` ni `slowapi`, no sólo `fastapi`. La regla dura del proyecto ("el Repository no importa nada del framework web") queda así verificada de punta a punta.
- **Sin cambios de comportamiento HTTP observable**: ningún router, service, UoW, `main.py` ni middleware se toca. `/api/v1/scan/start` sigue exactamente como lo dejó el scaffold. Nadie instancia todavía `N8nRepository` en código de producción — el primer consumidor es `ScanUoW` en CHANGE-10.
- No hay breaking changes: el archivo que se reescribe es un placeholder sin importadores.

## Capabilities

### New Capabilities
- `scan-forwarding`: define cómo el Bridge **entrega** un escaneo ya validado al orquestador n8n — a dónde va el mensaje, cómo se autentica, cuánto se espera, qué cuenta como aceptación y qué cuenta como indisponibilidad, y qué garantías de aislamiento (secreto que no se filtra, capa que no conoce el framework web) rodean esa entrega. Es la contraparte de transporte de `scan-payload-contract`: aquella define la *forma* del mensaje, ésta define su *entrega*.

### Modified Capabilities
<!-- Ninguna. `scan-payload-contract` sigue igual: este change consume `N8nPayload` tal
     como está, sin cambiar ni un requirement de su contrato. `api-edge-security`,
     `bridge-bootstrap`, `landing-bootstrap` y `runtime-configuration` tampoco cambian:
     no se toca política de borde, ni bootstrap de la app, ni el contrato de `.env`
     (`N8N_WEBHOOK_URL` y `N8N_WEBHOOK_TOKEN` ya existen en `Settings` desde CHANGE-00c). -->

## Impact

**Código afectado**
- `fastapi_bridge/repositories/n8n_repository.py` — se reemplaza el placeholder por la implementación de `N8nRepository`.
- `fastapi_bridge/exceptions/errors.py` — archivo nuevo, excepciones de dominio.
- `fastapi_bridge/tests/test_n8n_repository.py` — archivo nuevo, tests unitarios.
- `fastapi_bridge/tests/test_layer_boundaries.py` — una línea nueva en la tabla de reglas (dos entradas: `starlette`, `slowapi`).

**Código NO afectado (explícito)**
- `api/v1/scan/router.py`, `services/scan_service.py`, `uow/scan_unit_of_work.py`, `main.py`, `core/`, `db/`, `schemas/`: sin cambios.
- `exceptions/handlers.py`: **no se modifica**. El mapeo `N8nUnavailableError → 502 RFC 7807` es de CHANGE-12, no de este change. Acá sólo nace la excepción.
- PostgreSQL `db_fuzzing`: sin contacto. Este change no abre conexiones a base de datos ni toca las tablas existentes `scans`/`vulnerabilities`.
- El workflow de n8n (`Flujo_Fuzzing_N8N.json`) y el Dashboard existente: sin cambios. Este change es cliente del webhook, no lo modifica.

**Red y entorno**
- Los tests **no** hacen red real: n8n se simula con `httpx.MockTransport`, que intercepta a nivel de transporte del propio `httpx`. La suite corre offline y sin n8n levantado.
- No se inventan ni se escriben valores de `N8N_WEBHOOK_URL` / `N8N_WEBHOOK_TOKEN`: el código los toma de `Settings`, que ya los lee del `.env` real del servidor. Ningún test asserta un valor real de credencial (misma política que `test_env_contract.py`).

**Dependencias**
- No se agregan dependencias nuevas, ni de runtime ni de desarrollo. `httpx>=0.27` ya está en `requirements.txt` desde CHANGE-00a y trae `MockTransport` en su API pública — no hace falta `respx`.

**Consumidores aguas abajo (habilitados por este change, no implementados acá)**
- CHANGE-10 `scan-unit-of-work`: `ScanUoW.__aenter__` instancia el `httpx.AsyncClient` y el `N8nRepository`, y expone `uow.n8n`.
- CHANGE-11 `scan-service`: llama `uow.n8n.forward_scan(payload)` y propaga `N8nUnavailableError`.
- CHANGE-12 `scan-router-protected`: mapea `N8nUnavailableError` a 502 RFC 7807 (mensaje de usuario: "El sistema de escaneo no está disponible", Flujo 3 de la KB).

**Seguridad**
- `N8N_WEBHOOK_TOKEN` es `SecretStr` en `Settings`. El repositorio lo desenvuelve únicamente para construir el header y **nunca** lo escribe en logs, en mensajes de excepción ni en el `repr` de nada. El mensaje de `N8nUnavailableError` no incluye ni el token ni el cuerpo de la respuesta de n8n.

**Governance**
- Nivel **MEDIO**: es un adaptador de I/O saliente hacia infraestructura, con manejo de un secreto. Se implementa en pasos con checkpoints y se surfacean al usuario las decisiones no obvias (forma de inyección de `Settings`, estrictez del 200 OK, dónde vive la excepción, alcance del timeout). No es dominio Auth y no requiere aprobación previa línea por línea.
