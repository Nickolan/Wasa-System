"""Tests de `fastapi_bridge/exceptions/domain.py` (CHANGE-03, D-1, D-2).

`DomainError` es la base de la que heredan los errores de dominio del
proyecto (`EmailAlreadyExistsError` acá, `InvalidCredentialsError` en
CHANGE-04). Vive en un módulo propio, libre de FastAPI/Starlette, para que
capas por debajo de la web (el repositorio) puedan lanzarla sin arrastrar el
framework, y capas por arriba (CHANGE-07) puedan atraparla por la base.
"""

import ast
from pathlib import Path

import pytest

from fastapi_bridge.exceptions.domain import DomainError, EmailAlreadyExistsError

FASTAPI_BRIDGE_ROOT = Path(__file__).resolve().parent.parent
DOMAIN_MODULE = FASTAPI_BRIDGE_ROOT / "exceptions" / "domain.py"


def test_email_already_exists_error_constructs_with_an_email():
    exc = EmailAlreadyExistsError("user@test.com")
    assert isinstance(exc, EmailAlreadyExistsError)


def test_email_already_exists_error_exposes_the_email_attribute():
    exc = EmailAlreadyExistsError("user@test.com")
    assert exc.email == "user@test.com"


def test_email_already_exists_error_inherits_from_domain_error():
    assert issubclass(EmailAlreadyExistsError, DomainError)


def test_domain_error_inherits_from_exception():
    assert issubclass(DomainError, Exception)


def test_message_contains_the_email():
    exc = EmailAlreadyExistsError("collision@test.com")
    assert "collision@test.com" in str(exc)


def test_email_attribute_is_exactly_the_value_passed_not_the_full_message():
    exc = EmailAlreadyExistsError("bare@test.com")
    assert exc.email == "bare@test.com"
    assert exc.email != str(exc)


def test_can_be_caught_as_email_already_exists_error():
    with pytest.raises(EmailAlreadyExistsError):
        raise EmailAlreadyExistsError("a@test.com")


def test_can_be_caught_as_domain_error():
    # Es lo que habilita el handler único de CHANGE-07 sobre la base.
    with pytest.raises(DomainError):
        raise EmailAlreadyExistsError("a@test.com")


def test_domain_module_does_not_import_the_web_framework_or_persistence_stack():
    from fastapi_bridge.tests.test_layer_boundaries import get_imported_top_level_modules

    imported = get_imported_top_level_modules(DOMAIN_MODULE)
    forbidden = {"fastapi", "starlette", "slowapi", "sqlalchemy", "passlib"}
    assert forbidden.isdisjoint(imported)
