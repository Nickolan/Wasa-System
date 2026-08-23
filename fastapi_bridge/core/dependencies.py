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

`get_current_user` —que decodifica el Bearer token vía `core/security.py` y
protege `/api/v1/scan/start`— se agrega a este mismo módulo en CHANGE-06. Los
endpoints de auth (`/register`, `/login`) no la usan.

Regla de capa: este módulo expone `Depends(...)` de FastAPI y compone
servicios/UoW; puede importar `core/settings.py`, `core/security.py`,
`services/` y `db/session.py`. Vive fuera de `api/` precisamente para que
`api/` no tenga que hacerlo.
"""

from typing import Annotated

from fastapi import Depends

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
