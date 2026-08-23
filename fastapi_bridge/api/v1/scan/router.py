"""Router del dominio `scan` — sin operaciones registradas todavía (D-8).

Responsabilidad futura: `POST /start`, protegido anotando
`user_email: CurrentUserEmail` (alias de `Depends(get_current_user)`
declarado en `core/dependencies.py`, CHANGE-06, D-6) — no
`Depends(oauth2_scheme)`, que devuelve el token sin validar. La firma de
`get_current_user` ya existe y está probada (CHANGE-06): resuelve el email
del usuario autenticado o lanza `HTTPException(401)` RFC 7807/6750, sin
consultar la base de datos. Delegando toda lógica a `services/scan_service.py`.
El Router NUNCA contiene lógica de negocio (regla dura del proyecto); sólo
orquesta `Depends` y llama al Service.

Este módulo existe para que el import y el prefijo ya estén decididos, pero
`fastapi_bridge/main.py` NO lo monta (`include_router`) hasta CHANGE-12.
"""

from fastapi import APIRouter

router = APIRouter(prefix="/api/v1/scan", tags=["scan"])
