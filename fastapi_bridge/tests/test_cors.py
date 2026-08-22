"""Tests de la política CORS de `create_app()` (D-1, D-2, D-3)."""

import fastapi
import httpx

from fastapi_bridge.core.settings import Settings
from fastapi_bridge.main import create_app

ALLOWED_ORIGIN = "http://localhost:5173"
DISALLOWED_ORIGIN = "http://evil.example"


def test_create_app_returns_a_fastapi_instance():
    app = create_app()
    assert isinstance(app, fastapi.FastAPI)


async def test_allowed_origin_receives_exact_access_control_allow_origin_header():
    app = create_app(Settings(CORS_ORIGINS=[ALLOWED_ORIGIN]))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health", headers={"Origin": ALLOWED_ORIGIN})

    assert response.headers.get("access-control-allow-origin") == ALLOWED_ORIGIN


async def test_disallowed_origin_simple_request_gets_no_cors_header():
    app = create_app(Settings(CORS_ORIGINS=[ALLOWED_ORIGIN]))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health", headers={"Origin": DISALLOWED_ORIGIN})

    assert "access-control-allow-origin" not in response.headers


async def test_disallowed_origin_preflight_is_rejected_with_400():
    app = create_app(Settings(CORS_ORIGINS=[ALLOWED_ORIGIN]))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.options(
            "/health",
            headers={
                "Origin": DISALLOWED_ORIGIN,
                "Access-Control-Request-Method": "POST",
            },
        )

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


async def test_allowed_origin_preflight_is_accepted():
    app = create_app(Settings(CORS_ORIGINS=[ALLOWED_ORIGIN]))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.options(
            "/health",
            headers={
                "Origin": ALLOWED_ORIGIN,
                "Access-Control-Request-Method": "POST",
            },
        )

    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == ALLOWED_ORIGIN
    assert "POST" in response.headers.get("access-control-allow-methods", "")


async def test_preflight_declares_authorization_and_content_type_headers():
    app = create_app(Settings(CORS_ORIGINS=[ALLOWED_ORIGIN]))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.options(
            "/health",
            headers={
                "Origin": ALLOWED_ORIGIN,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Authorization, Content-Type",
            },
        )

    allowed_headers = response.headers.get("access-control-allow-headers", "").lower()
    assert "authorization" in allowed_headers
    assert "content-type" in allowed_headers


async def test_cors_origins_list_is_read_from_settings_not_hardcoded():
    custom_origin = "https://landing.wasa.example"
    app = create_app(Settings(CORS_ORIGINS=[custom_origin]))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health", headers={"Origin": custom_origin})

    assert response.headers.get("access-control-allow-origin") == custom_origin


async def test_no_credentials_header_is_ever_emitted():
    app = create_app(Settings(CORS_ORIGINS=[ALLOWED_ORIGIN]))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health", headers={"Origin": ALLOWED_ORIGIN})

    assert "access-control-allow-credentials" not in response.headers
