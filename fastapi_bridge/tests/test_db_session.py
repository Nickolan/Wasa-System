"""Tests de la factory de sesiones asíncronas (user-persistence, D-7).

Tampoco requieren PostgreSQL alcanzable: obtener la factory no abre
conexión, sólo la abre la primera sentencia que ejecute una sesión.
"""

import ast
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from fastapi_bridge.core.settings import Settings
from fastapi_bridge.db.base import get_engine
from fastapi_bridge.db.session import get_session_factory


async def _unreachable_settings() -> Settings:
    return Settings(DB_URL="postgresql+asyncpg://user:pass@localhost:3/db_fuzzing")


async def test_get_session_factory_is_bound_to_the_service_engine():
    settings = await _unreachable_settings()
    try:
        factory = get_session_factory(settings)
        assert isinstance(factory, async_sessionmaker)
        assert factory.kw["bind"] is get_engine(settings)
    finally:
        await get_engine(settings).dispose()


async def test_get_session_factory_has_expire_on_commit_disabled():
    settings = await _unreachable_settings()
    try:
        factory = get_session_factory(settings)
        assert factory.kw["expire_on_commit"] is False
    finally:
        await get_engine(settings).dispose()


async def test_getting_session_factory_does_not_open_a_connection():
    # Obtener la factory no debe conectar: si conectara, esto lanzaría contra
    # un host:puerto que casi con certeza no tiene nada escuchando.
    settings = await _unreachable_settings()
    try:
        factory = get_session_factory(settings)
        assert factory is not None
    finally:
        await get_engine(settings).dispose()


async def test_session_factory_produces_async_sessions():
    settings = await _unreachable_settings()
    try:
        factory = get_session_factory(settings)
        session = factory()
        try:
            assert isinstance(session, AsyncSession)
        finally:
            await session.close()
    finally:
        await get_engine(settings).dispose()


def test_db_session_module_does_not_import_fastapi():
    module_path = Path(__file__).resolve().parent.parent / "db" / "session.py"
    tree = ast.parse(module_path.read_text(encoding="utf-8"))
    imported_top_level_modules = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported_top_level_modules.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module is not None:
            imported_top_level_modules.add(node.module.split(".")[0])
    assert "fastapi" not in imported_top_level_modules
