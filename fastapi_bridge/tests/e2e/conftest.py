"""Fixtures del suite de humo E2E (CHANGE-22, D-2..D-7 de `design.md`).

**Guarda de opt-in (D-2, 2.3).** El `pytest.skip(allow_module_level=True)` de
abajo se ejecuta al *importar* este `conftest.py` -- antes de que pytest
colecte ningún test de `tests/e2e/`. Si `WASA_E2E != "1"`, todo el paquete se
omite (skip), nunca falla: `pytest` a secas (sin la variable) sigue corriendo
exactamente la suite unitaria de siempre, sin abrir sockets ni conexiones.

**Independencia del oráculo (D-6).** `db_conn` abre su propia conexión
`asyncpg` cruda con SQL literal -- nunca importa `UserRepository` ni
`get_session_factory` de `fastapi_bridge/db/`. Un bug de mapeo en el
repositorio de producción no puede esconderse detrás de una verificación que
usa el mismo código para escribir y para leer.

**Nunca hardcodeado (D-7).** `smoke_target` lee `WASA_E2E_TARGET_URL` y
`WASA_E2E_PHPSESSID` de `os.environ` -- ningún valor por defecto de red. Si
falta cualquiera de las dos, el fixture hace skip nombrando la variable
faltante; cero escaneos contra un destino implícito.

**Loop scope explícito (decisión no obvia, apply).** `pytest.ini` fija
`asyncio_default_fixture_loop_scope = function` para la suite unitaria
existente (34 archivos, cada uno con su propio motor SQLite descartable por
test). Este paquete necesita `db_conn`/`smoke_identity` compartidos por
**sesión** (una sola conexión, una sola identidad para toda la corrida), lo
que exige un loop de asyncio también de scope `session` -- mezclar loops de
distinto scope revienta con un `AssertionError` interno de
`pytest_asyncio`/`_pytest.fixtures`. Se resuelve **localmente**, sin tocar el
default global (que seguiría rompiendo el aislamiento de los otros 34
archivos si se subiera a `session`): estas dos fixtures se declaran con
`@pytest_asyncio.fixture(scope="session", loop_scope="session")`, y cada
módulo de test de este paquete que las use marca
`pytestmark = pytest.mark.asyncio(loop_scope="session")` junto al marcador `e2e`.
"""

from __future__ import annotations

import os
import uuid
from typing import AsyncIterator

import pytest

# --- Guarda de opt-in (D-2) --------------------------------------------------
# Debe ser el primer efecto de este módulo: nada de lo que sigue puede correr
# si WASA_E2E no está explícitamente en "1".
if os.getenv("WASA_E2E") != "1":
    pytest.skip(
        "Suite E2E opt-in: exportá WASA_E2E=1 para habilitarla "
        "(ver docs/e2e-smoke-test-runbook.md).",
        allow_module_level=True,
    )

# Los imports de librerías que hablan con infraestructura viva se hacen
# *después* de la guarda: si alguna no estuviera instalada en una máquina que
# jamás corre este suite, ni siquiera se intenta importarla.
import asyncpg  # noqa: E402
import httpx  # noqa: E402
import pytest_asyncio  # noqa: E402

# D-4 pedía el TLD `.test` (RFC 2606); se descarta en la práctica (hallazgo
# de este apply, no de diseño): `email-validator` -- el motor detrás de
# `EmailStr` de Pydantic -- rechaza TODO el TLD `.test` (y `.invalid`,
# `.localhost`) como "special-use or reserved name that cannot be used with
# email", con independencia del subdominio. `example.com` sí es aceptado por
# `email-validator` y sigue siendo el mismo tipo de reserva de RFC 2606
# (dominio de documentación, jamás usado para correo real) -- mismo espíritu
# de D-4, ajustado al validador real del Bridge.
_SMOKE_EMAIL_DOMAIN = "example.com"
# Contraseña de test fija: cumple RN-WS-15 (>= 8 caracteres), nunca una
# credencial real, nunca reutilizada fuera de esta suite.
_SMOKE_PASSWORD = "Sm0ke-Test-Passw0rd!"


@pytest.fixture(scope="session")
def bridge_base_url() -> str:
    """URL base del Bridge ya levantado por el operador (D-3): este suite
    se *conecta*, nunca lo arranca. Skip -- nunca fail -- si no responde."""
    base_url = os.getenv("WASA_E2E_BASE_URL", "http://127.0.0.1:8000")
    try:
        response = httpx.get(f"{base_url}/health", timeout=3.0)
    except httpx.HTTPError as exc:
        pytest.skip(f"Bridge no responde en {base_url}/health: {exc}")
    if response.status_code != 200:
        pytest.skip(
            f"Bridge respondió {response.status_code} en {base_url}/health, se esperaba 200"
        )
    return base_url


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def db_conn() -> AsyncIterator["asyncpg.Connection"]:
    """Conexión `asyncpg` cruda a `db_fuzzing`, independiente de la capa de
    persistencia de producción (D-6). Skip -- nunca fail -- si no conecta."""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        pytest.skip(
            "Falta DATABASE_URL: no se puede verificar persistencia en db_fuzzing "
            "(ver docs/e2e-smoke-test-runbook.md)"
        )
    try:
        conn = await asyncpg.connect(database_url, timeout=5.0)
    except (OSError, asyncpg.PostgresError) as exc:
        pytest.skip(f"db_fuzzing inalcanzable: {exc}")
    try:
        yield conn
    finally:
        await conn.close()


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def smoke_identity(db_conn: "asyncpg.Connection") -> AsyncIterator[tuple[str, str]]:
    """Identidad desechable **por corrida** (D-4): un email único con
    `uuid4().hex[:12]`, compartido por todos los tests de la corrida (registro,
    login, y el JWT que usa el recorrido de escaneo). El teardown borra
    **exactamente** esa fila -- `DELETE ... WHERE email = $1`, igualdad
    exacta, sin `LIKE` ni borrado por rango."""
    email = f"smoke+{uuid.uuid4().hex[:12]}@{_SMOKE_EMAIL_DOMAIN}"
    try:
        yield email, _SMOKE_PASSWORD
    finally:
        await db_conn.execute("DELETE FROM users WHERE email = $1", email)


@pytest.fixture(scope="session")
def smoke_target() -> tuple[str, str]:
    """Objetivo de escaneo (D-7): URL y `phpsessid` leídos del entorno, cero
    valores por defecto de red. Falta cualquiera -> skip nombrando la
    variable, jamás un escaneo contra un destino implícito."""
    target_url = os.environ.get("WASA_E2E_TARGET_URL")
    phpsessid = os.environ.get("WASA_E2E_PHPSESSID")
    missing = [
        name
        for name, value in (
            ("WASA_E2E_TARGET_URL", target_url),
            ("WASA_E2E_PHPSESSID", phpsessid),
        )
        if not value
    ]
    if missing:
        pytest.skip(
            "Faltan variables de entorno para el objetivo de escaneo: "
            + ", ".join(missing)
        )
    return target_url, phpsessid  # type: ignore[return-value]


@pytest.fixture(scope="session")
def smoke_state() -> dict:
    """Estado compartido de la corrida (D-3): el suite es deliberadamente
    secuencial y no hermético -- prueba el despliegue, no el código. Los
    propios tests, en orden, escriben acá el JWT emitido y el `scan_id`
    obtenido, para que los tests siguientes (y los de otros módulos de este
    mismo paquete) los reutilicen sin volver a autenticar."""
    return {}
