"""Tests de `AuthUoW` (CHANGE-04, capability `auth-session`, D-9).

Corre contra el motor SQLite async en memoria de `user_session_factory`
(`conftest.py`), nunca contra `get_session_factory` (que apuntaría a
`db_fuzzing`). `AuthUoW` es el único punto por el que `AuthService` toca la
persistencia: confirma en el camino feliz, deshace ante cualquier
excepción — incluidas las de dominio — y cierra la sesión siempre.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select

from fastapi_bridge.db.models import User
from fastapi_bridge.exceptions.domain import EmailAlreadyExistsError
from fastapi_bridge.repositories.user_repository import UserRepository
from fastapi_bridge.uow.auth_unit_of_work import AuthUoW


# ---------------------------------------------------------------------------
# 6.1 / 6.2 — construcción, __aenter__ expone .users
# ---------------------------------------------------------------------------


async def test_entering_the_block_exposes_users_as_a_user_repository(user_session_factory):
    uow = AuthUoW(user_session_factory)
    async with uow as active:
        assert isinstance(active.users, UserRepository)


# ---------------------------------------------------------------------------
# 6.3 / 6.4 — commit en el camino feliz
# ---------------------------------------------------------------------------


async def test_happy_path_commits_and_user_is_visible_from_a_new_session(user_session_factory):
    uow = AuthUoW(user_session_factory)
    async with uow as active:
        await active.users.create("user@test.com", "some-hash")

    async with user_session_factory() as fresh_session:
        result = await fresh_session.execute(select(User).where(User.email == "user@test.com"))
        assert result.scalar_one_or_none() is not None


# ---------------------------------------------------------------------------
# 6.5 / 6.6 — rollback ante excepción arbitraria
# ---------------------------------------------------------------------------


async def test_arbitrary_exception_propagates_and_rolls_back(user_session_factory):
    uow = AuthUoW(user_session_factory)

    class _Boom(Exception):
        pass

    with pytest.raises(_Boom):
        async with uow as active:
            await active.users.create("rollback@test.com", "some-hash")
            raise _Boom("boom")

    async with user_session_factory() as fresh_session:
        result = await fresh_session.execute(select(User).where(User.email == "rollback@test.com"))
        assert result.scalar_one_or_none() is None


# ---------------------------------------------------------------------------
# 6.7 — rollback también ante excepción de dominio (email duplicado)
# ---------------------------------------------------------------------------


async def test_domain_exception_also_rolls_back(user_session_factory):
    # Registrar un usuario primero (confirmado), luego intentar duplicarlo
    # dentro de un segundo bloque que debe deshacerse sin dejar sentencias
    # pendientes.
    setup_uow = AuthUoW(user_session_factory)
    async with setup_uow as active:
        await active.users.create("dup@test.com", "hash-one")

    uow = AuthUoW(user_session_factory)
    with pytest.raises(EmailAlreadyExistsError):
        async with uow as active:
            await active.users.create("dup@test.com", "hash-two")

    async with user_session_factory() as fresh_session:
        result = await fresh_session.execute(select(User).where(User.email == "dup@test.com"))
        rows = result.scalars().all()
        assert len(rows) == 1
        assert rows[0].hashed_password == "hash-one"


# ---------------------------------------------------------------------------
# 6.8 — la sesión se cierra siempre
# ---------------------------------------------------------------------------


async def test_session_is_closed_after_happy_path(user_session_factory):
    uow = AuthUoW(user_session_factory)
    async with uow as active:
        session = active._session  # noqa: SLF001 - inspección de test
    assert session.is_active is False or not session.in_transaction()


async def test_session_is_closed_after_exception(user_session_factory):
    uow = AuthUoW(user_session_factory)
    session_ref = None

    class _Boom(Exception):
        pass

    with pytest.raises(_Boom):
        async with uow as active:
            session_ref = active._session  # noqa: SLF001 - inspección de test
            raise _Boom("boom")

    assert session_ref is not None
    assert session_ref.in_transaction() is False


# ---------------------------------------------------------------------------
# 6.9 — reentrancia: misma instancia, dos bloques consecutivos
# ---------------------------------------------------------------------------


async def test_same_instance_reused_across_two_blocks_independently(user_session_factory):
    uow = AuthUoW(user_session_factory)

    async with uow as first:
        await first.users.create("first@test.com", "hash-a")

    async with uow as second:
        user = await second.users.get_by_email("first@test.com")
        assert user is not None
        await second.users.create("second@test.com", "hash-b")

    async with user_session_factory() as fresh_session:
        result = await fresh_session.execute(select(User))
        emails = {row.email for row in result.scalars().all()}
        assert emails == {"first@test.com", "second@test.com"}


# ---------------------------------------------------------------------------
# 6.10 — acceder a .users fuera del bloque es un error explícito
# ---------------------------------------------------------------------------


async def test_accessing_users_outside_the_block_raises_an_explicit_error(user_session_factory):
    uow = AuthUoW(user_session_factory)
    with pytest.raises(RuntimeError, match="no está activa|not active"):
        _ = uow.users
