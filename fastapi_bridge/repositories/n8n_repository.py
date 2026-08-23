"""`N8nRepository` — entrega de escaneos al Webhook Trigger de n8n (CHANGE-09).

Responsabilidad: `forward_scan(payload)` — POST al Webhook Trigger de n8n
(`N8N_WEBHOOK_URL`, autenticado con `N8N_WEBHOOK_TOKEN`) vía el `httpx.AsyncClient`
que le inyecta `ScanUoW` (CHANGE-10). Único punto del sistema que hace I/O
contra el orquestador.

Regla de capa (dura): este módulo NO SHALL importar nada de `fastapi` — debe
ser reutilizable fuera del framework web (verificado por AST en
`test_layer_boundaries.py`). El token de webhook se desenvuelve únicamente
para construir el header de autenticación; nunca se loguea ni aparece en el
mensaje de `N8nUnavailableError` (D-8).
"""

from __future__ import annotations

import httpx

from fastapi_bridge.core.settings import Settings
from fastapi_bridge.exceptions.errors import N8nUnavailableError
from fastapi_bridge.schemas.scan_schemas import N8nPayload

WEBHOOK_TOKEN_HEADER = "X-WASA-TOKEN"
REQUEST_TIMEOUT_SECONDS = 10.0


class N8nRepository:
    """Entrega escaneos al orquestador n8n vía un `httpx.AsyncClient` inyectado."""

    def __init__(self, client: httpx.AsyncClient, settings: Settings) -> None:
        self._client: httpx.AsyncClient = client
        self._settings: Settings = settings

    async def forward_scan(self, payload: N8nPayload) -> bool:
        """POST único del escaneo al Webhook Trigger de n8n.

        Devuelve `True` únicamente cuando el orquestador responde con un
        código 2xx (D-4, ablandado tras revisión del usuario: el Webhook
        Trigger real de n8n puede responder 200, 201 o 204 según cómo esté
        configurado el nodo de respuesta del workflow — ver Open Questions en
        `design.md`). Cualquier otro código de estado se traduce a
        `N8nUnavailableError`.
        """
        try:
            response = await self._client.post(
                self._settings.N8N_WEBHOOK_URL,
                json=payload.model_dump(mode="json"),
                headers={WEBHOOK_TOKEN_HEADER: self._settings.N8N_WEBHOOK_TOKEN.get_secret_value()},
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
        except httpx.RequestError as exc:
            raise N8nUnavailableError("no se pudo completar la entrega al orquestador") from exc
        if not response.is_success:
            raise N8nUnavailableError(
                f"el orquestador respondió con un código inesperado: {response.status_code}"
            )
        return True
