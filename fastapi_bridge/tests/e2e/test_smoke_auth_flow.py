"""Recorrido de autenticación contra infraestructura viva (CHANGE-22, grupo 3).

Secuencial y con estado compartido a propósito (D-3 de `design.md`): estos
tests se ejecutan en el orden en que están declarados (sin plugin de orden
aleatorio en este repo) y comparten `smoke_identity`/`smoke_state`
(scope=session) porque este suite prueba **el despliegue real**, no unidades
aisladas -- ver D-9 (excepción de TDD aprobada) para el porqué no hay
RED/GREEN clásico acá.
"""

from __future__ import annotations

import httpx
import pytest

pytestmark = pytest.mark.e2e

_REGISTER_PATH = "/api/v1/auth/register"
_LOGIN_PATH = "/api/v1/auth/login"


def test_register_new_email_returns_201_and_token(
    bridge_base_url: str, smoke_identity: tuple[str, str], smoke_state: dict
) -> None:
    email, password = smoke_identity

    response = httpx.post(
        f"{bridge_base_url}{_REGISTER_PATH}", json={"email": email, "password": password}, timeout=5.0
    )

    assert response.status_code == 201
    body = response.json()
    assert body["access_token"]
    assert body["token_type"] == "bearer"
    smoke_state["register_token"] = body["access_token"]


def test_register_duplicate_email_returns_409(
    bridge_base_url: str, smoke_identity: tuple[str, str]
) -> None:
    email, password = smoke_identity

    response = httpx.post(
        f"{bridge_base_url}{_REGISTER_PATH}", json={"email": email, "password": password}, timeout=5.0
    )

    assert response.status_code == 409
    assert response.headers["content-type"].startswith("application/problem+json")
    body = response.json()
    assert body["status"] == 409
    assert body["title"] == "Conflict"
    assert body["detail"] == f"El email '{email}' ya está registrado."


def test_login_with_wrong_password_returns_401(
    bridge_base_url: str, smoke_identity: tuple[str, str]
) -> None:
    email, _ = smoke_identity

    response = httpx.post(
        f"{bridge_base_url}{_LOGIN_PATH}",
        json={"email": email, "password": "definitely-the-wrong-password-1"},
        timeout=5.0,
    )

    assert response.status_code == 401
    assert response.headers["content-type"].startswith("application/problem+json")
    body = response.json()
    # RN-WS-12 / anti-enumeración: título y detalle son literales fijos que
    # no interpolan el email -- el mismo cuerpo sale para "no existe" y para
    # "contraseña incorrecta".
    assert body["status"] == 401
    assert body["title"] == "Unauthorized"
    assert body["detail"] == "email o contraseña incorrectos"
    assert email not in body["detail"]


def test_login_with_valid_credentials_returns_200_and_token(
    bridge_base_url: str, smoke_identity: tuple[str, str], smoke_state: dict
) -> None:
    email, password = smoke_identity

    response = httpx.post(
        f"{bridge_base_url}{_LOGIN_PATH}", json={"email": email, "password": password}, timeout=5.0
    )

    assert response.status_code == 200
    body = response.json()
    assert body["access_token"]
    assert body["token_type"] == "bearer"
    # El token de esta corrida es el que usan los tests de escaneo (grupo 4):
    # se sobrescribe el de 3.1 a propósito, es el más fresco.
    smoke_state["access_token"] = body["access_token"]


@pytest.mark.asyncio(loop_scope="session")
async def test_registered_user_row_exists_in_db(
    db_conn, smoke_identity: tuple[str, str]
) -> None:
    email, plaintext_password = smoke_identity

    row = await db_conn.fetchrow(
        "SELECT email, hashed_password FROM users WHERE email = $1", email
    )

    assert row is not None, f"no existe fila en users para {email}"
    assert row["email"] == email
    assert row["hashed_password"].startswith("$2"), "no parece un hash bcrypt (prefijo $2)"
    assert row["hashed_password"] != plaintext_password
    print(f"\n[evidencia] users.email={row['email']} hashed_password_prefix={row['hashed_password'][:4]}...")
