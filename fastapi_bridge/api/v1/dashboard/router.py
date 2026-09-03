"""Router del dominio `dashboard` — borde HTTP de la consulta de resultados (CHANGE-25).

Expone `GET /api/v1/dashboard` (ruta absoluta; el prefijo ya está declarado
en el `APIRouter`). El handler es cableado puro: tres query params
opcionales, un `Depends` y una llamada al Service. El Router NUNCA contiene
lógica de negocio (regla dura del proyecto): no normaliza `severity`, no
decide qué filtros aplicar, no captura ninguna excepción.

**Sin `try/except` (D-7).** Un fallo de la base de datos compartida se deja
propagar hasta `unhandled_exception_handler` (`main.py`), que ya devuelve un
500 RFC 7807 sin filtrar el SQL ni el host.

**Sin autenticación (D-8, `dashboard-endpoint`).** A diferencia de
`api/v1/scan/router.py`, esta ruta no declara `CurrentUserEmail` ni ningún
otro `Depends` de credencial: es una decisión explícita del propietario del
producto, documentada en `design.md` (R-1) y en el spec.

**Sin límite de tasa (D-8).** Ningún decorador `scan_rate_limit` sobre este
handler: el límite del proyecto se aplica exclusivamente por decorador
(CHANGE-00d), así que no aplicarlo alcanza.

**El prefijo se declara una sola vez.** `/api/v1/dashboard` vive en el
`APIRouter` de este módulo; `main.py` lo monta con `include_router(router)`
sin volver a pasar `prefix`.
"""

from fastapi import APIRouter, Depends

from fastapi_bridge.core.dependencies import get_dashboard_service
from fastapi_bridge.schemas.dashboard_schemas import DashboardFilters, DashboardResponse
from fastapi_bridge.services.dashboard_service import DashboardService

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])


@router.get(
    "",
    response_model=DashboardResponse,
    summary="Consulta el estado consolidado de escaneos y vulnerabilidades",
    description=(
        "Devuelve todos los escaneos (siempre completos, ordenados por fecha "
        "ascendente) y las vulnerabilidades, filtradas opcionalmente por "
        "`scan_id`, `severity` y `source`. Operación pública, sin límite de tasa."
    ),
)
async def get_dashboard(
    scan_id: int | None = None,
    severity: str | None = None,
    source: str | None = None,
    service: DashboardService = Depends(get_dashboard_service),
) -> DashboardResponse:
    filters = DashboardFilters(scan_id=scan_id, severity=severity, source=source)
    return await service.get_dashboard(filters)
