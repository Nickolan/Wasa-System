"""Handlers globales de excepción RFC 7807.

Responsabilidad: registrar `exception_handler`s en `main.py` que transforman toda
excepción de la API (validación, negocio, infraestructura) al formato uniforme
RFC 7807 (`type`, `title`, `status`, `detail`, `instance`). Ningún error de la API
SHALL retornarse fuera de este formato (regla dura del proyecto).

`problem_detail_response(...)` es el **punto único** de construcción de ese
formato para todo el proyecto (CHANGE-00d, D-6). CHANGE-07 reutiliza este
helper para los handlers restantes (`RequestValidationError`, `HTTPException`
genérica, `Exception` -> 500): debe **extender** este módulo, no reescribirlo.
"""

from slowapi.errors import RateLimitExceeded
from starlette.requests import Request
from starlette.responses import JSONResponse

from fastapi_bridge.core.settings import get_settings

# Literales RFC 7807 centralizados: único lugar del proyecto que los declara.
# CHANGE-07 reutiliza estas constantes en sus propios handlers en vez de
# repetir los strings.
PROBLEM_DETAIL_MEDIA_TYPE = "application/problem+json"
DEFAULT_PROBLEM_TYPE = "about:blank"
DEFAULT_PROBLEM_TITLE = "Error"


def problem_detail_response(
    *,
    status_code: int,
    instance: str,
    detail: str | None = None,
    title: str = DEFAULT_PROBLEM_TITLE,
    type_: str = DEFAULT_PROBLEM_TYPE,
) -> JSONResponse:
    """Constructor único de respuestas RFC 7807 Problem Details.

    Todo handler de excepción de la API (este módulo, y los que CHANGE-07
    agregue) debe construir su respuesta a través de esta función — nunca
    devolver un error en un formato distinto (regla dura del proyecto).
    """
    body = {
        "type": type_,
        "title": title,
        "status": status_code,
        "detail": detail,
        "instance": instance,
    }
    return JSONResponse(status_code=status_code, content=body, media_type=PROBLEM_DETAIL_MEDIA_TYPE)


RATE_LIMIT_PROBLEM_TYPE = "https://wasa.dev/errors/rate-limit-exceeded"
RATE_LIMIT_PROBLEM_TITLE = "Too Many Requests"
RATE_LIMIT_PROBLEM_DETAIL = "Se excedió el límite de solicitudes permitidas para este endpoint."


async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """Handler de `RateLimitExceeded` -> 429 RFC 7807 con `Retry-After` (D-6, D-7).

    Deliberadamente **no** delega en el handler por defecto ni en ningún
    atributo con guion bajo (API interna) de la librería de rate limiting —
    ambos son detalles de implementación de una dependencia de terceros.
    `Retry-After` se calcula desde `settings.RATE_LIMIT_WINDOW` para que esté
    **siempre** presente, sin depender de una bandera de configuración de esa
    librería ni de estado interno seteado por su middleware.
    """
    settings = get_settings()
    response = problem_detail_response(
        status_code=429,
        instance=request.url.path,
        detail=RATE_LIMIT_PROBLEM_DETAIL,
        title=RATE_LIMIT_PROBLEM_TITLE,
        type_=RATE_LIMIT_PROBLEM_TYPE,
    )
    response.headers["Retry-After"] = str(settings.RATE_LIMIT_WINDOW)
    return response
