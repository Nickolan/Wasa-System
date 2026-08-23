"""Tests del constructor único RFC 7807 en `exceptions/handlers.py` (D-6).

`problem_detail_response(...)` es el punto único de construcción de errores
de la API: todo handler de excepción (este change y CHANGE-07) lo reutiliza.
"""

import json
from types import SimpleNamespace

import pytest
from pydantic import ValidationError
from slowapi.errors import RateLimitExceeded
from starlette.requests import Request
from starlette.responses import JSONResponse

import fastapi_bridge.exceptions.handlers as handlers_module
from fastapi_bridge.core.settings import Settings
from fastapi_bridge.exceptions.handlers import (
    problem_detail_response,
    rate_limit_exceeded_handler,
)


def _make_request(path: str = "/api/v1/scan/start") -> Request:
    scope = {
        "type": "http",
        "method": "POST",
        "path": path,
        "headers": [],
        "query_string": b"",
        "client": ("127.0.0.1", 12345),
    }
    return Request(scope)


def _make_rate_limit_exceeded(limit_value: str = "10 per 3600 second") -> RateLimitExceeded:
    stub_limit = SimpleNamespace(error_message=None, limit=limit_value)
    return RateLimitExceeded(stub_limit)


def test_problem_detail_response_returns_json_response_with_expected_shape():
    response = problem_detail_response(
        status_code=400,
        detail="Solicitud inválida.",
        instance="/api/v1/scan/start",
    )

    assert isinstance(response, JSONResponse)
    assert response.status_code == 400
    assert response.media_type == "application/problem+json"

    body = json.loads(response.body)
    assert set(body.keys()) == {"type", "title", "status", "detail", "instance"}


def test_problem_detail_response_reflects_a_different_status_code():
    response = problem_detail_response(status_code=404, instance="/api/v1/scan/start")

    body = json.loads(response.body)
    assert response.status_code == 404
    assert body["status"] == 404


def test_problem_detail_response_reflects_the_given_instance():
    response = problem_detail_response(status_code=429, instance="/api/v1/auth/register")

    body = json.loads(response.body)
    assert body["instance"] == "/api/v1/auth/register"


def test_problem_detail_response_allows_missing_detail():
    response = problem_detail_response(status_code=400, instance="/api/v1/scan/start")

    body = json.loads(response.body)
    assert set(body.keys()) == {"type", "title", "status", "detail", "instance"}
    assert body["detail"] is None


def test_problem_detail_response_does_not_leak_internal_information():
    response = problem_detail_response(
        status_code=500,
        instance="/api/v1/scan/start",
        detail="Ocurrió un error inesperado.",
    )

    body = json.loads(response.body)
    serialized = json.dumps(body).lower()
    assert "traceback" not in serialized
    assert "file \"" not in serialized
    assert ".py" not in serialized
    assert "fastapi_bridge" not in serialized


def test_problem_detail_response_body_is_built_through_error_detail_model():
    # D-1 (CHANGE-07): el cuerpo se arma vía `ErrorDetail`, no un dict literal
    # en paralelo — la restricción `status: Field(ge=100, le=599)` deja de ser
    # decorativa y se convierte en una red real bajo cada handler. Un status
    # fuera de rango debe fallar en la construcción, no emitirse al cliente.
    with pytest.raises(ValidationError):
        problem_detail_response(status_code=700, instance="/x")


async def test_rate_limit_exceeded_handler_returns_429_problem_detail():
    request = _make_request()
    exc = _make_rate_limit_exceeded()

    response = await rate_limit_exceeded_handler(request, exc)

    assert isinstance(response, JSONResponse)
    assert response.status_code == 429
    body = json.loads(response.body)
    assert body["status"] == 429


async def test_rate_limit_exceeded_handler_includes_retry_after_header():
    request = _make_request()
    exc = _make_rate_limit_exceeded()

    response = await rate_limit_exceeded_handler(request, exc)

    retry_after = response.headers.get("Retry-After")
    assert retry_after is not None
    assert int(retry_after) > 0


async def test_rate_limit_exceeded_handler_retry_after_reflects_settings_window(monkeypatch):
    monkeypatch.setattr(
        handlers_module,
        "get_settings",
        lambda: Settings(RATE_LIMIT_REQUESTS=2, RATE_LIMIT_WINDOW=120),
    )
    request = _make_request()
    exc = _make_rate_limit_exceeded()

    response = await rate_limit_exceeded_handler(request, exc)

    assert response.headers["Retry-After"] == "120"


async def test_rate_limit_exceeded_handler_instance_matches_request_path():
    request = _make_request(path="/api/v1/scan/start")
    exc = _make_rate_limit_exceeded()

    response = await rate_limit_exceeded_handler(request, exc)

    body = json.loads(response.body)
    assert body["instance"] == "/api/v1/scan/start"
