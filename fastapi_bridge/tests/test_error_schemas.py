"""Tests del contrato de error RFC 7807 (CHANGE-02, capability `error-contract`).

Unitarios puros (D-13), igual que `test_auth_schemas.py`: validan `ErrorDetail`
directamente, sin `TestClient` ni handlers — los `exception_handler` que lo
producen llegan en CHANGE-07.
"""

import inspect

import pytest
from pydantic import ValidationError

import fastapi_bridge.schemas.scan_schemas as scan_schemas_module
from fastapi_bridge.schemas.error_schemas import ErrorDetail


def test_error_detail_valid_constructs_without_error():
    error = ErrorDetail(
        title="Unauthorized",
        status=401,
        detail="Credenciales inválidas",
        instance="/api/v1/auth/login",
    )
    assert error.title == "Unauthorized"
    assert error.status == 401
    assert error.detail == "Credenciales inválidas"
    assert error.instance == "/api/v1/auth/login"


def test_error_detail_fields_are_exactly_rfc7807_members():
    assert set(ErrorDetail.model_fields.keys()) == {"type", "title", "status", "detail", "instance"}


def test_error_detail_type_defaults_to_about_blank():
    error = ErrorDetail(title="Unauthorized", status=401, detail="x", instance="/api/v1/auth/login")
    assert error.type == "about:blank"


# --- Rango de status HTTP (100..599 inclusive) ---


@pytest.mark.parametrize("status_code", [400, 401, 409, 422, 429, 502, 500])
def test_error_detail_status_within_http_range_passes(status_code: int):
    error = ErrorDetail(title="x", status=status_code, detail="x", instance="/x")
    assert error.status == status_code


def test_error_detail_status_below_range_fails():
    try:
        ErrorDetail(title="x", status=99, detail="x", instance="/x")
        assert False, "se esperaba ValidationError"
    except ValidationError as exc:
        assert any(error["loc"] == ("status",) for error in exc.errors())


def test_error_detail_status_above_range_fails():
    try:
        ErrorDetail(title="x", status=600, detail="x", instance="/x")
        assert False, "se esperaba ValidationError"
    except ValidationError as exc:
        assert any(error["loc"] == ("status",) for error in exc.errors())


# --- Referencias URI relativas y absolutas (D-9, no AnyUrl) ---


def test_error_detail_instance_as_relative_endpoint_path_passes():
    error = ErrorDetail(title="x", status=401, detail="x", instance="/api/v1/auth/login")
    assert error.instance == "/api/v1/auth/login"


def test_error_detail_type_as_absolute_uri_passes():
    error = ErrorDetail(
        title="x",
        status=422,
        detail="x",
        instance="/api/v1/auth/register",
        type="https://example.com/problems/validation-error",
    )
    assert error.type == "https://example.com/problems/validation-error"


# --- Ubicación del contrato (spec error-contract): un único módulo ---


def test_error_detail_is_defined_in_error_schemas_not_scan_schemas():
    error_detail_names_in_scan_module = {
        name
        for name, obj in inspect.getmembers(scan_schemas_module)
        if inspect.isclass(obj) and name == "ErrorDetail"
    }
    assert not error_detail_names_in_scan_module, (
        "ErrorDetail no debe definirse ni reexportarse desde scan_schemas.py (D-10)"
    )
