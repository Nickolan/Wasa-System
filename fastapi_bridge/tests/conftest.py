"""Fixtures compartidas por la suite de `fastapi_bridge` (CHANGE-01, D-8 punto 3).

`FakeAsyncEngine` es un doble mínimo de `AsyncEngine` que permite ejercitar
el `lifespan` de `main.py` sin abrir ninguna conexión real contra
`db_fuzzing`: registra qué se llamó (`run_sync`, `dispose`) para que los
tests puedan afirmar sobre el alcance exacto del DDL emitido en el arranque,
y puede simular una base inaccesible lanzando una excepción al conectar.
"""

from __future__ import annotations

from typing import Any, Callable

import pytest


class FakeAsyncConnection:
    """Doble de `AsyncConnection`: registra cada llamada a `run_sync`."""

    def __init__(self) -> None:
        self.run_sync_calls: list[tuple[Callable[..., Any], dict[str, Any]]] = []

    async def run_sync(self, fn: Callable[..., Any], **kwargs: Any) -> None:
        self.run_sync_calls.append((fn, kwargs))


class _FakeBeginContext:
    def __init__(self, connection: FakeAsyncConnection, raise_on_enter: Exception | None) -> None:
        self._connection = connection
        self._raise_on_enter = raise_on_enter

    async def __aenter__(self) -> FakeAsyncConnection:
        if self._raise_on_enter is not None:
            raise self._raise_on_enter
        return self._connection

    async def __aexit__(self, exc_type: object, exc: object, tb: object) -> bool:
        return False


class FakeAsyncEngine:
    """Doble mínimo de `AsyncEngine`: sin pool, sin red, sólo contabilidad."""

    def __init__(self, raise_on_begin: Exception | None = None) -> None:
        self.connection = FakeAsyncConnection()
        self.dispose_calls = 0
        self._raise_on_begin = raise_on_begin

    def begin(self) -> _FakeBeginContext:
        return _FakeBeginContext(self.connection, self._raise_on_begin)

    async def dispose(self) -> None:
        self.dispose_calls += 1


@pytest.fixture
def fake_engine_factory() -> Callable[..., FakeAsyncEngine]:
    return FakeAsyncEngine
