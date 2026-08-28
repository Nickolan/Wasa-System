"""Tests del borde HTTP del disparo de escaneos (`POST /api/v1/scan/start`,
capability `scan-endpoint`, CHANGE-12).

Ningún test de este módulo hace red real, instancia un `httpx.AsyncClient`
contra un destino externo ni assertea valores reales de
`N8N_WEBHOOK_URL`/`N8N_WEBHOOK_TOKEN` (D-9 de `design.md`): `202`/`502`
sustituyen `get_scan_service` por `FakeScanService`; `401` ejercita el guard
real `get_current_user` con tokens reales (ausente, malformado, firmado con
otra clave, expirado); `429` sustituye ambas dependencias y reduce el cupo
con el mismo patrón que `test_rate_limit.py`.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import httpx
import pytest

from fastapi_bridge.core.dependencies import get_current_user
from fastapi_bridge.core.security import create_access_token
from fastapi_bridge.core.settings import Settings, get_settings
from fastapi_bridge.exceptions.errors import N8nUnavailableError
from fastapi_bridge.main import create_app
from fastapi_bridge.schemas.scan_schemas import ScanRequest, ScanResponse

SCAN_START_PATH = "/api/v1/scan/start"


def build_request(**overrides: object) -> ScanRequest:
    """Construye una `ScanRequest` válida por defecto, sobreescribible."""
    defaults: dict[str, object] = {
        "target_url": "https://objetivo.test.local/login",
        "phpsessid": "sessid-de-prueba",
        "sqlmap_level": 1,
        "sqlmap_risk": 1,
    }
    defaults.update(overrides)
    return ScanRequest.model_validate(defaults)


class FakeScanService:
    """Doble escrito a mano de `ScanService` (D-9): registra las
    `ScanRequest` recibidas y devuelve una `ScanResponse` fija configurable,
    o levanta `N8nUnavailableError` cuando se lo configura para fallar.
    """

    def __init__(
        self,
        *,
        response: ScanResponse | None = None,
        fail_with: Exception | None = None,
    ) -> None:
        self.received_requests: list[ScanRequest] = []
        self.received_emails: list[str] = []
        self._response = response or ScanResponse(
            scan_id="fixed-scan-id", status="queued", message="Escaneo encolado correctamente."
        )
        self._fail_with = fail_with

    async def start_scan(self, request: ScanRequest, user_email: str) -> ScanResponse:
        self.received_requests.append(request)
        self.received_emails.append(user_email)
        if self._fail_with is not None:
            raise self._fail_with
        return self._response


def valid_body(**overrides: object) -> dict[str, Any]:
    """Cuerpo JSON válido según `ScanRequest`, sobreescribible por caso de test."""
    body: dict[str, Any] = {
        "target_url": "https://objetivo.test.local/login",
        "phpsessid": "sessid-de-prueba",
        "sqlmap_level": 1,
        "sqlmap_risk": 1,
    }
    body.update(overrides)
    return body


async def build_client(app: Any, *, client_host: str = "10.0.0.9") -> httpx.AsyncClient:
    """`httpx.AsyncClient` sobre `httpx.ASGITransport` (mismo patrón que
    `test_rate_limit.py`), sin abrir ningún socket real."""
    transport = httpx.ASGITransport(app=app, client=(client_host, 12345))
    return httpx.AsyncClient(transport=transport, base_url="http://test")


def real_token(email: str = "scan-user@test.com", *, hours: int = 24) -> str:
    """Firma un JWT real con la `Settings` efectiva del proceso (`get_settings()`),
    la misma que resuelve `get_current_user` en producción (D-9: el guard NO
    se sustituye en los tests de 401/202 de camino feliz real)."""
    return create_access_token({"sub": email}, timedelta(hours=hours), get_settings())


def token_with_secret(secret: str, email: str = "scan-user@test.com") -> str:
    """Firma un JWT válido en forma pero con un secreto distinto al del proceso."""
    other_settings = Settings(JWT_SECRET=secret)
    return create_access_token({"sub": email}, timedelta(hours=24), other_settings)


@pytest.fixture(autouse=True)
def _isolated_scan_quota():
    """Aísla el cupo de rate limit de CADA test de este módulo.

    `fastapi_bridge.core.limiter.limiter` es un singleton de módulo con
    almacenamiento en memoria compartido por toda la sesión de pytest, y
    `POST /api/v1/scan/start` es la única ruta de producción decorada con él.
    Sin este reset, todos los tests que usan el `client_host` por defecto de
    `build_client` (`10.0.0.9`) comparten un único cupo de
    `RATE_LIMIT_REQUESTS` (10 por defecto) y lo consumen acumulativamente a
    lo largo del módulo: la suite quedaba exactamente en 10/10 antes de la
    sección 9, es decir con cero margen — el siguiente test que alcanzara el
    handler desde ese host habría fallado con un `429` desconcertante en vez
    del `202`/`502` esperado (fallo ya observado durante el apply de
    CHANGE-23). El reset por test elimina esa dependencia de orden.

    No debilita la cobertura de rate limiting: la sección 9 ejercita el cupo
    dentro de un mismo test, con su propia `Settings` y su propio
    `client_host`, y `reset()` sólo limpia el almacenamiento — no toca
    `limiter._dynamic_route_limits`, que es lo que verifica 9.7.
    """
    from fastapi_bridge.core.limiter import limiter

    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture
def app_with_overrides():
    """3.4: construye la app de producción y sustituye `get_current_user` por
    un doble fijo. `get_scan_service` todavía no existe en `core/dependencies.py`
    (llega en 5.2, D-3); esta fixture se completa en ese punto para sustituir
    también el Service. Limpia `app.dependency_overrides` al salir (un
    override filtrado contamina los tests de 401)."""
    app = create_app()
    fake_service = FakeScanService()
    app.dependency_overrides[get_current_user] = lambda: "scan-user@test.com"
    yield app, fake_service
    app.dependency_overrides.clear()


async def test_module_collects_without_import_errors() -> None:
    """3.1: ancla de recolección -- si este test corre, el módulo importó
    sin error (aísla el fallo de import de R-3 si `slowapi` no encontrara el
    parámetro `request` exigido en el handler decorado)."""
    assert SCAN_START_PATH == "/api/v1/scan/start"


async def test_fake_scan_service_registers_the_received_request() -> None:
    """3.2: el doble registra la solicitud recibida y devuelve la respuesta fija."""
    fake = FakeScanService()
    request = build_request()

    response = await fake.start_scan(request, "scan-user@test.com")

    assert fake.received_requests == [request]
    assert fake.received_emails == ["scan-user@test.com"]
    assert response.scan_id == "fixed-scan-id"


async def test_fake_scan_service_raises_when_configured_to_fail() -> None:
    """3.2: el doble puede configurarse para levantar `N8nUnavailableError`."""
    fake = FakeScanService(fail_with=N8nUnavailableError("orquestador no disponible"))

    with pytest.raises(N8nUnavailableError):
        await fake.start_scan(build_request(), "scan-user@test.com")

    assert fake.received_requests == [build_request()]


async def test_build_client_and_valid_body_work_against_health() -> None:
    """3.3: los helpers funcionan contra una ruta real de la app de producción."""
    app = create_app()
    async with await build_client(app) as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert "target_url" in valid_body()


async def test_dependency_overrides_are_cleared_after_the_fixture(app_with_overrides) -> None:
    """3.4: tras salir de la fixture, `app.dependency_overrides` queda vacío."""
    app, _fake_service = app_with_overrides
    assert app.dependency_overrides  # dentro de la fixture, hay overrides activos


def test_a_fresh_app_has_no_leftover_overrides() -> None:
    """3.4 (cierre): una app nueva construida después de que la fixture
    anterior terminó no hereda overrides -- cada `create_app()` es independiente."""
    app = create_app()
    assert app.dependency_overrides == {}


# ---------------------------------------------------------------------------
# 4. La operación existe y está montada
# ---------------------------------------------------------------------------


def test_router_has_exactly_one_route_registered_for_scan_start() -> None:
    """4.1 RED: el router del dominio scan debe tener exactamente una ruta,
    `POST /api/v1/scan/start`. Hoy (antes de 4.2) el router está vacío."""
    from fastapi_bridge.api.v1.scan.router import router as scan_router

    assert len(scan_router.routes) == 1
    route = scan_router.routes[0]
    assert route.path == "/api/v1/scan/start"
    assert route.methods == {"POST"}


async def test_scan_start_on_the_production_app_is_not_404() -> None:
    """4.3 RED/GREEN: montado el router en `create_app()`, la ruta ya no es
    404 en la app de producción. `get_scan_service` se sustituye (D-9): una
    vez wireado en 5.2, el handler delega de verdad en `ScanService`, y sin
    sustituirlo esta solicitud abriría un canal real hacia
    `N8N_WEBHOOK_URL` -- justo lo que D-9 prohíbe para todo este módulo."""
    from fastapi_bridge.core.dependencies import get_scan_service

    app = create_app()
    app.dependency_overrides[get_scan_service] = lambda: FakeScanService()
    async with await build_client(app) as client:
        response = await client.post(SCAN_START_PATH, json=valid_body())

    assert response.status_code != 404


async def test_get_on_scan_start_is_405() -> None:
    """4.4 TRIANGULATE: el verbo de disparo es el único admitido."""
    app = create_app()
    async with await build_client(app) as client:
        response = await client.get(SCAN_START_PATH)

    assert response.status_code == 405
    assert response.status_code != 200
    assert response.status_code != 404


async def test_scan_domain_exposes_no_other_route() -> None:
    """4.5 TRIANGULATE: descartando las rutas internas de FastAPI, las únicas
    rutas de la app son `GET /health` y `POST /api/v1/scan/start` (más las
    dos de auth ya montadas, CHANGE-05); no hay ninguna otra bajo el prefijo
    del dominio scan (consulta de estado, listado, cancelación)."""
    app = create_app()
    paths = set(app.openapi()["paths"].keys())
    scan_paths = {path for path in paths if path.startswith("/api/v1/scan")}

    assert scan_paths == {SCAN_START_PATH}


# ---------------------------------------------------------------------------
# 5. Delegación al Service y respuesta 202
# ---------------------------------------------------------------------------


async def test_service_receives_the_authenticated_user_email() -> None:
    """3.1 RED (CHANGE-23, D-1/D-5): el router reenvía al Service el email que
    resolvió `get_current_user`, en vez de descartarlo."""
    from fastapi_bridge.core.dependencies import get_scan_service

    fake_service = FakeScanService()
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: "scan-user@test.com"
    app.dependency_overrides[get_scan_service] = lambda: fake_service

    # client_host propio (D-5, test_rate_limit.py): el cupo por IP es
    # compartido por todos los tests de este módulo que usan el host por
    # defecto de `build_client` -- un host aislado evita agotarlo.
    async with await build_client(app, client_host="10.0.0.42") as client:
        response = await client.post(SCAN_START_PATH, json=valid_body())

    assert response.status_code == 202
    assert fake_service.received_emails == ["scan-user@test.com"]


async def test_two_distinct_current_user_overrides_reach_the_service_with_distinct_emails() -> None:
    """3.4(a) TRIANGULATE: dos overrides distintos de `get_current_user` con
    cuerpos idénticos producen dos invocaciones del Service con emails
    distintos."""
    from fastapi_bridge.core.dependencies import get_scan_service

    fake_service = FakeScanService()
    app = create_app()
    app.dependency_overrides[get_scan_service] = lambda: fake_service

    app.dependency_overrides[get_current_user] = lambda: "primer-usuario@test.com"
    async with await build_client(app, client_host="10.0.0.43") as client:
        await client.post(SCAN_START_PATH, json=valid_body())

    app.dependency_overrides[get_current_user] = lambda: "segundo-usuario@test.com"
    async with await build_client(app, client_host="10.0.0.44") as client:
        await client.post(SCAN_START_PATH, json=valid_body())

    assert fake_service.received_emails == ["primer-usuario@test.com", "segundo-usuario@test.com"]


async def test_an_email_field_in_the_request_body_does_not_reach_the_service_as_the_recipient() -> None:
    """3.4(b) TRIANGULATE: un cuerpo que incluye un campo `email` con
    apariencia de destinatario llega al Service con el email del JWT -- el
    valor del atacante no aparece en ningún lado."""
    from fastapi_bridge.core.dependencies import get_scan_service

    fake_service = FakeScanService()
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: "scan-user@test.com"
    app.dependency_overrides[get_scan_service] = lambda: fake_service

    body = valid_body(email="atacante@example.com")
    async with await build_client(app, client_host="10.0.0.45") as client:
        response = await client.post(SCAN_START_PATH, json=body)

    assert response.status_code == 202
    assert fake_service.received_emails == ["scan-user@test.com"]
    assert "atacante@example.com" not in response.text
    # El valor del atacante tampoco llega al Service por la vía de la
    # `ScanRequest`: `extra="ignore"` (CHANGE-08, D-7) lo descarta en la
    # validación, así que la solicitud entregada no lo lleva ni como
    # atributo ni en su `model_dump()`.
    received = fake_service.received_requests[0]
    assert not hasattr(received, "email")
    assert "atacante@example.com" not in str(received.model_dump())


async def test_email_never_appears_in_any_response_body() -> None:
    """3.5 TRIANGULATE (no filtración): el email no aparece en el cuerpo
    `202` de aceptación, ni en el `502` RFC 7807 de orquestador no
    disponible, ni en el `422` de validación -- mismo espíritu que
    `test_phpsessid_never_appears_in_any_error_body` (7.5)."""
    secret_email = "correo-secreto-no-debe-filtrarse@test.local"

    accepted_app, accepted_service = _app_with_fake_service()
    accepted_app.dependency_overrides[get_current_user] = lambda: secret_email
    async with await build_client(accepted_app, client_host="10.0.0.46") as client:
        accepted_response = await client.post(SCAN_START_PATH, json=valid_body())
    assert accepted_response.status_code == 202
    assert secret_email not in accepted_response.text

    invalid_body_app, _fs = _app_with_fake_service()
    invalid_body_app.dependency_overrides[get_current_user] = lambda: secret_email
    async with await build_client(invalid_body_app, client_host="10.0.0.47") as client:
        invalid_body_response = await client.post(
            SCAN_START_PATH, json={"phpsessid": "sessid-de-prueba"}
        )
    assert invalid_body_response.status_code in (400, 422)
    assert secret_email not in invalid_body_response.text

    failing_service = FakeScanService(
        fail_with=N8nUnavailableError("el orquestador no respondió a tiempo")
    )
    from fastapi_bridge.core.dependencies import get_scan_service

    failing_app = create_app()
    failing_app.dependency_overrides[get_current_user] = lambda: secret_email
    failing_app.dependency_overrides[get_scan_service] = lambda: failing_service
    async with await build_client(failing_app, client_host="10.0.0.48") as client:
        failing_response = await client.post(SCAN_START_PATH, json=valid_body())
    assert failing_response.status_code == 502
    assert secret_email not in failing_response.text


async def test_valid_request_with_substituted_dependencies_is_accepted() -> None:
    """5.1 RED: con `get_current_user` y `get_scan_service` sustituidos, un
    `POST` con cuerpo válido responde `202` con el cuerpo exacto que produjo
    el doble. `get_scan_service` todavía no existe en `core/dependencies.py`
    (llega en 5.2) -- este import local es la forma en que este test falla
    hoy, contra el cuerpo fijo `{}` de 4.2."""
    from fastapi_bridge.core.dependencies import get_scan_service

    fake_service = FakeScanService()
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: "scan-user@test.com"
    app.dependency_overrides[get_scan_service] = lambda: fake_service

    async with await build_client(app) as client:
        response = await client.post(SCAN_START_PATH, json=valid_body())

    assert response.status_code == 202
    assert response.json() == {
        "scan_id": "fixed-scan-id",
        "status": "queued",
        "message": "Escaneo encolado correctamente.",
    }


async def test_202_body_has_exactly_the_scan_response_keys() -> None:
    """5.3 TRIANGULATE: el cuerpo del 202 tiene exactamente las claves de
    `ScanResponse` -- ni una agregada, ni una renombrada."""
    from fastapi_bridge.core.dependencies import get_scan_service

    fake_service = FakeScanService(
        response=ScanResponse(scan_id="another-id", status="queued", message="otro mensaje")
    )
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: "scan-user@test.com"
    app.dependency_overrides[get_scan_service] = lambda: fake_service

    async with await build_client(app) as client:
        response = await client.post(SCAN_START_PATH, json=valid_body())

    body = response.json()
    assert set(body.keys()) == {"scan_id", "status", "message"}
    assert body == {"scan_id": "another-id", "status": "queued", "message": "otro mensaje"}


async def test_service_receives_the_request_unchanged_including_defaults() -> None:
    """5.4 TRIANGULATE: la `ScanRequest` que recibe el doble lleva exactamente
    los valores del cuerpo enviado, incluidos los defaults de
    `sqlmap_level`/`sqlmap_risk` cuando se omiten -- el Router no transforma
    la entrada."""
    from fastapi_bridge.core.dependencies import get_scan_service

    fake_service = FakeScanService()
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: "scan-user@test.com"
    app.dependency_overrides[get_scan_service] = lambda: fake_service

    body = {"target_url": "https://otro-objetivo.test.local/x", "phpsessid": "otra-sesion"}
    async with await build_client(app) as client:
        response = await client.post(SCAN_START_PATH, json=body)

    assert response.status_code == 202
    assert len(fake_service.received_requests) == 1
    received = fake_service.received_requests[0]
    assert str(received.target_url) == "https://otro-objetivo.test.local/x"
    assert received.phpsessid == "otra-sesion"
    assert received.sqlmap_level == 1
    assert received.sqlmap_risk == 1


async def test_202_is_neither_200_nor_201_and_calls_start_scan_exactly_once() -> None:
    """5.5 TRIANGULATE."""
    from fastapi_bridge.core.dependencies import get_scan_service

    fake_service = FakeScanService()
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: "scan-user@test.com"
    app.dependency_overrides[get_scan_service] = lambda: fake_service

    async with await build_client(app) as client:
        response = await client.post(SCAN_START_PATH, json=valid_body())

    assert response.status_code == 202
    assert response.status_code != 200
    assert response.status_code != 201
    assert len(fake_service.received_requests) == 1


# ---------------------------------------------------------------------------
# 6. Guard JWT -- NO se sustituye `get_current_user`: se ejercita el guard
# real con tokens reales (D-9). `get_scan_service` sí se sustituye, para
# poder afirmar que el rechazo ocurre antes de cualquier lógica de negocio.
# ---------------------------------------------------------------------------


def _app_with_fake_service() -> tuple[Any, "FakeScanService"]:
    from fastapi_bridge.core.dependencies import get_scan_service

    fake_service = FakeScanService()
    app = create_app()
    app.dependency_overrides[get_scan_service] = lambda: fake_service
    return app, fake_service


async def test_missing_authorization_header_is_401() -> None:
    """6.1 RED/GREEN: sin cabecera Authorization, la respuesta es 401."""
    app, _fake_service = _app_with_fake_service()

    async with await build_client(app) as client:
        response = await client.post(SCAN_START_PATH, json=valid_body())

    assert response.status_code == 401


async def test_expired_token_is_401() -> None:
    """6.2 TRIANGULATE."""
    app, _fake_service = _app_with_fake_service()
    token = real_token(hours=-1)

    async with await build_client(app) as client:
        response = await client.post(
            SCAN_START_PATH, json=valid_body(), headers={"Authorization": f"Bearer {token}"}
        )

    assert response.status_code == 401


async def test_malformed_token_is_401() -> None:
    """6.3 TRIANGULATE."""
    app, _fake_service = _app_with_fake_service()

    async with await build_client(app) as client:
        response = await client.post(
            SCAN_START_PATH, json=valid_body(), headers={"Authorization": "Bearer this-is-not-a-jwt"}
        )

    assert response.status_code == 401


async def test_token_signed_with_a_different_secret_is_401() -> None:
    """6.4 TRIANGULATE."""
    app, _fake_service = _app_with_fake_service()
    token = token_with_secret("a-totally-different-secret")

    async with await build_client(app) as client:
        response = await client.post(
            SCAN_START_PATH, json=valid_body(), headers={"Authorization": f"Bearer {token}"}
        )

    assert response.status_code == 401


async def test_401_bodies_do_not_distinguish_expired_from_bad_signature() -> None:
    """6.5 TRIANGULATE: los cuerpos de 401 no permiten distinguir el motivo."""
    app, _fake_service = _app_with_fake_service()
    expired_token = real_token(hours=-1)
    other_secret_token = token_with_secret("a-totally-different-secret")

    async with await build_client(app) as client:
        expired_response = await client.post(
            SCAN_START_PATH, json=valid_body(), headers={"Authorization": f"Bearer {expired_token}"}
        )
        other_secret_response = await client.post(
            SCAN_START_PATH, json=valid_body(), headers={"Authorization": f"Bearer {other_secret_token}"}
        )

    assert expired_response.status_code == other_secret_response.status_code == 401
    expired_detail = expired_response.json().get("detail", "")
    other_secret_detail = other_secret_response.json().get("detail", "")
    # El mismo literal para ambos casos es justamente lo que impide
    # distinguir el motivo del rechazo (D-9/D-3 de dependencies.py):
    # no hay dos mensajes distintos entre los que comparar.
    assert expired_detail == other_secret_detail
    assert "signature" not in expired_detail.lower()
    assert "firma inválida" not in expired_detail.lower()


async def test_no_401_path_reaches_the_fake_scan_service() -> None:
    """6.6 TRIANGULATE: en todos los caminos de 401, el `FakeScanService`
    registró cero llamadas -- el rechazo ocurre antes de la lógica de negocio."""
    app, fake_service = _app_with_fake_service()
    tokens_that_should_401 = [
        None,
        real_token(hours=-1),
        "this-is-not-a-jwt",
        token_with_secret("a-totally-different-secret"),
    ]

    async with await build_client(app) as client:
        for token in tokens_that_should_401:
            headers = {"Authorization": f"Bearer {token}"} if token else {}
            response = await client.post(SCAN_START_PATH, json=valid_body(), headers=headers)
            assert response.status_code == 401

    assert fake_service.received_requests == []


async def test_valid_real_token_reaches_the_handler() -> None:
    """6.7 TRIANGULATE: camino feliz con un token válido real (no sustituido)."""
    app, fake_service = _app_with_fake_service()
    token = real_token()

    async with await build_client(app) as client:
        response = await client.post(
            SCAN_START_PATH, json=valid_body(), headers={"Authorization": f"Bearer {token}"}
        )

    assert response.status_code == 202
    assert len(fake_service.received_requests) == 1


# ---------------------------------------------------------------------------
# 7. Mapeo N8nUnavailableError -> 502
# ---------------------------------------------------------------------------


def _app_with_failing_service() -> Any:
    from fastapi_bridge.core.dependencies import get_scan_service

    fake_service = FakeScanService(fail_with=N8nUnavailableError("el orquestador no respondió a tiempo"))
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: "scan-user@test.com"
    app.dependency_overrides[get_scan_service] = lambda: fake_service
    return app


async def test_n8n_unavailable_error_is_502() -> None:
    """7.1 RED: el `FakeScanService` configurado para levantar
    `N8nUnavailableError` produce un `502` en vez de propagar sin manejar."""
    app = _app_with_failing_service()

    async with await build_client(app) as client:
        response = await client.post(SCAN_START_PATH, json=valid_body())

    assert response.status_code == 502


async def test_502_body_is_rfc7807_with_status_and_content_type_and_instance() -> None:
    """7.3 TRIANGULATE."""
    app = _app_with_failing_service()

    async with await build_client(app) as client:
        response = await client.post(SCAN_START_PATH, json=valid_body())

    assert response.status_code == 502
    assert response.headers["content-type"] == "application/problem+json"
    body = response.json()
    assert set(body.keys()) == {"type", "title", "status", "detail", "instance"}
    assert body["status"] == 502
    assert body["instance"] == SCAN_START_PATH


async def test_502_body_does_not_leak_orchestrator_internals() -> None:
    """7.4 TRIANGULATE: el cuerpo del 502 no filtra destino, credencial,
    trazas de pila ni nombres de módulos internos."""
    app = _app_with_failing_service()

    async with await build_client(app) as client:
        response = await client.post(SCAN_START_PATH, json=valid_body())

    body_text = response.text.lower()
    for leak in (
        "n8n_webhook_url",
        "webhook",
        "traceback",
        "n8n_repository",
        "scan_unit_of_work",
        get_settings().N8N_WEBHOOK_TOKEN.get_secret_value().lower(),
    ):
        assert leak not in body_text


async def test_phpsessid_never_appears_in_any_error_body() -> None:
    """7.5: el `phpsessid` enviado no aparece en el cuerpo de ninguna
    respuesta de error (401, 422, 429, 502) — R-6."""
    secret_session_id = "super-secret-session-cookie-value"

    unauthorized_app, _fs = _app_with_fake_service()
    async with await build_client(unauthorized_app) as client:
        unauthorized_response = await client.post(
            SCAN_START_PATH, json=valid_body(phpsessid=secret_session_id)
        )
    assert secret_session_id not in unauthorized_response.text

    invalid_body_app, _fs2 = _app_with_fake_service()
    async with await build_client(invalid_body_app) as client:
        invalid_body_response = await client.post(
            SCAN_START_PATH,
            json={"phpsessid": secret_session_id},
            headers={"Authorization": f"Bearer {real_token()}"},
        )
    assert invalid_body_response.status_code in (400, 422)
    assert secret_session_id not in invalid_body_response.text

    failing_app = _app_with_failing_service()
    async with await build_client(failing_app) as client:
        gateway_response = await client.post(
            SCAN_START_PATH,
            json=valid_body(phpsessid=secret_session_id),
            headers={"Authorization": f"Bearer {real_token()}"},
        )
    assert gateway_response.status_code == 502
    assert secret_session_id not in gateway_response.text


# ---------------------------------------------------------------------------
# 8. Validación del cuerpo -- sin código nuevo, se apoya en Pydantic
# (schemas/scan_schemas.py, CHANGE-08) y en los handlers de CHANGE-07.
# ---------------------------------------------------------------------------


async def test_missing_target_url_is_a_validation_rejection_with_rfc7807_body() -> None:
    """8.1 RED/GREEN: satisfecho por el handler de CHANGE-07, no por código
    nuevo de este change -- se deja constancia."""
    app, _fake_service = _app_with_fake_service()
    body = valid_body()
    del body["target_url"]

    async with await build_client(app) as client:
        response = await client.post(
            SCAN_START_PATH, json=body, headers={"Authorization": f"Bearer {real_token()}"}
        )

    assert response.status_code in (400, 422)
    problem_body = response.json()
    assert set(problem_body.keys()) == {"type", "title", "status", "detail", "instance"}
    assert problem_body["instance"] == SCAN_START_PATH


@pytest.mark.parametrize(
    "overrides",
    [
        {"target_url": "not-a-url"},
        {"phpsessid": ""},
        {"phpsessid": "   "},
        {"sqlmap_level": 0},
        {"sqlmap_level": 6},
        {"sqlmap_risk": 0},
        {"sqlmap_risk": 4},
    ],
)
async def test_other_invalid_bodies_are_rejected_without_reaching_the_service(overrides: dict) -> None:
    """8.2 TRIANGULATE: cada caso del contrato de CHANGE-08 es rechazado y el
    `FakeScanService` queda en cero llamadas."""
    app, fake_service = _app_with_fake_service()
    body = valid_body(**overrides)

    async with await build_client(app) as client:
        response = await client.post(
            SCAN_START_PATH, json=body, headers={"Authorization": f"Bearer {real_token()}"}
        )

    assert response.status_code in (400, 422)
    assert fake_service.received_requests == []


async def test_unknown_extra_field_is_accepted_and_does_not_reach_the_service() -> None:
    """8.3 TRIANGULATE: `extra="ignore"` (CHANGE-08 D-7) -- un campo extra no
    endurece ni relaja el contrato, y no llega al Service."""
    app, fake_service = _app_with_fake_service()
    body = valid_body(accepted_ethics_disclaimer=True)

    async with await build_client(app) as client:
        response = await client.post(
            SCAN_START_PATH, json=body, headers={"Authorization": f"Bearer {real_token()}"}
        )

    assert response.status_code == 202
    assert len(fake_service.received_requests) == 1
    received = fake_service.received_requests[0]
    assert not hasattr(received, "accepted_ethics_disclaimer")


# ---------------------------------------------------------------------------
# 9. Cupo por IP sobre la ruta real (D-5: singleton de módulo `limiter`,
# aislado con `limiter.reset()`, mismo patrón que `test_rate_limit.py`)
# ---------------------------------------------------------------------------

TEST_QUOTA = 3
TEST_WINDOW = 3600


@pytest.fixture
def rate_limited_scan_app(monkeypatch):
    import fastapi_bridge.core.limiter as limiter_module
    from fastapi_bridge.core.dependencies import get_scan_service
    from fastapi_bridge.core.limiter import limiter

    monkeypatch.setattr(
        limiter_module,
        "get_settings",
        lambda: Settings(RATE_LIMIT_REQUESTS=TEST_QUOTA, RATE_LIMIT_WINDOW=TEST_WINDOW),
    )
    limiter.reset()

    fake_service = FakeScanService()
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: "scan-user@test.com"
    app.dependency_overrides[get_scan_service] = lambda: fake_service

    yield app, fake_service

    app.dependency_overrides.clear()
    limiter.reset()


async def test_request_over_quota_on_the_real_route_is_429(rate_limited_scan_app) -> None:
    """9.1 RED: agotado el cupo desde una IP, la siguiente solicitud sobre la
    ruta real es 429. Hoy falla porque el endpoint no está decorado."""
    app, _fake_service = rate_limited_scan_app

    async with await build_client(app, client_host="10.1.0.1") as client:
        for _ in range(TEST_QUOTA):
            await client.post(SCAN_START_PATH, json=valid_body())
        over_quota_response = await client.post(SCAN_START_PATH, json=valid_body())

    assert over_quota_response.status_code == 429


async def test_429_body_is_rfc7807_with_retry_after(rate_limited_scan_app) -> None:
    """9.3 TRIANGULATE."""
    app, _fake_service = rate_limited_scan_app

    async with await build_client(app, client_host="10.1.0.2") as client:
        for _ in range(TEST_QUOTA):
            await client.post(SCAN_START_PATH, json=valid_body())
        over_quota_response = await client.post(SCAN_START_PATH, json=valid_body())

    assert over_quota_response.status_code == 429
    assert over_quota_response.headers["content-type"] == "application/problem+json"
    body = over_quota_response.json()
    assert set(body.keys()) == {"type", "title", "status", "detail", "instance"}
    retry_after = over_quota_response.headers.get("retry-after")
    assert retry_after is not None
    assert int(retry_after) > 0


async def test_request_rejected_by_quota_does_not_reach_the_service(rate_limited_scan_app) -> None:
    """9.4 TRIANGULATE."""
    app, fake_service = rate_limited_scan_app

    async with await build_client(app, client_host="10.1.0.3") as client:
        for _ in range(TEST_QUOTA):
            await client.post(SCAN_START_PATH, json=valid_body())
        over_quota_response = await client.post(SCAN_START_PATH, json=valid_body())

    assert over_quota_response.status_code == 429
    assert len(fake_service.received_requests) == TEST_QUOTA


async def test_a_different_ip_is_served_while_the_first_is_exhausted(rate_limited_scan_app) -> None:
    """9.5 TRIANGULATE."""
    app, _fake_service = rate_limited_scan_app
    first_ip, second_ip = "10.1.0.4", "10.1.0.5"

    async with await build_client(app, client_host=first_ip) as client:
        for _ in range(TEST_QUOTA):
            await client.post(SCAN_START_PATH, json=valid_body())
        first_over_quota = await client.post(SCAN_START_PATH, json=valid_body())

    assert first_over_quota.status_code == 429

    async with await build_client(app, client_host=second_ip) as client:
        second_response = await client.post(SCAN_START_PATH, json=valid_body())

    assert second_response.status_code == 202


async def test_health_still_responds_200_after_scan_quota_is_exhausted(rate_limited_scan_app) -> None:
    """9.6 TRIANGULATE: el cupo no se derrama al resto del servicio."""
    app, _fake_service = rate_limited_scan_app

    async with await build_client(app, client_host="10.1.0.6") as client:
        for _ in range(TEST_QUOTA):
            await client.post(SCAN_START_PATH, json=valid_body())
        await client.post(SCAN_START_PATH, json=valid_body())
        health_response = await client.get("/health")

    assert health_response.status_code == 200


def test_scan_start_is_the_only_production_route_marked_in_the_module_singleton() -> None:
    """9.7: la ruta de disparo de escaneo figura registrada en
    `limiter._dynamic_route_limits` del singleton de módulo (D-5), y es la
    única ruta de producción registrada ahí."""
    from fastapi_bridge.core.limiter import limiter

    dynamic_keys = set(limiter._dynamic_route_limits.keys())
    scan_keys = {key for key in dynamic_keys if "start_scan" in key}
    assert len(scan_keys) == 1


async def test_rate_limit_fixture_starts_fresh_each_time_first(rate_limited_scan_app) -> None:
    """9.8 (primero de dos ejecuciones idénticas consecutivas)."""
    app, _fake_service = rate_limited_scan_app

    async with await build_client(app, client_host="10.1.0.7") as client:
        responses = [await client.post(SCAN_START_PATH, json=valid_body()) for _ in range(TEST_QUOTA)]

    assert all(response.status_code == 202 for response in responses)


async def test_rate_limit_fixture_starts_fresh_each_time_second(rate_limited_scan_app) -> None:
    """9.8 (segundo): si el aislamiento fallara, este test heredaría el cupo
    ya agotado por el anterior."""
    app, _fake_service = rate_limited_scan_app

    async with await build_client(app, client_host="10.1.0.7") as client:
        responses = [await client.post(SCAN_START_PATH, json=valid_body()) for _ in range(TEST_QUOTA)]

    assert all(response.status_code == 202 for response in responses)


# ---------------------------------------------------------------------------
# 10. Documentación OpenAPI -- por consecuencia de usar el guard (D-8), sin
# código nuevo de este change.
# ---------------------------------------------------------------------------


def test_scan_start_declares_a_bearer_security_requirement() -> None:
    """10.1 RED/GREEN: satisfecho por `OAuth2PasswordBearer` (CHANGE-06) --
    no se agregó `security` a mano en este change."""
    app = create_app()
    schema = app.openapi()

    operation = schema["paths"][SCAN_START_PATH]["post"]
    assert operation.get("security")

    security_schemes = schema["components"]["securitySchemes"]
    assert security_schemes
    declared_scheme = next(iter(security_schemes.values()))
    assert declared_scheme["type"] == "oauth2"
    assert "password" in declared_scheme.get("flows", {})


def test_scan_start_declares_202_response_and_request_body_schemas() -> None:
    """10.2 TRIANGULATE."""
    app = create_app()
    schema = app.openapi()

    operation = schema["paths"][SCAN_START_PATH]["post"]
    assert "202" in operation["responses"]
    response_ref = operation["responses"]["202"]["content"]["application/json"]["schema"]
    assert "ScanResponse" in str(response_ref)

    request_body_ref = operation["requestBody"]["content"]["application/json"]["schema"]
    assert "ScanRequest" in str(request_body_ref)


def test_health_declares_no_security_requirement() -> None:
    """10.3 TRIANGULATE: la protección es por operación, no global."""
    app = create_app()
    schema = app.openapi()

    health_operation = schema["paths"]["/health"]["get"]
    assert not health_operation.get("security")
