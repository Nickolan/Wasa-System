"""`DeclarativeBase` del proyecto (CHANGE-01).

Expone la `Base` de la que hereda el modelo `User` de `db/models.py`. El
engine SQLAlchemy async contra `db_fuzzing` (`create_async_engine`) se agrega
en este mismo módulo más adelante en CHANGE-01, como factory perezosa
`get_engine(settings)`, no como objeto de nivel de módulo: instanciarlo al
importar abriría un pool de conexiones contra `db_fuzzing` en el import,
violando el requirement "El scaffold no toca la base de datos compartida".

DD-02: `User` es —y debe seguir siendo— el único modelo sobre esta `Base`
que el servicio crea en `db_fuzzing`; el DDL del arranque se acota
explícitamente a `User.__table__` (ver `db/models.py` y `main.py`) para que
un modelo futuro sobre esta misma `Base` no emita DDL por arrastre contra la
instancia compartida.
"""

from functools import lru_cache

from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from fastapi_bridge.core.settings import Settings


class Base(DeclarativeBase):
    """Base declarativa única del proyecto. `User` es su único modelo."""


@lru_cache
def _build_engine(db_url: str) -> AsyncEngine:
    return create_async_engine(db_url)


def get_engine(settings: Settings) -> AsyncEngine:
    """Factory perezosa del `AsyncEngine` contra `settings.DB_URL` (D-1).

    No se cachea sobre la instancia de `Settings`: `Settings` (pydantic
    `BaseSettings`) no es hasheable, así que el cache se indexa sobre la
    cadena `DB_URL`, que sí lo es e identifica unívocamente la configuración
    de conexión relevante para el engine.
    """
    return _build_engine(settings.DB_URL)
