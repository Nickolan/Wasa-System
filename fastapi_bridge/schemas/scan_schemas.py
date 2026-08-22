"""Schemas Pydantic del dominio scan.

Define el contrato de datos del escaneo: `ScanRequest` (entrada de
`POST /api/v1/scan/start`), `ScanResponse` (salida del mismo endpoint) y
`N8nPayload` (mensaje reenviado al orquestador n8n). Validación de input en
backend (Pydantic v2), autoridad sobre la validación Zod del frontend.
Se implementa en CHANGE-08.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, StringConstraints


class ScanRequest(BaseModel):
    """Contrato de entrada de `POST /api/v1/scan/start` (RN-WS-02..05)."""

    # extra="ignore" es el default de Pydantic; se declara explícito para
    # dejar la decisión visible (D-7): el formulario de la landing manda un
    # checkbox de aceptación ética que no forma parte de este contrato.
    model_config = ConfigDict(extra="ignore")

    target_url: HttpUrl
    phpsessid: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
    sqlmap_level: Annotated[int, Field(ge=1, le=5)] = 1
    sqlmap_risk: Annotated[int, Field(ge=1, le=3)] = 1


class ScanResponse(BaseModel):
    """Contrato de salida de `POST /api/v1/scan/start`: fire-and-forward, siempre `queued`."""

    scan_id: str
    status: Literal["queued"]
    message: str


class N8nPayload(BaseModel):
    """Contrato del mensaje reenviado al webhook de n8n (RN-WS-07).

    `target_url` es `str`, no `HttpUrl` (D-5): se construye a partir de un
    `ScanRequest` ya validado y debe serializar a JSON plano sin transformar.
    """

    target_url: str
    phpsessid: str
    sqlmap_level: int
    sqlmap_risk: int
    scan_id: str
