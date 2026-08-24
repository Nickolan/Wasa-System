## Why

La cadena de escaneo está completa por dentro y **muerta por fuera**. `ScanRequest`/`ScanResponse` (CHANGE-08), `N8nRepository` (CHANGE-09), `ScanUoW` (CHANGE-10) y `ScanService.start_scan` (CHANGE-11) están implementados y archivados, pero ningún cliente puede alcanzarlos: `fastapi_bridge/api/v1/scan/router.py` sigue siendo un `APIRouter` con prefijo y cero operaciones registradas, y `main.py` ni siquiera lo importa. Hoy `POST /api/v1/scan/start` responde `404` — hay un test que lo afirma explícitamente (`test_edge_policy_exclusions.py::test_domain_routers_still_return_404_on_production_app`).

Ese hueco es el borde HTTP del dominio scan, y sin él quedan sin implementar tres reglas de negocio a la vez: **RN-WS-11** (el disparo de escaneo exige JWT válido; sin él, 401), **RN-WS-06** (10 solicitudes por IP cada 60 minutos sobre `/scan/start`; el decorador `scan_rate_limit` que CHANGE-00d dejó listo no está aplicado sobre ninguna ruta de producción) y el tramo final de **RN-WS-07/RN-WS-09** (la aceptación `202` y el mapeo de "el orquestador no respondió" a `502` en formato RFC 7807). También bloquea a todo el frontend de escaneo (CHANGE-18/19/20) y al smoke test E2E (CHANGE-22): no hay endpoint contra el cual apuntar.

Es además el **punto de confluencia** de las dos ramas del backend (Fase 1 Auth y Fase 2 Scan): es el primer módulo del proyecto que consume a la vez el guard JWT de CHANGE-06 y el `ScanService` de CHANGE-11.

## What Changes

- **`fastapi_bridge/api/v1/scan/router.py`** — se registra la única operación del dominio: `POST /start` (ruta absoluta `POST /api/v1/scan/start`, el prefijo ya está en el `APIRouter` existente). El handler:
  - exige autenticación vía `current_user: str = Depends(get_current_user)` (contrato de CHANGE-06: devuelve el email del `sub` del JWT, o lanza `HTTPException(401)`);
  - lleva el decorador `scan_rate_limit` de `core/limiter.py` — es la **primera** ruta de producción del proyecto en tenerlo, y la única que debe tenerlo;
  - recibe el body ya validado como `ScanRequest` (CHANGE-08), sin revalidar nada a mano;
  - delega **toda** la lógica en `await ScanService().start_scan(request)` — sin construir infraestructura, sin `httpx`, sin `Settings`, sin `ScanUoW` (CHANGE-11 D-2: `ScanService()` sin argumentos ya abre su propio ámbito de recursos);
  - devuelve `JSONResponse(status_code=202, content=...)` con la `ScanResponse` **tal cual**, sin transformarla;
  - **no captura** ninguna excepción: `N8nUnavailableError` (CHANGE-09) se mapea a `502` RFC 7807 registrando un `exception_handler` global, no con un `try/except` dentro del Router (regla dura: el Router no contiene lógica).
- **`fastapi_bridge/exceptions/handlers.py`** — se agrega `n8n_unavailable_handler`, construido con el `problem_detail_response(...)` existente (punto único de RFC 7807, CHANGE-00d D-6). No se reescribe ni se toca ningún handler previo.
- **`fastapi_bridge/main.py`** — se monta el router (`include_router(scan_router)`, sin `prefix` porque el router ya lo declara) y se registra el handler de `N8nUnavailableError`.
- **`fastapi_bridge/tests/test_scan_router.py`** (nuevo) — batería de borde HTTP: 202 con JWT válido, 401 sin/expirado, 422 con body inválido, 429 por rate limit, 502 con el orquestador caído, y la presencia del esquema de seguridad en el OpenAPI. **Ningún test hace red real ni levanta n8n**: se sustituye la dependencia completa del `ScanService` y del guard vía `app.dependency_overrides`.
- **Cambio de comportamiento observable (esperado, no breaking para clientes reales)**: `POST /api/v1/scan/start` deja de responder `404`. Dos tests archivados afirman lo contrario y **deben actualizarse** en este change: `test_edge_policy_exclusions.py::test_domain_routers_still_return_404_on_production_app` y el docstring/alcance de `test_app_wiring.py::test_no_production_route_has_a_rate_limit_applied`.
- **NO se implementa `get_current_user`**: es propiedad de CHANGE-06 y este change lo consume como contrato. Ver "Impact → Dependencia no satisfecha".

## Capabilities

### New Capabilities
- `scan-endpoint`: define el **borde HTTP del disparo de escaneo** — que existe una operación de disparo alcanzable por red, que está cerrada a quien no presenta credencial válida, que su cupo por origen es el del dominio scan y no alcanza al resto del servicio, qué código y qué cuerpo recibe quien la invoca con éxito (aceptación, no resultado), qué recibe cuando el orquestador no está disponible, y que el endpoint se documenta como protegido. Es la capa que faltaba **encima** de `scan-initiation` (CHANGE-11, que define el acto de negocio) y que la vuelve alcanzable: aquélla describe *qué decide el Bridge*, ésta describe *quién puede pedírselo y qué se le responde por HTTP*.

### Modified Capabilities
- `bridge-bootstrap`: el requirement "Superficie de API acotada al scaffold" deja de ser cierto para el dominio scan. Su escenario "Sólo /health está expuesto" afirma que la única ruta de aplicación es el health, y "Endpoints de dominio aún no disponibles" que `POST /api/v1/scan/start` responde `404`. Se lo **retira y se lo reemplaza** por "Superficie de API acotada a los dominios ya implementados", que conserva la misma garantía (ningún router se monta antes de que su change lo implemente) enunciada en términos del criterio duradero en vez del estadio temporal del scaffold — un `MODIFIED` no alcanzaba porque el nombre de uno de sus escenarios queda desmentido y los nombres de escenario no se pueden renombrar en un delta.
- `api-edge-security`: el requirement "La política de borde no altera la superficie de API" tiene un escenario ("Los routers de dominio siguen sin montarse") que este change invalida para scan. El requirement "Límite de solicitudes por IP sobre el disparo de escaneos" **no cambia de texto normativo** —ya está escrito en términos del endpoint real— pero deja de estar demostrado sobre una ruta desechable de test (D-8 de CHANGE-00d) para estarlo sobre la ruta de producción; esa exigencia se expresa como requirement nuevo en `scan-endpoint`, no como modificación de aquél.

<!-- NO cambian: `scan-initiation`, `scan-payload-contract`, `scan-resource-lifecycle` y
     `scan-forwarding` se consumen exactamente como los dejaron CHANGE-08/09/10/11: no se agrega
     ni se renombra un campo, ni se altera la firma de `start_scan`, ni se reinterpreta el veredicto
     de `forward_scan`. `runtime-configuration` no cambia: no se agrega, quita ni renombra ninguna
     variable de entorno, y `test_env_contract.py` sigue verde sin tocarse. `landing-bootstrap`:
     sin contacto (este change es 100% backend). -->

## Impact

**Código afectado**
- `fastapi_bridge/api/v1/scan/router.py` — se registra `POST /start` sobre el `APIRouter` existente.
- `fastapi_bridge/exceptions/handlers.py` — se **agrega** el handler de `N8nUnavailableError`; nada existente se modifica.
- `fastapi_bridge/main.py` — `include_router(scan_router)` + `add_exception_handler(N8nUnavailableError, ...)` dentro de `create_app()`.
- `fastapi_bridge/tests/test_scan_router.py` — archivo nuevo.
- `fastapi_bridge/tests/test_edge_policy_exclusions.py` — actualización obligada del test de `404` (ver arriba). Es una modificación de un test archivado, declarada por adelantado y no un descubrimiento del apply.
- `fastapi_bridge/tests/test_app_wiring.py` — revisión del alcance de `test_no_production_route_has_a_rate_limit_applied`.

**Código NO afectado (explícito)**
- `services/scan_service.py`, `uow/scan_unit_of_work.py`, `repositories/n8n_repository.py`, `schemas/scan_schemas.py`, `core/limiter.py`, `core/settings.py`: **no se modifican**. Sus contratos se consumen tal cual.
- `core/security.py` y `core/dependencies.py`: **no se implementan acá**. Son de CHANGE-01/04/06.
- `api/v1/auth/router.py`: sin cambios; sigue sin montarse en este branch.
- PostgreSQL `db_fuzzing`: sin contacto. Este change no abre conexiones a base de datos ni referencia las tablas existentes `scans`/`vulnerabilities`.
- El workflow de n8n y el Dashboard existente: sin cambios.

**Dependencia no satisfecha — bloquea el apply, no el propose**

CHANGES.md declara `CHANGE-12 → depende de CHANGE-11 ✓, CHANGE-00d ✓, CHANGE-06 ✗`. En el árbol de trabajo actual (branch `lauti/c-12-scan-router-protected`, descendiente de `main` + CHANGE-08..11):

- `core/dependencies.py` y `core/security.py` son **docstrings placeholder**: `get_current_user`, `oauth2_scheme` y `decode_access_token` no existen. CHANGE-06 no está implementado en **ninguna** rama del repositorio (existen `origin/niko/c-01..c-05` y `c-07`, pero no `c-06`).
- Los handlers RFC 7807 de `HTTPException` y `RequestValidationError` (CHANGE-07) tampoco están en este árbol: hoy un `401` o un `422` saldrían en el formato por defecto de FastAPI, **no** en RFC 7807. Existen implementados en `origin/niko/c-07-exception-handlers` / `origin/niko/c-05-auth-router`, sin mergear.

Consecuencia: tres de los siete criterios de aceptación de CHANGE-12 (401 sin JWT, 401 expirado, 400/422 RFC 7807) **no son satisfacibles en este branch tal como está**. La decisión sobre cómo proceder está aislada en `design.md` (D-1) y se surfacea para revisión del usuario antes del apply — es la única decisión de este change con nivel de governance ALTO.

**Riesgo de conflicto de merge (coordinación entre agentes)**
- CHANGE-05 (Agente A) también modifica el requirement "Superficie de API acotada al scaffold" de `bridge-bootstrap` y también edita `create_app()` en `main.py`. Ambos deltas son compatibles en contenido (uno monta auth, el otro monta scan) pero tocan las mismas líneas: el segundo en archivarse deberá reconciliar el delta, no sobrescribirlo.
