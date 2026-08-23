"""Tests de los contratos Pydantic v2 del dominio auth (CHANGE-02, `auth-contracts`).

Unitarios puros (D-13): validan los modelos directamente, sin `TestClient` ni
router — el router no existe hasta CHANGE-05, y estos schemas no dependen de
FastAPI (ver `test_layer_boundaries.py`).
"""

import inspect
from pathlib import Path

from pydantic import BaseModel, ValidationError

import fastapi_bridge.schemas.auth_schemas as auth_schemas_module
from fastapi_bridge.schemas.auth_schemas import TokenData, TokenResponse, UserLogin, UserRegister
from fastapi_bridge.tests.test_layer_boundaries import get_imported_top_level_modules


def test_user_register_valid_payload_constructs_without_error():
    user = UserRegister(email="user@example.com", password="a-valid-password")
    assert user.email == "user@example.com"
    assert user.password == "a-valid-password"


def test_user_register_fields_are_exactly_email_and_password():
    assert set(UserRegister.model_fields.keys()) == {"email", "password"}


def test_user_register_missing_email_fails():
    try:
        UserRegister(password="a-valid-password")
        assert False, "se esperaba ValidationError"
    except ValidationError as exc:
        errors = exc.errors()
        assert any(error["loc"] == ("email",) for error in errors)


def test_user_register_missing_password_fails():
    try:
        UserRegister(email="user@example.com")
        assert False, "se esperaba ValidationError"
    except ValidationError as exc:
        errors = exc.errors()
        assert any(error["loc"] == ("password",) for error in errors)


def test_user_register_missing_both_fields_fails_for_each():
    try:
        UserRegister()
        assert False, "se esperaba ValidationError"
    except ValidationError as exc:
        error_fields = {error["loc"][0] for error in exc.errors()}
        assert error_fields == {"email", "password"}


def test_user_register_email_without_at_sign_fails():
    try:
        UserRegister(email="not-an-email", password="a-valid-password")
        assert False, "se esperaba ValidationError"
    except ValidationError as exc:
        assert any(error["loc"] == ("email",) for error in exc.errors())


def test_user_register_email_without_domain_fails():
    try:
        UserRegister(email="user@", password="a-valid-password")
        assert False, "se esperaba ValidationError"
    except ValidationError as exc:
        assert any(error["loc"] == ("email",) for error in exc.errors())


def test_user_register_empty_email_fails():
    try:
        UserRegister(email="", password="a-valid-password")
        assert False, "se esperaba ValidationError"
    except ValidationError as exc:
        assert any(error["loc"] == ("email",) for error in exc.errors())


# --- Política de longitud de contraseña (RN-WS-15, D-4: sin reglas de complejidad) ---


def test_user_register_password_below_minimum_length_fails():
    try:
        UserRegister(email="user@example.com", password="1234567")
        assert False, "se esperaba ValidationError"
    except ValidationError as exc:
        assert any(error["loc"] == ("password",) for error in exc.errors())


def test_user_register_password_exactly_at_minimum_length_passes():
    user = UserRegister(email="user@example.com", password="12345678")
    assert user.password == "12345678"


def test_user_register_password_lowercase_only_of_valid_length_passes():
    # D-4: sin reglas de complejidad — solo minúsculas de longitud válida alcanza.
    user = UserRegister(email="user@example.com", password="abcdefgh")
    assert user.password == "abcdefgh"


# --- Techo de 72 bytes UTF-8 (D-2): límite duro de bcrypt, medido en bytes ---


def test_user_register_password_over_72_ascii_bytes_fails():
    password = "a" * 73  # 73 caracteres ASCII == 73 bytes UTF-8
    try:
        UserRegister(email="user@example.com", password=password)
        assert False, "se esperaba ValidationError"
    except ValidationError as exc:
        assert any(error["loc"] == ("password",) for error in exc.errors())


def test_user_register_password_under_72_chars_but_over_72_bytes_fails():
    # 40 caracteres multibyte ("á" son 2 bytes en UTF-8) -> 80 bytes, pero
    # solo 40 caracteres: si se midiera por max_length=72 (caracteres) pasaría.
    password = "á" * 40
    assert len(password) < 72
    assert len(password.encode("utf-8")) > 72
    try:
        UserRegister(email="user@example.com", password=password)
        assert False, "se esperaba ValidationError"
    except ValidationError as exc:
        assert any(error["loc"] == ("password",) for error in exc.errors())


def test_user_register_multibyte_password_within_72_bytes_passes():
    # 30 caracteres multibyte -> 60 bytes, dentro del techo.
    password = "á" * 30
    assert len(password.encode("utf-8")) <= 72
    user = UserRegister(email="user@example.com", password=password)
    assert user.password == password


# --- Rechazo de campos desconocidos (extra="forbid") ---


def test_user_register_extra_field_fails():
    try:
        UserRegister(email="user@example.com", password="a-valid-password", is_admin=True)
        assert False, "se esperaba ValidationError"
    except ValidationError as exc:
        assert any(error["loc"] == ("is_admin",) for error in exc.errors())


# --- No filtración de contraseña en la representación (RN-WS-12) ---


def test_user_register_password_not_in_repr():
    # Marcador único e improbable: si el assert pasara "por casualidad" con
    # una contraseña común, no probaría nada.
    secret_marker = "zQ7x9-UNLIKELY-MARKER-42"
    user = UserRegister(email="user@example.com", password=secret_marker)
    assert secret_marker not in repr(user)


# =====================================================================
# UserLogin — contrato asimétrico respecto del registro (D-3)
# =====================================================================


def test_user_login_valid_payload_constructs_without_error():
    login = UserLogin(email="user@example.com", password="any-non-empty")
    assert login.email == "user@example.com"
    assert login.password == "any-non-empty"


def test_user_login_invalid_email_fails():
    try:
        UserLogin(email="not-an-email", password="any-non-empty")
        assert False, "se esperaba ValidationError"
    except ValidationError as exc:
        assert any(error["loc"] == ("email",) for error in exc.errors())


def test_user_login_empty_password_fails():
    try:
        UserLogin(email="user@example.com", password="")
        assert False, "se esperaba ValidationError"
    except ValidationError as exc:
        assert any(error["loc"] == ("password",) for error in exc.errors())


def test_user_login_extra_field_fails():
    try:
        UserLogin(email="user@example.com", password="any-non-empty", remember_me=True)
        assert False, "se esperaba ValidationError"
    except ValidationError as exc:
        assert any(error["loc"] == ("remember_me",) for error in exc.errors())


def test_user_login_short_password_is_accepted_deliberately():
    # D-3: UserLogin NO reasserta el mínimo de 8 caracteres de UserRegister.
    # Por qué: (a) un usuario registrado bajo una política anterior con una
    # contraseña más corta que la política vigente debe poder seguir
    # autenticándose -- si el schema de login rechazara por longitud, quedaría
    # bloqueado sin forma de ni siquiera intentar cambiarla; (b) un 422
    # "password too short" en el login le confirma a un atacante la política
    # de longitud vigente y, peor, distingue este fallo del 401 genérico que
    # RN-WS-12/HU-03-02 exigen para evitar enumeración de usuarios. No
    # "unificar" este constraint con UserRegister en un refactor futuro.
    login = UserLogin(email="user@example.com", password="short")
    assert login.password == "short"


def test_user_login_password_over_72_bytes_fails():
    # Comparte el alias de techo de bcrypt con UserRegister (D-2).
    password = "a" * 73
    try:
        UserLogin(email="user@example.com", password=password)
        assert False, "se esperaba ValidationError"
    except ValidationError as exc:
        assert any(error["loc"] == ("password",) for error in exc.errors())


def test_user_login_password_not_in_repr():
    secret_marker = "zQ7x9-LOGIN-UNLIKELY-MARKER-77"
    login = UserLogin(email="user@example.com", password=secret_marker)
    assert secret_marker not in repr(login)


# =====================================================================
# TokenResponse — respuesta única de registro y login (D-7, D-8)
# =====================================================================


def test_token_response_defaults_token_type_to_bearer():
    token = TokenResponse(access_token="a-jwt-string", expires_in=86400)
    assert token.token_type == "bearer"


def test_token_response_token_type_other_than_bearer_fails():
    try:
        TokenResponse(access_token="a-jwt-string", token_type="basic", expires_in=86400)
        assert False, "se esperaba ValidationError"
    except ValidationError as exc:
        assert any(error["loc"] == ("token_type",) for error in exc.errors())


def test_token_response_expires_in_zero_fails():
    try:
        TokenResponse(access_token="a-jwt-string", expires_in=0)
        assert False, "se esperaba ValidationError"
    except ValidationError as exc:
        assert any(error["loc"] == ("expires_in",) for error in exc.errors())


def test_token_response_expires_in_negative_fails():
    try:
        TokenResponse(access_token="a-jwt-string", expires_in=-1)
        assert False, "se esperaba ValidationError"
    except ValidationError as exc:
        assert any(error["loc"] == ("expires_in",) for error in exc.errors())


def test_token_response_expires_in_24_hours_in_seconds_is_valid():
    # D-8: 24h * 3600 = 86400 segundos (default de TOKEN_EXPIRE_HOURS).
    token = TokenResponse(access_token="a-jwt-string", expires_in=86400)
    assert token.expires_in == 86400


# =====================================================================
# TokenData — payload del JWT ya decodificado (D-1, D-5)
# =====================================================================


def test_token_data_constructs_without_email_defaults_to_none():
    token_data = TokenData()
    assert token_data.email is None


def test_token_data_email_not_syntactically_valid_does_not_fail():
    # D-1: TokenData.email es str | None, no EmailStr -- un sub malformado en
    # un JWT es un fallo de autenticación (401), no de validación (422).
    token_data = TokenData(email="not-an-email-but-still-a-string")
    assert token_data.email == "not-an-email-but-still-a-string"


def test_token_data_extra_jwt_claims_do_not_fail():
    # D-5: TokenData es permisivo con claims extra del JWT (exp, iat, sub),
    # a diferencia de los contratos de entrada HTTP que usan extra="forbid".
    token_data = TokenData(email="user@example.com", exp=1234567890, iat=1234560000, sub="user@example.com")
    assert token_data.email == "user@example.com"


# =====================================================================
# Estructural: RN-WS-12 (ninguna contraseña en un schema de salida) e
# independencia de la capa de persistencia (spec auth-contracts)
# =====================================================================


def test_no_response_model_declares_a_password_field():
    forbidden_field_names = {"password", "hashed_password"}
    models_in_module = [
        obj
        for _, obj in inspect.getmembers(auth_schemas_module)
        if inspect.isclass(obj) and issubclass(obj, BaseModel) and obj is not BaseModel
    ]
    assert models_in_module, "no se encontró ningún modelo en auth_schemas.py"

    # UserRegister y UserLogin SÍ tienen 'password': son contratos de entrada.
    # Ningún OTRO modelo (respuesta) puede declararlo.
    response_models = [model for model in models_in_module if model not in (UserRegister, UserLogin)]
    for model in response_models:
        declared_fields = set(model.model_fields.keys())
        leaked = declared_fields & forbidden_field_names
        assert not leaked, f"{model.__name__} declara un campo de contraseña: {leaked}"


def test_no_user_response_model_exists():
    # RN-WS-12: el registro no devuelve un eco del usuario creado, sino un
    # token -- no debe existir ningún modelo de tipo "UserResponse".
    model_names = {
        name
        for name, obj in inspect.getmembers(auth_schemas_module)
        if inspect.isclass(obj) and issubclass(obj, BaseModel) and obj is not BaseModel
    }
    assert "UserResponse" not in model_names


def test_token_response_model_dump_has_no_password_key():
    # 7.4: verificación de punta a punta de RN-WS-12 sobre el único modelo de
    # respuesta real del dominio auth (los demás schemas de este módulo o son
    # de entrada -- UserRegister/UserLogin -- o internos -- TokenData, nunca
    # serializados hacia el cliente).
    token = TokenResponse(access_token="a-jwt-string", expires_in=86400)
    dumped = token.model_dump()
    assert "password" not in dumped
    assert "hashed_password" not in dumped


def test_auth_schemas_does_not_import_orm_session_or_settings():
    # Reutiliza el helper AST de test_layer_boundaries.py (5.6) en lugar de
    # duplicar el parseo. `auth_schemas.py` no importa nada de
    # `fastapi_bridge` (ni el modelo ORM, ni la sesión, ni Settings): es una
    # capa de schemas Pydantic puros, sin acoplamiento a persistencia ni config.
    module_path = Path(auth_schemas_module.__file__)
    imported = get_imported_top_level_modules(module_path)
    assert "fastapi_bridge" not in imported
    assert "sqlalchemy" not in imported
