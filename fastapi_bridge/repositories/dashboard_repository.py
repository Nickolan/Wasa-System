"""Acceso de solo lectura a las tablas compartidas de `db_fuzzing` (CHANGE-25, D-1).

Único módulo de producción autorizado a mencionar las tablas preexistentes
del sistema WASA existente (allowlist de un solo elemento en
`tests/test_no_shared_db_impact.py`, D-6). Todo lo que este módulo emite hacia
la base son sentencias `sqlalchemy.text()` con parámetros ligados por nombre
-- nunca una `Table`, nunca una `MetaData`, nunca reflexión. No declarar un
objeto `Table` acá es lo que garantiza, de forma estructural, que ningún
mecanismo de creación de esquema del servicio (presente ni futuro) pueda
alcanzar estas dos tablas por arrastre.

Los fragmentos de cada filtro son constantes de módulo (`_VULNERABILITY_FILTERS`);
sólo los valores viajan como parámetros ligados. El texto de la sentencia se
arma únicamente uniendo fragmentos constantes con `" ".join(...)`/`" AND ".join(...)`
-- nunca con un f-string, nunca con `+`/`%` sobre texto, nunca con `.format(`.

El constructor recibe una `AsyncSession` ya abierta (D-4, `DashboardUoW` es
quien decide su ciclo de vida) y no hace nada más: no construye engines, no
lee configuración, no confirma ni deshace ninguna transacción.
"""

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_GET_SCANS_QUERY = "SELECT * FROM scans ORDER BY scan_date ASC"
_GET_VULNERABILITIES_BASE_QUERY = "SELECT * FROM vulnerabilities"

# D-1: fragmentos fijos de la condición -- únicamente los valores viajan
# ligados (`:scan_id`, `:severity`, `:source`), nunca el texto de esta tabla.
_VULNERABILITY_FILTERS: dict[str, str] = {
    "scan_id": "scan_id = :scan_id",
    "severity": "severity = :severity",
    "source": "source = :source",
}


class DashboardRepository:
    """Dos consultas de proyección sobre `scans`/`vulnerabilities`, sin escritura alguna."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_scans(self) -> list[dict[str, Any]]:
        """Devuelve todos los escaneos, ordenados por fecha ascendente (D-1).

        Sin parámetros: la colección de escaneos nunca se filtra (los
        filtros de la consulta aplican sólo a vulnerabilidades, ver
        `dashboard-projection`).
        """
        result = await self._session.execute(text(_GET_SCANS_QUERY))
        return [dict(row) for row in result.mappings().all()]

    async def get_vulnerabilities(self, filters: dict[str, Any]) -> list[dict[str, Any]]:
        """Devuelve las vulnerabilidades que coinciden con `filters` (D-1).

        `filters` ya llega normalizado por `DashboardService` (D-5): este
        método no transforma ningún valor, sólo decide qué fragmentos
        constantes de `_VULNERABILITY_FILTERS` participan del `WHERE`, según
        qué claves están presentes con un valor no nulo. Los valores viajan
        siempre ligados -- nunca concatenados al texto de la sentencia.
        """
        present_keys = [
            key for key in _VULNERABILITY_FILTERS if filters.get(key) is not None
        ]
        query_fragments = [_GET_VULNERABILITIES_BASE_QUERY]
        if present_keys:
            where_clause = " AND ".join(_VULNERABILITY_FILTERS[key] for key in present_keys)
            query_fragments.append("WHERE")
            query_fragments.append(where_clause)
        query = " ".join(query_fragments)

        bound_params = {key: filters[key] for key in present_keys}
        result = await self._session.execute(text(query), bound_params)
        return [dict(row) for row in result.mappings().all()]
