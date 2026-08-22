"""Tests de `fastapi_bridge.core.settings.Settings` (bridge-bootstrap)."""

from fastapi_bridge.core.settings import Settings, get_settings


def test_settings_exposes_core_fields_without_env_file():
    settings = Settings()
    assert hasattr(settings, "JWT_SECRET")
    assert hasattr(settings, "TOKEN_EXPIRE_HOURS")
    assert hasattr(settings, "DB_URL")


def test_settings_exposes_full_environment_contract():
    settings = Settings()
    expected_fields_and_types = {
        "N8N_WEBHOOK_URL": str,
        "CORS_ORIGINS": list,
        "RATE_LIMIT_REQUESTS": int,
        "RATE_LIMIT_WINDOW": int,
        "APP_ENV": str,
    }
    for field_name, expected_type in expected_fields_and_types.items():
        assert hasattr(settings, field_name), f"falta el campo {field_name}"
        assert isinstance(getattr(settings, field_name), expected_type), (
            f"{field_name} no es del tipo {expected_type}"
        )
    # N8N_WEBHOOK_TOKEN es SecretStr (D-6) — se verifica en detalle en 3.6.
    assert hasattr(settings, "N8N_WEBHOOK_TOKEN")


def test_environment_variable_takes_precedence_and_coerces_to_int(monkeypatch):
    monkeypatch.setenv("TOKEN_EXPIRE_HOURS", "48")
    settings = Settings()
    assert settings.TOKEN_EXPIRE_HOURS == 48
    assert isinstance(settings.TOKEN_EXPIRE_HOURS, int)


def test_cors_origins_comma_separated_string_is_parsed_to_list(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "http://a.com,http://b.com")
    settings = Settings()
    assert settings.CORS_ORIGINS == ["http://a.com", "http://b.com"]


def test_cors_origins_single_origin_without_comma(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "http://a.com")
    settings = Settings()
    assert settings.CORS_ORIGINS == ["http://a.com"]


def test_secrets_never_leak_in_repr_or_dump(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "super-secret-value")
    monkeypatch.setenv("N8N_WEBHOOK_TOKEN", "another-secret-value")
    settings = Settings()

    assert "super-secret-value" not in repr(settings)
    assert "another-secret-value" not in repr(settings)

    dumped = settings.model_dump()
    assert "super-secret-value" not in str(dumped)
    assert "another-secret-value" not in str(dumped)

    assert settings.JWT_SECRET.get_secret_value() == "super-secret-value"
    assert settings.N8N_WEBHOOK_TOKEN.get_secret_value() == "another-secret-value"


def test_get_settings_is_cached_singleton():
    first_call = get_settings()
    second_call = get_settings()
    assert first_call is second_call
