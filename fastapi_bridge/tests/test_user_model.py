"""Tests del modelo ORM `User` (user-persistence).

Verifican la FORMA del modelo sin necesidad de una conexión real a
PostgreSQL (D-8 punto 1): introspección de `User.__table__` y del
`Base.metadata` del proyecto.
"""

from sqlalchemy import DateTime
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateTable

from fastapi_bridge.db.base import Base
from fastapi_bridge.db.models import User


def test_table_name_and_columns_are_exact():
    assert User.__tablename__ == "users"
    assert set(User.__table__.columns.keys()) == {
        "id",
        "email",
        "hashed_password",
        "created_at",
    }


def test_id_is_autoincrementing_primary_key():
    id_column = User.__table__.columns["id"]
    assert id_column.primary_key is True
    assert id_column.autoincrement in (True, "auto")


def test_email_and_hashed_password_are_not_nullable():
    assert User.__table__.columns["email"].nullable is False
    assert User.__table__.columns["hashed_password"].nullable is False


def test_created_at_has_server_default_and_timezone():
    created_at_column = User.__table__.columns["created_at"]
    assert isinstance(created_at_column.type, DateTime)
    assert created_at_column.type.timezone is True
    assert created_at_column.server_default is not None


def test_user_inherits_from_project_base():
    assert issubclass(User, Base)


def test_compiled_ddl_declares_unique_email_and_server_default_created_at():
    # D-8 punto 2: el DDL real, compilado contra el dialecto postgresql, sin
    # necesidad de conectarse a una base real.
    ddl = str(CreateTable(User.__table__).compile(dialect=postgresql.dialect()))
    assert "CREATE TABLE users" in ddl
    assert "UNIQUE" in ddl
    assert "email" in ddl
    assert "created_at" in ddl
    assert "now()" in ddl.lower()


def test_project_metadata_registers_only_the_users_table():
    # Ningún otro modelo se cuela en el metadata de la Base del proyecto.
    assert set(Base.metadata.tables.keys()) == {"users"}
