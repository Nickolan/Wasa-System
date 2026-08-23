"""Handlers globales de excepción RFC 7807.

Responsabilidad: registrar `exception_handler`s en `main.py` que transforman toda
excepción de la API (validación, negocio, infraestructura) al formato uniforme
RFC 7807 (`type`, `title`, `status`, `detail`, `instance`). Ningún error de la API
SHALL retornarse fuera de este formato (regla dura del proyecto) -- incluidos
los que genera el propio framework (404, 405) y los que nadie previó.

`problem_detail_response(...)` es el **punto único** de construcción de ese
formato para todo el proyecto (CHANGE-00d), y arma el cuerpo instanciando
`ErrorDetail` (`schemas/error_schemas.py`) en vez de un `dict` literal
(CHANGE-07, D-1): es la única declaración de la forma del error, y sus
restricciones (p. ej. `status` entre 100 y 599) alcanzan a lo que
efectivamente se emite.

El módulo quedó, tras CHANGE-07, con cinco handlers y una tabla de mapeo:
- `rate_limit_exceeded_handler` (`RateLimitExceeded` -> 429, CHANGE-00d).
- `request_validation_exception_handler` (`RequestValidationError` -> 422 o
  400 según D-2; compone el `detail` con `_format_validation_detail`, D-7).
- `http_exception_handler` (`starlette.exceptions.HTTPException` -> el
  estado propio de la excepción; cubre también 404/405, D-3).
- `domain_error_handler` (`DomainError` -> estado vía `_DOMAIN_ERROR_MAP`,
  D-4). **Punto de extensión para CHANGE-11**: un `DomainError` de negocio
  futuro (p. ej. el 502 del cliente n8n) se agrega como una fila nueva en
  `_DOMAIN_ERROR_MAP`, no como un handler nuevo -- el `exception_handler` ya
  está registrado sobre la base y cubre cualquier subclase.
- `unhandled_exception_handler` (`Exception` -> 500 opaco, D-5).

Los cinco se registran en `create_app()` (`main.py`), no a nivel de módulo
(D-10).
"""

import http
import logging

from fastapi.exceptions import RequestValidationError
from slowapi.errors import RateLimitExceeded
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.requests import Request
from starlette.responses import JSONResponse

from typing import Callable, NamedTuple

from fastapi_bridge.core.settings import get_settings
from fastapi_bridge.exceptions.domain import DomainError, EmailAlreadyExistsError, InvalidCredentialsError
from fastapi_bridge.schemas.error_schemas import ErrorDetail

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

    Todo handler de excepción de la API (este módulo) debe construir su
    respuesta a través de esta función — nunca devolver un error en un
    formato distinto (regla dura del proyecto).

    El cuerpo se arma instanciando `ErrorDetail` y volcando su contenido
    (CHANGE-07, D-1) en vez de ensamblar un `dict` literal en paralelo al
    modelo: es la única declaración de la forma del error, y las
    restricciones del modelo (p. ej. `status` dentro de 100..599) pasan a
    ser una red real sobre lo que efectivamente se emite, no una validación
    decorativa que nadie ejercita.
    """
    body = ErrorDetail(
        type=type_,
        title=title,
        status=status_code,
        detail=detail,
        instance=instance,
    )
    return JSONResponse(
        status_code=status_code,
        content=body.model_dump(),
        media_type=PROBLEM_DETAIL_MEDIA_TYPE,
    )


VALIDATION_PROBLEM_TYPE = "https://wasa.dev/errors/validation-error"
VALIDATION_PROBLEM_TITLE = "Unprocessable Entity"
MALFORMED_REQUEST_PROBLEM_TYPE = "https://wasa.dev/errors/malformed-request"
MALFORMED_REQUEST_PROBLEM_TITLE = "Bad Request"

# Ubicaciones que Pydantic antepone al nombre real del campo — no son parte
# del nombre, se descartan al componer el `detail` (D-7).
_VALIDATION_LOCATION_PREFIXES = {"body", "query", "path", "header"}

# Discriminante entre 400 y 422 (D-2, H-5): Pydantic v2 distingue el cuerpo
# que ni siquiera es JSON parseable con este `type` de error concreto.
_JSON_INVALID_ERROR_TYPE = "json_invalid"


def _format_validation_detail(errors: list[dict]) -> str:
    """Compone un `detail` legible a partir de `RequestValidationError.errors()`.

    Allowlist explícita (D-7, H-1): usa **solo** `loc` (para nombrar el
    campo) y `msg` (para describir el problema). `input` y `ctx` se
    descartan siempre sin excepción — `input` es el valor que el usuario
    envió, y en el endpoint de registro ese valor puede ser la contraseña en
    texto plano (RN-WS-12); `ctx` puede llevar patrones o límites internos
    de la restricción violada. Es una lista de campos permitidos, no una
    lista de campos excluidos: un campo nuevo que Pydantic agregue en una
    versión futura queda fuera por omisión, no adentro por descuido.

    Función pura, sin HTTP, para poder triangular casos sin construir una
    petición completa.
    """
    parts: list[str] = []
    for error in errors:
        loc = list(error.get("loc", ()))
        if loc and loc[0] in _VALIDATION_LOCATION_PREFIXES:
            loc = loc[1:]
        field_name = ".".join(str(segment) for segment in loc if isinstance(segment, str))
        msg = error.get("msg", "")
        if field_name:
            parts.append(f"{field_name}: {msg}")
        else:
            # H-5: `json_invalid` no tiene un nombre de campo -- su `loc` es
            # un desplazamiento de caracter (`["body", 1]`), no un campo. Se
            # describe solo con el mensaje, sin inventar un nombre.
            parts.append(msg)
    return "; ".join(parts)


async def request_validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Handler de `RequestValidationError` -> 422/400 RFC 7807 (D-2, D-7, D-8).

    El estado no es fijo: si **algún** error trae `type == "json_invalid"`,
    el cuerpo ni siquiera es JSON parseable y la respuesta es 400 ("no pude
    entender la petición"); en cualquier otro caso el JSON es válido pero
    viola el schema, y la respuesta es 422 ("entendí la petición, no puedo
    procesar el contenido"). El `detail` se compone siempre con la misma
    función pura (D-7), sin importar el estado elegido.
    """
    errors = exc.errors()
    detail = _format_validation_detail(errors)
    is_malformed = any(error.get("type") == _JSON_INVALID_ERROR_TYPE for error in errors)
    if is_malformed:
        return problem_detail_response(
            status_code=400,
            instance=request.url.path,
            detail=detail,
            title=MALFORMED_REQUEST_PROBLEM_TITLE,
            type_=MALFORMED_REQUEST_PROBLEM_TYPE,
        )
    return problem_detail_response(
        status_code=422,
        instance=request.url.path,
        detail=detail,
        title=VALIDATION_PROBLEM_TITLE,
        type_=VALIDATION_PROBLEM_TYPE,
    )


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Handler de `HTTPException` -> RFC 7807 (D-3, D-8).

    Se registra sobre `starlette.exceptions.HTTPException`, **no** sobre
    `fastapi.HTTPException`: H-2 muestra que los 404/405 que genera el
    propio router de Starlette son de la clase base, y `fastapi.HTTPException`
    es subclase de esa base. Registrar sobre la subclase deja esos dos
    errores fuera del formato RFC 7807 -- exactamente lo que la regla dura
    del proyecto prohíbe.

    No pasa `type_`: hereda `about:blank`, el valor que RFC 7807 §4.2
    prescribe cuando el error no representa un tipo de problema propio del
    dominio más allá de su código de estado. El `title` deriva de la frase
    de estado HTTP estándar, con caída a `DEFAULT_PROBLEM_TITLE` para un
    código no estándar que `http.HTTPStatus` no reconozca.

    `exc.headers` se vuelca sobre la respuesta ya construida -- generalización
    del mismo patrón que `rate_limit_exceeded_handler` usa para `Retry-After`
    (H-3) -- salvo `Content-Type`, que `problem_detail_response` ya fijó en
    `application/problem+json` y ningún header de la excepción puede
    sobrescribir.
    """
    try:
        title = http.HTTPStatus(exc.status_code).phrase
    except ValueError:
        title = DEFAULT_PROBLEM_TITLE

    response = problem_detail_response(
        status_code=exc.status_code,
        instance=request.url.path,
        detail=str(exc.detail) if exc.detail is not None else None,
        title=title,
    )
    if exc.headers:
        for header_name, header_value in exc.headers.items():
            if header_name.lower() == "content-type":
                continue
            response.headers[header_name] = header_value
    return response


# Detalle genérico del 500 (D-5): literal de módulo, no f-string, para que
# no haya dónde interpolar información del servidor. Único lugar donde se
# declara -- lo reutilizan tanto el fallback de un `DomainError` sin mapear
# (5.8) como `unhandled_exception_handler` (grupo 6), en vez de declararlo
# dos veces.
INTERNAL_ERROR_PROBLEM_TYPE = "https://wasa.dev/errors/internal-server-error"
INTERNAL_ERROR_PROBLEM_TITLE = "Internal Server Error"
INTERNAL_ERROR_PROBLEM_DETAIL = "Ocurrió un error inesperado procesando la solicitud."

EMAIL_ALREADY_EXISTS_PROBLEM_TYPE = "https://wasa.dev/errors/email-already-exists"
EMAIL_ALREADY_EXISTS_PROBLEM_TITLE = "Conflict"
INVALID_CREDENTIALS_PROBLEM_TYPE = "https://wasa.dev/errors/invalid-credentials"
INVALID_CREDENTIALS_PROBLEM_TITLE = "Unauthorized"
# Literal fijo (D-4): no interpola nada de la solicitud ni de la excepción --
# `InvalidCredentialsError` deliberadamente no lleva el email (CHANGE-04),
# así que no hay de dónde tomarlo, y el mensaje no distingue "email
# inexistente" de "contraseña incorrecta" (anti-enumeración).
INVALID_CREDENTIALS_PROBLEM_DETAIL = "email o contraseña incorrectos"


class ProblemSpec(NamedTuple):
    """Una fila de `_DOMAIN_ERROR_MAP`: cómo traducir una clase de `DomainError`."""

    status_code: int
    title: str
    type_: str
    # `detail` puede ser fijo (`InvalidCredentialsError`) o compuesto desde
    # la excepción concreta (`EmailAlreadyExistsError.email`). Un callable
    # opcional evita que el handler se convierta en un árbol de `if` por
    # fila: la fila sabe componer su propio `detail`, el handler solo
    # resuelve cuál fila usar.
    detail: str | Callable[[DomainError], str]


def _email_already_exists_detail(exc: DomainError) -> str:
    assert isinstance(exc, EmailAlreadyExistsError)
    return f"El email '{exc.email}' ya está registrado."


# Tabla de mapeo `DomainError concreto -> ProblemSpec`, declarada en la capa
# web (D-4): `exceptions/domain.py` no importa nada, ni siquiera stdlib, y
# un código de estado HTTP es una decisión de la capa de transporte, no del
# dominio. Agregar un error de dominio futuro (CHANGE-11) es una fila acá,
# no un handler nuevo -- el despacho ya cubre toda la jerarquía porque el
# `exception_handler` se registra sobre la base `DomainError`.
_DOMAIN_ERROR_MAP: dict[type[DomainError], ProblemSpec] = {
    EmailAlreadyExistsError: ProblemSpec(
        status_code=409,
        title=EMAIL_ALREADY_EXISTS_PROBLEM_TITLE,
        type_=EMAIL_ALREADY_EXISTS_PROBLEM_TYPE,
        detail=_email_already_exists_detail,
    ),
    InvalidCredentialsError: ProblemSpec(
        status_code=401,
        title=INVALID_CREDENTIALS_PROBLEM_TITLE,
        type_=INVALID_CREDENTIALS_PROBLEM_TYPE,
        detail=INVALID_CREDENTIALS_PROBLEM_DETAIL,
    ),
}


async def domain_error_handler(request: Request, exc: DomainError) -> JSONResponse:
    """Handler único sobre `DomainError` -> estado HTTP vía `_DOMAIN_ERROR_MAP` (D-4).

    Un único `exception_handler` registrado sobre la clase base cubre toda
    la jerarquía de errores de dominio, presente y futura (CHANGE-11 agrega
    una fila a la tabla, no un handler). La resolución recorre el MRO de la
    excepción concreta -- no un `==` de tipo exacto -- para que una
    subclase de una clase ya mapeada (una especialización futura) siga
    resolviendo en vez de caer al 500 por accidente.

    Un `DomainError` que ninguna fila cubre cae al 500 genérico: un error
    de negocio que la capa web no sabe traducir es un defecto del servidor,
    y devolver un 400 inventado le atribuiría al cliente una omisión del
    código.
    """
    spec: ProblemSpec | None = None
    for klass in type(exc).__mro__:
        if klass in _DOMAIN_ERROR_MAP:
            spec = _DOMAIN_ERROR_MAP[klass]
            break

    if spec is None:
        return problem_detail_response(
            status_code=500,
            instance=request.url.path,
            detail=INTERNAL_ERROR_PROBLEM_DETAIL,
            title=INTERNAL_ERROR_PROBLEM_TITLE,
            type_=INTERNAL_ERROR_PROBLEM_TYPE,
        )

    detail = spec.detail(exc) if callable(spec.detail) else spec.detail
    return problem_detail_response(
        status_code=spec.status_code,
        instance=request.url.path,
        detail=detail,
        title=spec.title,
        type_=spec.type_,
    )


logger = logging.getLogger(__name__)


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handler de último recurso -> 500 opaco hacia afuera, completo hacia adentro (D-5).

    El cuerpo es siempre el mismo literal de módulo (`INTERNAL_ERROR_PROBLEM_*`),
    sin importar qué excepción lo causó: cualquier derivación filtra
    internals del servidor. Un `IntegrityError` de SQLAlchemy trae la
    sentencia SQL y el nombre de la constraint en su `str()`; un
    `OperationalError` de asyncpg trae el host y la base; y el solo nombre
    de la clase de la excepción ya revela qué motor hay detrás. Por eso el
    `detail` es un literal, no una f-string: no hay dónde interpolar.

    Es el último recurso de la cadena de handlers: si él mismo lanza,
    Starlette ya no tiene a quién delegar y la conexión se cierra sin
    respuesta. Por eso sus únicas operaciones son leer `request.url.path`,
    loguear y construir la respuesta con constantes -- no inspecciona `exc`,
    no ramifica por su tipo, no consulta la base y no lee configuración.

    `logger.exception(...)` se llama **antes** de construir la respuesta,
    con el `logging` estándar del lenguaje: registra el stack trace
    completo en el logger del módulo, sin imponer `basicConfig` ni un
    formato propio -- eso pisaría la configuración del proceso (uvicorn
    configura el root logger). Un 500 opaco hacia el cliente y también hacia
    el operador convertiría cada fallo en una investigación a ciegas.
    """
    logger.exception("Excepción no manejada en %s", request.url.path, exc_info=exc)
    return problem_detail_response(
        status_code=500,
        instance=request.url.path,
        detail=INTERNAL_ERROR_PROBLEM_DETAIL,
        title=INTERNAL_ERROR_PROBLEM_TITLE,
        type_=INTERNAL_ERROR_PROBLEM_TYPE,
    )


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
