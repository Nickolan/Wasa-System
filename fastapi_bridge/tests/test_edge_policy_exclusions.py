"""Tests de exclusiones del rate limit y de que la superficie de API sigue
intacta con la política de borde activa (D-8).
"""

import httpx
import pytest
from starlette.requests import Request
from starlette.responses import JSONResponse

import fastapi_bridge.core.limiter as limiter_module
from fastapi_bridge.core.limiter import limiter, scan_rate_limit
from fastapi_bridge.core.settings import Settings
from fastapi_bridge.main import app as production_app
from fastapi_bridge.main import create_app

TEST_QUOTA = 2
TEST_WINDOW = 3600


@pytest.fixture
def small_quota_app(monkeypatch):
    monkeypatch.setattr(
        limiter_module,
        "get_settings",
        lambda: Settings(RATE_LIMIT_REQUESTS=TEST_QUOTA, RATE_LIMIT_WINDOW=TEST_WINDOW),
    )
    limiter.reset()
    yield create_app()
    limiter.reset()


async def _get(app, path: str, client_host: str = "10.0.0.5") -> httpx.Response:
    transport = httpx.ASGITransport(app=app, client=(client_host, 12345))
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)


async def _post(app, path: str, client_host: str = "10.0.0.5") -> httpx.Response:
    transport = httpx.ASGITransport(app=app, client=(client_host, 12345))
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post(path)


async def test_health_is_never_rate_limited(small_quota_app):
    # GET /health repetido por encima del cupo configurado (TEST_QUOTA) sigue
    # devolviendo 200 siempre: no tiene el decorador `scan_rate_limit`.
    responses = [await _get(small_quota_app, "/health") for _ in range(TEST_QUOTA + 5)]
    assert all(response.status_code == 200 for response in responses)


async def test_auth_endpoint_keeps_responding_after_scan_quota_is_exhausted(small_quota_app, monkeypatch):
    app = small_quota_app

    async def _scan_stub(request: Request) -> JSONResponse:
        return JSONResponse({"status": "accepted"})

    _scan_stub.__name__ = "scan_stub_8_2"
    _scan_stub.__qualname__ = _scan_stub.__name__
    app.add_api_route("/__test__/scan/start", scan_rate_limit(_scan_stub), methods=["POST"])

    async def _auth_stub(request: Request) -> JSONResponse:
        # Simula un endpoint de auth SIN el decorador de rate limit (CHANGE-05
        # nunca lo aplica sobre login/registro).
        return JSONResponse({"status": "ok"})

    app.add_api_route("/__test__/auth/login", _auth_stub, methods=["POST"])

    # Agota el cupo de scan.
    for _ in range(TEST_QUOTA):
        await _post(app, "/__test__/scan/start")
    exhausted_response = await _post(app, "/__test__/scan/start")
    assert exhausted_response.status_code == 429

    # La IP que agotó su cupo de scan sigue pudiendo autenticarse.
    auth_response = await _post(app, "/__test__/auth/login")
    assert auth_response.status_code == 200


async def test_scan_router_still_returns_404_on_production_app_auth_does_not():
    # CHANGE-05: el router de auth queda montado en la app de producción; el
    # de scan sigue sin montarse hasta CHANGE-12. El aserto de scan (404) se
    # conserva -- es el que impide que este change monte de más.
    transport = httpx.ASGITransport(app=production_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        scan_response = await client.post("/api/v1/scan/start")
        auth_response = await client.post("/api/v1/auth/register")

    assert scan_response.status_code == 404
    assert auth_response.status_code != 404


async def test_health_keeps_its_exact_contract_with_edge_policy_active():
    transport = httpx.ASGITransport(app=production_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "wasa-fastapi-bridge"}


async def test_building_the_app_opens_no_external_infrastructure_connection():
    # Mismo patrón que `test_no_shared_db_impact.py::test_lifespan_cycle_opens_no_network_or_db_connection`:
    # con PostgreSQL/n8n/Redis inaccesibles, construir la app con la política
    # de borde activa y correr su ciclo de lifespan no debe lanzar ninguna
    # excepción de conexión — CORS y el rate limiter son en-proceso.
    app = create_app()
    async with app.router.lifespan_context(app):
        pass
