"""Tests de los schemas del dominio dashboard (CHANGE-25, D-2)."""

from datetime import datetime

import pytest
from pydantic import ValidationError

from fastapi_bridge.schemas.dashboard_schemas import (
    DashboardFilters,
    DashboardResponse,
    ScanRow,
    VulnerabilityRow,
)


def test_scan_row_keeps_an_unknown_key_intact():
    row = ScanRow.model_validate({"id": 1, "target_url": "https://x.test", "unexpected_column": "kept"})
    assert row.model_dump()["unexpected_column"] == "kept"


def test_scan_row_all_declared_fields_are_optional():
    row = ScanRow.model_validate({})
    dumped = row.model_dump()
    for field in (
        "id",
        "target_url",
        "scan_date",
        "total_vulnerabilities",
        "critical_count",
        "high_count",
        "medium_count",
        "low_count",
        "report_path",
    ):
        assert dumped[field] is None


def test_scan_row_accepts_a_native_datetime_for_scan_date():
    # Contra Postgres real, `scan_date` (columna TIMESTAMP) llega como
    # `datetime.datetime`, no como string: asyncpg/SQLAlchemy deserializan
    # el tipo de columna, no lo dejan en texto. `str | None` rechazaba esto
    # con un ValidationError -- 500 real, reproducido corriendo el Bridge
    # contra db_fuzzing -- así que el campo debe aceptar `datetime` (D-2 se
    # mantiene: el valor no se transforma, sólo se tipa correctamente).
    row = ScanRow.model_validate({"id": 1, "scan_date": datetime(2026, 5, 3, 18, 53, 2, 150000)})
    assert row.scan_date == datetime(2026, 5, 3, 18, 53, 2, 150000)


def test_scan_row_still_accepts_an_iso_string_for_scan_date():
    # No regresivo: los fixtures de test (columna TEXT) y cualquier caller
    # que ya arme el dict con un string ISO siguen funcionando -- Pydantic
    # parsea el string a `datetime` en vez de rechazarlo.
    row = ScanRow.model_validate({"id": 1, "scan_date": "2024-01-01T00:00:00"})
    assert row.scan_date == datetime(2024, 1, 1, 0, 0, 0)


def test_vulnerability_row_accepts_a_native_int_for_cweid():
    # Contra Postgres real, `cweid` (columna INTEGER de `vulnerabilities`,
    # p.ej. -1 como sentinel de "sin CWE", o 497/1021 para CWEs reales)
    # llega como `int`, no como string. `str | None` rechazaba esto con un
    # ValidationError -- 500 real, reproducido corriendo el Bridge contra
    # db_fuzzing. `int | str | None` tolera además el formato de texto
    # ("CWE-79") que otra fuente de escaneo pudiera llegar a escribir.
    row = VulnerabilityRow.model_validate({"id": 1, "cweid": -1})
    assert row.cweid == -1


def test_vulnerability_row_still_accepts_a_string_for_cweid():
    row = VulnerabilityRow.model_validate({"id": 1, "cweid": "CWE-79"})
    assert row.cweid == "CWE-79"


def test_vulnerability_row_keeps_an_unknown_key_intact():
    row = VulnerabilityRow.model_validate({"id": 1, "severity": "high", "unexpected_column": "kept"})
    assert row.model_dump()["unexpected_column"] == "kept"


def test_vulnerability_row_missing_column_gives_none_not_a_validation_error():
    # 3.2: una columna ausente debe dar None, nunca un error de validación --
    # el Bridge no controla el esquema de la tabla compartida.
    row = VulnerabilityRow.model_validate({"id": 1})
    assert row.model_dump()["severity"] is None
    assert row.model_dump()["source"] is None


def test_vulnerability_row_all_declared_fields_are_optional():
    row = VulnerabilityRow.model_validate({})
    dumped = row.model_dump()
    for field in (
        "id",
        "scan_id",
        "source",
        "type",
        "severity",
        "url",
        "description",
        "solution",
        "cweid",
        "evidence",
    ):
        assert dumped[field] is None


def test_dashboard_response_empty_dump_has_exactly_scans_and_vulnerabilities():
    response = DashboardResponse(scans=[], vulnerabilities=[])
    assert response.model_dump() == {"scans": [], "vulnerabilities": []}


def test_dashboard_filters_all_fields_accept_none():
    filters = DashboardFilters(scan_id=None, severity=None, source=None)
    assert filters.model_dump() == {"scan_id": None, "severity": None, "source": None}


def test_dashboard_filters_rejects_a_non_numeric_scan_id():
    with pytest.raises(ValidationError):
        DashboardFilters(scan_id="abc", severity=None, source=None)
