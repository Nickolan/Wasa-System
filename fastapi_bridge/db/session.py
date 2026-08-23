"""Factory de `AsyncSession` (CHANGE-01).

Expone `get_session_factory(settings)`, un `async_sessionmaker` ligado al
engine de `db/base.py` y configurado con `expire_on_commit=False` (D-7): sin
esto, leer un atributo de un objeto después del `commit` dispara un refresh
implícito que en `AsyncSession` es exactamente la fuente del error
`MissingGreenlet`. Este módulo no importa nada de FastAPI: `db/` queda por
debajo de la frontera del framework web, igual que `repositories/`.

Es el único punto desde el que la `AuthUoW` (CHANGE-03) debe obtener
sesiones — ningún otro módulo debe construir un `async_sessionmaker` propio.
"""

from functools import lru_cache

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from fastapi_bridge.core.settings import Settings
from fastapi_bridge.db.base import get_engine


@lru_cache
def _build_session_factory(db_url: str) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(bind=get_engine(Settings(DB_URL=db_url)), expire_on_commit=False)


def get_session_factory(settings: Settings) -> async_sessionmaker[AsyncSession]:
    """Factory perezosa de `AsyncSession`, cacheada por `settings.DB_URL` (D-1/D-7).

    Ligada al mismo engine que devuelve `get_engine(settings)`. Obtenerla no
    abre ninguna conexión: la conexión real ocurre recién cuando una sesión
    ejecuta su primera sentencia.
    """
    return _build_session_factory(settings.DB_URL)
