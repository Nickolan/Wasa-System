"""Tests de `fastapi_bridge/core/security.py` (CHANGE-04, capabilities
`password-hashing` y `access-token`).

Suite puramente unitaria (D-14): sin base de datos, sin bucle de eventos.
Las cuatro primitivas son funciones síncronas y puras — un test puede
invocarlas directamente y construir su propio `Settings` a mano.
"""

from __future__ import annotations

import ast
import inspect
import time
from datetime import timedelta
from pathlib import Path

import pytest
from jose import jwt

from fastapi_bridge.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from fastapi_bridge.core.settings import Settings
from fastapi_bridge.schemas.auth_schemas import TokenData

FASTAPI_BRIDGE_ROOT = Path(__file__).resolve().parent.parent
SECURITY_MODULE = FASTAPI_BRIDGE_ROOT / "core" / "security.py"


def _settings(secret: str = "test-secret", hours: int = 24) -> Settings:
    # D-5: `Settings` construido a mano, sin tocar el cache de `get_settings`.
    return Settings(JWT_SECRET=secret, TOKEN_EXPIRE_HOURS=hours)


# ---------------------------------------------------------------------------
# 3.1 / 3.2 — hash_password / verify_password, camino feliz
# ---------------------------------------------------------------------------


def test_hash_password_returns_a_bcrypt_modular_string():
    hashed = hash_password("secret")
    assert isinstance(hashed, str)
    assert hashed.startswith("$2b$")


def test_verify_password_accepts_the_correct_password():
    hashed = hash_password("secret")
    assert verify_password("secret", hashed) is True


def test_verify_password_rejects_the_wrong_password():
    hashed = hash_password("secret")
    assert verify_password("wrong", hashed) is False


# ---------------------------------------------------------------------------
# 3.3 — sal aleatoria
# ---------------------------------------------------------------------------


def test_two_hashes_of_the_same_password_differ_and_both_verify():
    first = hash_password("secret")
    second = hash_password("secret")
    assert first != second
    assert verify_password("secret", first) is True
    assert verify_password("secret", second) is True


# ---------------------------------------------------------------------------
# 3.4 — coste embebido
# ---------------------------------------------------------------------------


def test_hash_embeds_cost_factor_twelve():
    hashed = hash_password("secret")
    # Formato modular: $2b$<coste>$<sal+hash>
    cost = hashed.split("$")[2]
    assert cost == "12"


# ---------------------------------------------------------------------------
# 3.5 — verificación distingue mayúsculas/espacios; Unicode multibyte
# ---------------------------------------------------------------------------


def test_verify_password_is_case_sensitive():
    hashed = hash_password("Secret")
    assert verify_password("secret", hashed) is False


def test_verify_password_does_not_ignore_trailing_space():
    hashed = hash_password("secret")
    assert verify_password("secret ", hashed) is False


def test_hash_password_supports_multibyte_unicode():
    hashed = hash_password("contraseña-ñoño-🔒")
    assert verify_password("contraseña-ñoño-🔒", hashed) is True
    assert verify_password("contraseña-ñoño-🔓", hashed) is False


# ---------------------------------------------------------------------------
# 3.6 / 3.7 — hash corrupto no rompe el servicio
# ---------------------------------------------------------------------------


def test_verify_password_returns_false_for_malformed_hash():
    assert verify_password("secret", "no-soy-un-hash") is False


def test_verify_password_returns_false_for_empty_hash():
    assert verify_password("secret", "") is False


# ---------------------------------------------------------------------------
# 3.8 — la contraseña no aparece en el hash
# ---------------------------------------------------------------------------


def test_plaintext_password_does_not_appear_in_the_hash():
    hashed = hash_password("mySecretPass123")
    assert "mySecretPass123" not in hashed


# ---------------------------------------------------------------------------
# 3.9 — el coste no es un parámetro del llamador
# ---------------------------------------------------------------------------


def test_hash_password_signature_takes_only_the_password():
    signature = inspect.signature(hash_password)
    assert list(signature.parameters.keys()) == ["plain"]


# ---------------------------------------------------------------------------
# 4.1 / 4.2 — emisión de JWT
# ---------------------------------------------------------------------------


def test_create_access_token_returns_a_three_segment_jwt():
    settings = _settings()
    token = create_access_token({"sub": "a@b.com"}, timedelta(hours=24), settings)
    assert isinstance(token, str)
    assert len(token.split(".")) == 3


def test_create_access_token_roundtrips_the_subject_claim():
    settings = _settings()
    token = create_access_token({"sub": "a@b.com"}, timedelta(hours=24), settings)
    payload = jwt.decode(token, settings.JWT_SECRET.get_secret_value(), algorithms=["HS256"])
    assert payload["sub"] == "a@b.com"


# ---------------------------------------------------------------------------
# 4.3 — exp / iat coherentes con expires_delta
# ---------------------------------------------------------------------------


def test_token_carries_exp_and_iat_consistent_with_expires_delta():
    settings = _settings()
    before = time.time()
    token = create_access_token({"sub": "a@b.com"}, timedelta(hours=24), settings)
    after = time.time()
    payload = jwt.decode(token, settings.JWT_SECRET.get_secret_value(), algorithms=["HS256"])
    assert "exp" in payload
    assert "iat" in payload
    # `iat`/`exp` son NumericDate (RFC 7519 §2): enteros truncados al
    # segundo, de ahí el margen de un segundo en el piso.
    assert int(before) - 1 <= payload["iat"] <= after
    assert payload["exp"] - payload["iat"] == pytest.approx(24 * 3600, abs=5)


def test_different_expires_delta_produces_a_different_exp():
    settings = _settings()
    token_short = create_access_token({"sub": "a@b.com"}, timedelta(hours=1), settings)
    token_long = create_access_token({"sub": "a@b.com"}, timedelta(hours=48), settings)
    payload_short = jwt.decode(token_short, settings.JWT_SECRET.get_secret_value(), algorithms=["HS256"])
    payload_long = jwt.decode(token_long, settings.JWT_SECRET.get_secret_value(), algorithms=["HS256"])
    assert payload_long["exp"] > payload_short["exp"]


# ---------------------------------------------------------------------------
# 4.4 / 4.5 — decode_access_token, camino feliz
# ---------------------------------------------------------------------------


def test_decode_access_token_recovers_the_email_on_the_happy_path():
    settings = _settings()
    token = create_access_token({"sub": "user@test.com"}, timedelta(hours=24), settings)
    data = decode_access_token(token, settings)
    assert data.email == "user@test.com"


# ---------------------------------------------------------------------------
# 4.6 / 4.7 — R-5: alg:none y firma con otra clave
# ---------------------------------------------------------------------------


def _build_unsigned_alg_none_token(payload: dict) -> str:
    """Construye a mano un JWT `alg: none` (python-jose se niega a emitirlo:
    `JWSError: Algorithm none not supported`, lo cual es una buena señal de
    la librería — pero un atacante no usa python-jose para forjarlo)."""
    import base64
    import json

    def _b64url(data: bytes) -> str:
        return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")

    header = _b64url(json.dumps({"alg": "none", "typ": "JWT"}).encode("utf-8"))
    body = _b64url(json.dumps(payload).encode("utf-8"))
    return f"{header}.{body}."


def test_decode_access_token_rejects_alg_none_token():
    # El test más importante del change: si decode_access_token derivara la
    # lista de algoritmos de la cabecera del propio token, un atacante podría
    # mandar un token sin firma (`alg: none`) y autenticarse como cualquier
    # identidad que escriba en `sub`.
    settings = _settings()
    forged = _build_unsigned_alg_none_token({"sub": "attacker@evil.com"})
    data = decode_access_token(forged, settings)
    assert data.email is None


def test_decode_access_token_rejects_token_signed_with_a_different_key():
    settings = _settings(secret="test-secret")
    other_settings = _settings(secret="a-completely-different-secret")
    token = create_access_token({"sub": "user@test.com"}, timedelta(hours=24), other_settings)
    data = decode_access_token(token, settings)
    assert data.email is None


# ---------------------------------------------------------------------------
# 4.8 / 4.9 — token expirado
# ---------------------------------------------------------------------------


def test_decode_access_token_rejects_expired_token_without_raising():
    settings = _settings()
    token = create_access_token({"sub": "user@test.com"}, timedelta(hours=-1), settings)
    data = decode_access_token(token, settings)
    assert data.email is None


# ---------------------------------------------------------------------------
# 4.10 — todos los rechazos son indistinguibles
# ---------------------------------------------------------------------------


def test_all_rejections_produce_the_same_indistinguishable_result():
    settings = _settings()

    garbage_token = "this-is-not-a-jwt-at-all"

    token_no_sub = jwt.encode({"iat": time.time()}, settings.JWT_SECRET.get_secret_value(), algorithm="HS256")

    valid_token = create_access_token({"sub": "user@test.com"}, timedelta(hours=24), settings)
    header, payload_segment, signature = valid_token.split(".")
    tampered_char = "a" if payload_segment[0] != "a" else "b"
    tampered_token = f"{header}.{tampered_char}{payload_segment[1:]}.{signature}"

    rs256_header_token = jwt.encode(
        {"sub": "user@test.com"},
        settings.JWT_SECRET.get_secret_value(),
        algorithm="HS256",
        headers={"alg": "RS256"},
    )

    results = [
        decode_access_token(garbage_token, settings),
        decode_access_token(token_no_sub, settings),
        decode_access_token(tampered_token, settings),
    ]
    for result in results:
        assert result == TokenData(email=None)
    # Cabecera con alg distinto (RS256) también rechazada e indistinguible.
    assert decode_access_token(rs256_header_token, settings) == TokenData(email=None)


def test_decode_access_token_rejects_rs256_header():
    settings = _settings()
    # No poseemos una clave RSA real, pero un token que declara RS256 en la
    # cabecera y viene firmado con HMAC igual debe rechazarse: la lista de
    # algoritmos permitidos nunca sale de la cabecera del propio token.
    token = jwt.encode(
        {"sub": "user@test.com"}, settings.JWT_SECRET.get_secret_value(), algorithm="HS256", headers={"alg": "RS256"}
    )
    data = decode_access_token(token, settings)
    assert data.email is None


# ---------------------------------------------------------------------------
# 4.11 — tipo devuelto siempre TokenData
# ---------------------------------------------------------------------------


def test_decode_access_token_always_returns_token_data():
    settings = _settings()
    valid_token = create_access_token({"sub": "user@test.com"}, timedelta(hours=24), settings)
    assert isinstance(decode_access_token(valid_token, settings), TokenData)
    assert isinstance(decode_access_token("garbage", settings), TokenData)


# ---------------------------------------------------------------------------
# 4.12 / 4.13 — el secreto y el token nunca se registran ni se hardcodean
# ---------------------------------------------------------------------------


def _module_source_calls_logging_with(tree: ast.AST, forbidden_names: set[str]) -> bool:
    """True si alguna llamada a `logging`/`logger.*` recibe una variable cuyo
    nombre está en `forbidden_names` como argumento."""
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            func = node.func
            is_logging_call = (isinstance(func, ast.Attribute) and func.attr in {
                "debug", "info", "warning", "error", "critical", "exception",
            }) or (isinstance(func, ast.Name) and func.id == "print")
            if not is_logging_call:
                continue
            for arg in list(node.args) + [kw.value for kw in node.keywords]:
                for name_node in ast.walk(arg):
                    if isinstance(name_node, ast.Name) and name_node.id in forbidden_names:
                        return True
    return False


def test_security_module_never_logs_secret_token_or_password():
    tree = ast.parse(SECURITY_MODULE.read_text(encoding="utf-8"), filename=str(SECURITY_MODULE))
    forbidden = {"token", "secret", "plain", "password", "key", "hashed"}
    assert _module_source_calls_logging_with(tree, forbidden) is False


def test_security_module_has_no_hardcoded_signing_key_literal():
    tree = ast.parse(SECURITY_MODULE.read_text(encoding="utf-8"), filename=str(SECURITY_MODULE))
    # Ninguna asignación de una constante de módulo (mayúsculas) puede ser un
    # string literal largo que luzca como secreto de firma.
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id.isupper() and "SECRET" in target.id:
                    pytest.fail(f"constante de módulo con nombre de secreto: {target.id}")


def test_no_module_outside_security_unwraps_jwt_secret():
    # 4.13: ningún módulo de producción fuera de core/security.py invoca
    # `.get_secret_value()` sobre JWT_SECRET.
    fastapi_bridge_root = FASTAPI_BRIDGE_ROOT
    offending: list[str] = []
    for py_file in fastapi_bridge_root.rglob("*.py"):
        if py_file == SECURITY_MODULE or "tests" in py_file.parts or ".venv" in py_file.parts:
            continue
        source = py_file.read_text(encoding="utf-8")
        if "get_secret_value" in source and "JWT_SECRET" in source:
            offending.append(str(py_file))
    assert offending == [], f"desenvuelven JWT_SECRET fuera de core/security.py: {offending}"
