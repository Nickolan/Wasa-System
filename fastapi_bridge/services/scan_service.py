"""Lógica de negocio de la iniciación de escaneos (CHANGE-11, scan-initiation).

Responsabilidad: traducir una `ScanRequest` ya validada en un escaneo
disparado — generar el `scan_id` (única pieza de información que el Bridge
aporta y que no vino del cliente), componer el `N8nPayload` y delegar la
entrega abriendo exactamente un ámbito de recursos de escaneo (`ScanUoW`,
CHANGE-10) por operación: patrón fire-and-forward, el Bridge no espera el
resultado del escaneo, sólo confirma el disparo (RN-WS-07).

Regla de capa (dura): este módulo NO instancia `httpx` ni `SQLAlchemy`
directamente — todo acceso a infraestructura pasa por la `ScanUoW` inyectada.
Tampoco importa nada del framework web (`fastapi`, `starlette`, `slowapi`) ni
lee configuración por su cuenta: no conoce el destino ni la credencial del
orquestador.

`N8nUnavailableError` se deja propagar sin capturar ni envolver: es
deliberado (D-6 de `design.md`) para que el borde HTTP (CHANGE-12) tenga
exactamente un caso que reconocer para responder 502 RFC 7807. No se agrega
logging de la solicitud entrante: `phpsessid` es una credencial de sesión de
la aplicación objetivo y no debe aparecer en registros.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable

from fastapi_bridge.schemas.scan_schemas import N8nPayload, ScanRequest, ScanResponse
from fastapi_bridge.uow.scan_unit_of_work import ScanUoW

SCAN_QUEUED_MESSAGE = "Escaneo encolado correctamente. Los resultados aparecerán en el Dashboard."


class ScanService:
    """Iniciación de escaneos: genera, compone, entrega y confirma."""

    def __init__(self, uow_factory: Callable[[], ScanUoW] = ScanUoW) -> None:
        self._uow_factory: Callable[[], ScanUoW] = uow_factory

    async def start_scan(self, request: ScanRequest) -> ScanResponse:
        """Genera el `scan_id`, compone el `N8nPayload` y entrega el escaneo.

        No captura `N8nUnavailableError`: se deja propagar intacta hacia el
        llamador (D-6). El orden es deliberado — generar, componer y recién
        entonces abrir el ámbito de recursos — para que nada que pueda fallar
        por validación ocurra con el canal de red ya abierto (D-8).
        """
        scan_id = str(uuid.uuid4())
        payload = N8nPayload(
            target_url=str(request.target_url),
            phpsessid=request.phpsessid,
            sqlmap_level=request.sqlmap_level,
            sqlmap_risk=request.sqlmap_risk,
            scan_id=scan_id,
        )
        async with self._uow_factory() as uow:
            await uow.n8n.forward_scan(payload)
        return ScanResponse(scan_id=scan_id, status="queued", message=SCAN_QUEUED_MESSAGE)
