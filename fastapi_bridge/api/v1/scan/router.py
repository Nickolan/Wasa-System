"""Router del dominio `scan` — sin operaciones registradas todavía (D-8).

Responsabilidad futura: `POST /start`, protegido por `Depends(get_current_user)`,
delegando toda lógica a `services/scan_service.py`. El Router NUNCA contiene lógica
de negocio (regla dura del proyecto); sólo orquesta `Depends` y llama al Service.

Este módulo existe para que el import y el prefijo ya estén decididos, pero
`fastapi_bridge/main.py` NO lo monta (`include_router`) hasta CHANGE-12.
"""

from fastapi import APIRouter

router = APIRouter(prefix="/api/v1/scan", tags=["scan"])
