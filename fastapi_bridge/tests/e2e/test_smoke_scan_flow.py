"""Recorrido de escaneo contra infraestructura viva (CHANGE-22, grupo 4).

Depende del JWT emitido por `test_smoke_auth_flow.py::test_login_with_valid_credentials_returns_200_and_token`
(`smoke_state["access_token"]`, scope=session) -- D-3: el suite es
secuencial a propósito. `db_conn` y `scans`/`vulnerabilities` se tratan
como **solo lectura** en todo este módulo (regla dura del proyecto + D-6):
ninguna sentencia de este archivo escribe sobre esas dos tablas -- ver
`test_scan_and_vulnerabilities_tables_are_read_only_in_this_suite`, que lo
verifica por inspección de código.
"""

from __future__ import annotations

import asyncio
import re
import time
import uuid
from pathlib import Path

import httpx
import pytest

pytestmark = pytest.mark.e2e

_SCAN_START_PATH = "/api/v1/scan/start"
_MISSING_TOKEN_DETAIL = "No se proporcionó un token de autenticación."
_INVALID_TOKEN_DETAIL = "El token de autenticación no es válido o expiró."


def _scan_body(target_url: str, phpsessid: str) -> dict:
    return {"target_url": target_url, "phpsessid": phpsessid}


def test_scan_without_jwt_returns_401(bridge_base_url: str, smoke_target: tuple[str, str]) -> None:
    target_url, phpsessid = smoke_target

    response = httpx.post(
        f"{bridge_base_url}{_SCAN_START_PATH}", json=_scan_body(target_url, phpsessid), timeout=5.0
    )

    assert response.status_code == 401
    assert response.headers["content-type"].startswith("application/problem+json")
    body = response.json()
    assert body["detail"] == _MISSING_TOKEN_DETAIL


def test_scan_with_invalid_jwt_returns_401(bridge_base_url: str, smoke_target: tuple[str, str]) -> None:
    target_url, phpsessid = smoke_target

    response = httpx.post(
        f"{bridge_base_url}{_SCAN_START_PATH}",
        json=_scan_body(target_url, phpsessid),
        headers={"Authorization": "Bearer this-is-not-a-real-jwt"},
        timeout=5.0,
    )

    assert response.status_code == 401
    body = response.json()
    assert body["detail"] == _INVALID_TOKEN_DETAIL


@pytest.mark.asyncio(loop_scope="session")
async def test_scan_with_valid_jwt_returns_202_under_3s(
    bridge_base_url: str, smoke_target: tuple[str, str], smoke_state: dict, db_conn
) -> None:
    target_url, phpsessid = smoke_target
    token = smoke_state.get("access_token")
    if not token:
        pytest.skip(
            "No hay access_token en smoke_state: "
            "test_login_with_valid_credentials_returns_200_and_token no corrió o falló antes que este test"
        )

    # Ancla por `id` (monotónico), no por timestamp: `scans.scan_date` es
    # `timestamp without time zone` y comparar contra el reloj de este
    # proceso sería frágil ante cualquier desfasaje de reloj/zona horaria
    # entre esta máquina y la que corre PostgreSQL/n8n. El máximo `id` antes
    # de disparar es la única marca de "nuevo" que no depende del reloj.
    max_id_before = await db_conn.fetchval("SELECT COALESCE(max(id), 0) FROM scans")

    started_at = time.monotonic()
    response = httpx.post(
        f"{bridge_base_url}{_SCAN_START_PATH}",
        json=_scan_body(target_url, phpsessid),
        headers={"Authorization": f"Bearer {token}"},
        timeout=10.0,
    )
    elapsed = time.monotonic() - started_at

    assert response.status_code == 202
    body = response.json()
    # scan_id debe ser parseable como UUID (CHANGE-12, D-uuid4 en ScanService).
    parsed = uuid.UUID(body["scan_id"])
    assert str(parsed) == body["scan_id"]
    assert elapsed < 3.0, f"el 202 tardó {elapsed:.3f}s, se esperaba < 3.0s"

    smoke_state["scan_id"] = body["scan_id"]
    smoke_state["scan_target_url"] = target_url
    smoke_state["scans_max_id_before"] = max_id_before
    print(f"\n[evidencia] scan_id={body['scan_id']} elapsed={elapsed:.3f}s target_url={target_url}")


@pytest.mark.asyncio(loop_scope="session")
async def test_scan_row_appears_in_shared_db(db_conn, smoke_state: dict) -> None:
    target_url = smoke_state.get("scan_target_url")
    max_id_before = smoke_state.get("scans_max_id_before")
    if target_url is None or max_id_before is None:
        pytest.skip(
            "No hay scan_target_url/scans_max_id_before en smoke_state: "
            "test_scan_with_valid_jwt_returns_202_under_3s no corrió o falló antes que este test"
        )

    # El INSERT en `scans` lo hace el workflow de n8n, disparado por el
    # webhook -- es asíncrono respecto del 202 del Bridge (D-1 del roadmap:
    # el Bridge es fire-and-forward). Reintenta con espera acotada; si se
    # agota, el mensaje distingue "n8n no insertó" de "sin conexión" porque
    # `db_conn` ya habría hecho skip antes si la conexión fallara.
    max_attempts = 20
    poll_interval_seconds = 3.0
    row = None
    for _ in range(max_attempts):
        row = await db_conn.fetchrow(
            "SELECT id, target_url FROM scans WHERE id > $1 AND target_url = $2 ORDER BY id ASC LIMIT 1",
            max_id_before,
            target_url,
        )
        if row is not None:
            break
        await asyncio.sleep(poll_interval_seconds)

    assert row is not None, (
        f"n8n no insertó ninguna fila nueva (id > {max_id_before}) en scans para "
        f"target_url={target_url!r} tras {max_attempts * poll_interval_seconds:.0f}s de espera -- "
        "el 202 del Bridge fue aceptado pero el workflow no llegó a persistir el escaneo "
        "(o tardó más de lo esperado)"
    )
    assert row["target_url"] == target_url
    print(f"\n[evidencia] scans.id={row['id']} target_url={row['target_url']}")


def test_scan_and_vulnerabilities_tables_are_read_only_in_this_suite() -> None:
    """Inspección estática (4.6): ningún archivo de este paquete emite SQL de
    escritura (`INSERT INTO`/`UPDATE ... SET`/`DELETE FROM`/`ALTER TABLE`)
    contra `scans` ni `vulnerabilities`. La única escritura de todo el suite
    es el `DELETE FROM users WHERE email = $1` de `conftest.py::smoke_identity`
    (D-4).

    Los patrones exigen la sintaxis SQL real adyacente a la tabla (no solo
    "el verbo y el nombre de tabla en algún lugar de la línea"): la prosa de
    este mismo archivo describe en varios docstrings que "el INSERT en
    `scans` lo hace n8n", y esa frase -- que no es SQL -- no debe autodetectarse
    como una escritura prohibida.
    """
    protected_tables = ("scans", "vulnerabilities")
    sql_write_patterns = [
        re.compile(rf"\bINSERT\s+INTO\s+{table}\b", re.IGNORECASE) for table in protected_tables
    ] + [
        re.compile(rf"\bUPDATE\s+{table}\b", re.IGNORECASE) for table in protected_tables
    ] + [
        re.compile(rf"\bDELETE\s+FROM\s+{table}\b", re.IGNORECASE) for table in protected_tables
    ] + [
        re.compile(rf"\bALTER\s+TABLE\s+{table}\b", re.IGNORECASE) for table in protected_tables
    ]

    e2e_dir = Path(__file__).resolve().parent
    offending: list[str] = []
    for py_file in e2e_dir.glob("*.py"):
        text = py_file.read_text(encoding="utf-8")
        if any(pattern.search(text) for pattern in sql_write_patterns):
            offending.append(py_file.name)

    assert offending == [], f"escritura prohibida sobre scans/vulnerabilities detectada en: {offending}"
