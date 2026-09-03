"""Tests de `DashboardUoW` (CHANGE-25, D-4: nunca confirma)."""

import pytest

from fastapi_bridge.uow.dashboard_unit_of_work import DashboardUoW


class _RecordingSession:
    """Doble mínimo de `AsyncSession`: registra si se llamó a commit/rollback/close."""

    def __init__(self) -> None:
        self.committed = False
        self.rolled_back = False
        self.closed = False

    async def commit(self) -> None:
        self.committed = True

    async def rollback(self) -> None:
        self.rolled_back = True

    async def close(self) -> None:
        self.closed = True


def _factory_returning(session: _RecordingSession):
    def _factory() -> _RecordingSession:
        return session

    return _factory


async def test_normal_exit_rolls_back_and_never_commits():
    session = _RecordingSession()
    uow = DashboardUoW(_factory_returning(session))

    async with uow:
        pass

    assert session.committed is False
    assert session.rolled_back is True
    assert session.closed is True


async def test_exit_by_exception_also_rolls_back_and_never_commits():
    session = _RecordingSession()
    uow = DashboardUoW(_factory_returning(session))

    with pytest.raises(ValueError):
        async with uow:
            raise ValueError("boom")

    assert session.committed is False
    assert session.rolled_back is True
    assert session.closed is True


def test_dashboard_property_raises_runtime_error_outside_the_scope():
    uow = DashboardUoW(_factory_returning(_RecordingSession()))

    with pytest.raises(RuntimeError):
        uow.dashboard


async def test_dashboard_property_is_available_inside_the_scope():
    session = _RecordingSession()
    async with DashboardUoW(_factory_returning(session)) as uow:
        assert uow.dashboard is not None


async def test_dashboard_uow_reads_against_real_sqlite_tables(shared_tables_session_factory):
    async with DashboardUoW(shared_tables_session_factory) as uow:
        scans = await uow.dashboard.get_scans()
        assert scans == []
