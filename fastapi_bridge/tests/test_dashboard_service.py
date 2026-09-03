"""Tests de `DashboardService` (CHANGE-25, D-5: normalización de `severity` vive acá)."""

import ast
from pathlib import Path

from fastapi_bridge.schemas.dashboard_schemas import DashboardFilters
from fastapi_bridge.services.dashboard_service import DashboardService

DASHBOARD_SERVICE_PATH = (
    Path(__file__).resolve().parent.parent / "services" / "dashboard_service.py"
)


class _RecordingRepository:
    def __init__(self, scans=None, vulnerabilities=None) -> None:
        self._scans = scans if scans is not None else []
        self._vulnerabilities = vulnerabilities if vulnerabilities is not None else []
        self.received_filters: dict | None = None

    async def get_scans(self):
        return self._scans

    async def get_vulnerabilities(self, filters):
        self.received_filters = filters
        return self._vulnerabilities


class _RecordingUoW:
    """Doble de `DashboardUoW`: expone `.dashboard` y es reentrante como `async with`."""

    def __init__(self, repository: _RecordingRepository) -> None:
        self._repository = repository

    @property
    def dashboard(self) -> _RecordingRepository:
        return self._repository

    async def __aenter__(self) -> "_RecordingUoW":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None


async def test_severity_capitalized_reaches_the_repository_lowercased():
    repository = _RecordingRepository()
    service = DashboardService(_RecordingUoW(repository))

    await service.get_dashboard(DashboardFilters(scan_id=None, severity="Critical", source=None))

    assert repository.received_filters["severity"] == "critical"


async def test_source_reaches_the_repository_unchanged():
    repository = _RecordingRepository()
    service = DashboardService(_RecordingUoW(repository))

    await service.get_dashboard(DashboardFilters(scan_id=None, severity=None, source="OWASP ZAP"))

    assert repository.received_filters["source"] == "OWASP ZAP"


async def test_scan_id_reaches_the_repository_unchanged():
    repository = _RecordingRepository()
    service = DashboardService(_RecordingUoW(repository))

    await service.get_dashboard(DashboardFilters(scan_id=42, severity=None, source=None))

    assert repository.received_filters["scan_id"] == 42


async def test_empty_string_severity_is_treated_as_absent():
    repository = _RecordingRepository()
    service = DashboardService(_RecordingUoW(repository))

    await service.get_dashboard(DashboardFilters(scan_id=None, severity="", source=None))

    assert repository.received_filters["severity"] is None


async def test_get_dashboard_returns_a_dashboard_response_with_both_collections():
    repository = _RecordingRepository(
        scans=[{"id": 1, "target_url": "https://x.test"}],
        vulnerabilities=[{"id": 2, "severity": "high"}],
    )
    service = DashboardService(_RecordingUoW(repository))

    response = await service.get_dashboard(DashboardFilters(scan_id=None, severity=None, source=None))

    assert len(response.scans) == 1
    assert response.scans[0].id == 1
    assert len(response.vulnerabilities) == 1
    assert response.vulnerabilities[0].severity == "high"


def test_dashboard_service_module_has_no_try_except():
    # 5.2: `("services", "sqlalchemy")` en `test_layer_boundaries.py` ya
    # ancla que el módulo no importa SQLAlchemy directamente. Este test
    # cubre lo que ese no puede: D-7, sin captura de excepciones -- un fallo
    # de base de datos se propaga hasta el handler genérico de `main.py`.
    tree = ast.parse(DASHBOARD_SERVICE_PATH.read_text(encoding="utf-8"), filename=str(DASHBOARD_SERVICE_PATH))
    assert not any(isinstance(node, ast.Try) for node in ast.walk(tree))
