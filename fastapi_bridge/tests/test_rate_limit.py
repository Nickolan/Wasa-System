"""Tests end-to-end del comportamiento 429 del rate limit de scan (D-8, D-9).

D-8: no se monta el router real `api/v1/scan/router.py` — estos tests
construyen la app vía `create_app()` y le montan **en el propio test** una
ruta desechable decorada con el mismo `scan_rate_limit` que CHANGE-12
aplicará sobre `POST /start`.

D-9: `scan_rate_limit` queda atado, desde el import de `core/limiter.py`, al
singleton de módulo `limiter` — no a la instancia nueva que `create_app()`
publica en `app.state.limiter`. Aislar el contador entre tests significa
entonces resetear el storage de ese singleton (`limiter.reset()`), no
construir un `Limiter` nuevo (el decorador ya capturó `self` en tiempo de
import y no se puede reapuntar).
"""

import json
import uuid

import httpx
import pytest
from starlette.requests import Request
from starlette.responses import JSONResponse

import fastapi_bridge.core.limiter as limiter_module
from fastapi_bridge.core.limiter import limiter, scan_rate_limit
from fastapi_bridge.core.settings import Settings
from fastapi_bridge.main import create_app

TEST_QUOTA = 3
TEST_WINDOW = 3600
STUB_PATH = "/__test__/scan/start"


@pytest.fixture
def rate_limited_app(monkeypatch):
    # scan_limit_string() lee get_settings() en cada request (D-5); se
    # sustituye acá para que la ruta de test opere con un cupo chico sin
    # tocar el entorno del proceso.
    monkeypatch.setattr(
        limiter_module,
        "get_settings",
        lambda: Settings(RATE_LIMIT_REQUESTS=TEST_QUOTA, RATE_LIMIT_WINDOW=TEST_WINDOW),
    )
    limiter.reset()

    app = create_app()
    call_count = {"value": 0}

    # slowapi indexa sus registros de límite (`_route_limits` /
    # `_dynamic_route_limits`) por `f"{func.__module__}.{func.__name__}"`, y
    # ese registro NO se limpia con `limiter.reset()` (que sólo vacía el
    # storage de conteo) — persiste en el singleton de módulo entre tests.
    # Un nombre de función único por test evita que el registro de un test
    # anterior siga sumando límites duplicados sobre la misma clave.
    async def _scan_start_stub(request: Request) -> JSONResponse:
        call_count["value"] += 1
        return JSONResponse({"status": "accepted"})

    _scan_start_stub.__name__ = f"scan_start_stub_{uuid.uuid4().hex}"
    _scan_start_stub.__qualname__ = _scan_start_stub.__name__

    limited_stub = scan_rate_limit(_scan_start_stub)
    app.add_api_route(STUB_PATH, limited_stub, methods=["POST"])

    yield app, call_count

    limiter.reset()


async def _post(app, path: str = STUB_PATH, client_host: str = "10.0.0.1") -> httpx.Response:
    transport = httpx.ASGITransport(app=app, client=(client_host, 12345))
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post(path)


async def test_fixture_route_responds_200(rate_limited_app):
    app, call_count = rate_limited_app

    response = await _post(app)

    assert response.status_code == 200
    assert call_count["value"] == 1


async def test_requests_within_quota_are_never_rejected(rate_limited_app):
    app, call_count = rate_limited_app

    responses = [await _post(app) for _ in range(TEST_QUOTA)]

    assert all(response.status_code == 200 for response in responses)
    assert call_count["value"] == TEST_QUOTA


async def test_request_over_quota_is_rejected_without_executing_the_endpoint(rate_limited_app):
    app, call_count = rate_limited_app

    for _ in range(TEST_QUOTA):
        await _post(app)
    over_quota_response = await _post(app)

    assert over_quota_response.status_code == 429
    # El cupo se agotó exactamente en TEST_QUOTA llamadas; la solicitud
    # N+1 no debe haber incrementado el contador (el handler nunca corrió).
    assert call_count["value"] == TEST_QUOTA


async def test_429_body_is_rfc7807_with_content_type_and_retry_after(rate_limited_app):
    app, _call_count = rate_limited_app

    for _ in range(TEST_QUOTA):
        await _post(app)
    over_quota_response = await _post(app)

    assert over_quota_response.status_code == 429
    assert over_quota_response.headers["content-type"] == "application/problem+json"

    body = json.loads(over_quota_response.content)
    assert set(body.keys()) == {"type", "title", "status", "detail", "instance"}
    assert body["status"] == 429

    retry_after = over_quota_response.headers.get("retry-after")
    assert retry_after is not None
    assert int(retry_after) > 0


async def test_quota_is_per_ip_not_global(rate_limited_app):
    app, _call_count = rate_limited_app
    first_ip = "10.0.0.1"
    second_ip = "10.0.0.2"

    for _ in range(TEST_QUOTA):
        await _post(app, client_host=first_ip)
    first_ip_over_quota_response = await _post(app, client_host=first_ip)

    # La primera IP ya agotó su cupo.
    assert first_ip_over_quota_response.status_code == 429

    # Una segunda IP, sin historial, tiene su propio contador independiente.
    second_ip_response = await _post(app, client_host=second_ip)
    assert second_ip_response.status_code == 200


async def test_repeated_run_starts_with_a_fresh_quota_first(rate_limited_app):
    # Primero de dos tests idénticos consecutivos (ver el segundo abajo):
    # agota el cupo por completo.
    app, _call_count = rate_limited_app
    responses = [await _post(app) for _ in range(TEST_QUOTA)]
    assert all(response.status_code == 200 for response in responses)


async def test_repeated_run_starts_with_a_fresh_quota_second(rate_limited_app):
    # Si el aislamiento de D-9 fallara, este test heredaría el cupo ya
    # agotado por el anterior y fallaría acá — la fixture reconstruye la
    # app y resetea el storage del Limiter en cada invocación.
    app, _call_count = rate_limited_app
    responses = [await _post(app) for _ in range(TEST_QUOTA)]
    assert all(response.status_code == 200 for response in responses)
