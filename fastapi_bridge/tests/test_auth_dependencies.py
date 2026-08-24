"""Tests de `get_auth_service` (CHANGE-05, D-1/D-8) y `get_current_user` /
`CurrentUserEmail` (CHANGE-06, capability `request-authentication`) —
composición y autenticación por `Depends`.

Grupo 3 de `openspec/changes/auth-router/tasks.md` (get_auth_service).
Grupos 3-8 de `openspec/changes/jwt-dependency/tasks.md` (get_current_user):
primero la dependencia como función pura (sin HTTP), después su forma sobre
HTTP real vía una ruta sonda descartable (D-11 de `design.md` — no se monta
nada en `api/v1/scan/router.py`, que sigue siendo responsabilidad de
CHANGE-12).
"""

from __future__ import annotations

import json
import logging as logging_module
from datetime import timedelta
from typing import Annotated

import httpx
import pytest
from fastapi import Depends, FastAPI, HTTPException
from jose import jwt
from sqlalchemy.ext.asyncio import async_sessionmaker

from fastapi_bridge.core.dependencies import (
    CurrentUserEmail,
    get_auth_service,
    get_current_user,
    oauth2_scheme,
)
from fastapi_bridge.core.security import create_access_token
from fastapi_bridge.core.settings import Settings, get_settings
from fastapi_bridge.db.session import get_session_factory
from fastapi_bridge.main import create_app
from fastapi_bridge.schemas.auth_schemas import UserLogin, UserRegister
from fastapi_bridge.services.auth_service import AuthService
from fastapi_bridge.uow.auth_unit_of_work import AuthUoW


def test_get_auth_service_returns_an_auth_service_instance():
    settings = Settings()
    service = get_auth_service(settings)
    assert isinstance(service, AuthService)


def test_get_auth_service_returns_a_new_instance_on_each_call():
    # D-8: una instancia de AuthService por petición, no un singleton.
    settings = Settings()
    first = get_auth_service(settings)
    second = get_auth_service(settings)
    assert first is not second
    # Construirla no dispara I/O: get_session_factory está cacheada por
    # DB_URL, así que ninguna de las dos invocaciones abre una conexión.
    assert isinstance(first._uow, AuthUoW)
    assert isinstance(second._uow, AuthUoW)


def test_get_auth_service_uses_the_session_factory_for_the_settings_passed_in():
    # La configuración llega por el parámetro `settings`, no por lectura
    # directa de un cache global fijo: dos Settings con distinto DB_URL
    # producen servicios ligados a factories distintas (identidad de la
    # factory cacheada por get_session_factory, D-7 de db/session.py).
    settings_a = Settings(DB_URL="sqlite+aiosqlite:///./does-not-exist-a.db")
    settings_b = Settings(DB_URL="sqlite+aiosqlite:///./does-not-exist-b.db")

    service_a = get_auth_service(settings_a)
    service_b = get_auth_service(settings_b)

    factory_a = get_session_factory(settings_a)
    factory_b = get_session_factory(settings_b)

    assert isinstance(factory_a, async_sessionmaker)
    assert factory_a is not factory_b
    assert service_a._uow._session_factory is factory_a
    assert service_b._uow._session_factory is factory_b


async def test_auth_service_built_like_get_auth_service_does_is_functional_end_to_end(user_session_factory):
    # Confirma que la composición AuthService(AuthUoW(session_factory)) -- la
    # misma que arma get_auth_service -- es funcional de punta a punta antes
    # de agregarle transporte HTTP encima. Se usa la fixture SQLite en vez de
    # get_session_factory(settings) para no depender de db_fuzzing.
    service = AuthService(AuthUoW(user_session_factory))

    register_data = UserRegister(email="triangulate@test.com", password="a-valid-password")
    register_token = await service.register(register_data)
    assert register_token.access_token

    login_data = UserLogin(email="triangulate@test.com", password="a-valid-password")
    login_token = await service.login(login_data)
    assert login_token.access_token


# ---------------------------------------------------------------------------
# CHANGE-06 -- grupo 3: get_current_user como función pura (D-1, D-5, D-6,
# D-7, D-8, D-10)
# ---------------------------------------------------------------------------


def _settings(secret: str = "test-secret", hours: int = 24) -> Settings:
    return Settings(JWT_SECRET=secret, TOKEN_EXPIRE_HOURS=hours)


def _token_for(email: str, settings: Settings, hours: int = 24) -> str:
    return create_access_token({"sub": email}, timedelta(hours=hours), settings)


async def test_get_current_user_resolves_the_email_of_a_valid_token():
    # 3.1: RED antes de que el símbolo existiera (ImportError); GREEN una
    # vez declarado get_current_user.
    settings = _settings()
    token = _token_for("user@test.com", settings)

    email = await get_current_user(token, settings)

    assert email == "user@test.com"


async def test_returned_email_is_exactly_the_token_subject():
    # 3.3: sin transformación intermedia entre el `sub` del token y lo
    # que devuelve la dependencia.
    settings = _settings()
    token = _token_for("exact-subject@test.com", settings)

    assert await get_current_user(token, settings) == "exact-subject@test.com"


async def test_returned_email_is_the_normalized_one_the_system_persists():
    # 3.3: un login con capitalización distinta resuelve al email
    # normalizado -- acá simulado directamente sobre el `sub` del token,
    # que es lo que AuthService ya normaliza antes de firmar.
    settings = _settings()
    token = _token_for("user@test.com", settings)

    assert await get_current_user(token, settings) == "user@test.com"


async def test_get_current_user_rejects_a_malformed_token():
    # 3.4 RED / 3.5 GREEN: token sin forma de JWT -> HTTPException(401).
    settings = _settings()

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user("this-is-not-a-jwt", settings)

    assert exc_info.value.status_code == 401


async def test_get_current_user_rejects_a_token_signed_with_a_different_key():
    # 3.6 TRIANGULATE.
    settings = _settings()
    other_key_settings = _settings(secret="a-different-key")
    token = _token_for("user@test.com", other_key_settings)

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(token, settings)

    assert exc_info.value.status_code == 401


async def test_get_current_user_rejects_an_expired_token():
    # 3.6 TRIANGULATE: exp en el pasado explícito, no un sleep.
    settings = _settings()
    token = _token_for("user@test.com", settings, hours=-1)

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(token, settings)

    assert exc_info.value.status_code == 401


async def test_get_current_user_rejects_a_token_without_subject():
    # 3.6 TRIANGULATE: jwt.encode directo, sin claim `sub`.
    settings = _settings()
    token = jwt.encode({"scope": "irrelevant"}, settings.JWT_SECRET.get_secret_value(), algorithm="HS256")

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(token, settings)

    assert exc_info.value.status_code == 401


async def test_get_current_user_rejects_a_missing_token():
    # 3.7 TRIANGULATE: token=None -- lo que entrega oauth2_scheme con
    # auto_error=False cuando no hay header o el esquema no es Bearer.
    # Rama que sólo existe por D-1: sin credenciales, no token inválido.
    settings = _settings()

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(None, settings)

    assert exc_info.value.status_code == 401
    assert exc_info.value.headers["WWW-Authenticate"] == "Bearer"


async def test_get_current_user_uses_the_settings_actually_injected():
    # 3.8 TRIANGULATE (D-7): un token emitido con una Settings se rechaza
    # al validarlo con otra de distinta JWT_SECRET.
    issuing_settings = _settings(secret="issuer-secret")
    validating_settings = _settings(secret="validator-secret")
    token = _token_for("user@test.com", issuing_settings)

    with pytest.raises(HTTPException):
        await get_current_user(token, validating_settings)

    # y con la misma Settings que lo emitió, resuelve sin problema.
    assert await get_current_user(token, issuing_settings) == "user@test.com"


async def test_get_current_user_resolves_without_any_database_available():
    # 3.9 TRIANGULATE (D-5): un email que no existe en ninguna tabla se
    # resuelve igual -- la validez del token es la prueba de identidad, y
    # esta llamada no abre ninguna sesión ni conexión.
    settings = _settings()
    token = _token_for("nobody-in-any-table@test.com", settings)

    email = await get_current_user(token, settings)

    assert email == "nobody-in-any-table@test.com"


# ---------------------------------------------------------------------------
# CHANGE-06 -- grupo 4: camino feliz sobre HTTP real, ruta sonda (D-11)
# ---------------------------------------------------------------------------

PROBE_PATH = "/_probe"


def _build_probe_app() -> tuple[FastAPI, dict[str, int]]:
    """`create_app()` con una ruta sonda `GET /_probe` agregada **en el
    test** (D-11): no se monta nada en `api/v1/scan/router.py`, que sigue
    siendo responsabilidad de CHANGE-12. La sonda cuenta sus ejecuciones
    para anclar 5.7 (la operación protegida no llega a correr ante un
    rechazo). Anotada con `Depends(get_current_user)` explícito -- el alias
    `CurrentUserEmail` se ejercita aparte en el grupo 6."""
    app = create_app()
    call_count = {"value": 0}

    @app.get(PROBE_PATH)
    async def probe(user_email: Annotated[str, Depends(get_current_user)]) -> dict[str, str]:
        call_count["value"] += 1
        return {"email": user_email}

    return app, call_count


async def _get_probe(app: FastAPI, headers: dict[str, str] | None = None) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(PROBE_PATH, headers=headers or {})


async def test_probe_with_valid_bearer_token_returns_200_and_the_email():
    # 4.1 RED / 4.2 GREEN.
    app, _call_count = _build_probe_app()
    settings = get_settings()
    token = _token_for("probe@test.com", settings)

    response = await _get_probe(app, headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json() == {"email": "probe@test.com"}


async def test_probe_settings_override_changes_which_tokens_are_accepted():
    # 4.3 TRIANGULATE: app.dependency_overrides[get_settings] con una
    # JWT_SECRET propia hace que la sonda acepte tokens de esa clave y
    # rechace los de la clave por defecto.
    app, _call_count = _build_probe_app()
    override_settings = _settings(secret="probe-override-secret")
    app.dependency_overrides[get_settings] = lambda: override_settings
    token_for_override = _token_for("probe@test.com", override_settings)
    token_for_default = _token_for("probe@test.com", get_settings())

    accepted = await _get_probe(app, headers={"Authorization": f"Bearer {token_for_override}"})
    rejected = await _get_probe(app, headers={"Authorization": f"Bearer {token_for_default}"})

    assert accepted.status_code == 200
    assert rejected.status_code == 401


async def test_probe_accepts_lowercase_bearer_scheme():
    # 4.4 TRIANGULATE: el esquema se compara sin distinguir mayúsculas,
    # tal como resuelve get_authorization_scheme_param.
    app, _call_count = _build_probe_app()
    settings = get_settings()
    token = _token_for("probe@test.com", settings)

    response = await _get_probe(app, headers={"Authorization": f"bearer {token}"})

    assert response.status_code == 200


# ---------------------------------------------------------------------------
# CHANGE-06 -- grupo 5: la forma del rechazo sobre HTTP (D-2, D-3, D-4)
# ---------------------------------------------------------------------------


def _assert_is_rfc7807_401(response: httpx.Response) -> dict:
    assert response.status_code == 401
    assert response.headers["content-type"] == "application/problem+json"
    body = json.loads(response.content)
    assert set(body.keys()) == {"type", "title", "status", "detail", "instance"}
    assert body["status"] == 401
    assert body["instance"] == PROBE_PATH
    return body


async def test_probe_without_authorization_header_is_401_rfc7807():
    # 5.1 RED/GREEN.
    app, _call_count = _build_probe_app()

    response = await _get_probe(app)

    _assert_is_rfc7807_401(response)


async def test_probe_with_basic_scheme_is_the_same_401_as_missing_header():
    # 5.2 TRIANGULATE: el caso que sólo auto_error=False deja bajo control.
    app, _call_count = _build_probe_app()

    no_header_response = await _get_probe(app)
    basic_response = await _get_probe(app, headers={"Authorization": "Basic dXNlcjpwYXNz"})

    assert basic_response.status_code == no_header_response.status_code == 401
    assert basic_response.content == no_header_response.content
    assert basic_response.headers["www-authenticate"] == no_header_response.headers["www-authenticate"]


async def test_probe_with_malformed_token_is_401_rfc7807():
    # 5.3 TRIANGULATE.
    app, _call_count = _build_probe_app()

    response = await _get_probe(app, headers={"Authorization": "Bearer not-a-jwt"})

    _assert_is_rfc7807_401(response)


async def test_probe_with_token_signed_by_a_different_key_is_401_rfc7807():
    # 5.3 TRIANGULATE.
    app, _call_count = _build_probe_app()
    token = _token_for("probe@test.com", _settings(secret="another-key"))

    response = await _get_probe(app, headers={"Authorization": f"Bearer {token}"})

    _assert_is_rfc7807_401(response)


async def test_probe_with_expired_token_is_401_rfc7807():
    # 5.3 TRIANGULATE.
    app, _call_count = _build_probe_app()
    token = _token_for("probe@test.com", get_settings(), hours=-1)

    response = await _get_probe(app, headers={"Authorization": f"Bearer {token}"})

    _assert_is_rfc7807_401(response)


async def test_the_four_rejections_of_a_present_token_are_byte_for_byte_identical():
    # 5.4: el test de mayor valor del change. Malformado, otra clave,
    # vencido y sin sujeto producen exactamente la misma respuesta.
    app, _call_count = _build_probe_app()
    settings = get_settings()

    malformed = await _get_probe(app, headers={"Authorization": "Bearer not-a-jwt"})
    other_key = await _get_probe(
        app, headers={"Authorization": f"Bearer {_token_for('probe@test.com', _settings(secret='another-key'))}"}
    )
    expired = await _get_probe(
        app, headers={"Authorization": f"Bearer {_token_for('probe@test.com', settings, hours=-1)}"}
    )
    no_subject_token = jwt.encode({"scope": "x"}, settings.JWT_SECRET.get_secret_value(), algorithm="HS256")
    no_subject = await _get_probe(app, headers={"Authorization": f"Bearer {no_subject_token}"})

    responses = [malformed, other_key, expired, no_subject]
    for response in responses:
        assert response.status_code == 401
    bodies = [response.content for response in responses]
    challenges = [response.headers["www-authenticate"] for response in responses]
    assert len(set(bodies)) == 1, "los cuatro rechazos deben tener el mismo cuerpo, byte a byte"
    assert len(set(challenges)) == 1, "los cuatro rechazos deben tener el mismo desafío"


async def test_challenge_follows_rfc6750_and_distinguishes_only_two_situations():
    # 5.5 TRIANGULATE (D-3).
    app, _call_count = _build_probe_app()

    no_credentials = await _get_probe(app)
    invalid_token = await _get_probe(app, headers={"Authorization": "Bearer not-a-jwt"})

    assert no_credentials.headers["www-authenticate"] == "Bearer"
    assert invalid_token.headers["www-authenticate"] == 'Bearer error="invalid_token"'
    for response in (no_credentials, invalid_token):
        assert "error_description" not in response.headers["www-authenticate"]
        assert response.headers["content-type"] == "application/problem+json"


async def test_the_same_challenge_for_every_kind_of_invalid_token():
    # 5.5 TRIANGULATE: malformado, vencido y otra clave -> mismo desafío.
    app, _call_count = _build_probe_app()
    settings = get_settings()

    malformed = await _get_probe(app, headers={"Authorization": "Bearer not-a-jwt"})
    expired = await _get_probe(
        app, headers={"Authorization": f"Bearer {_token_for('probe@test.com', settings, hours=-1)}"}
    )
    other_key = await _get_probe(
        app, headers={"Authorization": f"Bearer {_token_for('probe@test.com', _settings(secret='another-key'))}"}
    )

    challenges = {r.headers["www-authenticate"] for r in (malformed, expired, other_key)}
    assert challenges == {'Bearer error="invalid_token"'}


async def test_nothing_from_the_presented_token_appears_in_the_response():
    # 5.6 TRIANGULATE: ni el token entero ni ninguno de sus tres segmentos
    # figuran en el cuerpo ni en ningún header.
    app, _call_count = _build_probe_app()
    token = "a-token.that-looks.like-a-jwt-but-isnt"

    response = await _get_probe(app, headers={"Authorization": f"Bearer {token}"})

    raw = response.content.decode() + "".join(f"{k}:{v}" for k, v in response.headers.items())
    for segment in token.split("."):
        assert segment not in raw
    assert token not in raw
    assert "JWTError" not in raw
    assert "jose" not in raw


async def test_protected_operation_never_runs_on_any_rejection():
    # 5.7 TRIANGULATE: seis casos de rechazo, el contador de la sonda sigue
    # en cero.
    app, call_count = _build_probe_app()
    settings = get_settings()

    await _get_probe(app)  # sin header
    await _get_probe(app, headers={"Authorization": "Basic dXNlcjpwYXNz"})  # esquema distinto
    await _get_probe(app, headers={"Authorization": "Bearer not-a-jwt"})  # malformado
    await _get_probe(
        app, headers={"Authorization": f"Bearer {_token_for('probe@test.com', _settings(secret='x'))}"}
    )  # otra clave
    await _get_probe(
        app, headers={"Authorization": f"Bearer {_token_for('probe@test.com', settings, hours=-1)}"}
    )  # vencido
    no_subject_token = jwt.encode({"scope": "x"}, settings.JWT_SECRET.get_secret_value(), algorithm="HS256")
    await _get_probe(app, headers={"Authorization": f"Bearer {no_subject_token}"})  # sin sub

    assert call_count["value"] == 0


async def test_rejection_leaves_no_trace_of_the_token_or_the_resolved_email(caplog):
    # 5.8 TRIANGULATE.
    app, _call_count = _build_probe_app()
    settings = get_settings()
    caplog.set_level(logging_module.DEBUG)

    with caplog.at_level(logging_module.DEBUG):
        rejected_token = "reject-me-not-a-jwt"
        rejected = await _get_probe(app, headers={"Authorization": f"Bearer {rejected_token}"})
        valid_token = _token_for("must-not-be-logged@test.com", settings)
        accepted = await _get_probe(app, headers={"Authorization": f"Bearer {valid_token}"})

    assert rejected.status_code == 401
    assert accepted.status_code == 200
    for record in caplog.records:
        message = record.getMessage()
        assert rejected_token not in message
        assert "must-not-be-logged@test.com" not in message


# ---------------------------------------------------------------------------
# CHANGE-06 -- grupo 6: sustituibilidad, alias, documentación OpenAPI (D-6, D-13)
# ---------------------------------------------------------------------------


def _build_probe_app_with_alias() -> tuple[FastAPI, dict[str, int]]:
    app = create_app()
    call_count = {"value": 0}

    @app.get(PROBE_PATH)
    async def probe(user_email: CurrentUserEmail) -> dict[str, str]:
        call_count["value"] += 1
        return {"email": user_email}

    return app, call_count


async def test_current_user_email_alias_behaves_like_explicit_depends():
    # 6.1: una sonda anotada con el alias se comporta igual que con
    # Depends(get_current_user) explícito.
    alias_app, _ = _build_probe_app_with_alias()
    explicit_app, _ = _build_probe_app()
    settings = get_settings()
    token = _token_for("alias@test.com", settings)

    alias_response = await _get_probe(alias_app, headers={"Authorization": f"Bearer {token}"})
    explicit_response = await _get_probe(explicit_app, headers={"Authorization": f"Bearer {token}"})

    assert alias_response.status_code == explicit_response.status_code == 200
    assert alias_response.json() == explicit_response.json() == {"email": "alias@test.com"}


async def test_dependency_override_lets_the_probe_respond_without_any_authorization_header():
    # 6.2: exactamente lo que CHANGE-12 necesita para /scan/start.
    app, call_count = _build_probe_app_with_alias()
    app.dependency_overrides[get_current_user] = lambda: "overridden@test.com"

    response = await _get_probe(app)

    assert response.status_code == 200
    assert response.json() == {"email": "overridden@test.com"}
    assert call_count["value"] == 1


async def test_oauth2_scheme_returns_the_raw_token_while_the_alias_returns_the_validated_email():
    # 6.3: piezas distintas -- una sonda con Depends(oauth2_scheme) recibe
    # el token crudo sin validar.
    app = create_app()

    @app.get(PROBE_PATH)
    async def probe(raw_token: Annotated[str, Depends(oauth2_scheme)]) -> dict[str, str]:
        return {"raw_token": raw_token}

    settings = get_settings()
    token = _token_for("raw@test.com", settings)

    response = await _get_probe(app, headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    # el extractor devuelve el token tal cual, no el email -- sin validar.
    assert response.json() == {"raw_token": token}


async def test_token_url_points_to_the_real_login_route():
    # 6.4.
    assert oauth2_scheme.model.flows.password.tokenUrl == "/api/v1/auth/login"
    app = create_app()
    paths = app.openapi()["paths"]
    assert "/api/v1/auth/login" in paths


async def test_openapi_schema_with_probe_route_declares_the_security_requirement():
    # 6.5. Confirma de paso 1.4: auto_error=False no impide la declaración
    # del esquema (D-1) ni su asociación con la operación que lo usa.
    app, _ = _build_probe_app()

    schema = app.openapi()

    probe_operation = schema["paths"][PROBE_PATH]["get"]
    assert "security" in probe_operation and probe_operation["security"]

    security_schemes = schema["components"]["securitySchemes"]
    assert security_schemes, "debe declarar al menos un esquema de seguridad"
    declared_scheme = next(iter(security_schemes.values()))
    assert declared_scheme["flows"]["password"]["tokenUrl"] == "/api/v1/auth/login"


async def test_only_the_scan_start_operation_declares_security():
    # 6.5 / 8.3 (reemplaza a `test_declaring_the_schema_alone_protects_nothing`):
    # cuando se escribió este test, ninguna ruta de producción usaba todavía
    # `get_current_user`/`CurrentUserEmail`, así que declarar el esquema no
    # protegía nada -- el aserto original ("ninguna operación existente debe
    # declarar seguridad todavía") queda desmentido por CHANGE-12, que sí
    # aplica el guard sobre `POST /api/v1/scan/start`. Se reescribe para
    # afirmar lo que ahora corresponde: la protección sigue siendo por
    # operación, no global -- exactamente una operación la declara, y es la
    # que efectivamente usa la dependencia.
    app = create_app()

    schema = app.openapi()

    protected_paths = {
        path
        for path, path_item in schema["paths"].items()
        for operation in path_item.values()
        if operation.get("security")
    }
    assert protected_paths == {"/api/v1/scan/start"}


# ---------------------------------------------------------------------------
# CHANGE-06 -- grupo 8: regresión de superficie de API (D-11)
#
# 8.1 (rutas registradas == health + register + login) y la mitad de 8.2
# (scan/start sigue en 404 RFC 7807) estaban anclados, en su momento sin
# tocarlos, por `test_app_wiring.py::test_route_surface_includes_health_and_auth_but_not_scan`
# y `::test_still_unmounted_scan_route_returns_404_in_rfc7807_format`
# (CHANGE-05/07). CHANGE-12 monta y protege `POST /api/v1/scan/start`, así
# que esos dos anclajes ya no describen el estado vigente: se renombraron y
# reescribieron ahí mismo (`test_route_surface_includes_health_auth_and_scan`,
# `test_scan_route_without_credentials_returns_401_in_rfc7807_format`) para
# afirmar lo que corresponde ahora. Acá sólo se agrega lo que ningún test
# previo cubre: que las rutas públicas siguen respondiendo sin exigir
# Authorization.
# ---------------------------------------------------------------------------


async def test_public_routes_still_respond_without_an_authorization_header():
    # 8.2: health, register y login no devuelven 401 sin header -- agregar
    # get_current_user al módulo no las protege por sí solo. Se sustituye
    # get_auth_service por un doble (mismo patrón que
    # test_get_auth_service_dependency_is_substitutable_by_the_route` en
    # test_layer_boundaries.py) para no depender de una conexión real a
    # db_fuzzing en este test -- lo único que importa acá es el status code.
    from fastapi_bridge.schemas.auth_schemas import TokenResponse

    class _Double:
        async def register(self, data: UserRegister) -> TokenResponse:
            return TokenResponse(access_token="double-token", expires_in=1)

        async def login(self, data: UserLogin) -> TokenResponse:
            return TokenResponse(access_token="double-token", expires_in=1)

    app = create_app()
    app.dependency_overrides[get_auth_service] = lambda: _Double()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        health_response = await client.get("/health")
        register_response = await client.post(
            "/api/v1/auth/register", json={"email": "still-public@test.com", "password": "a-valid-password"}
        )
        login_response = await client.post(
            "/api/v1/auth/login", json={"email": "still-public@test.com", "password": "a-valid-password"}
        )

    for response in (health_response, register_response, login_response):
        assert response.status_code != 401
