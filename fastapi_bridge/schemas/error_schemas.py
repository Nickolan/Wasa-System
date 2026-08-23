"""Contrato de error RFC 7807 (CHANGE-02, capability `error-contract`).

Declara `ErrorDetail`, la forma canónica de todo error de la API (RN-WS-09,
Problem Details for HTTP APIs), compartida por los dominios Auth y Scan.

Vive en su propio módulo, no en el de un dominio: es un contrato
**transversal** que consumen los manejadores globales de excepciones
(`fastapi_bridge/exceptions/handlers.py`, CHANGE-07) y ambos dominios,
no solo uno. Alojarlo en el módulo de un dominio concreto obligaría a los
demás consumidores a importar de un dominio ajeno para hablar de errores
que no le pertenecen — ver D-10 en `openspec/changes/auth-pydantic-schemas/design.md`.

Este módulo solo declara la *forma* del error. La emisión de estos errores
—registrar los `exception_handler`, construir la respuesta HTTP— es
responsabilidad de `fastapi_bridge/exceptions/handlers.py` (CHANGE-07), que
importa `ErrorDetail` y lo usa como constructor efectivo del cuerpo que sale
por el cable — no de este módulo, que no importa nada de la capa web.
"""

from pydantic import BaseModel, Field


class ErrorDetail(BaseModel):
    """Forma RFC 7807 de un error de la API.

    `type` e `instance` se modelan como `str`, no `AnyUrl` (D-9): RFC 7807
    define ambos como *URI references*, que incluyen referencias relativas.
    En la práctica `instance` es el path del endpoint que falló
    (p. ej. `/api/v1/auth/login`), y `AnyUrl` rechazaría un path sin esquema
    ni host, obligando a cada handler a inventar un origen absoluto.
    """

    type: str = "about:blank"
    title: str
    status: int = Field(..., ge=100, le=599)
    # `detail` es opcional (CHANGE-07, delta `error-contract`, D-1): RFC 7807 §3.1
    # declara los cinco miembros del Problem Detail como opcionales, y
    # `problem_detail_response` ya admite emitir un error sin detalle desde
    # CHANGE-00d. Exigirlo obligado forzaría a cada handler a inventar un texto
    # cuando el código de estado y el título ya son suficientemente informativos.
    detail: str | None = None
    instance: str
