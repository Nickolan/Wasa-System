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


def test_route_surface_includes_health_and_auth_but_not_scan():
    # CHANGE-05: registrar los manejadores no monta rutas por sí solo -- lo
    # que monta el router de auth es `include_router` en `create_app()`. La
    # superficie vigente es health + las dos rutas de auth; scan sigue sin
    # montarse hasta CHANGE-12.
    #
    # Se lee desde `app.openapi()["paths"]`, no desde `app.routes`: esta
    # versión de FastAPI resuelve `include_router` de forma perezosa (un
    # único `_IncludedRouter` en `app.routes`, sin `.path` propio) y expande
    # las rutas efectivas recién al construir el schema o al despachar una
    # petición real. El schema OpenAPI es la superficie pública estable —
    # inspeccionar el árbol de objetos internos de `app.routes` acoplaría el
    # test a un detalle de implementación de esta versión del framework.
    app = create_app()
    paths = set(app.openapi()["paths"].keys())
    assert "/health" in paths
    domain_paths = {p for p in paths if p.startswith("/api/")}
    assert domain_paths == {"/api/v1/auth/register", "/api/v1/auth/login"}


def test_health_endpoint_still_returns_200_with_its_exact_contract():
    from fastapi.testclient import TestClient

    app = create_app()
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "wasa-fastapi-bridge"}


def test_still_unmounted_scan_route_returns_404_in_rfc7807_format():
    # CHANGE-05: el router de auth ya está montado, así que este ancla se
    # traslada a scan -- el que sigue sin montarse hasta CHANGE-12 y sigue
    # dando 404 en formato RFC 7807, no el cuerpo por defecto de Starlette.
    from fastapi.testclient import TestClient

    app = create_app()
    client = TestClient(app)

    response = client.post("/api/v1/scan/start")

    assert response.status_code == 404
    body = response.json()
    assert set(body.keys()) == {"type", "title", "status", "detail", "instance"}
