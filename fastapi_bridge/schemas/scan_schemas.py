"""Schemas Pydantic del dominio scan — placeholder de estructura.

Responsabilidad futura: `ScanRequest`, `ScanResponse`, `N8nPayload`.
Se implementa en CHANGE-08.

`ErrorDetail` NO vive acá: es un contrato transversal compartido por Auth y
Scan y se define en `fastapi_bridge/schemas/error_schemas.py` (D-10,
CHANGE-02) para que ningún dominio importe la forma de error desde el módulo
de otro dominio.
"""
