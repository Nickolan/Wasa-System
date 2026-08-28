"""Tests de `fastapi_bridge.services.scan_service.ScanService` (scan-initiation).

Ningún test hace red real ni instancia un `httpx.AsyncClient`: el ámbito de
recursos de escaneo (`ScanUoW`) se sustituye por un doble escrito a mano
(`FakeScanUoW` / `FakeN8nRepository` / `FakeUoWFactory`, D-9 de design.md), así
que la configuración (`N8N_WEBHOOK_URL` / `N8N_WEBHOOK_TOKEN`) nunca entra en
juego — misma política que `test_env_contract.py`, `test_n8n_repository.py` y
`test_scan_unit_of_work.py`.
"""

from __future__ import annotations

import ast
import uuid
from pathlib import Path

import pytest

from fastapi_bridge.exceptions.errors import N8nUnavailableError
from fastapi_bridge.schemas.scan_schemas import N8nPayload, ScanRequest, ScanResponse
from fastapi_bridge.services import scan_service
from fastapi_bridge.services.scan_service import SCAN_QUEUED_MESSAGE, ScanService
from fastapi_bridge.tests.test_layer_boundaries import get_imported_top_level_modules
from fastapi_bridge.uow.scan_unit_of_work import ScanUoW

TEST_TARGET_URL = "https://objetivo.test.local/login"
TEST_PHPSESSID = "sessid-de-prueba"
TEST_USER_EMAIL = "usuario@test.local"


def build_request(**overrides: object) -> ScanRequest:
    """`ScanRequest` válida de prueba con los cuatro campos del contrato (CHANGE-08)."""
    fields: dict[str, object] = {
        "target_url": TEST_TARGET_URL,
        "phpsessid": TEST_PHPSESSID,
        "sqlmap_level": 1,
        "sqlmap_risk": 1,
    }
    fields.update(overrides)
    return ScanRequest(**fields)


# --- Dobles de prueba del ámbito de recursos (D-9) -------------------------


class FakeN8nRepository:
    """Doble de `N8nRepository`: acumula los payloads recibidos, sin red."""

    def __init__(self, *, fail_with: Exception | None = None) -> None:
        self.received_payloads: list[N8nPayload] = []
        self._fail_with = fail_with

    async def forward_scan(self, payload: N8nPayload) -> bool:
        self.received_payloads.append(payload)
        if self._fail_with is not None:
            raise self._fail_with
        return True


class FakeScanUoW:
    """Doble de `ScanUoW`: async context manager que expone `.n8n`, sin red."""

    def __init__(self, n8n: FakeN8nRepository | None = None) -> None:
        self.n8n: FakeN8nRepository = n8n if n8n is not None else FakeN8nRepository()
        self.entered = 0
        self.exited = 0
        self.closed = False

    async def __aenter__(self) -> "FakeScanUoW":
        self.entered += 1
        return self

    async def __aexit__(self, exc_type: object, exc: object, tb: object) -> None:
        self.exited += 1
        self.closed = True
        # Anotado -> None deliberadamente: nunca suprime la excepción del bloque.


class FakeUoWFactory:
    """Fábrica de prueba: cada invocación devuelve una `FakeScanUoW` nueva."""

    def __init__(self, n8n: FakeN8nRepository | None = None) -> None:
        self._n8n = n8n
        self.created: list[FakeScanUoW] = []

    def __call__(self) -> FakeScanUoW:
        uow = FakeScanUoW(self._n8n)
        self.created.append(uow)
        return uow


# --- Verificación directa de los dobles ------------------------------------


async def test_fake_n8n_repository_records_the_received_payload():
    fake = FakeN8nRepository()
    payload = N8nPayload(
        target_url=TEST_TARGET_URL,
        phpsessid=TEST_PHPSESSID,
        sqlmap_level=1,
        sqlmap_risk=1,
        scan_id="scan-de-prueba-001",
        email=TEST_USER_EMAIL,
    )

    result = await fake.forward_scan(payload)

    assert result is True
    assert fake.received_payloads == [payload]


async def test_fake_n8n_repository_raises_when_configured_to_fail():
    fake = FakeN8nRepository(fail_with=N8nUnavailableError("falla de prueba"))
    payload = N8nPayload(
        target_url=TEST_TARGET_URL,
        phpsessid=TEST_PHPSESSID,
        sqlmap_level=1,
        sqlmap_risk=1,
        scan_id="scan-de-prueba-002",
        email=TEST_USER_EMAIL,
    )

    with pytest.raises(N8nUnavailableError):
        await fake.forward_scan(payload)


async def test_fake_scan_uow_propagates_the_exception_and_marks_closed_on_exit():
    fake_uow = FakeScanUoW()

    with pytest.raises(ValueError):
        async with fake_uow:
            raise ValueError("falla arbitraria dentro del ámbito de prueba")

    assert fake_uow.closed is True


def test_fake_uow_factory_returns_a_new_instance_on_each_call():
    factory = FakeUoWFactory()

    first = factory()
    second = factory()

    assert first is not second
    assert factory.created == [first, second]


# --- ScanService: construcción e inyección de la fábrica (D-1, D-2) --------


def test_scan_service_is_constructed_without_arguments():
    service = ScanService()

    assert service is not None


def test_scan_service_default_uow_factory_is_the_real_scan_uow_class():
    service = ScanService()

    assert service._uow_factory is ScanUoW


async def test_injected_uow_factory_wins_over_the_default():
    factory = FakeUoWFactory()
    service = ScanService(uow_factory=factory)

    await service.start_scan(build_request(), TEST_USER_EMAIL)

    assert len(factory.created) == 1
    assert len(factory.created[0].n8n.received_payloads) == 1


# --- start_scan: camino feliz mínimo (D-1, D-5) ----------------------------


async def test_start_scan_returns_a_scan_response():
    service = ScanService(uow_factory=FakeUoWFactory())

    response = await service.start_scan(build_request(), TEST_USER_EMAIL)

    assert isinstance(response, ScanResponse)


async def test_start_scan_forwards_the_caller_supplied_email_to_the_payload():
    # 2.1 (CHANGE-23, D-1/D-2): el email es un segundo argumento obligatorio
    # de `start_scan`, separado de la `ScanRequest`, y viaja intacto hasta el
    # `N8nPayload` que recibe el repositorio.
    factory = FakeUoWFactory()
    service = ScanService(uow_factory=factory)

    await service.start_scan(build_request(), "usuario@test.local")

    payload = factory.created[0].n8n.received_payloads[0]
    assert payload.email == "usuario@test.local"


# --- Identificador del escaneo (D-3) ----------------------------------------


async def test_scan_id_has_the_shape_of_a_uuid_v4():
    service = ScanService(uow_factory=FakeUoWFactory())

    response = await service.start_scan(build_request(), TEST_USER_EMAIL)

    assert uuid.UUID(response.scan_id).version == 4


async def test_two_identical_requests_on_the_same_service_receive_distinct_scan_ids():
    service = ScanService(uow_factory=FakeUoWFactory())
    request = build_request()

    first_response = await service.start_scan(request, TEST_USER_EMAIL)
    second_response = await service.start_scan(request, TEST_USER_EMAIL)

    assert first_response.scan_id != second_response.scan_id


async def test_scan_id_is_not_derived_from_any_request_field():
    service = ScanService(uow_factory=FakeUoWFactory())
    request = build_request(phpsessid="sessid-particular-1234")

    response = await service.start_scan(request, TEST_USER_EMAIL)

    assert str(request.target_url) not in response.scan_id
    assert request.phpsessid not in response.scan_id
    assert str(request.sqlmap_level) != response.scan_id
    assert str(request.sqlmap_risk) != response.scan_id


async def test_unknown_request_field_cannot_pin_the_scan_id():
    # `ScanRequest.model_config = ConfigDict(extra="ignore")` (CHANGE-08):
    # una clave desconocida como "scan_id" no debe llegar ni influir el
    # identificador que el Bridge genera.
    request = ScanRequest(
        target_url=TEST_TARGET_URL,
        phpsessid=TEST_PHPSESSID,
        sqlmap_level=1,
        sqlmap_risk=1,
        scan_id="scan-id-impuesto-por-el-cliente",
    )
    service = ScanService(uow_factory=FakeUoWFactory())

    response = await service.start_scan(request, TEST_USER_EMAIL)

    assert response.scan_id != "scan-id-impuesto-por-el-cliente"
    assert uuid.UUID(response.scan_id).version == 4


# --- Composición del mensaje y una sola entrega (D-8) -----------------------


async def test_payload_maps_the_four_request_fields_one_to_one():
    factory = FakeUoWFactory()
    service = ScanService(uow_factory=factory)
    request = build_request(phpsessid="otra-sesion-de-prueba", sqlmap_level=3, sqlmap_risk=2)

    await service.start_scan(request, TEST_USER_EMAIL)

    payload = factory.created[0].n8n.received_payloads[0]
    assert payload.target_url == str(request.target_url)
    assert payload.phpsessid == request.phpsessid
    assert payload.sqlmap_level == request.sqlmap_level
    assert payload.sqlmap_risk == request.sqlmap_risk


async def test_payload_target_url_is_the_stringified_request_url_not_the_raw_literal():
    factory = FakeUoWFactory()
    service = ScanService(uow_factory=factory)
    # Pydantic >=2.10 normaliza un host desnudo agregando la barra final.
    raw_literal = "https://objetivo.test.local"
    request = build_request(target_url=raw_literal)

    await service.start_scan(request, TEST_USER_EMAIL)

    payload = factory.created[0].n8n.received_payloads[0]
    assert isinstance(payload.target_url, str)
    assert payload.target_url == str(request.target_url)


async def test_payload_carries_defaults_and_normalizations_applied_by_validation():
    factory = FakeUoWFactory()
    service = ScanService(uow_factory=factory)
    # Omite nivel y riesgo (default 1/1) y trae la sesión con espacios en los
    # extremos, que `ScanRequest` ya normaliza (strip) al validar (CHANGE-08).
    request = ScanRequest(target_url=TEST_TARGET_URL, phpsessid="  sesion-con-espacios  ")
    assert request.phpsessid == "sesion-con-espacios"  # normalización ya aplicada por Pydantic

    await service.start_scan(request, TEST_USER_EMAIL)

    payload = factory.created[0].n8n.received_payloads[0]
    assert payload.sqlmap_level == 1
    assert payload.sqlmap_risk == 1
    assert payload.phpsessid == "sesion-con-espacios"


async def test_payload_carries_exactly_the_six_contract_fields_even_with_unknown_input_fields():
    factory = FakeUoWFactory()
    service = ScanService(uow_factory=factory)
    request = ScanRequest(
        target_url=TEST_TARGET_URL,
        phpsessid=TEST_PHPSESSID,
        sqlmap_level=1,
        sqlmap_risk=1,
        campo_desconocido="valor-que-no-debe-viajar",
    )

    await service.start_scan(request, TEST_USER_EMAIL)

    payload = factory.created[0].n8n.received_payloads[0]
    assert set(payload.model_dump(mode="json").keys()) == {
        "target_url",
        "phpsessid",
        "sqlmap_level",
        "sqlmap_risk",
        "scan_id",
        "email",
    }


async def test_a_successful_start_scan_delivers_exactly_once():
    factory = FakeUoWFactory()
    service = ScanService(uow_factory=factory)

    await service.start_scan(build_request(), TEST_USER_EMAIL)

    assert len(factory.created) == 1
    assert len(factory.created[0].n8n.received_payloads) == 1


async def test_two_successive_start_scans_open_two_distinct_scopes():
    factory = FakeUoWFactory()
    service = ScanService(uow_factory=factory)

    await service.start_scan(build_request(), TEST_USER_EMAIL)
    await service.start_scan(build_request(), TEST_USER_EMAIL)

    assert len(factory.created) == 2
    assert factory.created[0] is not factory.created[1]


# --- `user_email`: obligatorio, intocado, y no filtra (CHANGE-23, 2.4/2.5) --


async def test_two_distinct_emails_with_identical_requests_produce_distinct_recipients():
    factory = FakeUoWFactory()
    service = ScanService(uow_factory=factory)
    request = build_request()

    await service.start_scan(request, "primer-usuario@test.local")
    await service.start_scan(request, "segundo-usuario@test.local")

    first_payload = factory.created[0].n8n.received_payloads[0]
    second_payload = factory.created[1].n8n.received_payloads[0]
    assert first_payload.email == "primer-usuario@test.local"
    assert second_payload.email == "segundo-usuario@test.local"
    assert first_payload.email != second_payload.email


async def test_start_scan_without_the_email_argument_raises_type_error():
    # D-2: sin `= None` ni destinatario de respaldo -- un llamador que olvide
    # el email deja de compilar/pasar, no continúa con un destinatario vacío
    # ni fijo.
    service = ScanService(uow_factory=FakeUoWFactory())

    with pytest.raises(TypeError):
        await service.start_scan(build_request())  # type: ignore[call-arg]


async def test_an_email_field_on_the_raw_request_does_not_influence_the_payload_email():
    # `ScanRequest` no declara un campo `email` (CHANGE-08), pero aunque uno
    # se colara por otra vía, gana siempre el parámetro `user_email`, nunca
    # un dato leído de la solicitud.
    factory = FakeUoWFactory()
    service = ScanService(uow_factory=factory)
    request = ScanRequest(
        target_url=TEST_TARGET_URL,
        phpsessid=TEST_PHPSESSID,
        email="atacante@example.com",
    )

    await service.start_scan(request, TEST_USER_EMAIL)

    payload = factory.created[0].n8n.received_payloads[0]
    assert payload.email == TEST_USER_EMAIL
    assert payload.email != "atacante@example.com"


async def test_email_does_not_appear_in_the_scan_response():
    service = ScanService(uow_factory=FakeUoWFactory())

    response = await service.start_scan(build_request(), TEST_USER_EMAIL)

    assert TEST_USER_EMAIL not in response.scan_id
    assert TEST_USER_EMAIL not in response.status
    assert TEST_USER_EMAIL not in response.message
    assert not hasattr(response, "email")


async def test_email_does_not_appear_in_a_propagated_n8n_unavailable_error():
    # 2.5 TRIANGULATE (seguridad) -- mismo espíritu que el test ya existente
    # del `phpsessid`: el email no debe filtrarse en el mensaje de la
    # excepción propagada.
    n8n = FakeN8nRepository(fail_with=N8nUnavailableError("orquestador no disponible"))
    service = ScanService(uow_factory=FakeUoWFactory(n8n))
    secret_email = "correo-secreto-no-debe-filtrarse@test.local"

    with pytest.raises(N8nUnavailableError) as excinfo:
        await service.start_scan(build_request(), secret_email)

    assert secret_email not in str(excinfo.value)


# --- Confirmación devuelta y propagación del error (D-4, D-6) --------------


async def test_response_scan_id_is_identical_to_the_scan_id_captured_in_the_delivered_payload():
    # El test más importante del change (Risks de design.md): si este vínculo
    # se rompe, el usuario recibe un scan_id con el que nunca va a encontrar
    # sus resultados en el Dashboard, y ningún test de otra capa lo detecta.
    factory = FakeUoWFactory()
    service = ScanService(uow_factory=factory)

    response = await service.start_scan(build_request(), TEST_USER_EMAIL)

    delivered_payload = factory.created[0].n8n.received_payloads[0]
    assert response.scan_id == delivered_payload.scan_id


async def test_successful_response_declares_queued_status_with_the_imported_message_constant():
    service = ScanService(uow_factory=FakeUoWFactory())

    response = await service.start_scan(build_request(), TEST_USER_EMAIL)

    assert response.status == "queued"
    assert response.message == SCAN_QUEUED_MESSAGE


async def test_n8n_unavailable_error_reaches_the_caller_with_its_original_type():
    n8n = FakeN8nRepository(fail_with=N8nUnavailableError("orquestador no disponible"))
    service = ScanService(uow_factory=FakeUoWFactory(n8n))

    with pytest.raises(N8nUnavailableError):
        await service.start_scan(build_request(), TEST_USER_EMAIL)


async def test_no_confirmation_is_emitted_and_the_scope_closes_when_delivery_fails():
    n8n = FakeN8nRepository(fail_with=N8nUnavailableError("orquestador no disponible"))
    factory = FakeUoWFactory(n8n)
    service = ScanService(uow_factory=factory)

    response = None
    with pytest.raises(N8nUnavailableError):
        response = await service.start_scan(build_request(), TEST_USER_EMAIL)

    assert response is None
    assert factory.created[0].closed is True


async def test_propagated_exception_type_is_exactly_n8n_unavailable_error_not_a_subclass():
    n8n = FakeN8nRepository(fail_with=N8nUnavailableError("orquestador no disponible"))
    service = ScanService(uow_factory=FakeUoWFactory(n8n))

    with pytest.raises(Exception) as excinfo:
        await service.start_scan(build_request(), TEST_USER_EMAIL)

    assert type(excinfo.value) is N8nUnavailableError


async def test_an_unrelated_exception_is_not_masked_as_n8n_unavailable_error():
    n8n = FakeN8nRepository(fail_with=ValueError("condición de error no relacionada"))
    service = ScanService(uow_factory=FakeUoWFactory(n8n))

    with pytest.raises(ValueError):
        await service.start_scan(build_request(), TEST_USER_EMAIL)


# --- Pureza de capa, independencia de framework y del entorno (D-10) -------

SCAN_SERVICE_MODULE_PATH = Path(scan_service.__file__)


def _source_without_module_docstring() -> str:
    """Código de `scan_service.py` sin su docstring de módulo, para que las
    menciones de ejemplo en el docstring (p. ej. `ScanUoW`, `httpx`) no hagan
    fallar las revisiones estáticas del código real (mismo criterio que
    `test_scan_unit_of_work.py`)."""
    tree = ast.parse(
        SCAN_SERVICE_MODULE_PATH.read_text(encoding="utf-8"), filename=str(SCAN_SERVICE_MODULE_PATH)
    )
    if isinstance(tree.body[0], ast.Expr) and isinstance(tree.body[0].value, ast.Constant):
        tree.body = tree.body[1:]
    return ast.unparse(tree)


def test_scan_uow_conforms_to_the_contract_the_fake_double_replicates():
    # D-9: costura que evita que el doble derive del contrato real sin que
    # nadie se entere. Viable sin red ni .env: todos los campos de Settings
    # tienen default y construir un ScanUoW no hace I/O.
    real_uow = ScanUoW()

    assert real_uow is not None
    assert hasattr(ScanUoW, "__aenter__")
    assert hasattr(ScanUoW, "__aexit__")
    assert hasattr(ScanUoW, "n8n")


def test_scan_service_module_does_not_import_httpx_sqlalchemy_asyncpg_or_the_db_layer():
    imported = get_imported_top_level_modules(SCAN_SERVICE_MODULE_PATH)
    assert imported.isdisjoint({"httpx", "sqlalchemy", "asyncpg"})
    assert "fastapi_bridge.db" not in SCAN_SERVICE_MODULE_PATH.read_text(encoding="utf-8")


def test_scan_service_module_does_not_import_the_web_framework_or_build_http_responses():
    imported = get_imported_top_level_modules(SCAN_SERVICE_MODULE_PATH)
    assert imported.isdisjoint({"fastapi", "starlette", "slowapi"})
    code = _source_without_module_docstring()
    assert "JSONResponse" not in code
    assert "HTTPException" not in code
    assert "status_code" not in code


async def test_start_scan_works_without_instantiating_the_fastapi_application():
    # Deliberadamente no importa fastapi_bridge.main ni construye la app en
    # ningún momento: demuestra que la iniciación funciona sin la app levantada.
    service = ScanService(uow_factory=FakeUoWFactory())

    response = await service.start_scan(build_request(), TEST_USER_EMAIL)

    assert response.status == "queued"


def test_scan_service_module_has_no_orchestrator_url_credential_or_direct_env_access():
    source = SCAN_SERVICE_MODULE_PATH.read_text(encoding="utf-8")
    assert "N8N_WEBHOOK_URL" not in source
    assert "N8N_WEBHOOK_TOKEN" not in source
    assert "os.environ" not in source
    assert "os.getenv" not in source
    imported = get_imported_top_level_modules(SCAN_SERVICE_MODULE_PATH)
    assert "fastapi_bridge.core.settings" not in source
    assert imported.isdisjoint({"os"})


async def test_successful_response_does_not_contain_the_phpsessid():
    service = ScanService(uow_factory=FakeUoWFactory())
    request = build_request(phpsessid="sessid-secreta-no-debe-filtrarse")

    response = await service.start_scan(request, TEST_USER_EMAIL)

    assert "sessid-secreta-no-debe-filtrarse" not in response.scan_id
    assert "sessid-secreta-no-debe-filtrarse" not in response.status
    assert "sessid-secreta-no-debe-filtrarse" not in response.message


async def test_propagated_error_message_does_not_contain_the_phpsessid():
    n8n = FakeN8nRepository(fail_with=N8nUnavailableError("orquestador no disponible"))
    service = ScanService(uow_factory=FakeUoWFactory(n8n))
    request = build_request(phpsessid="sessid-secreta-no-debe-filtrarse")

    with pytest.raises(N8nUnavailableError) as excinfo:
        await service.start_scan(request, TEST_USER_EMAIL)

    assert "sessid-secreta-no-debe-filtrarse" not in str(excinfo.value)


def test_scan_service_module_does_not_import_logging_or_emit_request_field_records():
    imported = get_imported_top_level_modules(SCAN_SERVICE_MODULE_PATH)
    assert "logging" not in imported
    code = _source_without_module_docstring()
    assert "log.info(" not in code
    assert "log.debug(" not in code
    assert "print(" not in code


def test_scan_service_does_not_revalidate_the_already_validated_request():
    # No debe reimplementar ninguna de las reglas que ya aplicó ScanRequest:
    # esquema de URL, presencia de sesión, rangos de nivel/riesgo.
    code = _source_without_module_docstring()
    assert "HttpUrl" not in code
    assert "phpsessid ==" not in code
    assert "sqlmap_level >" not in code
    assert "sqlmap_level <" not in code
    assert "sqlmap_risk >" not in code
    assert "sqlmap_risk <" not in code
