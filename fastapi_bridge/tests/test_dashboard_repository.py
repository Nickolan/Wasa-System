"""Tests de `DashboardRepository` (CHANGE-25, D-1: SQL de texto, parámetros ligados).

Usa la fixture `shared_tables_session` (`conftest.py`, tarea 4.1): SQLite en
memoria propio del test, con `scans`/`vulnerabilities` locales -- nunca la
base compartida real.
"""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi_bridge.repositories.dashboard_repository import DashboardRepository


async def _seed_scan(session: AsyncSession, **columns) -> None:
    defaults = {
        "id": None,
        "target_url": "https://example.test",
        "scan_date": "2024-01-01T00:00:00",
        "total_vulnerabilities": 0,
        "critical_count": 0,
        "high_count": 0,
        "medium_count": 0,
        "low_count": 0,
        "report_path": None,
    }
    defaults.update(columns)
    await session.execute(
        text(
            "INSERT INTO scans (id, target_url, scan_date, total_vulnerabilities, critical_count, "
            "high_count, medium_count, low_count, report_path) "
            "VALUES (:id, :target_url, :scan_date, :total_vulnerabilities, :critical_count, "
            ":high_count, :medium_count, :low_count, :report_path)"
        ),
        defaults,
    )


async def _seed_vulnerability(session: AsyncSession, **columns) -> None:
    defaults = {
        "id": None,
        "scan_id": None,
        "source": "OWASP ZAP",
        "type": "xss",
        "severity": "high",
        "url": "https://example.test/vuln",
        "description": "desc",
        "solution": "sol",
        "cweid": "CWE-79",
        "evidence": "evidence",
    }
    defaults.update(columns)
    await session.execute(
        text(
            "INSERT INTO vulnerabilities (id, scan_id, source, type, severity, url, description, "
            "solution, cweid, evidence) "
            "VALUES (:id, :scan_id, :source, :type, :severity, :url, :description, :solution, "
            ":cweid, :evidence)"
        ),
        defaults,
    )


# --------------------------------------------------------------------------
# 4.2 -- get_scans(): orden cronológico ascendente
# --------------------------------------------------------------------------


async def test_get_scans_returns_seeded_rows_ordered_by_scan_date_ascending(shared_tables_session):
    await _seed_scan(shared_tables_session, id=1, target_url="https://c.test", scan_date="2024-03-01")
    await _seed_scan(shared_tables_session, id=2, target_url="https://a.test", scan_date="2024-01-01")
    await _seed_scan(shared_tables_session, id=3, target_url="https://b.test", scan_date="2024-02-01")

    repository = DashboardRepository(shared_tables_session)
    scans = await repository.get_scans()

    assert [row["target_url"] for row in scans] == ["https://a.test", "https://b.test", "https://c.test"]


async def test_get_scans_on_an_empty_table_returns_an_empty_list(shared_tables_session):
    repository = DashboardRepository(shared_tables_session)
    assert await repository.get_scans() == []


# --------------------------------------------------------------------------
# 4.3 -- get_vulnerabilities(): sin filtros devuelve todo
# --------------------------------------------------------------------------


async def test_get_vulnerabilities_without_filters_returns_all_rows(shared_tables_session):
    await _seed_vulnerability(shared_tables_session, id=1, severity="high")
    await _seed_vulnerability(shared_tables_session, id=2, severity="low")

    repository = DashboardRepository(shared_tables_session)
    rows = await repository.get_vulnerabilities({})

    assert {row["id"] for row in rows} == {1, 2}


# --------------------------------------------------------------------------
# 4.4 -- triangulación por cada filtro por separado
# --------------------------------------------------------------------------


async def test_get_vulnerabilities_filters_by_scan_id_match(shared_tables_session):
    await _seed_vulnerability(shared_tables_session, id=1, scan_id=10)
    await _seed_vulnerability(shared_tables_session, id=2, scan_id=20)

    repository = DashboardRepository(shared_tables_session)
    rows = await repository.get_vulnerabilities({"scan_id": 10})

    assert [row["id"] for row in rows] == [1]


async def test_get_vulnerabilities_filters_by_scan_id_no_match(shared_tables_session):
    await _seed_vulnerability(shared_tables_session, id=1, scan_id=10)

    repository = DashboardRepository(shared_tables_session)
    rows = await repository.get_vulnerabilities({"scan_id": 999})

    assert rows == []


async def test_get_vulnerabilities_filters_by_severity_match(shared_tables_session):
    await _seed_vulnerability(shared_tables_session, id=1, severity="critical")
    await _seed_vulnerability(shared_tables_session, id=2, severity="low")

    repository = DashboardRepository(shared_tables_session)
    rows = await repository.get_vulnerabilities({"severity": "critical"})

    assert [row["id"] for row in rows] == [1]


async def test_get_vulnerabilities_filters_by_severity_no_match(shared_tables_session):
    await _seed_vulnerability(shared_tables_session, id=1, severity="critical")

    repository = DashboardRepository(shared_tables_session)
    rows = await repository.get_vulnerabilities({"severity": "medium"})

    assert rows == []


async def test_get_vulnerabilities_filters_by_source_match(shared_tables_session):
    await _seed_vulnerability(shared_tables_session, id=1, source="SQLMap (Worker)")
    await _seed_vulnerability(shared_tables_session, id=2, source="ffuf")

    repository = DashboardRepository(shared_tables_session)
    rows = await repository.get_vulnerabilities({"source": "SQLMap (Worker)"})

    assert [row["id"] for row in rows] == [1]


async def test_get_vulnerabilities_filters_by_source_no_match(shared_tables_session):
    await _seed_vulnerability(shared_tables_session, id=1, source="SQLMap (Worker)")

    repository = DashboardRepository(shared_tables_session)
    rows = await repository.get_vulnerabilities({"source": "nonexistent"})

    assert rows == []


# --------------------------------------------------------------------------
# 4.5 -- triangulación de la conjunción
# --------------------------------------------------------------------------


async def test_get_vulnerabilities_combines_two_filters(shared_tables_session):
    await _seed_vulnerability(shared_tables_session, id=1, severity="high", source="ffuf")
    await _seed_vulnerability(shared_tables_session, id=2, severity="high", source="OWASP ZAP")
    await _seed_vulnerability(shared_tables_session, id=3, severity="low", source="ffuf")

    repository = DashboardRepository(shared_tables_session)
    rows = await repository.get_vulnerabilities({"severity": "high", "source": "ffuf"})

    assert [row["id"] for row in rows] == [1]


async def test_get_vulnerabilities_combines_three_filters(shared_tables_session):
    await _seed_vulnerability(shared_tables_session, id=1, scan_id=10, severity="high", source="ffuf")
    await _seed_vulnerability(shared_tables_session, id=2, scan_id=10, severity="high", source="OWASP ZAP")
    await _seed_vulnerability(shared_tables_session, id=3, scan_id=20, severity="high", source="ffuf")

    repository = DashboardRepository(shared_tables_session)
    rows = await repository.get_vulnerabilities({"scan_id": 10, "severity": "high", "source": "ffuf"})

    assert [row["id"] for row in rows] == [1]


async def test_get_vulnerabilities_contradictory_filters_return_empty_without_error(shared_tables_session):
    await _seed_vulnerability(shared_tables_session, id=1, severity="high", source="ffuf")

    repository = DashboardRepository(shared_tables_session)
    rows = await repository.get_vulnerabilities({"severity": "high", "source": "OWASP ZAP"})

    assert rows == []


# --------------------------------------------------------------------------
# 4.6 -- el filtro viaja ligado, nunca como texto SQL
# --------------------------------------------------------------------------


async def test_get_vulnerabilities_sql_injection_attempt_returns_no_rows_and_leaves_table_intact(
    shared_tables_session,
):
    await _seed_vulnerability(shared_tables_session, id=1, source="ffuf")

    repository = DashboardRepository(shared_tables_session)
    rows = await repository.get_vulnerabilities({"source": "' OR 1=1 --"})

    assert rows == []

    remaining = await shared_tables_session.execute(text("SELECT COUNT(*) FROM vulnerabilities"))
    assert remaining.scalar_one() == 1
