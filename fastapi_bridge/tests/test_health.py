"""Tests del endpoint de salud `GET /health` (bridge-bootstrap)."""

import fastapi
import httpx

from fastapi_bridge.main import app


async def test_health_returns_200():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200


async def test_health_body_is_exact_contract():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
    assert response.json() == {"status": "ok", "service": "wasa-fastapi-bridge"}


async def test_health_requires_no_authorization_header():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")  # no Authorization header sent
    assert response.status_code == 200
    assert response.status_code != 401


def test_app_is_a_fastapi_instance():
    assert isinstance(app, fastapi.FastAPI)


async def test_auth_router_is_mounted_but_scan_router_is_not_yet():
    # CHANGE-05: el router de auth queda montado (deja de responder 404); el
    # de scan sigue sin montarse hasta CHANGE-12. `/register` sin cuerpo
    # dispara un 422 de validación (la ruta existe), no un 404 (la ruta no
    # existe) -- es justamente la distinción que separa ambos casos.
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        register_response = await client.post("/api/v1/auth/register")
        scan_response = await client.post("/api/v1/scan/start")
    assert register_response.status_code != 404
    assert scan_response.status_code == 404


def test_importing_main_creates_no_module_level_engine_or_client():
    # El import de fastapi_bridge.main no debe dejar un engine SQLAlchemy ni un
    # cliente httpx colgando a nivel de módulo — sólo la app y sus rutas.
    import fastapi_bridge.main as main_module

    module_level_names = vars(main_module)
    for name, value in module_level_names.items():
        assert type(value).__name__ not in {"Engine", "AsyncEngine", "Client", "AsyncClient"}, (
            f"'{name}' parece un recurso de infraestructura creado a nivel de módulo"
        )
