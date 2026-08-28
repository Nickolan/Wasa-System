"""Router del dominio `scan` — borde HTTP del disparo de escaneos (CHANGE-12).

Expone `POST /start` (ruta absoluta `POST /api/v1/scan/start`, el prefijo ya
está declarado en el `APIRouter`). El handler es cableado puro: `Depends` +
una llamada al Service + un `JSONResponse`. El Router NUNCA contiene lógica
de negocio (regla dura del proyecto): no construye infraestructura, no
captura excepciones, no valida nada a mano.

`N8nUnavailableError` no se captura acá: se mapea a `502` por un
`exception_handler` global registrado en `main.py` (D-2), no por un
`try/except` local.
"""

from fastapi import APIRouter, Depends, Request
from starlette.responses import JSONResponse

from fastapi_bridge.core.dependencies import CurrentUserEmail, get_scan_service
from fastapi_bridge.core.limiter import scan_rate_limit
from fastapi_bridge.schemas.scan_schemas import ScanRequest, ScanResponse
from fastapi_bridge.services.scan_service import ScanService

router = APIRouter(prefix="/api/v1/scan", tags=["scan"])


@router.post("/start", status_code=202, response_model=ScanResponse)
@scan_rate_limit
async def start_scan(
    request: Request,
    scan_request: ScanRequest,
    current_user: CurrentUserEmail,
    service: ScanService = Depends(get_scan_service),
) -> JSONResponse:
    response = await service.start_scan(scan_request, current_user)
    return JSONResponse(status_code=202, content=response.model_dump(mode="json"))
