"""`DashboardService` — lógica de negocio de la consulta de resultados (CHANGE-25, D-5).

Traduce una `DashboardFilters` ya validada en un `DashboardResponse`, abriendo
exactamente un ámbito de `DashboardUoW` por operación (mismo patrón que
`AuthService`/`AuthUoW`). La normalización de `severity` a minúsculas vive
acá, no en el repositorio (D-5): "las severidades se almacenan en minúsculas
y el consumidor las envía capitalizadas" es una regla de dominio sobre los
datos, no una preocupación de acceso a datos — y es precisamente el tipo de
asimetría (severity se normaliza, source no) que conviene poder leer en un
solo lugar.

Un filtro vacío (`""`) se trata igual que uno ausente (`None`): ninguno de
los dos participa del `WHERE` que arma el repositorio.

Regla de capa (dura): este módulo NO instancia `SQLAlchemy` directamente —
todo acceso a infraestructura pasa por la `DashboardUoW` inyectada. Tampoco
importa nada del framework web y no captura ninguna excepción (D-7): un
fallo de base de datos se propaga hasta el handler genérico de `main.py`.
"""

from __future__ import annotations

from typing import Any

from fastapi_bridge.schemas.dashboard_schemas import DashboardFilters, DashboardResponse
from fastapi_bridge.uow.dashboard_unit_of_work import DashboardUoW


def _normalized_filters(filters: DashboardFilters) -> dict[str, Any]:
    """Traduce `DashboardFilters` al `dict` que espera el repositorio (D-5).

    `severity` se convierte a minúsculas; `source` viaja tal cual (asimetría
    deliberada, ver docstring del módulo). Un valor vacío equivale a ausente
    para ambos.
    """
    return {
        "scan_id": filters.scan_id,
        "severity": filters.severity.lower() if filters.severity else None,
        "source": filters.source if filters.source else None,
    }


class DashboardService:
    """Lógica de negocio de la consulta de resultados, sobre una `DashboardUoW` inyectada."""

    def __init__(self, uow: DashboardUoW) -> None:
        self._uow = uow

    async def get_dashboard(self, filters: DashboardFilters) -> DashboardResponse:
        normalized = _normalized_filters(filters)
        async with self._uow as uow:
            scan_rows = await uow.dashboard.get_scans()
            vulnerability_rows = await uow.dashboard.get_vulnerabilities(normalized)
        return DashboardResponse.from_rows(scan_rows, vulnerability_rows)
