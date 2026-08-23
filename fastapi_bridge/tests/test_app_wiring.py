"""Tests del cableado del `Limiter` y su exception handler en `create_app()` (D-1, D-4).

Se extiende (CHANGE-07, D-10) con el registro de los cuatro handlers RFC 7807
restantes: `RequestValidationError`, `starlette.exceptions.HTTPException`,
`DomainError` y `Exception`, junto al de `RateLimitExceeded` que ya estaba.
"""

from fastapi.exceptions import RequestValidationError
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from starlette.exceptions import HTTPException as StarletteHTTPException

from fastapi_bridge.exceptions.domain import DomainError
from fastapi_bridge.main import create_app


def test_app_state_exposes_a_limiter_instance():
    app = create_app()
    assert isinstance(app.state.limiter, Limiter)


def test_app_registers_rate_limit_exceeded_handler():
    app = create_app()
    assert RateLimitExceeded in app.exception_handlers


def test_limiter_is_not_mistaken_for_infrastructure_engine_or_client():
    # Regresión estructural (D-9 de `bridge-bootstrap`): el Limiter no debe
    # ser confundido con un Engine SQLAlchemy ni un cliente httpx.
    app = create_app()
    assert type(app.state.limiter).__name__ not in {"Engine", "AsyncEngine", "Client", "AsyncClient"}


def test_no_production_route_has_a_rate_limit_applied():
    # D-8: el límite se aplica sólo vía decorador sobre rutas específicas.
    # La app de producción (sin routers de dominio montados) no tiene
    # ninguna ruta marcada para limitación: ni límites estáticos ni
    # dinámicos (el callable `scan_rate_limit`) registrados en el Limiter.
    app = create_app()
    assert app.state.limiter._route_limits == {}
    assert app.state.limiter._dynamic_route_limits == {}


# ---------------------------------------------------------------------------
# CHANGE-07 (D-10) — registro de los cuatro handlers RFC 7807 restantes
# ---------------------------------------------------------------------------


def test_app_registers_the_request_validation_exception_handler():
    # FastAPI ya registra un handler por defecto para `RequestValidationError`
    # -- no alcanza con "está presente", hay que verificar que es **nuestro**
    # handler el que quedó cableado (identidad de función, no solo membresía).
    from fastapi_bridge.exceptions.handlers import request_validation_exception_handler

    app = create_app()
    assert app.exception_handlers[RequestValidationError] is request_validation_exception_handler


def test_app_registers_the_http_exception_handler_on_the_starlette_base_class():
    # Mismo caso: FastAPI ya trae un handler por defecto para la excepción
    # HTTP base. Se verifica identidad, no solo presencia.
    from fastapi_bridge.exceptions.handlers import http_exception_handler

    app = create_app()
    assert app.exception_handlers[StarletteHTTPException] is http_exception_handler


def test_app_registers_the_domain_error_handler():
    app = create_app()
    assert DomainError in app.exception_handlers


def test_app_registers_the_unhandled_exception_handler():
    app = create_app()
    assert Exception in app.exception_handlers


def test_registration_does_not_depend_on_module_state():
    # Dos apps independientes deben quedar ambas con el conjunto completo de
    # manejadores -- el registro vive en `create_app()`, no a nivel de módulo.
    first_app = create_app()
    second_app = create_app()

    expected = {RequestValidationError, StarletteHTTPException, DomainError, RateLimitExceeded, Exception}
    for app in (first_app, second_app):
        assert expected.issubset(set(app.exception_handlers.keys()))


def test_route_surface_does_not_change_after_registering_handlers():
    # Registrar manejadores no monta rutas de dominio: `GET /health` sigue
    # siendo la única ruta expuesta.
    app = create_app()
    paths = {route.path for route in app.routes if hasattr(route, "path")}
    assert "/health" in paths
    domain_paths = {p for p in paths if p.startswith("/api/")}
    assert domain_paths == set()


def test_health_endpoint_still_returns_200_with_its_exact_contract():
    from fastapi.testclient import TestClient

    app = create_app()
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "wasa-fastapi-bridge"}


def test_unmounted_domain_route_returns_404_in_rfc7807_format():
    # La superficie de rutas no cambia (7.4): la misma ausencia de router de
    # auth que hoy da 404 sigue dando 404, pero ahora en formato RFC 7807 en
    # vez del cuerpo por defecto de FastAPI/Starlette.
    from fastapi.testclient import TestClient

    app = create_app()
    client = TestClient(app)

    response = client.post("/api/v1/auth/register")

    assert response.status_code == 404
    body = response.json()
    assert set(body.keys()) == {"type", "title", "status", "detail", "instance"}
