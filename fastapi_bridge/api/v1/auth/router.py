"""Router HTTP del dominio `auth` (CHANGE-05) — `POST /register` y `POST /login`.

Ambas operaciones delegan toda la lógica de negocio a `AuthService`
(`services/auth_service.py`), inyectado por `Depends(get_auth_service)`
(`core/dependencies.py`). El Router NUNCA contiene lógica de negocio (regla
dura del proyecto): cada handler es una línea que llama al Service y
devuelve su resultado.

**Sin `try/except` (D-2).** `EmailAlreadyExistsError` e
`InvalidCredentialsError` se propagan sin capturar hasta `domain_error_handler`
(CHANGE-07), registrado sobre `DomainError` en `create_app()`. Capturar acá y
relanzar una `HTTPException` a mano duplicaría `_DOMAIN_ERROR_MAP` en cada
ruta y volvería opcional lo que hoy es estructural: que un 409/401 salga
siempre en RFC 7807 porque nadie lo intercepta antes del handler global.

**Sin logging (D-11).** Ningún handler de este módulo llama a `logging`: el
único dato que podría registrar es el email o la contraseña recibidos, y este
es exactamente el borde donde ambos llegan en texto plano.

**El prefijo se declara una sola vez (D-12).** `/api/v1/auth` vive en el
`APIRouter` de este módulo; `main.py` lo monta con `include_router(router)`
**sin** pasar `prefix` de nuevo — hacerlo produciría
`/api/v1/auth/api/v1/auth/...`.

**Nota para CHANGE-06 (D-4).** Ambas rutas reciben cuerpo JSON
(`UserRegister`/`UserLogin`), no `OAuth2PasswordRequestForm`. El
`tokenUrl="/api/v1/auth/login"` que CHANGE-06 declare en su
`OAuth2PasswordBearer` sigue siendo válido como referencia de la ruta, pero
el botón "Authorize" de `/docs` no va a funcionar contra un endpoint que
espera JSON en vez de `application/x-www-form-urlencoded`. No es un bug: es
el trade-off documentado en D-4 de `design.md` para que el contrato real
(JSON, campo `email`) coincida con lo que manda el frontend.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, status

from fastapi_bridge.core.dependencies import get_auth_service
from fastapi_bridge.schemas.auth_schemas import TokenResponse, UserLogin, UserRegister
from fastapi_bridge.schemas.error_schemas import ErrorDetail
from fastapi_bridge.services.auth_service import AuthService

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

# D-7: media type real que emiten los handlers RFC 7807 -- no el
# `application/json` por defecto que FastAPI asumiría para `responses`.
_PROBLEM_JSON = "application/problem+json"


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    response_model=TokenResponse,
    summary="Registra un usuario nuevo y devuelve un token",
    description=(
        "Crea el usuario con la contraseña hasheada y devuelve un token ya "
        "emitido: el registro no obliga a hacer login a continuación."
    ),
    responses={
        409: {
            "model": ErrorDetail,
            "description": "El email ya está registrado.",
            "content": {_PROBLEM_JSON: {}},
        },
        422: {
            "model": ErrorDetail,
            "description": "El cuerpo no cumple el contrato de `UserRegister`.",
            "content": {_PROBLEM_JSON: {}},
        },
    },
)
async def register(
    data: UserRegister,
    service: Annotated[AuthService, Depends(get_auth_service)],
) -> TokenResponse:
    return await service.register(data)


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Autentica un usuario existente y devuelve un token",
    description=(
        "Verifica email y contraseña y devuelve un token. Ante email "
        "inexistente o contraseña incorrecta responde el mismo 401 "
        "indistinguible (RN-WS-12)."
    ),
    responses={
        401: {
            "model": ErrorDetail,
            "description": "Email o contraseña incorrectos.",
            "content": {_PROBLEM_JSON: {}},
        },
        422: {
            "model": ErrorDetail,
            "description": "El cuerpo no cumple el contrato de `UserLogin`.",
            "content": {_PROBLEM_JSON: {}},
        },
    },
)
async def login(
    data: UserLogin,
    service: Annotated[AuthService, Depends(get_auth_service)],
) -> TokenResponse:
    return await service.login(data)
