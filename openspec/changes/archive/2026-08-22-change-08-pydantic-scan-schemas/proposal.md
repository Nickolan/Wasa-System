## Why

El FastAPI Bridge todavía no tiene un contrato de datos para el escaneo: `fastapi_bridge/schemas/scan_schemas.py` es un placeholder vacío. Sin ese contrato, ninguna de las reglas de negocio que gobiernan el payload de escaneo (RN-WS-02 a RN-WS-05) está codificada en el backend, y toda la cadena de la Fase 2 del roadmap (`09 n8n-repository → 10 scan-unit-of-work → 11 scan-service → 12 scan-router-protected`) está bloqueada porque cada uno de esos changes consume tipos que aún no existen.

Este change define ese contrato como única fuente de verdad de la forma del escaneo: qué entra por la API pública, qué sale hacia el cliente, y qué se reenvía a n8n. Es el primer eslabón de la Fase 2 y no tiene dependencias pendientes (CHANGE-00a ya está archivado).

## What Changes

- Se implementan tres schemas Pydantic v2 en `fastapi_bridge/schemas/scan_schemas.py`, reemplazando el docstring placeholder actual:
  - **`ScanRequest`** — contrato de entrada de `POST /api/v1/scan/start`. Valida `target_url` (URL con esquema `http`/`https`), `phpsessid` (obligatorio, no vacío ni solo espacios), `sqlmap_level` (entero 1..5, default 1) y `sqlmap_risk` (entero 1..3, default 1). Codifica RN-WS-02, RN-WS-03, RN-WS-04 y RN-WS-05.
  - **`ScanResponse`** — contrato de salida del mismo endpoint: `scan_id`, `status` fijo en `"queued"` y `message` legible para el usuario.
  - **`N8nPayload`** — contrato de salida hacia el webhook de n8n: los cuatro campos del `ScanRequest` en forma serializable más el `scan_id` generado por el Bridge.
- Se agrega `fastapi_bridge/tests/test_scan_schemas.py` con la batería de tests unitarios de validación (casos válidos, casos inválidos por campo, defaults y normalización).
- **Sin cambios de comportamiento HTTP observable**: este change NO monta ni modifica ningún router, servicio, repositorio ni dependencia. El endpoint `/api/v1/scan/start` sigue tal como lo dejó el scaffold; recién CHANGE-12 lo conecta a estos schemas.
- No hay breaking changes: el archivo que se toca es un placeholder sin importadores.

## Capabilities

### New Capabilities
- `scan-payload-contract`: define el contrato de datos del escaneo en el FastAPI Bridge — qué constituye una solicitud de escaneo válida (esquema de URL, sesión obligatoria, rangos y defaults de los parámetros SQLMap), qué forma tiene la respuesta de aceptación, y qué forma tiene el payload que el Bridge reenvía al orquestador n8n. Es un contrato de validación y forma, independiente del transporte HTTP y de la mecánica de reenvío (que viven en `api-edge-security` y en los changes 09-12).

### Modified Capabilities
<!-- Ninguna. Ninguna capability existente (api-edge-security, bridge-bootstrap,
     landing-bootstrap, runtime-configuration) cambia sus requirements: este change
     solo agrega un contrato de datos nuevo, sin alterar política de borde,
     bootstrap ni configuración. -->

## Impact

**Código afectado**
- `fastapi_bridge/schemas/scan_schemas.py` — se reemplaza el placeholder por la implementación de los tres schemas.
- `fastapi_bridge/tests/test_scan_schemas.py` — archivo nuevo, tests unitarios.

**Código NO afectado (explícito)**
- `fastapi_bridge/api/v1/scan/router.py`, `services/`, `uow/`, `repositories/`, `core/`, `db/`, `main.py`: sin cambios. Ni una línea fuera de `schemas/` y `tests/`.
- PostgreSQL `db_fuzzing`: sin contacto. Este change no tiene capa de I/O, no abre conexiones, no toca las tablas existentes `scans`/`vulnerabilities`.
- n8n: sin contacto. `N8nPayload` describe la forma del mensaje, no lo envía.

**Dependencias**
- No se agregan dependencias nuevas. `pydantic` v2 ya está en `requirements.txt` desde CHANGE-00a.

**Consumidores aguas abajo (habilitados por este change, no implementados acá)**
- CHANGE-09 `n8n-repository` consume `N8nPayload` en `forward_scan(payload: N8nPayload) -> bool`.
- CHANGE-11 `scan-service` construye el `N8nPayload` a partir del `ScanRequest` y del `scan_id` generado.
- CHANGE-12 `scan-router-protected` usa `ScanRequest` como body y `ScanResponse` como `response_model`.

**Contrato con el frontend**
- Los rangos y defaults definidos acá deben espejarse en el schema Zod del formulario (CHANGE-16, HU-02-02 a HU-02-04). El backend es la autoridad: la validación de Pydantic es la que decide, la de Zod es UX.

**Governance**
- Nivel **BAJO**: schemas Pydantic puros, sin persistencia, sin auth, sin llamadas externas, sin efectos de red. Autonomía plena una vez que los tests pasan.
