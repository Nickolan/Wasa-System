"""Tests de `AuthService` (CHANGE-04, capability `auth-session`).

Integración real (D-14 de `design.md`): corre contra el motor SQLite async en
memoria de `user_session_factory` (`conftest.py`), con una `AuthUoW`
construida sobre esa factory. Lo que hay que demostrar de `register` es que
el alta **queda confirmada** y que ante excepción **no queda nada** — eso es
comportamiento del límite transaccional, no algo que un doble de sesión
pueda ejercitar.

`AuthService(uow)` recibe únicamente la Unit of Work por constructor
(`auth-session` spec, `CHANGES.md`): a diferencia de `create_access_token`/
`decode_access_token` (D-5, que sí reciben `Settings` explícito porque son
funciones puras de `core/security.py`), `register`/`login` obtienen
`Settings` internamente vía `get_settings()` — el mismo mecanismo cacheado
que usa el resto del Bridge fuera de las primitivas de seguridad puras. Los
tests que necesitan una configuración distinta de la default la inyectan
monkeypacheando `fastapi_bridge.services.auth_service.get_settings`.

Coste asumido (D-14, R-7): todos los tests de este módulo usan un coste de
bcrypt reducido vía monkeypatch de `_BCRYPT_ROUNDS`, para no inflar la
duración de la suite con el coste de producción (12) — la fortaleza real del
hash ya está anclada en `test_security.py`.
"""

from __future__ import annotations

import ast
import time
from pathlib import Path

import pytest
from sqlalchemy import select

from fastapi_bridge.core import security
from fastapi_bridge.core.security import decode_access_token, verify_password
from fastapi_bridge.core.settings import Settings
from fastapi_bridge.db.models import User
from fastapi_bridge.exceptions.domain import EmailAlreadyExistsError, InvalidCredentialsError
from fastapi_bridge.schemas.auth_schemas import TokenResponse, UserLogin, UserRegister
from fastapi_bridge.services import auth_service as auth_service_module
from fastapi_bridge.services.auth_service import AuthService
from fastapi_bridge.uow.auth_unit_of_work import AuthUoW

FASTAPI_BRIDGE_ROOT = Path(__file__).resolve().parent.parent
AUTH_SERVICE_MODULE = FASTAPI_BRIDGE_ROOT / "services" / "auth_service.py"

_DEFAULT_TEST_SETTINGS = Settings(JWT_SECRET="test-secret", TOKEN_EXPIRE_HOURS=24)


@pytest.fixture(autouse=True)
def _cheap_bcrypt(monkeypatch: pytest.MonkeyPatch):
    # D-14/R-7: coste reducido para todos los tests de este módulo.
    monkeypatch.setattr(security, "_BCRYPT_ROUNDS", 4)


@pytest.fixture(autouse=True)
def _fixed_test_settings(monkeypatch: pytest.MonkeyPatch):
    # Settings determinístico (secreto y expiración conocidos) sin tocar el
    # cache de get_settings() del resto de la suite.
    monkeypatch.setattr(auth_service_module, "get_settings", lambda: _DEFAULT_TEST_SETTINGS)


def _settings_with(hours: int) -> Settings:
    return Settings(JWT_SECRET="test-secret", TOKEN_EXPIRE_HOURS=hours)


def _service(session_factory) -> AuthService:
    return AuthService(AuthUoW(session_factory))


# ---------------------------------------------------------------------------
# 7.1 / 7.2 — register, camino feliz
# ---------------------------------------------------------------------------


async def test_register_returns_a_token_response(user_session_factory):
    service = _service(user_session_factory)
    response = await service.register(UserRegister(email="new@test.com", password="supersecret"))
    assert isinstance(response, TokenResponse)


# ---------------------------------------------------------------------------
# 7.3 — lo persistido es el hash
# ---------------------------------------------------------------------------


async def test_register_persists_a_bcrypt_hash_not_the_plaintext(user_session_factory):
    service = _service(user_session_factory)
    await service.register(UserRegister(email="hash@test.com", password="supersecret"))

    async with user_session_factory() as fresh_session:
        result = await fresh_session.execute(select(User).where(User.email == "hash@test.com"))
        user = result.scalar_one()
        assert user.hashed_password != "supersecret"
        assert user.hashed_password.startswith("$2b$")
        assert verify_password("supersecret", user.hashed_password) is True


# ---------------------------------------------------------------------------
# 7.4 — la respuesta no filtra nada
# ---------------------------------------------------------------------------


async def test_register_response_does_not_leak_password_or_hash(user_session_factory):
    service = _service(user_session_factory)
    response = await service.register(UserRegister(email="leak@test.com", password="supersecret"))
    dumped = response.model_dump()
    values = " ".join(str(v) for v in dumped.values())
    assert "supersecret" not in values
    assert response.token_type == "bearer"


# ---------------------------------------------------------------------------
# 7.5 — sub del token es el email normalizado
# ---------------------------------------------------------------------------


async def test_register_token_subject_is_the_normalized_email(user_session_factory):
    service = _service(user_session_factory)
    response = await service.register(UserRegister(email="USER@TEST.COM", password="supersecret"))
    data = decode_access_token(response.access_token, _DEFAULT_TEST_SETTINGS)
    assert data.email == "user@test.com"

    async with user_session_factory() as fresh_session:
        result = await fresh_session.execute(select(User).where(User.email == "user@test.com"))
        assert result.scalar_one_or_none() is not None


# ---------------------------------------------------------------------------
# 7.6 — expires_in en segundos, coherente con el token
# ---------------------------------------------------------------------------


async def test_register_expires_in_matches_configured_expiration(user_session_factory):
    service = _service(user_session_factory)
    response = await service.register(UserRegister(email="expiry@test.com", password="supersecret"))
    assert response.expires_in == 24 * 3600

    data = decode_access_token(response.access_token, _DEFAULT_TEST_SETTINGS)
    payload_exp_minus_iat = _token_lifetime_seconds(response.access_token)
    assert data.email == "expiry@test.com"
    assert payload_exp_minus_iat == pytest.approx(response.expires_in, abs=5)


def _token_lifetime_seconds(token: str) -> float:
    from jose import jwt

    payload = jwt.decode(
        token, _DEFAULT_TEST_SETTINGS.JWT_SECRET.get_secret_value(), algorithms=["HS256"]
    )
    return payload["exp"] - payload["iat"]


async def test_register_expires_in_follows_a_different_settings_value(user_session_factory, monkeypatch):
    monkeypatch.setattr(auth_service_module, "get_settings", lambda: _settings_with(hours=1))
    service = _service(user_session_factory)
    response = await service.register(UserRegister(email="expiry2@test.com", password="supersecret"))
    assert response.expires_in == 1 * 3600


# ---------------------------------------------------------------------------
# 7.7 / 7.8 — email duplicado
# ---------------------------------------------------------------------------


async def test_register_with_duplicate_email_raises_email_already_exists(user_session_factory):
    service = _service(user_session_factory)
    await service.register(UserRegister(email="dup@test.com", password="supersecret"))
    with pytest.raises(EmailAlreadyExistsError):
        await service.register(UserRegister(email="dup@test.com", password="othersecret"))

    async with user_session_factory() as fresh_session:
        result = await fresh_session.execute(select(User).where(User.email == "dup@test.com"))
        assert len(result.scalars().all()) == 1


async def test_register_with_duplicate_email_different_capitalization_also_raises(user_session_factory):
    service = _service(user_session_factory)
    await service.register(UserRegister(email="dup2@test.com", password="supersecret"))
    with pytest.raises(EmailAlreadyExistsError):
        await service.register(UserRegister(email="DUP2@TEST.COM", password="othersecret"))


# ---------------------------------------------------------------------------
# 7.9 — sin consulta previa de existencia (D-10)
# ---------------------------------------------------------------------------


def test_register_does_not_call_get_by_email():
    # D-10/R-7 de CHANGE-03: un pre-chequeo es optimización de UX, no la
    # garantía de RN-WS-13 (la da la constraint del motor). Agregarlo invita
    # a borrar la captura de IntegrityError que sí garantiza la regla.
    tree = ast.parse(AUTH_SERVICE_MODULE.read_text(encoding="utf-8"), filename=str(AUTH_SERVICE_MODULE))
    register_fn = None
    for node in ast.walk(tree):
        if isinstance(node, ast.AsyncFunctionDef) and node.name == "register":
            register_fn = node
            break
    assert register_fn is not None, "no se encontró `register` en services/auth_service.py"
    for node in ast.walk(register_fn):
        if isinstance(node, ast.Attribute) and node.attr == "get_by_email":
            pytest.fail("register invoca get_by_email: viola D-10 (sin pre-consulta de existencia)")


# ---------------------------------------------------------------------------
# 8.1 / 8.2 / 8.3 — login, camino feliz
# ---------------------------------------------------------------------------


async def test_login_returns_a_token_response_that_decodes_to_the_user_email(user_session_factory):
    service = _service(user_session_factory)
    await service.register(UserRegister(email="login@test.com", password="supersecret"))
    response = await service.login(UserLogin(email="login@test.com", password="supersecret"))
    data = decode_access_token(response.access_token, _DEFAULT_TEST_SETTINGS)
    assert data.email == "login@test.com"


async def test_login_accepts_any_capitalization_of_the_email(user_session_factory):
    service = _service(user_session_factory)
    await service.register(UserRegister(email="caseemail@test.com", password="supersecret"))
    response = await service.login(UserLogin(email="CASEEMAIL@TEST.COM", password="supersecret"))
    assert isinstance(response, TokenResponse)


async def test_login_password_is_case_sensitive(user_session_factory):
    service = _service(user_session_factory)
    await service.register(UserRegister(email="casepass@test.com", password="Supersecret"))
    with pytest.raises(InvalidCredentialsError):
        await service.login(UserLogin(email="casepass@test.com", password="supersecret"))


# ---------------------------------------------------------------------------
# 8.4 / 8.5 / 8.6 — rechazos
# ---------------------------------------------------------------------------


async def test_login_with_wrong_password_raises_invalid_credentials(user_session_factory):
    service = _service(user_session_factory)
    await service.register(UserRegister(email="wrongpw@test.com", password="supersecret"))
    with pytest.raises(InvalidCredentialsError):
        await service.login(UserLogin(email="wrongpw@test.com", password="incorrect"))


async def test_login_with_nonexistent_email_raises_invalid_credentials(user_session_factory):
    service = _service(user_session_factory)
    with pytest.raises(InvalidCredentialsError):
        await service.login(UserLogin(email="ghost@test.com", password="whatever1"))


# ---------------------------------------------------------------------------
# 8.7 — indistinguibilidad en el mensaje
# ---------------------------------------------------------------------------


async def test_the_two_rejection_paths_are_the_same_type_and_message(user_session_factory):
    service = _service(user_session_factory)
    await service.register(UserRegister(email="msgcheck@test.com", password="supersecret"))

    with pytest.raises(InvalidCredentialsError) as wrong_password_exc:
        await service.login(UserLogin(email="msgcheck@test.com", password="incorrect"))

    with pytest.raises(InvalidCredentialsError) as no_such_user_exc:
        await service.login(UserLogin(email="nosuchuser@test.com", password="incorrect"))

    assert type(wrong_password_exc.value) is type(no_such_user_exc.value)
    assert str(wrong_password_exc.value) == str(no_such_user_exc.value)


# ---------------------------------------------------------------------------
# 8.8 — indistinguibilidad en el tiempo (D-8)
# ---------------------------------------------------------------------------


async def test_the_two_rejection_paths_are_comparable_in_time(user_session_factory, monkeypatch):
    # A diferencia del resto del módulo, este test necesita el coste real de
    # bcrypt (12) en AMBOS caminos: `_DUMMY_PASSWORD_HASH` se deriva una sola
    # vez al importar el módulo, con el coste de producción, y comparar ese
    # camino contra un hash de usuario abaratado por `_cheap_bcrypt`
    # invertiría el resultado (el señuelo, más caro, "ganaría" por razones
    # que nada tienen que ver con D-8). Se restaura el coste real acá.
    monkeypatch.setattr(security, "_BCRYPT_ROUNDS", 12)
    service = _service(user_session_factory)
    await service.register(UserRegister(email="timing@test.com", password="supersecret"))

    async def _time_rejection(login_data: UserLogin) -> float:
        start = time.perf_counter()
        with pytest.raises(InvalidCredentialsError):
            await service.login(login_data)
        return time.perf_counter() - start

    wrong_password_time = await _time_rejection(UserLogin(email="timing@test.com", password="incorrect"))
    no_such_user_time = await _time_rejection(UserLogin(email="nosuchuser2@test.com", password="incorrect"))

    # Umbral relativo, no absoluto (para no ser frágil en CI): sin el
    # señuelo, "email inexistente" retorna en microsegundos y la razón sería
    # >100x más rápido que el camino con hashing real. Con el señuelo, ambos
    # están dentro de un orden de magnitud.
    slower = max(wrong_password_time, no_such_user_time)
    faster = max(min(wrong_password_time, no_such_user_time), 1e-6)
    assert slower / faster < 10


# ---------------------------------------------------------------------------
# 8.9 / 8.10 — el señuelo es constante de módulo, no recalculado
# ---------------------------------------------------------------------------


def test_dummy_password_hash_is_a_module_level_constant():
    tree = ast.parse(AUTH_SERVICE_MODULE.read_text(encoding="utf-8"), filename=str(AUTH_SERVICE_MODULE))
    module_level_names = set()
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    module_level_names.add(target.id)
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            module_level_names.add(node.target.id)

    dummy_hash_names = {name for name in module_level_names if "DUMMY" in name.upper()}
    assert dummy_hash_names, "no se encontró una constante de módulo con 'DUMMY' en el nombre"

    # No debe recalcularse dentro de `login`: ninguna llamada a hash_password
    # dentro del cuerpo de `login`.
    login_fn = None
    for node in ast.walk(tree):
        if isinstance(node, ast.AsyncFunctionDef) and node.name == "login":
            login_fn = node
            break
    assert login_fn is not None
    for node in ast.walk(login_fn):
        if isinstance(node, ast.Attribute) and node.attr == "hash_password":
            pytest.fail("login invoca hash_password: el señuelo debe derivarse una sola vez a nivel de módulo")


# ---------------------------------------------------------------------------
# 8.11 — login no escribe
# ---------------------------------------------------------------------------


async def test_successful_login_does_not_modify_the_user_row(user_session_factory):
    service = _service(user_session_factory)
    await service.register(UserRegister(email="nowrite@test.com", password="supersecret"))

    async with user_session_factory() as fresh_session:
        before = (
            await fresh_session.execute(select(User).where(User.email == "nowrite@test.com"))
        ).scalar_one()
        before_hash, before_created_at = before.hashed_password, before.created_at

    await service.login(UserLogin(email="nowrite@test.com", password="supersecret"))

    async with user_session_factory() as fresh_session:
        after = (
            await fresh_session.execute(select(User).where(User.email == "nowrite@test.com"))
        ).scalar_one()
        assert after.hashed_password == before_hash
        assert after.created_at == before_created_at


# ---------------------------------------------------------------------------
# 8.12 — el rechazo no registra el email
# ---------------------------------------------------------------------------


def test_rejection_path_does_not_log_the_email():
    tree = ast.parse(AUTH_SERVICE_MODULE.read_text(encoding="utf-8"), filename=str(AUTH_SERVICE_MODULE))
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            func = node.func
            is_logging_call = isinstance(func, ast.Attribute) and func.attr in {
                "debug", "info", "warning", "error", "critical", "exception",
            }
            if not is_logging_call:
                continue
            for arg in list(node.args) + [kw.value for kw in node.keywords]:
                for name_node in ast.walk(arg):
                    if isinstance(name_node, ast.Attribute) and name_node.attr == "email":
                        pytest.fail("una sentencia de logging referencia `.email`")


# ---------------------------------------------------------------------------
# 9.1 — offload a thread pool (R-4)
# ---------------------------------------------------------------------------


def test_hashing_calls_go_through_thread_offload_not_directly_in_the_coroutine():
    # Alcance: solo dentro de las corrutinas `register`/`login`. La
    # constante de módulo `_DUMMY_PASSWORD_HASH` (8.9/8.10) llama
    # `hash_password` directamente **a nivel de módulo**, en tiempo de
    # import — ahí no hay bucle de eventos que bloquear, así que esa llamada
    # queda fuera de este escenario a propósito.
    tree = ast.parse(AUTH_SERVICE_MODULE.read_text(encoding="utf-8"), filename=str(AUTH_SERVICE_MODULE))
    direct_calls: list[str] = []
    offloaded_calls: list[str] = []

    coroutines = [
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.AsyncFunctionDef) and node.name in {"register", "login"}
    ]
    assert coroutines, "no se encontraron register/login en services/auth_service.py"

    for coroutine in coroutines:
        for node in ast.walk(coroutine):
            if not isinstance(node, ast.Call):
                continue
            func = node.func
            # Llamada directa: hash_password(...) / verify_password(...)
            if isinstance(func, ast.Name) and func.id in {"hash_password", "verify_password"}:
                direct_calls.append(func.id)
            if isinstance(func, ast.Attribute) and func.attr in {"hash_password", "verify_password"}:
                direct_calls.append(func.attr)
            # Llamada vía anyio.to_thread.run_sync(hash_password, ...)
            if isinstance(func, ast.Attribute) and func.attr == "run_sync":
                for arg in node.args:
                    if isinstance(arg, ast.Name) and arg.id in {"hash_password", "verify_password"}:
                        offloaded_calls.append(arg.id)
                    if isinstance(arg, ast.Attribute) and arg.attr in {"hash_password", "verify_password"}:
                        offloaded_calls.append(arg.attr)

    # Dentro de register/login no debe haber ninguna llamada *directa*
    # (`hash_password(...)`/`verify_password(...)`) — solo referencias
    # pasadas como argumento de `run_sync`, nunca invocadas ellas mismas.
    assert offloaded_calls, "no se encontró ninguna llamada offloaded a hash_password/verify_password"
    assert direct_calls == [], (
        f"hay llamadas directas a hash_password/verify_password dentro de register/login, "
        f"sin pasar por el offload a thread pool: {direct_calls}"
    )


# ---------------------------------------------------------------------------
# 9.2 — el Service no confirma ni deshace transacciones
# ---------------------------------------------------------------------------


def test_service_never_calls_commit_or_rollback():
    tree = ast.parse(AUTH_SERVICE_MODULE.read_text(encoding="utf-8"), filename=str(AUTH_SERVICE_MODULE))
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute) and node.attr in {"commit", "rollback"}:
            pytest.fail(f"services/auth_service.py invoca `.{node.attr}()`: ese límite pertenece a AuthUoW")


# ---------------------------------------------------------------------------
# 9.3 — sin registro de material sensible
# ---------------------------------------------------------------------------


def test_service_never_logs_password_hash_or_token():
    tree = ast.parse(AUTH_SERVICE_MODULE.read_text(encoding="utf-8"), filename=str(AUTH_SERVICE_MODULE))
    forbidden = {"password", "hashed_password", "access_token", "token"}
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            func = node.func
            is_logging_call = isinstance(func, ast.Attribute) and func.attr in {
                "debug", "info", "warning", "error", "critical", "exception",
            }
            if not is_logging_call:
                continue
            for arg in list(node.args) + [kw.value for kw in node.keywords]:
                for name_node in ast.walk(arg):
                    if isinstance(name_node, ast.Name) and name_node.id in forbidden:
                        pytest.fail(f"sentencia de logging referencia `{name_node.id}`")


# ---------------------------------------------------------------------------
# 9.4 — imports prohibidos siguen en verde con código real
# ---------------------------------------------------------------------------


def test_auth_service_module_does_not_import_hashing_or_jwt_libraries():
    from fastapi_bridge.tests.test_layer_boundaries import get_imported_top_level_modules

    imported = get_imported_top_level_modules(AUTH_SERVICE_MODULE)
    assert "bcrypt" not in imported
    assert "passlib" not in imported
    assert "jose" not in imported
    assert "sqlalchemy" not in imported
