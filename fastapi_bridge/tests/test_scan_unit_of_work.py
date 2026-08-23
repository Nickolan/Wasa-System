"""Tests de `fastapi_bridge.uow.scan_unit_of_work.ScanUoW` (scan-resource-lifecycle).

Ningún test hace red real: cuando hace falta ejercitar una entrega se monta
`httpx.MockTransport` sobre el cliente que el propio `ScanUoW` construyó (o,
para los escenarios de "config explícita gana", sobre un `N8nRepository`
levantado con ese mismo cliente). El ciclo de vida del canal se verifica
inspeccionando `client.is_closed`, que es API pública de `httpx.AsyncClient`.
Ningún test assertea valores reales de `N8N_WEBHOOK_URL` / `N8N_WEBHOOK_TOKEN`:
siempre se construyen instancias de `Settings` con valores de prueba, siguiendo
la política ya establecida en `test_env_contract.py` / `test_n8n_repository.py`.
"""

from __future__ import annotations

import ast
import inspect
import json
from pathlib import Path
from typing import Callable

import httpx
import pytest

from fastapi_bridge.core.settings import Settings
from fastapi_bridge.exceptions.errors import N8nUnavailableError
from fastapi_bridge.repositories.n8n_repository import N8nRepository, REQUEST_TIMEOUT_SECONDS
from fastapi_bridge.schemas.scan_schemas import N8nPayload
from fastapi_bridge.tests.test_layer_boundaries import get_imported_top_level_modules
from fastapi_bridge.uow import scan_unit_of_work
from fastapi_bridge.uow.scan_unit_of_work import ScanUoW

TEST_WEBHOOK_URL = "http://n8n.test.local/webhook/wasa-scan"
TEST_WEBHOOK_TOKEN = "test-token-distintivo-nunca-real"


# --- Helpers compartidos --------------------------------------------------


def build_settings(
    *,
    webhook_url: str = TEST_WEBHOOK_URL,
    webhook_token: str = TEST_WEBHOOK_TOKEN,
) -> Settings:
    """`Settings` de prueba, construida directamente (no `get_settings()`,
    que está bajo `@lru_cache` y ensuciaría el estado entre tests)."""
    return Settings(N8N_WEBHOOK_URL=webhook_url, N8N_WEBHOOK_TOKEN=webhook_token)


def build_payload(**overrides: object) -> N8nPayload:
    """`N8nPayload` de prueba con los cinco campos del contrato (CHANGE-08)."""
    fields: dict[str, object] = {
        "target_url": "https://objetivo.test.local/login",
        "phpsessid": "sessid-de-prueba",
        "sqlmap_level": 1,
        "sqlmap_risk": 1,
        "scan_id": "scan-de-prueba-001",
    }
    fields.update(overrides)
    return N8nPayload(**fields)


def get_open_client(uow: ScanUoW) -> httpx.AsyncClient:
    """Acceso deliberado a `uow._client` (D-10): es la única forma de
    observar, desde el test, el objeto de canal que el UoW encapsula —
    confinado a este único helper, con este comentario justificativo (8.2)."""
    return uow._client  # type: ignore[attr-defined]


def mount_mock_transport(
    client: httpx.AsyncClient, handler: Callable[[httpx.Request], httpx.Response]
) -> None:
    """Sustituye el transporte del cliente ya construido por el UoW por un
    `httpx.MockTransport(handler)`, para ejercitar una entrega real sin red."""
    client._transport = httpx.MockTransport(handler)  # type: ignore[attr-defined]


def capturing_handler(
    status_code: int = 200, **response_kwargs: object
) -> tuple[Callable[[httpx.Request], httpx.Response], list[httpx.Request]]:
    """Handler que responde `status_code` y guarda cada `httpx.Request`
    recibida, para afirmar sobre la request saliente real."""
    captured: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return httpx.Response(status_code, **response_kwargs)

    return handler, captured


def counting_handler(
    status_code: int,
) -> tuple[Callable[[httpx.Request], httpx.Response], Callable[[], int]]:
    """Handler que cuenta invocaciones y responde `status_code` siempre, para
    afirmar el requirement de "sin reintento del ámbito"."""
    count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal count
        count += 1
        return httpx.Response(status_code)

    return handler, lambda: count


def fixed_status_handler(status_code: int) -> Callable[[httpx.Request], httpx.Response]:
    """Handler que siempre responde `status_code`, sin capturar nada — para
    los escenarios que sólo necesitan disparar `N8nUnavailableError`."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status_code)

    return handler


# --- Construcción y resolución de Settings (D-2) -------------------------


def test_scan_uow_can_be_constructed_with_an_injected_settings():
    uow = ScanUoW(settings=build_settings())

    assert uow is not None


def test_scan_uow_can_be_constructed_with_no_arguments_at_all():
    # Escenario "el ámbito se abre sin necesidad de argumentos": resuelve su
    # propia configuración vigente (get_settings()) sin que el llamador pase nada.
    uow = ScanUoW()

    assert uow is not None


async def test_scan_uow_injected_settings_wins_over_the_system_settings():
    other_webhook_url = "http://n8n-inyectado.test.local/webhook/otro"
    handler, captured = capturing_handler(200)

    async with ScanUoW(settings=build_settings(webhook_url=other_webhook_url)) as uow:
        mount_mock_transport(get_open_client(uow), handler)
        await uow.n8n.forward_scan(build_payload())

    assert str(captured[0].url) == other_webhook_url


def test_scan_unit_of_work_module_does_not_read_environment_directly():
    # 2.5: revisión estática — el módulo no debe leer os.environ/os.getenv
    # directamente ni traer una URL/token literal; sólo usa Settings/get_settings.
    source = inspect.getsource(scan_unit_of_work)
    assert "os.environ" not in source
    assert "os.getenv" not in source
    assert TEST_WEBHOOK_URL not in source


# --- __aenter__: apertura del ámbito (D-1, D-3, D-4) ----------------------


async def test_entering_the_scope_yields_the_uow_instance_itself():
    the_uow = ScanUoW(settings=build_settings())

    async with the_uow as uow:
        assert uow is the_uow


async def test_channel_is_open_while_inside_the_scope():
    async with ScanUoW(settings=build_settings()) as uow:
        assert get_open_client(uow).is_closed is False


async def test_client_default_timeout_matches_the_imported_forwarding_timeout_constant():
    # D-4: comparado contra la constante IMPORTADA, nunca contra un literal
    # 10.0 escrito acá — así no hay dos valores que puedan divergir en silencio.
    async with ScanUoW(settings=build_settings()) as uow:
        assert get_open_client(uow).timeout == httpx.Timeout(REQUEST_TIMEOUT_SECONDS)


# --- n8n: punto de acceso al mecanismo de entrega (D-6) -------------------


async def test_n8n_property_exposes_an_n8n_repository_instance():
    async with ScanUoW(settings=build_settings()) as uow:
        assert isinstance(uow.n8n, N8nRepository)


async def test_n8n_property_is_stable_across_two_accesses_within_the_same_scope():
    async with ScanUoW(settings=build_settings()) as uow:
        first_access = uow.n8n
        second_access = uow.n8n

        assert first_access is second_access


def test_accessing_n8n_before_entering_the_scope_raises_runtime_error():
    uow = ScanUoW(settings=build_settings())

    with pytest.raises(RuntimeError):
        uow.n8n  # noqa: B018 (acceso deliberado para disparar la guarda)


async def test_accessing_n8n_after_the_scope_ended_raises_runtime_error():
    uow = ScanUoW(settings=build_settings())

    async with uow:
        pass

    with pytest.raises(RuntimeError):
        uow.n8n  # noqa: B018


def test_n8n_guard_raises_runtime_error_not_assert_or_domain_exception():
    # 4.7: revisión estática — la guarda debe ser `raise RuntimeError`, nunca
    # un `assert` (se evapora con python -O) ni una excepción de dominio.
    source = inspect.getsource(scan_unit_of_work.ScanUoW.n8n.fget)
    assert "raise RuntimeError" in source
    assert "assert " not in source
    assert "N8nUnavailableError" not in source


# --- __aexit__: cierre garantizado y no supresión (D-5) -------------------


async def test_normal_exit_closes_the_channel():
    async with ScanUoW(settings=build_settings()) as uow:
        client = get_open_client(uow)

    assert client.is_closed is True


async def test_exit_by_arbitrary_exception_still_closes_the_channel_and_propagates_it():
    captured_client: httpx.AsyncClient | None = None

    with pytest.raises(ValueError):
        async with ScanUoW(settings=build_settings()) as uow:
            captured_client = get_open_client(uow)
            raise ValueError("falla arbitraria de prueba dentro del ámbito")

    assert captured_client is not None
    assert captured_client.is_closed is True


async def test_exit_by_n8n_unavailable_error_closes_the_channel_and_preserves_the_original_type():
    captured_client: httpx.AsyncClient | None = None

    with pytest.raises(N8nUnavailableError):
        async with ScanUoW(settings=build_settings()) as uow:
            captured_client = get_open_client(uow)
            mount_mock_transport(captured_client, fixed_status_handler(500))
            await uow.n8n.forward_scan(build_payload())

    assert captured_client is not None
    assert captured_client.is_closed is True


async def test_channel_closes_even_when_no_delivery_was_ever_made():
    async with ScanUoW(settings=build_settings()) as uow:
        client = get_open_client(uow)
        # Deliberadamente no se llama a forward_scan.

    assert client.is_closed is True


async def test_channel_is_already_closed_by_the_time_the_caller_observes_the_failure():
    try:
        async with ScanUoW(settings=build_settings()) as uow:
            client = get_open_client(uow)
            mount_mock_transport(client, fixed_status_handler(500))
            await uow.n8n.forward_scan(build_payload())
    except N8nUnavailableError:
        # Dentro del `except` del llamador: el canal ya debe estar cerrado.
        assert client.is_closed is True
    else:
        pytest.fail("se esperaba N8nUnavailableError")


def test_aexit_is_annotated_to_return_none_and_never_swallows_via_except_around_aclose():
    # 5.7: revisión estática — `-> None` (nunca `-> bool`), sin `return True`,
    # sin `except` envolviendo `aclose()`.
    source = inspect.getsource(scan_unit_of_work.ScanUoW.__aexit__)
    assert "-> None" in source
    assert "-> bool" not in source
    assert "return True" not in source
    assert "except" not in source


# --- Aislamiento entre ámbitos y no participación (D-7) -------------------


async def test_two_separate_uow_instances_open_distinct_clients():
    async with ScanUoW(settings=build_settings()) as first_uow:
        async with ScanUoW(settings=build_settings()) as second_uow:
            assert get_open_client(first_uow) is not get_open_client(second_uow)


async def test_closing_the_inner_scope_does_not_affect_the_still_open_outer_scope():
    async with ScanUoW(settings=build_settings()) as outer_uow:
        outer_client = get_open_client(outer_uow)

        async with ScanUoW(settings=build_settings()) as inner_uow:
            inner_client = get_open_client(inner_uow)

        assert inner_client.is_closed is True
        assert outer_client.is_closed is False


async def test_a_scope_that_failed_does_not_prevent_opening_a_fresh_new_scope():
    with pytest.raises(ValueError):
        async with ScanUoW(settings=build_settings()):
            raise ValueError("primer ámbito, termina por error")

    async with ScanUoW(settings=build_settings()) as new_uow:
        assert get_open_client(new_uow).is_closed is False


async def test_scope_does_not_alter_the_delivered_message_payload():
    handler, captured = capturing_handler(200)
    payload = build_payload()

    async with ScanUoW(settings=build_settings()) as uow:
        mount_mock_transport(get_open_client(uow), handler)
        await uow.n8n.forward_scan(payload)

    body = json.loads(captured[0].content)
    assert set(body.keys()) == {
        "target_url",
        "phpsessid",
        "sqlmap_level",
        "sqlmap_risk",
        "scan_id",
    }
    assert body == payload.model_dump(mode="json")


async def test_scope_does_not_retry_a_failed_delivery():
    handler, get_count = counting_handler(status_code=500)

    with pytest.raises(N8nUnavailableError):
        async with ScanUoW(settings=build_settings()) as uow:
            mount_mock_transport(get_open_client(uow), handler)
            await uow.n8n.forward_scan(build_payload())

    assert get_count() == 1


def test_scan_unit_of_work_module_does_not_reference_payload_or_delivery_internals():
    # 6.6: revisión estática, sobre el CÓDIGO (sin docstrings) — el UoW
    # gobierna recursos y nada más: no debe referenciar N8nPayload, uuid ni
    # llamar a forward_scan en su propio código. El docstring de módulo
    # menciona `uow.n8n.forward_scan(payload)` únicamente como ejemplo de uso
    # para ScanService, y eso no cuenta como violación (mismo criterio que
    # test_no_shared_db_impact.py).
    module_path = Path(scan_unit_of_work.__file__)
    tree = ast.parse(module_path.read_text(encoding="utf-8"), filename=str(module_path))
    if isinstance(tree.body[0], ast.Expr) and isinstance(tree.body[0].value, ast.Constant):
        tree.body = tree.body[1:]  # descarta el docstring de módulo
    code_without_module_docstring = ast.unparse(tree)

    assert "N8nPayload" not in code_without_module_docstring
    assert "import uuid" not in code_without_module_docstring
    assert "forward_scan(" not in code_without_module_docstring


# --- Independencia del framework web y de la base de datos (D-9, req.) ----


async def test_scope_opens_delivers_and_closes_without_ever_instantiating_the_fastapi_app():
    # Deliberadamente no importa fastapi_bridge.main ni construye la app en
    # ningún momento: demuestra que el ámbito funciona sin la app levantada.
    handler, captured = capturing_handler(200)

    async with ScanUoW(settings=build_settings()) as uow:
        mount_mock_transport(get_open_client(uow), handler)
        result = await uow.n8n.forward_scan(build_payload())

    assert result is True
    assert len(captured) == 1


def test_scan_unit_of_work_module_does_not_import_sqlalchemy_asyncpg_or_the_db_layer():
    module_path = Path(scan_unit_of_work.__file__)
    imported = get_imported_top_level_modules(module_path)
    assert imported.isdisjoint({"sqlalchemy", "asyncpg"})
    assert "fastapi_bridge.db" not in module_path.read_text(encoding="utf-8")
