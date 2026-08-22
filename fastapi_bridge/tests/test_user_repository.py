"""Tests de `UserRepository` (CHANGE-03, user-registry).

Corren contra la fixture `user_session` (`tests/conftest.py`, D-6): un motor
SQLite async real en memoria, con solo `User.__table__` creada. Se ejercita
SQL de verdad — incluida la violación real de la constraint `UNIQUE` de
`email` — no un doble programado para simular el error.
"""

from datetime import datetime

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from fastapi_bridge.db.models import User
from fastapi_bridge.exceptions.domain import EmailAlreadyExistsError
from fastapi_bridge.repositories.user_repository import UserRepository

# ---------------------------------------------------------------------------
# 5.1 — construcción y alta básica
# ---------------------------------------------------------------------------


async def test_constructor_accepts_the_injected_session(user_session):
    repo = UserRepository(user_session)
    assert repo is not None


async def test_create_returns_a_user(user_session):
    repo = UserRepository(user_session)
    user = await repo.create("user@test.com", "$2b$12$fakehash")
    assert isinstance(user, User)


async def test_create_returns_a_user_with_a_populated_id(user_session):
    repo = UserRepository(user_session)
    user = await repo.create("id-check@test.com", "$2b$12$fakehash")
    assert user.id is not None


# ---------------------------------------------------------------------------
# 5.3 — TRIANGULATE: valores generados por la base, hash opaco, ids distintos
# ---------------------------------------------------------------------------


async def test_create_populates_created_at_without_it_being_passed(user_session):
    repo = UserRepository(user_session)
    user = await repo.create("created-at@test.com", "$2b$12$fakehash")
    assert user.created_at is not None
    assert isinstance(user.created_at, datetime)


async def test_create_stores_the_hashed_password_exactly_as_received(user_session):
    repo = UserRepository(user_session)
    raw_hash = "$2b$12$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWX"
    user = await repo.create("hash-opaque@test.com", raw_hash)
    assert user.hashed_password == raw_hash


async def test_two_consecutive_creates_with_different_emails_get_different_ids(user_session):
    repo = UserRepository(user_session)
    first = await repo.create("first@test.com", "hash-1")
    second = await repo.create("second@test.com", "hash-2")
    assert first.id != second.id


# ---------------------------------------------------------------------------
# 5.4/5.6 — normalización de email en escritura (D-4)
# ---------------------------------------------------------------------------


async def test_create_stores_the_email_normalized_to_lowercase(user_session):
    repo = UserRepository(user_session)
    await repo.create("USER@TEST.COM", "$2b$12$fakehash")

    # Se lee de la base con una consulta propia, no del objeto en memoria:
    # así el test falla si se normalizara solo en el objeto Python.
    result = await user_session.execute(select(User).where(User.email == "user@test.com"))
    stored = result.scalar_one()
    assert stored.email == "user@test.com"


@pytest.mark.parametrize(
    "raw_email, expected_stored_email",
    [
        ("Mixed@Case.Com", "mixed@case.com"),
        ("  padded@test.com  ", "padded@test.com"),
        ("already-lower@test.com", "already-lower@test.com"),
    ],
)
async def test_create_normalization_cases(user_session, raw_email, expected_stored_email):
    repo = UserRepository(user_session)
    await repo.create(raw_email, "$2b$12$fakehash")

    result = await user_session.execute(
        select(User).where(User.email == expected_stored_email)
    )
    assert result.scalar_one() is not None


# ---------------------------------------------------------------------------
# 5.7/5.8/5.9 — email duplicado -> EmailAlreadyExistsError (D-1, D-2, D-3)
# ---------------------------------------------------------------------------


async def test_create_with_duplicate_email_raises_email_already_exists_error(user_session):
    repo = UserRepository(user_session)
    await repo.create("dup@test.com", "hash-1")

    with pytest.raises(EmailAlreadyExistsError):
        await repo.create("dup@test.com", "hash-2")


async def test_create_with_duplicate_email_in_different_capitalization_also_raises(user_session):
    # Intersección de D-3 con D-4: el escenario que más fácil se rompe si la
    # normalización se vuelve asimétrica.
    repo = UserRepository(user_session)
    await repo.create("case@test.com", "hash-1")

    with pytest.raises(EmailAlreadyExistsError):
        await repo.create("CASE@TEST.COM", "hash-2")


async def test_duplicate_error_carries_the_normalized_email(user_session):
    repo = UserRepository(user_session)
    await repo.create("normalized@test.com", "hash-1")

    with pytest.raises(EmailAlreadyExistsError) as exc_info:
        await repo.create("NORMALIZED@TEST.COM", "hash-2")

    assert exc_info.value.email == "normalized@test.com"


async def test_duplicate_error_preserves_the_original_integrity_error_as_cause(user_session):
    repo = UserRepository(user_session)
    await repo.create("cause@test.com", "hash-1")

    with pytest.raises(EmailAlreadyExistsError) as exc_info:
        await repo.create("cause@test.com", "hash-2")

    assert isinstance(exc_info.value.__cause__, IntegrityError)


async def test_duplicate_create_does_not_leave_a_second_user_in_the_table(user_session):
    repo = UserRepository(user_session)
    await repo.create("onlyone@test.com", "hash-1")
    # Confirmamos el primer alta antes de intentar la duplicada: así el
    # rollback posterior (necesario porque el repositorio no lo hace por su
    # cuenta, D-5) deshace únicamente el INSERT fallido, no el exitoso.
    await user_session.commit()

    with pytest.raises(EmailAlreadyExistsError):
        await repo.create("onlyone@test.com", "hash-2")

    # El repositorio no hace rollback por su cuenta (D-5): tras un conflicto
    # la sesión queda "DEACTIVE" hasta que el llamador (acá, el test, en
    # producción la AuthUoW) la deshace explícitamente.
    await user_session.rollback()

    count = len(
        (
            await user_session.execute(select(User).where(User.email == "onlyone@test.com"))
        ).scalars().all()
    )
    assert count == 1


# ---------------------------------------------------------------------------
# 5.10 — test-ancla de R-2/D-3: una única constraint de unicidad, sin FKs
# ---------------------------------------------------------------------------


def test_users_table_has_exactly_one_unique_constraint_and_no_foreign_keys():
    # Ancla la premisa que hace correcta la captura amplia de IntegrityError
    # en `create` (D-3): hoy `users` tiene una sola forma de violar
    # integridad (el email duplicado). Si un change futuro le agrega otra
    # constraint de unicidad, un CHECK, o una FK, este test se pone en rojo
    # y obliga a revisar D-3 antes de que la captura amplia empiece a
    # reportar "email duplicado" ante violaciones que no lo son.
    unique_constraints = [
        c for c in User.__table__.constraints if c.__class__.__name__ == "UniqueConstraint"
    ]
    assert len(unique_constraints) == 1
    assert [col.name for col in unique_constraints[0].columns] == ["email"]
    assert len(User.__table__.foreign_keys) == 0


# ---------------------------------------------------------------------------
# 5.11 — el repositorio no es dueño de la transacción (D-5)
# ---------------------------------------------------------------------------


async def test_create_does_not_commit_the_transaction(user_session):
    repo = UserRepository(user_session)
    await repo.create("rollback-check@test.com", "hash-1")

    await user_session.rollback()

    result = await user_session.execute(
        select(User).where(User.email == "rollback-check@test.com")
    )
    assert result.scalar_one_or_none() is None


# ---------------------------------------------------------------------------
# 6.1/6.2 — get_by_email: búsqueda básica (D-4, D-7)
# ---------------------------------------------------------------------------


async def test_get_by_email_returns_the_user_that_was_created(user_session):
    repo = UserRepository(user_session)
    created = await repo.create("findme@test.com", "hash-1")

    found = await repo.get_by_email("findme@test.com")

    assert found is not None
    assert found.id == created.id


async def test_get_by_email_returns_none_when_no_user_matches_without_raising(user_session):
    repo = UserRepository(user_session)
    found = await repo.get_by_email("nobody@test.com")
    assert found is None


# ---------------------------------------------------------------------------
# 6.3 — TRIANGULATE: simetría de normalización (D-4, corazón de R-1)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "search_email",
    ["USER@TEST.COM", "User@Test.Com", "  user@test.com  "],
)
async def test_get_by_email_finds_the_user_regardless_of_capitalization(user_session, search_email):
    # Sin esto, quien se registra con mayúsculas no puede volver a entrar, y
    # el 401 genérico de login (HU-03-02) vuelve el síntoma indistinguible
    # de una contraseña mal escrita (R-1).
    repo = UserRepository(user_session)
    await repo.create("user@test.com", "hash-1")

    found = await repo.get_by_email(search_email)

    assert found is not None
    assert found.email == "user@test.com"


# ---------------------------------------------------------------------------
# 6.4 — TRIANGULATE: coincidencia exacta, no parcial
# ---------------------------------------------------------------------------


async def test_get_by_email_does_not_match_a_superstring_of_an_existing_email(user_session):
    repo = UserRepository(user_session)
    await repo.create("alguien@test.com", "hash-1")

    assert await repo.get_by_email("alguien@test.com.ar") is None


async def test_get_by_email_does_not_match_a_substring_of_an_existing_email(user_session):
    repo = UserRepository(user_session)
    await repo.create("alguien@test.com", "hash-1")

    assert await repo.get_by_email("guien@test.com") is None


# ---------------------------------------------------------------------------
# 6.5 — TRIANGULATE: parámetro ligado, no concatenación de texto
# ---------------------------------------------------------------------------


async def test_get_by_email_treats_sql_looking_input_as_a_bound_parameter(user_session):
    repo = UserRepository(user_session)
    await repo.create("safe@test.com", "hash-1")

    result = await repo.get_by_email("a' OR '1'='1")

    assert result is None
    remaining = (await user_session.execute(select(User))).scalars().all()
    assert len(remaining) == 1


# ---------------------------------------------------------------------------
# 6.6 — TRIANGULATE: multiplicidad
# ---------------------------------------------------------------------------


async def test_get_by_email_with_two_users_returns_the_matching_one_not_the_other(user_session):
    repo = UserRepository(user_session)
    first = await repo.create("first-multi@test.com", "hash-1")
    second = await repo.create("second-multi@test.com", "hash-2")

    found_first = await repo.get_by_email("first-multi@test.com")
    found_second = await repo.get_by_email("second-multi@test.com")

    assert found_first.id == first.id
    assert found_second.id == second.id


def test_user_repository_module_never_calls_commit_or_rollback_on_the_session():
    import ast
    from pathlib import Path

    module_path = Path(__file__).resolve().parent.parent / "repositories" / "user_repository.py"
    tree = ast.parse(module_path.read_text(encoding="utf-8"))

    forbidden_calls = {"commit", "rollback"}
    found = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute) and node.attr in forbidden_calls:
            found.add(node.attr)

    assert found.isdisjoint(forbidden_calls)
