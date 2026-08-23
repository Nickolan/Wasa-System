"""Tests de la política CORS de `create_app()` (D-1, D-2, D-3).

Se extiende (CHANGE-07, D-6, H-4) con la verificación de que las respuestas
de error atendidas por un handler específico (422, 401, 404) SÍ llevan
headers CORS, y que la respuesta 500 del handler genérico NO los lleva —
`ServerErrorMiddleware` de Starlette envuelve por fuera de `CORSMiddleware`,
así que el 500 se genera cuando la cadena de middlewares de usuario ya no
está en el camino. Es una limitación real y documentada del stack (D-6), no
el comportamiento deseado; el test la fija para que sea conocida.
"""

import fastapi
import httpx
from pydantic import BaseModel

from fastapi_bridge.core.settings import Settings
from fastapi_bridge.exceptions.domain import InvalidCredentialsError
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


# ---------------------------------------------------------------------------
# CHANGE-07 (D-6, H-4) — CORS sobre las respuestas de error
# ---------------------------------------------------------------------------


class _Body(BaseModel):
    email: str
    password: str


def _app_with_failing_routes() -> fastapi.FastAPI:
    app = create_app(Settings(CORS_ORIGINS=[ALLOWED_ORIGIN]))

    @app.post("/__test_validate")
    def _validate(body: _Body) -> dict:
        return {"ok": True}

    @app.get("/__test_invalid")
    def _invalid() -> dict:
        raise InvalidCredentialsError()

    @app.get("/__test_boom")
    def _boom() -> dict:
        raise RuntimeError("boom")

    return app


async def test_validation_error_response_carries_cors_headers():
    app = _app_with_failing_routes()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/__test_validate",
            json={"email": "a"},
            headers={"Origin": ALLOWED_ORIGIN},
        )

    assert response.status_code == 422
    assert response.headers.get("access-control-allow-origin") == ALLOWED_ORIGIN


async def test_domain_error_response_carries_cors_headers():
    app = _app_with_failing_routes()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/__test_invalid", headers={"Origin": ALLOWED_ORIGIN})

    assert response.status_code == 401
    assert response.headers.get("access-control-allow-origin") == ALLOWED_ORIGIN


async def test_404_response_carries_cors_headers():
    app = _app_with_failing_routes()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/__does_not_exist", headers={"Origin": ALLOWED_ORIGIN})

    assert response.status_code == 404
    assert response.headers.get("access-control-allow-origin") == ALLOWED_ORIGIN


async def test_500_response_does_not_carry_cors_headers():
    # Comportamiento real y documentado (D-6), no un bug abierto: el 500 del
    # handler genérico se genera por fuera de `CORSMiddleware`, así que un
    # navegador con origen cruzado no puede leer su cuerpo. El cuerpo es un
    # literal genérico sin nada accionable (D-5), así que la pérdida de
    # información hacia el cliente es nula.
    #
    # `raise_app_exceptions=False` es el equivalente de
    # `TestClient(..., raise_server_exceptions=False)` (H-6) para el
    # transporte ASGI de httpx: sin él, el cliente re-lanza la excepción en
    # vez de entregar la respuesta 500 que produjo `unhandled_exception_handler`.
    app = _app_with_failing_routes()
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/__test_boom", headers={"Origin": ALLOWED_ORIGIN})

    assert response.status_code == 500
    assert "access-control-allow-origin" not in response.headers
