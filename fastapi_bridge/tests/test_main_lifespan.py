"""Tests del `lifespan` de `main.py` (user-persistence, D-8 punto 3).

Ejercitan el ciclo completo de arranque/apagado con un doble del engine
(`FakeAsyncEngine`, `tests/conftest.py`), sin abrir ninguna conexión real
contra `db_fuzzing`.
"""

import ast
from pathlib import Path

import pytest

from fastapi_bridge.db.base import Base
from fastapi_bridge.db.models import User


async def test_lifespan_creates_only_the_users_table(monkeypatch, fake_engine_factory):
    fake_engine = fake_engine_factory()
    monkeypatch.setattr("fastapi_bridge.main.get_engine", lambda settings: fake_engine)

    from fastapi_bridge.main import app

    async with app.router.lifespan_context(app):
        pass

    assert len(fake_engine.connection.run_sync_calls) == 1
    fn, kwargs = fake_engine.connection.run_sync_calls[0]
    # `Base.metadata.create_all` es un bound method: cada acceso al atributo
    # produce un objeto nuevo, así que se compara por `__self__`/`__func__`
    # en vez de identidad directa.
    assert fn.__self__ is Base.metadata
    assert fn.__func__ is Base.metadata.create_all.__func__
    assert kwargs == {"tables": [User.__table__]}


async def test_lifespan_disposes_the_engine_on_shutdown(monkeypatch, fake_engine_factory):
    fake_engine = fake_engine_factory()
    monkeypatch.setattr("fastapi_bridge.main.get_engine", lambda settings: fake_engine)

    from fastapi_bridge.main import app

    async with app.router.lifespan_context(app):
        assert fake_engine.dispose_calls == 0

    assert fake_engine.dispose_calls == 1


async def test_lifespan_propagates_connection_failure_instead_of_silencing_it(
    monkeypatch, fake_engine_factory
):
    # D-6: si `db_fuzzing` no responde, el arranque debe fallar de forma
    # ruidosa — la excepción de conexión propaga, no se descarta.
    connection_error = ConnectionRefusedError("db_fuzzing unreachable")
    fake_engine = fake_engine_factory(raise_on_begin=connection_error)
    monkeypatch.setattr("fastapi_bridge.main.get_engine", lambda settings: fake_engine)

    from fastapi_bridge.main import app

    with pytest.raises(ConnectionRefusedError):
        async with app.router.lifespan_context(app):
            pass


def test_lifespan_hook_has_no_swallowing_except_around_table_creation():
    # Verificación estructural: ningún `except` en el cuerpo del `lifespan`
    # puede descartar el error de conexión (D-6).
    main_module_path = Path(__file__).resolve().parent.parent / "main.py"
    tree = ast.parse(main_module_path.read_text(encoding="utf-8"))
    lifespan_function = next(
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.AsyncFunctionDef) and node.name == "lifespan"
    )
    except_handlers = [node for node in ast.walk(lifespan_function) if isinstance(node, ast.ExceptHandler)]
    assert except_handlers == [], (
        "el lifespan no debe envolver la creación de tablas en un except que descarte el error (D-6)"
    )
