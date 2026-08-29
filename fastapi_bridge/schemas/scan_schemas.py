"""Schemas Pydantic del dominio scan.

Define el contrato de datos del escaneo: `ScanRequest` (entrada de
`POST /api/v1/scan/start`), `ScanResponse` (salida del mismo endpoint) y
`N8nPayload` (mensaje reenviado al orquestador n8n). Validación de input en
backend (Pydantic v2), autoridad sobre la validación Zod del frontend.
Responsabilidad futura: `ScanRequest`, `ScanResponse`, `N8nPayload`.
Se implementa en CHANGE-08.

`ErrorDetail` NO vive acá: es un contrato transversal compartido por Auth y
Scan y se define en `fastapi_bridge/schemas/error_schemas.py` (D-10,
CHANGE-02) para que ningún dominio importe la forma de error desde el módulo
de otro dominio.
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

    `email` es el correo del usuario autenticado que inició el escaneo
    (RN-WS-16, D-1 de CHANGE-23): su única fuente es el JWT resuelto por
    `get_current_user`, nunca la `ScanRequest` del cliente ni ningún campo
    que el cliente pueda fijar. Se tipa `str`, no `EmailStr` (D-4 de
    CHANGE-23): el valor ya fue validado como `EmailStr` en el registro y
    viene firmado dentro del JWT; revalidarlo acá no agrega seguridad, sólo
    un modo de falla nuevo (mismo criterio que `target_url` y que
    `TokenData.email` en CHANGE-04).
    """

    target_url: str
    phpsessid: str
    sqlmap_level: int
    sqlmap_risk: int
    scan_id: str
    email: str
