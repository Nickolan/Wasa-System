"""Fixtures compartidas por la suite de `fastapi_bridge` (CHANGE-01, D-8 punto 3).

`FakeAsyncEngine` es un doble mínimo de `AsyncEngine` que permite ejercitar
el `lifespan` de `main.py` sin abrir ninguna conexión real contra
`db_fuzzing`: registra qué se llamó (`run_sync`, `dispose`) para que los
tests puedan afirmar sobre el alcance exacto del DDL emitido en el arranque,
y puede simular una base inaccesible lanzando una excepción al conectar.

`user_session` (CHANGE-03, D-6) es distinta en naturaleza: no es un doble,
sino un motor SQLite async real en memoria (`sqlite+aiosqlite:///:memory:`),
construido con su propio `create_async_engine` — nunca pasa por
`get_engine`/`get_session_factory` de `db/base.py`/`db/session.py`, para que
ningún test de `UserRepository` pueda apuntar por accidente a `db_fuzzing`.
Crea únicamente `User.__table__` (mismo alcance explícito que el `lifespan`
de CHANGE-01) y entrega una `AsyncSession` con `expire_on_commit=False`,
igual que la factory de producción.

Límites de fidelidad de SQLite frente a PostgreSQL (D-6) — ningún test de
este change debe apoyarse en lo contrario:
- `String(320)` no valida longitud en SQLite (SQLite no impone `VARCHAR(n)`);
  esa cobertura vive en `tests/test_user_model.py`, que compila el DDL contra
  el dialecto `postgresql` sin necesidad de una conexión real.
- `DateTime(timezone=True)` devuelve un `datetime` naive en SQLite (no hay
  tipo de zona horaria nativo); ningún test de este change afirma nada sobre
  el tzinfo de `created_at`.
- No existe SQLSTATE en SQLite: D-3 decidió deliberadamente no inspeccionar
  `exc.orig`/SQLSTATE en `UserRepository.create`, así que esta limitación no
  afecta la cobertura — es justamente la rama que el diseño no mira.
"""

from __future__ import annotations

from typing import Any, AsyncIterator, Callable

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


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


@pytest.fixture
async def user_session_factory() -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    """`async_sessionmaker` real contra SQLite en memoria, con solo `users`
    creada (CHANGE-04, D-9 de `design.md`).

    A diferencia de `user_session` (que entrega una única `AsyncSession` ya
    abierta), esta fixture entrega la **factory**: es lo que necesita
    `AuthUoW`, cuyo constructor recibe `session_factory` y abre una sesión
    nueva en cada `__aenter__` (D-9) — nunca vía `get_session_factory`, que
    apuntaría a `db_fuzzing`. Mismo motor descartable por test, mismas
    limitaciones de fidelidad de SQLite documentadas arriba en `user_session`.
    """
    from fastapi_bridge.db.base import Base
    from fastapi_bridge.db.models import User

    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all, tables=[User.__table__])

    session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)
    try:
        yield session_factory
    finally:
        await engine.dispose()


@pytest.fixture
async def user_session() -> AsyncIterator[AsyncSession]:
    """`AsyncSession` real contra SQLite en memoria, con solo `users` creada.

    Motor propio y descartable por test (D-6): cada uso arranca con la
    tabla vacía, así que el orden de ejecución de los tests no puede influir
    en el resultado (2.4). Al terminar, cierra la sesión y hace `dispose()`
    del engine — nada queda vivo entre tests.
    """
    from fastapi_bridge.db.base import Base
    from fastapi_bridge.db.models import User

    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all, tables=[User.__table__])

    session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)
    session = session_factory()
    try:
        yield session
    finally:
        await session.close()
        await engine.dispose()


# CHANGE-25 (dashboard-read-router), tarea 4.1 -- DDL local a la tabla de columnas
# conocidas por D-2 (`schemas/dashboard_schemas.py`: `ScanRow`/`VulnerabilityRow`).
_SHARED_TABLES_DDL = (
    """
    CREATE TABLE scans (
        id INTEGER PRIMARY KEY,
        target_url TEXT,
        scan_date TEXT,
        total_vulnerabilities INTEGER,
        critical_count INTEGER,
        high_count INTEGER,
        medium_count INTEGER,
        low_count INTEGER,
        report_path TEXT
    )
    """,
    """
    CREATE TABLE vulnerabilities (
        id INTEGER PRIMARY KEY,
        scan_id INTEGER,
        source TEXT,
        type TEXT,
        severity TEXT,
        url TEXT,
        description TEXT,
        solution TEXT,
        cweid TEXT,
        evidence TEXT
    )
    """,
)


@pytest.fixture
async def shared_tables_session() -> AsyncIterator[AsyncSession]:
    """`AsyncSession` real contra SQLite en memoria, con `scans` y
    `vulnerabilities` propias del test (CHANGE-25, tarea 4.1) -- para
    ejercitar `DashboardRepository` sin tocar `db_fuzzing` real.

    Motor propio, construido con `create_async_engine` directo: NUNCA pasa
    por `get_engine`/`get_session_factory` de `db/base.py`/`db/session.py`
    (mismo criterio que `user_session`/`user_session_factory` arriba), así
    que ningún test de este dominio puede apuntar por accidente a la base
    compartida real. Las columnas replican exactamente las declaradas en
    `ScanRow`/`VulnerabilityRow` (D-2); sembrar filas es responsabilidad de
    cada test, ejecutando `INSERT` directo sobre esta misma sesión antes de
    pasarla a `DashboardRepository` (que sólo lee).
    """
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        for statement in _SHARED_TABLES_DDL:
            await connection.execute(text(statement))

    session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)
    session = session_factory()
    try:
        yield session
    finally:
        await session.close()
        await engine.dispose()


@pytest.fixture
async def shared_tables_session_factory() -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    """`async_sessionmaker` sobre el mismo SQLite en memoria de
    `shared_tables_session`, pero entregando la **factory** (lo que necesita
    `DashboardUoW`, cuyo constructor recibe `session_factory` y abre una
    sesión nueva en cada `__aenter__` -- mismo patrón que
    `user_session_factory`/`AuthUoW`)."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        for statement in _SHARED_TABLES_DDL:
            await connection.execute(text(statement))

    session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)
    try:
        yield session_factory
    finally:
        await engine.dispose()
