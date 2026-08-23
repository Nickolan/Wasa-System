"""Tests de `fastapi_bridge.repositories.n8n_repository.N8nRepository` (scan-forwarding).

Ningún test hace red real: se simula el orquestador n8n con `httpx.MockTransport`,
que intercepta en la capa de transporte de `httpx` y permite afirmar sobre la
`httpx.Request` saliente real (URL, headers, cuerpo) sin abrir un socket. Ningún
test assertea valores reales de `N8N_WEBHOOK_URL` / `N8N_WEBHOOK_TOKEN`: siempre
se construyen instancias de `Settings` con valores de prueba, siguiendo la
política ya establecida en `test_env_contract.py` / `test_settings.py`.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Callable

import httpx
import pytest

from fastapi_bridge.core.settings import Settings
from fastapi_bridge.exceptions.errors import N8nUnavailableError
from fastapi_bridge.repositories.n8n_repository import N8nRepository
from fastapi_bridge.schemas.scan_schemas import N8nPayload
from fastapi_bridge.tests.test_layer_boundaries import get_imported_top_level_modules

FORBIDDEN_MODULES_IN_ERRORS = {"fastapi", "starlette", "slowapi", "httpx", "pydantic"}
TEST_WEBHOOK_URL = "http://n8n.test.local/webhook/wasa-scan"
TEST_WEBHOOK_TOKEN = "test-token-distintivo-nunca-real"


# --- Helpers compartidos ------------------------------------------------


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


def build_settings(
    *,
    webhook_url: str = TEST_WEBHOOK_URL,
    webhook_token: str = TEST_WEBHOOK_TOKEN,
) -> Settings:
    """`Settings` de prueba, construida directamente (no `get_settings()`,
    que está bajo `@lru_cache` y ensuciaría el estado entre tests)."""
    return Settings(N8N_WEBHOOK_URL=webhook_url, N8N_WEBHOOK_TOKEN=webhook_token)


def build_client(handler: Callable[[httpx.Request], httpx.Response], **client_kwargs: object) -> httpx.AsyncClient:
    """`httpx.AsyncClient` de prueba, montado sobre `httpx.MockTransport(handler)`:
    intercepta en la capa de transporte, así que ejercita la construcción real
    de la request (URL, headers, cuerpo) sin red real."""
    return httpx.AsyncClient(transport=httpx.MockTransport(handler), **client_kwargs)


def build_repository(
    handler: Callable[[httpx.Request], httpx.Response],
    *,
    settings: Settings | None = None,
    **client_kwargs: object,
) -> N8nRepository:
    """`N8nRepository` de prueba, cableado sobre un `MockTransport(handler)`."""
    return N8nRepository(build_client(handler, **client_kwargs), settings or build_settings())


def raising_handler(exc: Exception) -> Callable[[httpx.Request], httpx.Response]:
    """Handler de `MockTransport` que levanta `exc` en lugar de responder."""

    def handler(request: httpx.Request) -> httpx.Response:
        raise exc

    return handler


def capturing_handler(
    status_code: int = 200, **response_kwargs: object
) -> tuple[Callable[[httpx.Request], httpx.Response], list[httpx.Request]]:
    """Handler que responde `status_code` y guarda cada `httpx.Request` recibida
    en la lista devuelta, para afirmar sobre la request saliente real."""
    captured: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return httpx.Response(status_code, **response_kwargs)

    return handler, captured


def counting_handler(
    status_code: int | None = None, exc: Exception | None = None
) -> tuple[Callable[[httpx.Request], httpx.Response], Callable[[], int]]:
    """Handler que cuenta invocaciones y responde `status_code` o levanta `exc`,
    para afirmar el requirement de intento único (D-11)."""
    count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal count
        count += 1
        if exc is not None:
            raise exc
        assert status_code is not None
        return httpx.Response(status_code)

    return handler, lambda: count


# --- N8nUnavailableError (D-2) ------------------------------------------


def test_n8n_unavailable_error_is_a_catchable_exception_subclass_with_message():
    assert issubclass(N8nUnavailableError, Exception)

    try:
        raise N8nUnavailableError("el orquestador no respondió a tiempo")
    except N8nUnavailableError as exc:
        assert str(exc) == "el orquestador no respondió a tiempo"


def test_exceptions_errors_module_imports_no_third_party_or_framework_package():
    errors_path = Path(__file__).resolve().parent.parent / "exceptions" / "errors.py"
    imported = get_imported_top_level_modules(errors_path)
    assert imported.isdisjoint(FORBIDDEN_MODULES_IN_ERRORS), (
        f"exceptions/errors.py debe ser Python puro; importa {imported & FORBIDDEN_MODULES_IN_ERRORS}"
    )


# --- Construcción e inyección (D-1) --------------------------------------


async def test_n8n_repository_can_be_constructed_with_client_and_settings():
    repository = build_repository(lambda request: httpx.Response(200))

    assert repository is not None


async def test_n8n_repository_does_not_open_or_close_the_injected_client():
    client = build_client(lambda request: httpx.Response(200))

    N8nRepository(client, build_settings())

    assert client.is_closed is False


# --- forward_scan: camino feliz — destino, header, cuerpo (D-3, D-7, D-8) --


async def test_forward_scan_returns_true_when_n8n_responds_200():
    repository = build_repository(lambda request: httpx.Response(200))

    result = await repository.forward_scan(build_payload())

    assert result is True


@pytest.mark.parametrize(
    "webhook_url",
    ["http://n8n-primero.test.local/webhook/a", "http://n8n-segundo.test.local/webhook/b"],
)
async def test_forward_scan_posts_to_exactly_the_configured_webhook_url(webhook_url: str):
    handler, captured = capturing_handler(200)
    repository = build_repository(handler, settings=build_settings(webhook_url=webhook_url))

    await repository.forward_scan(build_payload())

    assert str(captured[0].url) == webhook_url


async def test_forward_scan_sends_the_unwrapped_token_never_the_secretstr_obfuscated_form():
    handler, captured = capturing_handler(200)
    repository = build_repository(handler)

    await repository.forward_scan(build_payload())

    # No "simplificar" a settings.N8N_WEBHOOK_TOKEN sin .get_secret_value():
    # SecretStr se interpolaría como "**********" y n8n rechazaría la entrega (D-8).
    assert captured[0].headers["X-WASA-TOKEN"] == TEST_WEBHOOK_TOKEN
    assert captured[0].headers["X-WASA-TOKEN"] != "**********"


async def test_forward_scan_body_has_exactly_the_five_contract_keys_as_json():
    handler, captured = capturing_handler(200)
    payload = build_payload()
    repository = build_repository(handler)

    await repository.forward_scan(payload)

    request = captured[0]
    body = json.loads(request.content)
    assert set(body.keys()) == {
        "target_url",
        "phpsessid",
        "sqlmap_level",
        "sqlmap_risk",
        "scan_id",
    }
    assert body == payload.model_dump(mode="json")
    assert isinstance(body["target_url"], str)
    assert "application/json" in request.headers["content-type"]


async def test_forward_scan_header_travels_on_every_delivery_not_only_the_first():
    handler, captured = capturing_handler(200)
    repository = build_repository(handler)

    await repository.forward_scan(build_payload(scan_id="scan-uno"))
    await repository.forward_scan(build_payload(scan_id="scan-dos"))

    assert len(captured) == 2
    assert captured[0].headers["X-WASA-TOKEN"] == TEST_WEBHOOK_TOKEN
    assert captured[1].headers["X-WASA-TOKEN"] == TEST_WEBHOOK_TOKEN


async def test_forward_scan_enforces_10s_timeout_even_when_the_client_declares_none():
    handler, captured = capturing_handler(200)
    # Cliente sin timeout propio (D-3: el límite lo impone la entrega, no el canal).
    repository = build_repository(handler, timeout=None)

    await repository.forward_scan(build_payload())

    timeout = captured[0].extensions["timeout"]
    assert timeout == {"connect": 10.0, "read": 10.0, "write": 10.0, "pool": 10.0}


@pytest.mark.parametrize("body", [b"", b"no es json valido {{{"])
async def test_forward_scan_returns_true_on_200_regardless_of_response_body(body: bytes):
    repository = build_repository(lambda request: httpx.Response(200, content=body))

    assert await repository.forward_scan(build_payload()) is True


# --- forward_scan: respuestas no aceptadas (D-4, ablandado a 2xx) --------


@pytest.mark.parametrize("status_code", [302, 401, 404, 500])
async def test_forward_scan_raises_n8n_unavailable_for_non_2xx_status_codes(status_code: int):
    repository = build_repository(lambda request: httpx.Response(status_code))

    with pytest.raises(N8nUnavailableError):
        await repository.forward_scan(build_payload())


@pytest.mark.parametrize("status_code", [201, 204])
async def test_forward_scan_returns_true_for_other_2xx_status_codes(status_code: int):
    # D-4 (actualizado): el criterio de aceptación es cualquier 2xx, no sólo
    # 200 exacto — precisamente porque no se puede confirmar desde el repo
    # con qué código responde el Webhook Trigger real de n8n (ver Open
    # Questions en design.md). Si el nodo de respuesta de n8n resultara
    # devolver otro código, ESTE es el test que hay que revisar.
    repository = build_repository(lambda request: httpx.Response(status_code))

    assert await repository.forward_scan(build_payload()) is True


# --- forward_scan: fallas de transporte (D-5) ----------------------------


async def test_forward_scan_raises_n8n_unavailable_on_read_timeout():
    repository = build_repository(raising_handler(httpx.ReadTimeout("timeout de prueba")))

    with pytest.raises(N8nUnavailableError):
        await repository.forward_scan(build_payload())


@pytest.mark.parametrize(
    "transport_error",
    [
        httpx.ConnectError("orquestador inalcanzable de prueba"),
        httpx.ReadError("falla de transporte a mitad de camino de prueba"),
    ],
)
async def test_forward_scan_raises_n8n_unavailable_for_other_transport_errors(transport_error: httpx.RequestError):
    # Se captura la raíz httpx.RequestError (D-5), no una lista de subclases:
    # ConnectError y ReadError deben producir la misma condición de dominio
    # sin que este módulo tenga que conocer cada subclase de httpx.
    repository = build_repository(raising_handler(transport_error))

    with pytest.raises(N8nUnavailableError):
        await repository.forward_scan(build_payload())


async def test_forward_scan_preserves_original_transport_exception_as_cause():
    repository = build_repository(raising_handler(httpx.ConnectError("orquestador inalcanzable de prueba")))

    with pytest.raises(N8nUnavailableError) as exc_info:
        await repository.forward_scan(build_payload())

    assert isinstance(exc_info.value.__cause__, httpx.RequestError)


def test_no_bare_except_exception_in_n8n_repository_module():
    # D-5: un bug de programación no debe disfrazarse de "n8n no disponible".
    n8n_repository_path = Path(__file__).resolve().parent.parent / "repositories" / "n8n_repository.py"
    source = n8n_repository_path.read_text(encoding="utf-8")
    assert "except Exception" not in source


# --- Garantías transversales: secreto, intento único, fire-and-forward --


@pytest.mark.parametrize(
    "handler",
    [
        lambda request: httpx.Response(500),
        raising_handler(httpx.ReadTimeout("timeout de prueba")),
        raising_handler(httpx.ConnectError("orquestador inalcanzable de prueba")),
    ],
)
async def test_forward_scan_failure_never_leaks_the_webhook_token_in_the_error_text(handler):
    repository = build_repository(handler)

    with pytest.raises(N8nUnavailableError) as exc_info:
        await repository.forward_scan(build_payload())

    assert TEST_WEBHOOK_TOKEN not in str(exc_info.value)
    assert TEST_WEBHOOK_TOKEN not in repr(exc_info.value)


async def test_forward_scan_failure_never_leaks_the_n8n_response_body_in_the_error_text():
    distinctive_body_marker = "cuerpo-distintivo-de-la-respuesta-de-n8n-que-no-debe-filtrarse"
    repository = build_repository(
        lambda request: httpx.Response(500, content=distinctive_body_marker.encode())
    )

    with pytest.raises(N8nUnavailableError) as exc_info:
        await repository.forward_scan(build_payload())

    assert distinctive_body_marker not in str(exc_info.value)
    assert distinctive_body_marker not in repr(exc_info.value)


async def test_forward_scan_makes_exactly_one_attempt_when_n8n_responds_500():
    handler, get_count = counting_handler(status_code=500)
    repository = build_repository(handler)

    with pytest.raises(N8nUnavailableError):
        await repository.forward_scan(build_payload())

    assert get_count() == 1


async def test_forward_scan_makes_exactly_one_attempt_on_timeout():
    handler, get_count = counting_handler(exc=httpx.ReadTimeout("timeout de prueba"))
    repository = build_repository(handler)

    with pytest.raises(N8nUnavailableError):
        await repository.forward_scan(build_payload())

    assert get_count() == 1


async def test_forward_scan_success_makes_exactly_one_request_no_follow_up_query():
    handler, get_count = counting_handler(status_code=200)
    repository = build_repository(handler)

    result = await repository.forward_scan(build_payload())

    assert result is True
    assert get_count() == 1


# --- Independencia del framework web (D-10) ------------------------------


async def test_forward_scan_works_without_the_fastapi_application_ever_being_instantiated():
    # Este test, deliberadamente, no importa `fastapi_bridge.main` ni construye
    # la app FastAPI en ningún momento: sólo el repositorio y sus dependencias
    # inyectadas (httpx.AsyncClient de prueba, Settings de prueba). Que
    # `forward_scan` funcione igual demuestra el requirement de independencia
    # del framework web — la entrega se comporta igual sin la app levantada.
    repository = build_repository(lambda request: httpx.Response(200))

    result = await repository.forward_scan(build_payload())

    assert result is True
