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


def test_scan_start_is_the_only_production_route_with_a_rate_limit_applied():
    # CHANGE-12 (D-5, R-2): `scan_rate_limit` queda atado, desde el import de
    # `core/limiter.py`, al singleton de módulo `limiter` -- no a la
    # instancia nueva que `create_app()` publica en `app.state.limiter`. Este
    # test reemplaza al anterior (`test_no_production_route_has_a_rate_limit_applied`),
    # que inspeccionaba `app.state.limiter` y por eso seguiría verde aunque
    # el decorador se olvidara sobre el endpoint -- pasaba por vacuidad, no
    # porque protegiera nada (R-2). Se reescribe para inspeccionar el
    # singleton real y afirmar que la única ruta de producción marcada ahí
    # es el disparo de escaneo.
    # No se compara el conjunto completo de `_dynamic_route_limits` contra
    # `{scan_key}`: ese registro no se limpia con `limiter.reset()` (mismo
    # hallazgo que documenta `test_rate_limit.py`) y persiste entre módulos
    # de test dentro de la misma sesión de pytest -- otros tests (p. ej.
    # `test_edge_policy_exclusions.py`) montan sus propias rutas desechables
    # decoradas con `scan_rate_limit` y sus claves quedan en el singleton
    # después de terminar. El aserto que sí es robusto y es el que importa
    # para R-2/D-5 es sobre las rutas de PRODUCCIÓN: ninguna ruta del árbol
    # `fastapi_bridge.api.*` de producción, salvo `start_scan`, aparece
    # registrada ahí.
    from fastapi_bridge.core.limiter import limiter as production_limiter

    create_app()
    assert production_limiter._route_limits == {}
    dynamic_keys = set(production_limiter._dynamic_route_limits.keys())
    scan_keys = {key for key in dynamic_keys if "start_scan" in key}
    assert len(scan_keys) == 1

    production_api_keys = {key for key in dynamic_keys if key.startswith("fastapi_bridge.api.")}
    assert production_api_keys == scan_keys


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


def test_route_surface_includes_health_auth_scan_and_dashboard():
    # CHANGE-05: registrar los manejadores no monta rutas por sí solo -- lo
    # que monta el router de auth es `include_router` en `create_app()`. La
    # superficie vigente hasta CHANGE-11 era health + las dos rutas de auth,
    # con scan todavía sin montar. CHANGE-12 montó `POST /api/v1/scan/start`
    # y CHANGE-25 monta `GET /api/v1/dashboard`: este test reemplaza al
    # anterior (`test_route_surface_includes_health_auth_and_scan`), cuyo
    # nombre y aserto de superficie exacta quedaron desmentidos por ese
    # montaje -- se renombra porque afirma lo contrario a partir de ahora.
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
    assert domain_paths == {
        "/api/v1/auth/register",
        "/api/v1/auth/login",
        "/api/v1/scan/start",
        "/api/v1/dashboard",
    }


def test_health_endpoint_still_returns_200_with_its_exact_contract():
    from fastapi.testclient import TestClient

    app = create_app()
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "wasa-fastapi-bridge"}


def test_scan_route_without_credentials_returns_401_in_rfc7807_format():
    # CHANGE-12: el router de scan ya está montado y protegido. Este test
    # reemplaza al anterior (`test_still_unmounted_scan_route_returns_404_in_rfc7807_format`),
    # cuyo nombre y aserto de 404 quedaron desmentidos por este change -- la
    # ruta existe ahora, así que una solicitud sin credencial ya no es "no
    # encontrado" sino "no autorizado", y sigue en formato RFC 7807 (no el
    # cuerpo por defecto de Starlette/FastAPI).
    from fastapi.testclient import TestClient

    app = create_app()
    client = TestClient(app)

    response = client.post("/api/v1/scan/start")

    assert response.status_code == 401
    assert response.status_code != 404
    body = response.json()
    assert set(body.keys()) == {"type", "title", "status", "detail", "instance"}
