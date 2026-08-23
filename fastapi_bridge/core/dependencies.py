"""Dependencias de FastAPI compartidas entre routers.

## `get_auth_service` (CHANGE-05, D-1/D-8)

Compone `AuthService(AuthUoW(get_session_factory(settings)))` y lo entrega
por `Depends(get_auth_service)` a las rutas de `api/v1/auth/router.py`. Es el
único punto del proyecto que conoce el cableado entre la capa de servicio
(`services/auth_service.py`) y la de persistencia (`db/session.py`,
`uow/auth_unit_of_work.py`).

Vive acá y no bajo `api/` (D-1 de `design.md`, `auth-router`) porque
`LAYER_IMPORT_RULES` (`tests/test_layer_boundaries.py`) prohíbe `sqlalchemy`
en todo el árbol `api/`, de forma recursiva: la composición necesita
`get_session_factory`, que es la puerta a SQLAlchemy. Aunque el test AST no
detectaría el import transitivo si viviera bajo `api/`, eso no lo volvería
correcto — la capa de transporte quedaría conociendo el cableado de
persistencia. Acá el router importa un solo nombre (`get_auth_service`) y
nada más: cero conocimiento de cómo se construye su servicio.

Construye una `AuthService` **nueva en cada llamada** (D-8): no hay
`lru_cache` ni singleton en `app.state`. El costo es nulo porque
`get_session_factory` ya está cacheada por `DB_URL` — no abre ninguna
conexión al construirse, sólo al ejecutar la primera sentencia — y una
instancia por petición hace estructuralmente imposible que el estado de una
petición se filtre a otra.

## `get_current_user` / `CurrentUserEmail` (CHANGE-06)

Convierte un header `Authorization: Bearer <jwt>` en el email del usuario
autenticado, o en un `401` uniforme RFC 7807. Vive acá, junto a
`get_auth_service`, por la misma razón (D-9 de `design.md`): es el único
lugar que tanto `auth` como `scan` pueden importar sin que la capa de
transporte conozca cableado de persistencia ni de criptografía.

`oauth2_scheme` se declara con `auto_error=False` (D-1): con el default
`True`, `OAuth2PasswordBearer` lanzaría **su propia** `HTTPException` con un
`detail` en inglés fijado por la librería, dejando el proyecto con dos
respuestas 401 redactadas por dueños distintos. Con `auto_error=False`, la
falta de header **y** un esquema de autorización distinto de `Bearer`
(p. ej. `Authorization: Basic ...`) llegan igual como `token is None`, y es
`get_current_user` quien decide la respuesta — la misma que redacta para
cualquier otro token inválido. `auto_error` no afecta la declaración del
esquema en OpenAPI (FastAPI la colecta por `isinstance(..., SecurityBase)`,
no por esa bandera): `/docs` sigue mostrando el candado en las rutas
protegidas.

El rechazo es siempre `fastapi.HTTPException(401, ...)`, no un `DomainError`
propio (D-2): un token que no valida es un fallo de la capa de transporte,
no una regla de negocio violada, y `http_exception_handler`
(`exceptions/handlers.py`, CHANGE-07) ya traduce cualquier `HTTPException` a
RFC 7807 trasladando sus headers — así el `WWW-Authenticate` de RFC 6750
sobrevive sin agregar manejo de errores nuevo. El `type` de ese problem
details queda en `about:blank` (no hay una URI propia): es exactamente el
caso que `error-rendering` prevé para una excepción HTTP genérica.

Sin `try/except` (D-10): `decode_access_token` nunca lanza (CHANGE-04, D-7),
así que la única condición de rechazo, una vez que hay un token presente, es
`token_data.email is None`. Un `try/except` acá sería código muerto que
invitaría a ramificar por tipo de excepción — exactamente la fuga que evita
que los cuatro motivos de rechazo (malformado, otra clave, vencido, sin
`sub`) sean indistinguibles entre sí (D-3). El desafío `WWW-Authenticate`
sólo distingue "sin credenciales" (`Bearer`) de "token presente inválido"
(`Bearer error="invalid_token"`, el código que RFC 6750 §3.1 agrupa
deliberadamente para todos esos motivos); nunca lleva `error_description` ni
ningún dato del token recibido (D-4). Ningún literal vive dentro del cuerpo
de la función: los dos `detail` y las dos formas del desafío son constantes
de módulo.

No consulta la base de datos (D-5): el token firmado por el propio servicio
y su vencimiento ya validado son prueba suficiente de identidad. El alcance
v1.2 no tiene baja ni suspensión de usuarios, así que la consulta no
protegería de nada real hoy — pero si eso cambia, un token de un usuario
dado de baja seguirá siendo válido hasta su vencimiento (hasta
`TOKEN_EXPIRE_HOURS`, default 24h). Es el trade-off inherente a un JWT sin
estado; la mitigación (consulta de existencia, lista de revocación) es un
change propio, no un agregado silencioso a éste.

Devuelve `str` (el email), no `TokenData` ni una entidad `User` (D-6): es lo
único que el flujo de scan necesita, y el tipo de retorno es la afirmación
de que el caso `None` ya quedó cerrado aguas abajo. `CurrentUserEmail =
Annotated[str, Depends(get_current_user)]` es el alias que los routers deben
anotar (`user_email: CurrentUserEmail`) — hace imposible que un consumidor
declare por error `Depends(oauth2_scheme)`, que devuelve el token **sin
validar**.

`tokenUrl="/api/v1/auth/login"` (D-13) sólo alimenta el botón "Authorize" de
`/docs`; no participa de ninguna validación en tiempo de ejecución. Ese
botón **no funciona** (heredado de CHANGE-05 D-4): `/login` recibe JSON
(`UserLogin`), no `application/x-www-form-urlencoded`. No es un bug de este
change y no se arregla acá — las rutas protegidas siguen siendo probables
desde `/docs` con "Try it out" pegando el token a mano.

Agregar estos dos símbolos no monta ni modifica ninguna ruta: `/scan/start`
sigue en 404 hasta CHANGE-12, y las rutas de auth siguen siendo públicas.

Regla de capa: este módulo expone `Depends(...)` de FastAPI y compone
servicios/UoW; puede importar `core/settings.py`, `core/security.py`,
`services/` y `db/session.py`. Vive fuera de `api/` precisamente para que
`api/` no tenga que hacerlo.
"""

from typing import Annotated

from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer

from fastapi_bridge.core.security import decode_access_token
from fastapi_bridge.core.settings import Settings, get_settings
from fastapi_bridge.db.session import get_session_factory
from fastapi_bridge.services.auth_service import AuthService
from fastapi_bridge.uow.auth_unit_of_work import AuthUoW


def get_auth_service(settings: Annotated[Settings, Depends(get_settings)]) -> AuthService:
    """Compone un `AuthService` nuevo por petición (D-8) sobre la `AuthUoW`
    y la `session_factory` correspondientes a `settings`. Sin literales de
    configuración propios: la cadena de conexión sale íntegramente de
    `Settings`, recibida vía `Depends(get_settings)`."""
    session_factory = get_session_factory(settings)
    return AuthService(AuthUoW(session_factory))


# CHANGE-06, D-3/D-4: dos literales de detalle y dos formas de desafío, una
# por cada situación de rechazo. Constantes de módulo -- nunca compuestas
# dentro de get_current_user -- para que no haya dónde interpolar el token,
# el email ni el motivo concreto del rechazo.
_MISSING_CREDENTIALS_DETAIL = "No se proporcionó un token de autenticación."
_INVALID_TOKEN_DETAIL = "El token de autenticación no es válido o expiró."
_MISSING_CREDENTIALS_CHALLENGE = "Bearer"
_INVALID_TOKEN_CHALLENGE = 'Bearer error="invalid_token"'

# CHANGE-06, D-1/D-13: auto_error=False (ver docstring del módulo);
# tokenUrl apunta a la ruta de login real, aunque su botón "Authorize" no
# funcione contra ella (D-13, heredado de CHANGE-05 D-4).
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


async def get_current_user(
    token: Annotated[str | None, Depends(oauth2_scheme)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> str:
    """Resuelve el email del usuario autenticado a partir del Bearer token de
    la solicitud, o lanza `HTTPException(401)` RFC 6750/7807 (ver docstring
    del módulo para el porqué de cada decisión: D-1, D-2, D-5, D-10)."""
    if token is None:
        raise HTTPException(
            status_code=401,
            detail=_MISSING_CREDENTIALS_DETAIL,
            headers={"WWW-Authenticate": _MISSING_CREDENTIALS_CHALLENGE},
        )
    token_data = decode_access_token(token, settings)
    if token_data.email is None:
        raise HTTPException(
            status_code=401,
            detail=_INVALID_TOKEN_DETAIL,
            headers={"WWW-Authenticate": _INVALID_TOKEN_CHALLENGE},
        )
    return token_data.email


# CHANGE-06, D-6: anotación única que los routers deben usar para declarar
# una operación protegida -- nunca `Depends(oauth2_scheme)` por error, que
# devuelve el token sin validar.
CurrentUserEmail = Annotated[str, Depends(get_current_user)]
