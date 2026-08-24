"""Fase aislada de rate limiting (CHANGE-22, grupo 5, D-5 de `design.md`).

Corre **última** y contra un Bridge reiniciado con `N8N_WEBHOOK_URL`
apuntando al receptor local trivial (`local_receiver.py`) -- ver el paso 5
de `docs/e2e-smoke-test-runbook.md`. Guarda propia además de la de
`conftest.py`: exige `WASA_E2E_RATELIMIT=1` explícito, porque agota el
presupuesto de `RATE_LIMIT_REQUESTS`/IP/`RATE_LIMIT_WINDOW` (10/3600s por
defecto) y deja `127.0.0.1` en `429` para cualquier escaneo posterior hasta
que alguien reinicie el proceso `uvicorn` (D-5, 5.5).

Autosuficiente a propósito (no depende de `smoke_state` de
`test_smoke_auth_flow.py`): registra o loguea su propia identidad, para que
`pytest fastapi_bridge/tests/e2e -m e2e_ratelimit` funcione seleccionado
solo, sin haber corrido antes el resto del suite.
"""

from __future__ import annotations

import os

import httpx
import pytest

pytestmark = [pytest.mark.e2e, pytest.mark.e2e_ratelimit]

if os.getenv("WASA_E2E_RATELIMIT") != "1":
    pytest.skip(
        "Fase de rate limit opt-in: exportá WASA_E2E_RATELIMIT=1 además de WASA_E2E=1 "
        "(agota el presupuesto de /scan/start para esta IP; ver docs/e2e-smoke-test-runbook.md).",
        allow_module_level=True,
    )

_SCAN_START_PATH = "/api/v1/scan/start"
_REGISTER_PATH = "/api/v1/auth/register"
_LOGIN_PATH = "/api/v1/auth/login"


@pytest.fixture(scope="module")
def rate_limit_token(bridge_base_url: str, smoke_identity: tuple[str, str]) -> str:
    email, password = smoke_identity
    register_response = httpx.post(
        f"{bridge_base_url}{_REGISTER_PATH}", json={"email": email, "password": password}, timeout=5.0
    )
    if register_response.status_code == 201:
        return register_response.json()["access_token"]

    # El resto del suite (test_smoke_auth_flow.py) puede haber corrido antes
    # en esta misma sesión y ya haber registrado `smoke_identity` -> 409
    # esperado, se resuelve con login en vez de fallar.
    assert register_response.status_code == 409, (
        f"registro inesperado al preparar la fase de rate limit: {register_response.status_code} "
        f"{register_response.text}"
    )
    login_response = httpx.post(
        f"{bridge_base_url}{_LOGIN_PATH}", json={"email": email, "password": password}, timeout=5.0
    )
    assert login_response.status_code == 200, (
        f"no se pudo obtener token para la fase de rate limit: {login_response.status_code} "
        f"{login_response.text}"
    )
    return login_response.json()["access_token"]


@pytest.mark.asyncio(loop_scope="session")
async def test_eleventh_request_returns_429(
    bridge_base_url: str, smoke_target: tuple[str, str], rate_limit_token: str, db_conn
) -> None:
    target_url, phpsessid = smoke_target
    headers = {"Authorization": f"Bearer {rate_limit_token}"}
    body = {"target_url": target_url, "phpsessid": phpsessid}

    # 5.4: esta fase no debe producir escaneos reales -- el webhook apunta al
    # receptor local (5.2, paso de operador), que no inserta nada en `scans`.
    scans_count_before = await db_conn.fetchval("SELECT count(*) FROM scans")

    responses = [
        httpx.post(f"{bridge_base_url}{_SCAN_START_PATH}", json=body, headers=headers, timeout=10.0)
        for _ in range(11)
    ]

    scans_count_after = await db_conn.fetchval("SELECT count(*) FROM scans")

    first_ten_statuses = [response.status_code for response in responses[:10]]
    eleventh = responses[10]

    assert first_ten_statuses == [202] * 10, first_ten_statuses
    assert eleventh.status_code == 429
    assert eleventh.headers["content-type"].startswith("application/problem+json")
    eleventh_body = eleventh.json()
    assert eleventh_body["status"] == 429

    assert scans_count_after == scans_count_before, (
        f"la fase de rate limit insertó filas en scans (antes={scans_count_before}, "
        f"después={scans_count_after}): el webhook NO estaba apuntando al receptor local (5.2)"
    )
