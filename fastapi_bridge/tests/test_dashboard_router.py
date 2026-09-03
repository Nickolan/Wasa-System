"""Tests del router del dominio dashboard (CHANGE-25, grupo 5/6)."""

import ast
from pathlib import Path

import httpx

import fastapi_bridge.core.limiter as limiter_module
from fastapi_bridge.core.dependencies import get_dashboard_service
from fastapi_bridge.core.limiter import limiter
from fastapi_bridge.core.settings import Settings
from fastapi_bridge.main import create_app
from fastapi_bridge.schemas.dashboard_schemas import DashboardFilters, DashboardResponse

FASTAPI_BRIDGE_ROOT = Path(__file__).resolve().parent.parent
DASHBOARD_ROUTER_PATH = FASTAPI_BRIDGE_ROOT / "api" / "v1" / "dashboard" / "router.py"


class _DoubleDashboardService:
    def __init__(self, response: DashboardResponse) -> None:
        self._response = response
        self.received_filters: DashboardFilters | None = None

    async def get_dashboard(self, filters: DashboardFilters) -> DashboardResponse:
        self.received_filters = filters
        return self._response


class _RaisingDashboardService:
    async def get_dashboard(self, filters: DashboardFilters) -> DashboardResponse:
        raise RuntimeError(
            "conexión a postgresql+asyncpg://wasa:secret@db-host:5432/db_fuzzing agotada"
        )


def _mounted_app(double: _DoubleDashboardService | None = None) -> "httpx.ASGITransport":
    app = create_app()
    app.dependency_overrides[get_dashboard_service] = lambda: double or _DoubleDashboardService(
        DashboardResponse(scans=[], vulnerabilities=[])
    )
    return app


async def test_get_dashboard_without_query_params_returns_200(monkeypatch):
    app = create_app()
    double = _DoubleDashboardService(DashboardResponse(scans=[], vulnerabilities=[]))
    app.dependency_overrides[get_dashboard_service] = lambda: double

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/dashboard")

    assert response.status_code == 200
    assert response.json() == {"scans": [], "vulnerabilities": []}


async def test_get_dashboard_dependency_is_substitutable_by_the_route():
    # 5.4: `app.dependency_overrides` cambia efectivamente qué servicio usa
    # la ruta -- mismo patrón que `test_get_auth_service_dependency_is_substitutable_by_the_route`.
    app = create_app()
    double = _DoubleDashboardService(DashboardResponse(scans=[], vulnerabilities=[]))
    app.dependency_overrides[get_dashboard_service] = lambda: double

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        await client.get("/api/v1/dashboard", params={"scan_id": 7, "severity": "High", "source": "ffuf"})

    assert double.received_filters is not None
    assert double.received_filters.scan_id == 7
    assert double.received_filters.severity == "High"
    assert double.received_filters.source == "ffuf"


# --------------------------------------------------------------------------
# 5.5 -- el router es cableado puro: sin lógica, sin captura de errores
# --------------------------------------------------------------------------


def _parse(file_path: Path) -> ast.Module:
    return ast.parse(file_path.read_text(encoding="utf-8"), filename=str(file_path))


def test_dashboard_router_module_contains_no_try_and_builds_no_http_exception():
    tree = _parse(DASHBOARD_ROUTER_PATH)

    assert not any(isinstance(node, ast.Try) for node in ast.walk(tree))

    called_names = {
        node.func.id for node in ast.walk(tree) if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
    }
    assert "HTTPException" not in called_names


def test_dashboard_router_module_does_not_construct_its_own_service():
    # `("api", "sqlalchemy")` en `tests/test_layer_boundaries.py::LAYER_IMPORT_RULES`
    # ya ancla, de forma recursiva sobre todo el árbol `api/`, que este
    # módulo no importa SQLAlchemy. Este test cubre lo que ese no puede: que
    # tampoco mencione el cableado de persistencia por nombre.
    source = DASHBOARD_ROUTER_PATH.read_text(encoding="utf-8")
    for forbidden_symbol in ("DashboardUoW", "get_session_factory", "Settings("):
        assert forbidden_symbol not in source


# --------------------------------------------------------------------------
# 6.3 -- la operación es pública
# --------------------------------------------------------------------------


async def test_dashboard_without_authorization_header_returns_200():
    app = _mounted_app()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/dashboard")
    assert response.status_code == 200


async def test_dashboard_with_an_invalid_token_returns_the_same_200():
    app = _mounted_app()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        without_header = await client.get("/api/v1/dashboard")
        with_invalid_token = await client.get(
            "/api/v1/dashboard", headers={"Authorization": "Bearer not-a-real-token"}
        )
    assert with_invalid_token.status_code == 200
    assert with_invalid_token.json() == without_header.json()


# --------------------------------------------------------------------------
# 6.4 -- montar dashboard no relaja el guard de scan
# --------------------------------------------------------------------------


async def test_mounting_dashboard_does_not_relax_the_scan_guard():
    app = _mounted_app()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/v1/scan/start")
    assert response.status_code == 401


# --------------------------------------------------------------------------
# 6.5 -- método y parámetros
# --------------------------------------------------------------------------


async def test_post_to_dashboard_returns_405():
    app = _mounted_app()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/v1/dashboard")
    assert response.status_code == 405


async def test_non_numeric_scan_id_returns_422_without_calling_the_service():
    class _FailingService:
        async def get_dashboard(self, filters):
            raise AssertionError("no debería invocarse: scan_id inválido debe rechazarse antes")

    app = create_app()
    app.dependency_overrides[get_dashboard_service] = lambda: _FailingService()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/dashboard", params={"scan_id": "abc"})
    assert response.status_code == 422


async def test_empty_severity_query_param_is_equivalent_to_absent():
    double = _DoubleDashboardService(DashboardResponse(scans=[], vulnerabilities=[]))
    app = _mounted_app(double)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/dashboard", params={"severity": ""})
    assert response.status_code == 200
    assert double.received_filters.severity == ""  # el router pasa el valor crudo


async def test_unknown_query_param_does_not_alter_the_result():
    double = _DoubleDashboardService(DashboardResponse(scans=[], vulnerabilities=[]))
    app = _mounted_app(double)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        without_extra = await client.get("/api/v1/dashboard")
        with_extra = await client.get("/api/v1/dashboard", params={"limit": 5})
    assert with_extra.status_code == 200
    assert with_extra.json() == without_extra.json()


# --------------------------------------------------------------------------
# 6.6 -- respuesta ante fallo
# --------------------------------------------------------------------------


async def test_service_failure_returns_5xx_problem_json_without_leaking_infrastructure_details():
    # `raise_app_exceptions=False`: por defecto `httpx.ASGITransport` (igual
    # que `TestClient`, ver `test_exception_handlers.py`, H-6) re-lanza la
    # excepción original en vez de devolver la respuesta que produjo el
    # handler -- necesario para ejercitar el 500 real de punta a punta.
    app = create_app()
    app.dependency_overrides[get_dashboard_service] = lambda: _RaisingDashboardService()
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/dashboard")

    assert 500 <= response.status_code < 600
    assert response.headers["content-type"] == "application/problem+json"
    body_text = response.text.lower()
    for leaked_fragment in ("postgresql", "asyncpg", "db-host", "wasa:secret", "5432", "select"):
        assert leaked_fragment not in body_text


# --------------------------------------------------------------------------
# 6.7 -- la ruta no consume el cupo de rate limit
# --------------------------------------------------------------------------


async def test_dashboard_route_is_never_rate_limited(monkeypatch):
    monkeypatch.setattr(
        limiter_module,
        "get_settings",
        lambda: Settings(RATE_LIMIT_REQUESTS=1, RATE_LIMIT_WINDOW=3600),
    )
    limiter.reset()
    try:
        app = _mounted_app()
        transport = httpx.ASGITransport(app=app, client=("10.0.0.9", 12345))
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            responses = [await client.get("/api/v1/dashboard") for _ in range(5)]
    finally:
        limiter.reset()

    assert all(response.status_code == 200 for response in responses)


# --------------------------------------------------------------------------
# 6.8 -- esquema OpenAPI
# --------------------------------------------------------------------------


def _dashboard_operation() -> dict:
    app = create_app()
    return app.openapi()["paths"]["/api/v1/dashboard"]["get"]


def test_openapi_includes_the_dashboard_get_operation():
    operation = _dashboard_operation()
    assert operation is not None


def test_openapi_declares_the_three_query_parameters_as_optional():
    operation = _dashboard_operation()
    params_by_name = {p["name"]: p for p in operation.get("parameters", [])}
    for name in ("scan_id", "severity", "source"):
        assert params_by_name[name]["in"] == "query"
        assert params_by_name[name]["required"] is False


def test_openapi_operation_declares_no_security_requirement():
    operation = _dashboard_operation()
    assert not operation.get("security")
