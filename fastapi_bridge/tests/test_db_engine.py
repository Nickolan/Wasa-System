"""Tests del engine asíncrono contra `db_fuzzing` (user-persistence).

Ninguno de estos tests requiere un PostgreSQL alcanzable (D-8): construir un
`AsyncEngine` con `create_async_engine` no conecta, sólo configura el pool de
forma diferida. La primera conexión real ocurre cuando algo ejecuta una
sentencia — cosa que estos tests no hacen.
"""

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine

from fastapi_bridge.core.settings import Settings
from fastapi_bridge.db.base import get_engine


@pytest.fixture
async def unreachable_settings():
    # Puerto que casi con certeza no tiene nada escuchando: alcanza para
    # probar que construir el engine no intenta conectar.
    settings = Settings(DB_URL="postgresql+asyncpg://user:pass@localhost:1/db_fuzzing")
    yield settings
    await get_engine(settings).dispose()


async def test_get_engine_returns_async_engine_with_asyncpg_driver(unreachable_settings):
    engine = get_engine(unreachable_settings)
    assert isinstance(engine, AsyncEngine)
    assert engine.dialect.driver == "asyncpg"


async def test_get_engine_is_cached_for_the_same_settings(unreachable_settings):
    first = get_engine(unreachable_settings)
    second = get_engine(unreachable_settings)
    assert first is second


async def test_get_engine_returns_different_instances_for_different_db_urls(unreachable_settings):
    other_settings = Settings(DB_URL="postgresql+asyncpg://user:pass@localhost:2/db_fuzzing")
    try:
        assert get_engine(unreachable_settings) is not get_engine(other_settings)
    finally:
        await get_engine(other_settings).dispose()


async def test_get_engine_does_not_raise_with_unreachable_database(unreachable_settings):
    # Construir el engine no conecta: no debe lanzar aunque el host:puerto
    # de settings.DB_URL no tenga nada escuchando.
    engine = get_engine(unreachable_settings)
    assert isinstance(engine, AsyncEngine)
