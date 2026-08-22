"""Tests del cableado del `Limiter` y su exception handler en `create_app()` (D-1, D-4)."""

from slowapi import Limiter
from slowapi.errors import RateLimitExceeded

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
