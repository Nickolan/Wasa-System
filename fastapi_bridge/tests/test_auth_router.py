"""Tests end-to-end (ASGI in-process) del router de auth (CHANGE-05).

Grupos 4-7 de `openspec/changes/auth-router/tasks.md`: camino feliz de
registro y login, rechazos de validación y de dominio, y documentación
OpenAPI. `auth_client` construye la app real (`create_app()`) y sustituye
`get_auth_service` por un `AuthService` sobre SQLite en memoria (D-9) — nunca
apunta a `db_fuzzing`. `httpx.ASGITransport` no dispara el `lifespan`.
"""

from __future__ import annotations

from typing import AsyncIterator

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from fastapi_bridge.core.dependencies import get_auth_service
from fastapi_bridge.core.security import decode_access_token
from fastapi_bridge.core.settings import get_settings
from fastapi_bridge.db.models import User
from fastapi_bridge.exceptions.domain import DomainError
from fastapi_bridge.main import create_app
from fastapi_bridge.schemas.auth_schemas import TokenResponse, UserLogin, UserRegister
from fastapi_bridge.services.auth_service import AuthService
from fastapi_bridge.uow.auth_unit_of_work import AuthUoW

VALID_PASSWORD = "a-valid-password"


class _SpyAuthService:
    """Doble de `AuthService` que registra si `register`/`login` fueron
    invocados — usado para probar que la validación de Pydantic corta el
    camino antes de alcanzar la capa de servicio (6.6)."""

    def __init__(self) -> None:
        self.register_called = False
        self.login_called = False

    async def register(self, data: UserRegister) -> TokenResponse:
        self.register_called = True
        return TokenResponse(access_token="unused", expires_in=3600)

    async def login(self, data: UserLogin) -> TokenResponse:
        self.login_called = True
        return TokenResponse(access_token="unused", expires_in=3600)


class _UnmappedDomainError(DomainError):
    """Subclase de `DomainError` deliberadamente ajena a `_DOMAIN_ERROR_MAP`
    (6.8): ejercita el fallback a 500 del `domain_error_handler`."""


class _ExplodingAuthService:
    """Doble cuyo `register`/`login` lanzan un `DomainError` no mapeado."""

    async def register(self, data: UserRegister) -> TokenResponse:
        raise _UnmappedDomainError("boom")

    async def login(self, data: UserLogin) -> TokenResponse:
        raise _UnmappedDomainError("boom")


@pytest.fixture
def auth_app(user_session_factory: async_sessionmaker[AsyncSession]):
    app = create_app()
    app.dependency_overrides[get_auth_service] = lambda: AuthService(AuthUoW(user_session_factory))
    yield app
    app.dependency_overrides.clear()


@pytest.fixture
async def auth_client(auth_app) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=auth_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


# ---------------------------------------------------------------------------
# 4. POST /api/v1/auth/register -- camino feliz y montaje
# ---------------------------------------------------------------------------


async def test_register_with_valid_data_returns_201(auth_client: httpx.AsyncClient):
    response = await auth_client.post(
        "/api/v1/auth/register",
        json={"email": "new-user@test.com", "password": VALID_PASSWORD},
    )
    assert response.status_code == 201


async def test_register_response_body_is_a_complete_token_response(auth_client: httpx.AsyncClient):
    response = await auth_client.post(
        "/api/v1/auth/register",
        json={"email": "complete-token@test.com", "password": VALID_PASSWORD},
    )
    body = response.json()
    assert body["access_token"]
    assert body["token_type"] == "bearer"
    assert isinstance(body["expires_in"], int)
    assert body["expires_in"] > 0


async def test_register_token_decodes_to_the_registered_email_and_hash_differs_from_password(
    auth_client: httpx.AsyncClient, user_session_factory: async_sessionmaker[AsyncSession]
):
    email = "decodes-correctly@test.com"
    response = await auth_client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": VALID_PASSWORD},
    )
    token = response.json()["access_token"]

    token_data = decode_access_token(token, get_settings())
    assert token_data.email == email

    async with user_session_factory() as session:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one()
    assert user.hashed_password != VALID_PASSWORD


async def test_register_response_does_not_leak_password_or_hash_and_has_exact_keys(
    auth_client: httpx.AsyncClient,
):
    response = await auth_client.post(
        "/api/v1/auth/register",
        json={"email": "no-leak@test.com", "password": VALID_PASSWORD},
    )
    raw_body = response.text
    assert VALID_PASSWORD not in raw_body

    body = response.json()
    assert set(body.keys()) == {"access_token", "token_type", "expires_in"}
    assert VALID_PASSWORD not in body["access_token"]


async def test_register_prefix_is_not_duplicated(auth_client: httpx.AsyncClient):
    response = await auth_client.post(
        "/api/v1/auth/api/v1/auth/register",
        json={"email": "duplicated-prefix@test.com", "password": VALID_PASSWORD},
    )
    assert response.status_code == 404


async def test_application_route_surface_is_exactly_health_auth_and_scan(auth_app):
    # CHANGE-12 monta `POST /api/v1/scan/start`. Este test reemplaza al
    # anterior (`test_application_route_surface_is_exactly_health_and_auth`),
    # cuyo aserto de superficie exacta quedó desmentido por ese montaje.
    paths = set(auth_app.openapi()["paths"].keys())
    assert paths == {"/health", "/api/v1/auth/register", "/api/v1/auth/login", "/api/v1/scan/start"}


# ---------------------------------------------------------------------------
# 5. POST /api/v1/auth/login -- camino feliz y rechazo indistinguible
# ---------------------------------------------------------------------------


async def test_login_with_credentials_from_registration_returns_200(auth_client: httpx.AsyncClient):
    email = "login-happy-path@test.com"
    await auth_client.post("/api/v1/auth/register", json={"email": email, "password": VALID_PASSWORD})

    response = await auth_client.post("/api/v1/auth/login", json={"email": email, "password": VALID_PASSWORD})
    assert response.status_code == 200


async def test_login_token_decodes_to_the_user_email(auth_client: httpx.AsyncClient):
    email = "login-decodes@test.com"
    await auth_client.post("/api/v1/auth/register", json={"email": email, "password": VALID_PASSWORD})

    response = await auth_client.post("/api/v1/auth/login", json={"email": email, "password": VALID_PASSWORD})
    token_data = decode_access_token(response.json()["access_token"], get_settings())
    assert token_data.email == email


async def test_login_with_different_capitalization_of_a_registered_email_returns_200(
    auth_client: httpx.AsyncClient,
):
    await auth_client.post(
        "/api/v1/auth/register", json={"email": "user@test.com", "password": VALID_PASSWORD}
    )
    response = await auth_client.post(
        "/api/v1/auth/login", json={"email": "USER@TEST.COM", "password": VALID_PASSWORD}
    )
    assert response.status_code == 200


async def test_register_and_login_return_the_same_response_shape_with_different_status_codes(
    auth_client: httpx.AsyncClient,
):
    email = "same-shape@test.com"
    register_response = await auth_client.post(
        "/api/v1/auth/register", json={"email": email, "password": VALID_PASSWORD}
    )
    login_response = await auth_client.post(
        "/api/v1/auth/login", json={"email": email, "password": VALID_PASSWORD}
    )
    assert set(register_response.json().keys()) == set(login_response.json().keys())
    assert register_response.status_code == 201
    assert login_response.status_code == 200


async def test_login_with_nonexistent_email_returns_401(auth_client: httpx.AsyncClient):
    response = await auth_client.post(
        "/api/v1/auth/login", json={"email": "nobody@test.com", "password": VALID_PASSWORD}
    )
    assert response.status_code == 401


async def test_login_with_wrong_password_returns_401(auth_client: httpx.AsyncClient):
    email = "wrong-password@test.com"
    await auth_client.post("/api/v1/auth/register", json={"email": email, "password": VALID_PASSWORD})

    response = await auth_client.post(
        "/api/v1/auth/login", json={"email": email, "password": "not-the-right-password"}
    )
    assert response.status_code == 401


async def test_the_two_401_bodies_are_field_by_field_identical(auth_client: httpx.AsyncClient):
    email = "identical-401@test.com"
    await auth_client.post("/api/v1/auth/register", json={"email": email, "password": VALID_PASSWORD})

    nonexistent_response = await auth_client.post(
        "/api/v1/auth/login", json={"email": "does-not-exist@test.com", "password": VALID_PASSWORD}
    )
    wrong_password_response = await auth_client.post(
        "/api/v1/auth/login", json={"email": email, "password": "wrong-one"}
    )
    assert nonexistent_response.json() == wrong_password_response.json()
    assert nonexistent_response.status_code == wrong_password_response.status_code == 401


async def test_login_401_is_complete_rfc7807_and_does_not_echo_the_email(auth_client: httpx.AsyncClient):
    sent_email = "should-not-be-echoed@test.com"
    response = await auth_client.post(
        "/api/v1/auth/login", json={"email": sent_email, "password": VALID_PASSWORD}
    )
    assert response.status_code == 401
    assert response.headers["content-type"] == "application/problem+json"

    body = response.json()
    assert set(body.keys()) == {"type", "title", "status", "detail", "instance"}
    assert body["status"] == 401
    assert body["instance"] == "/api/v1/auth/login"
    assert sent_email not in response.text


# ---------------------------------------------------------------------------
# 6. Rechazos del registro y de la validación de entrada
# ---------------------------------------------------------------------------


async def test_duplicate_email_on_register_returns_409_and_creates_no_second_row(
    auth_client: httpx.AsyncClient, user_session_factory: async_sessionmaker[AsyncSession]
):
    email = "duplicate@test.com"
    first_response = await auth_client.post(
        "/api/v1/auth/register", json={"email": email, "password": VALID_PASSWORD}
    )
    assert first_response.status_code == 201

    second_response = await auth_client.post(
        "/api/v1/auth/register", json={"email": email, "password": VALID_PASSWORD}
    )
    assert second_response.status_code == 409
    body = second_response.json()
    assert body["status"] == 409
    assert body["instance"] == "/api/v1/auth/register"

    async with user_session_factory() as session:
        result = await session.execute(select(User).where(User.email == email))
        rows = result.scalars().all()
    assert len(rows) == 1


async def test_duplicate_email_with_different_capitalization_also_returns_409(
    auth_client: httpx.AsyncClient,
):
    await auth_client.post(
        "/api/v1/auth/register", json={"email": "case-collision@test.com", "password": VALID_PASSWORD}
    )
    response = await auth_client.post(
        "/api/v1/auth/register", json={"email": "CASE-COLLISION@TEST.COM", "password": VALID_PASSWORD}
    )
    assert response.status_code == 409


async def test_password_shorter_than_minimum_returns_422_without_leaking_the_password(
    auth_client: httpx.AsyncClient,
):
    short_password = "short1"
    response = await auth_client.post(
        "/api/v1/auth/register", json={"email": "short-password@test.com", "password": short_password}
    )
    assert response.status_code == 422
    body = response.json()
    assert "password" in body["detail"]
    assert short_password not in response.text


@pytest.mark.parametrize(
    "payload",
    [
        {"email": "not-an-email", "password": VALID_PASSWORD},
        {"email": "missing-password@test.com"},
        {"email": "extra-field@test.com", "password": VALID_PASSWORD, "confirmPassword": VALID_PASSWORD},
    ],
    ids=["invalid-email-format", "missing-password-field", "extra-field-forbidden"],
)
async def test_register_validation_rejections_return_422(auth_client: httpx.AsyncClient, payload: dict):
    # El caso "extra-field-forbidden" documenta el riesgo para CHANGE-16
    # (design.md §Risks): `UserRegister` tiene `extra="forbid"`, así que un
    # frontend que mande `confirmPassword` junto al resto del formulario
    # recibe 422. El cliente real debe mandar sólo {email, password}.
    response = await auth_client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 422


async def test_register_with_unparseable_json_body_returns_400_not_422(auth_client: httpx.AsyncClient):
    response = await auth_client.post(
        "/api/v1/auth/register",
        content=b"{not-valid-json",
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 400


async def test_validation_failure_never_reaches_the_service_layer(auth_app):
    spy = _SpyAuthService()
    auth_app.dependency_overrides[get_auth_service] = lambda: spy
    transport = httpx.ASGITransport(app=auth_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/v1/auth/register", json={"email": "not-an-email"})

    assert response.status_code == 422
    assert spy.register_called is False
    assert spy.login_called is False


async def test_wrong_http_method_on_login_returns_405_in_rfc7807_format(auth_client: httpx.AsyncClient):
    response = await auth_client.get("/api/v1/auth/login")
    assert response.status_code == 405
    body = response.json()
    assert set(body.keys()) == {"type", "title", "status", "detail", "instance"}


async def test_unmapped_domain_error_from_the_service_surfaces_as_generic_500(auth_app):
    auth_app.dependency_overrides[get_auth_service] = lambda: _ExplodingAuthService()
    transport = httpx.ASGITransport(app=auth_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/auth/register", json={"email": "explode@test.com", "password": VALID_PASSWORD}
        )

    assert response.status_code == 500
    body = response.json()
    assert body["detail"] == "Ocurrió un error inesperado procesando la solicitud."
    assert "_UnmappedDomainError" not in response.text
    assert "boom" not in response.text


# ---------------------------------------------------------------------------
# 7. Documentación OpenAPI (D-7)
# ---------------------------------------------------------------------------


def test_openapi_declares_both_routes_with_their_success_status_and_token_response_schema():
    app = create_app()
    schema = app.openapi()

    register_op = schema["paths"]["/api/v1/auth/register"]["post"]
    login_op = schema["paths"]["/api/v1/auth/login"]["post"]

    assert "201" in register_op["responses"]
    assert "200" in login_op["responses"]

    register_schema_ref = register_op["responses"]["201"]["content"]["application/json"]["schema"]
    login_schema_ref = login_op["responses"]["200"]["content"]["application/json"]["schema"]
    assert "TokenResponse" in str(register_schema_ref)
    assert "TokenResponse" in str(login_schema_ref)


def test_openapi_documented_errors_use_the_project_error_model_not_the_framework_default():
    app = create_app()
    schema = app.openapi()

    register_422 = schema["paths"]["/api/v1/auth/register"]["post"]["responses"]["422"]
    login_422 = schema["paths"]["/api/v1/auth/login"]["post"]["responses"]["422"]

    for operation_422 in (register_422, login_422):
        assert "application/problem+json" in operation_422["content"]
        assert "HTTPValidationError" not in str(operation_422["content"])
        assert "ErrorDetail" in str(operation_422["content"])

    register_409 = schema["paths"]["/api/v1/auth/register"]["post"]["responses"]["409"]
    login_401 = schema["paths"]["/api/v1/auth/login"]["post"]["responses"]["401"]
    assert "application/problem+json" in register_409["content"]
    assert "application/problem+json" in login_401["content"]


def test_openapi_auth_operations_are_tagged_auth_and_schema_builds_without_raising():
    app = create_app()
    schema = app.openapi()

    register_op = schema["paths"]["/api/v1/auth/register"]["post"]
    login_op = schema["paths"]["/api/v1/auth/login"]["post"]
    assert register_op["tags"] == ["auth"]
    assert login_op["tags"] == ["auth"]

    health_op = schema["paths"]["/health"]["get"]
    assert health_op.get("tags", []) != ["auth"]
