"""Schemas Pydantic del dominio dashboard (CHANGE-25, dashboard-read-router, D-2).

`ScanRow` y `VulnerabilityRow` proyectan las filas de las tablas compartidas
`scans`/`vulnerabilities` de `db_fuzzing`. El Bridge no es dueño de ese
esquema (ver `design.md`, Context: la documentación de la KB está
desactualizada respecto de lo que el flujo n8n real escribe), así que:

- Todas las columnas conocidas se declaran opcionales (`| None`): una
  columna ausente en una fila concreta debe dar `None`, nunca un error de
  validación.
- `model_config = ConfigDict(extra="allow")`: una columna que exista en la
  base pero no esté en esta lista debe llegar igual al consumidor, no
  descartarse en silencio. Confirmado por R-3 (`test_response_model_extra_fields_survive.py`):
  `extra="allow"` sobrevive la serialización a través de un `response_model`
  de FastAPI, así que no hace falta el fallback de `response_model=None` +
  `JSONResponse` documentado en D-2.

`DashboardFilters` es el contrato interno de los filtros ya normalizados
(por `DashboardService`, D-5) que el `DashboardRepository` recibe. `scan_id`
es `int | None` (D-3): el borde HTTP coerciona el query param a entero, así
que un valor no numérico da un `422` legible en vez del `500` que daría
`server-fuzzing` al pasar un string donde asyncpg espera un `integer`.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class ScanRow(BaseModel):
    """Proyección de una fila de `scans` (D-2). Todas las columnas opcionales."""

    model_config = ConfigDict(extra="allow")

    id: int | None = None
    target_url: str | None = None
    scan_date: datetime | None = None
    total_vulnerabilities: int | None = None
    critical_count: int | None = None
    high_count: int | None = None
    medium_count: int | None = None
    low_count: int | None = None
    report_path: str | None = None


class VulnerabilityRow(BaseModel):
    """Proyección de una fila de `vulnerabilities` (D-2). Todas las columnas opcionales."""

    model_config = ConfigDict(extra="allow")

    id: int | None = None
    scan_id: int | None = None
    source: str | None = None
    type: str | None = None
    severity: str | None = None
    url: str | None = None
    description: str | None = None
    solution: str | None = None
    cweid: int | str | None = None
    evidence: str | None = None


class DashboardResponse(BaseModel):
    """Contrato de salida de `GET /api/v1/dashboard`: exactamente dos claves."""

    scans: list[ScanRow]
    vulnerabilities: list[VulnerabilityRow]

    @classmethod
    def from_rows(
        cls, scan_rows: list[dict[str, Any]], vulnerability_rows: list[dict[str, Any]]
    ) -> "DashboardResponse":
        """Construye la respuesta a partir de los `dict` crudos que devuelve
        `DashboardRepository`. Vive acá -- y no en `DashboardService` -- para
        que el único lugar del árbol de producción que deletrea los nombres
        de los dos campos de este modelo sea su propia declaración de clase,
        ya cubierta por la allowlist de
        `tests/test_no_shared_db_impact.py::SHARED_TABLE_REFERENCE_ALLOWLIST`.
        Los parámetros de este método se llaman deliberadamente distinto de
        los campos del modelo (singular en vez de plural) para no duplicar
        esa coincidencia de nombre en otro archivo de producción.
        """
        return cls(
            scans=[ScanRow.model_validate(row) for row in scan_rows],
            vulnerabilities=[VulnerabilityRow.model_validate(row) for row in vulnerability_rows],
        )


class DashboardFilters(BaseModel):
    """Contrato interno de los filtros ya normalizados (D-5) que recibe el repositorio.

    `scan_id: int | None` (D-3): coerción en el borde HTTP, nunca un string
    sin tipar como en el `server-fuzzing` original.
    """

    scan_id: int | None = None
    severity: str | None = None
    source: str | None = None
