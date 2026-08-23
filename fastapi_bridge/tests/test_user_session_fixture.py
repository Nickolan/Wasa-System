"""Tests de la fixture `user_session` (CHANGE-03, D-6).

Estos tests no ejercitan `UserRepository` (eso es el grupo 5/6): validan la
infraestructura de test en sí misma — que el motor SQLite en memoria crea la
tabla `users`, que aísla entre tests, y que la constraint `UNIQUE` de `email`
está realmente activa en este motor. Sin este último test, todo el grupo 5
estaría probando la traducción de un error que nunca ocurre (D-6/D-3).
"""

from datetime import datetime

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from fastapi_bridge.db.models import User


async def test_smoke_insert_and_read_a_user(user_session):
    user = User(email="smoke@test.com", hashed_password="$2b$12$fakehash")
    user_session.add(user)
    await user_session.flush()

    result = await user_session.execute(select(User).where(User.email == "smoke@test.com"))
    fetched = result.scalar_one()
    assert fetched.email == "smoke@test.com"


async def test_id_is_populated_by_the_engine_not_the_application(user_session):
    user = User(email="autoincrement@test.com", hashed_password="hash")
    user_session.add(user)
    await user_session.flush()

    assert user.id is not None
    assert isinstance(user.id, int)


async def test_created_at_is_populated_by_server_default_without_passing_it(user_session):
    user = User(email="serverdefault@test.com", hashed_password="hash")
    user_session.add(user)
    await user_session.flush()
    await user_session.refresh(user)

    assert user.created_at is not None
    assert isinstance(user.created_at, datetime)


async def test_two_consecutive_uses_of_the_fixture_start_with_an_empty_table_first(user_session):
    count = (await user_session.execute(select(func.count()).select_from(User))).scalar_one()
    assert count == 0

    user_session.add(User(email="isolation@test.com", hashed_password="hash"))
    await user_session.flush()

    count_after_insert = (
        await user_session.execute(select(func.count()).select_from(User))
    ).scalar_one()
    assert count_after_insert == 1


async def test_two_consecutive_uses_of_the_fixture_start_with_an_empty_table_second(user_session):
    # Independiente del test anterior: si la fixture no aislara, este test
    # vería el usuario insertado por el test anterior y fallaría.
    count = (await user_session.execute(select(func.count()).select_from(User))).scalar_one()
    assert count == 0


async def test_unique_constraint_on_email_is_active_in_this_engine(user_session):
    user_session.add(User(email="dup@test.com", hashed_password="hash-a"))
    await user_session.flush()

    user_session.add(User(email="dup@test.com", hashed_password="hash-b"))
    with pytest.raises(IntegrityError):
        await user_session.flush()
