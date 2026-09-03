"""`DashboardUoW` — Unit of Work del dominio dashboard (CHANGE-25, D-4).

Context manager asíncrono sobre `DashboardRepository`: al entrar abre una
sesión **nueva** desde la `session_factory` recibida por constructor
(idéntico a `AuthUoW`) y construye el repositorio; al salir, en **toda**
circunstancia (normal o por excepción), deshace la transacción y luego
cierra la sesión. Nunca hay una rama que confirme.

A diferencia de `AuthUoW` (que sí ramifica commit/rollback porque su
dominio escribe), este dominio es puramente de proyección: convertir la
garantía de solo lectura en una propiedad estructural de la transacción, no
sólo del texto de las consultas, es la mitad del contraste deliberado que
documenta `design.md` (D-4). Aunque un cambio futuro colara una escritura en
el repositorio, no existiría ningún camino por el que se persistiera.
"""

from __future__ import annotations

from types import TracebackType
from typing import Any, Callable

from fastapi_bridge.repositories.dashboard_repository import DashboardRepository

# `Callable[[], Any]` (no `async_sessionmaker[AsyncSession]`) a propósito:
# los tests unitarios de esta clase (`tests/test_dashboard_unit_of_work.py`)
# inyectan una factory que devuelve un doble simple, sin heredar de
# `AsyncSession`. En producción, `core/dependencies.py` sigue pasando
# `get_session_factory(settings)`, que sí cumple ese tipo real.
SessionFactory = Callable[[], Any]


class DashboardUoW:
    """Unit of Work asíncrona sobre `DashboardRepository`, que nunca confirma."""

    def __init__(self, session_factory: SessionFactory) -> None:
        self._session_factory = session_factory
        self._session: Any = None
        self._dashboard: DashboardRepository | None = None

    @property
    def dashboard(self) -> DashboardRepository:
        if self._dashboard is None:
            raise RuntimeError(
                "DashboardUoW no está activa: entrá al bloque `async with` antes de usar `.dashboard`"
            )
        return self._dashboard

    async def __aenter__(self) -> "DashboardUoW":
        self._session = self._session_factory()
        self._dashboard = DashboardRepository(self._session)
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        assert self._session is not None
        try:
            await self._session.rollback()
        finally:
            await self._session.close()
            self._session = None
            self._dashboard = None
        # Devolver None (falsy): la excepción, si la hubo, nunca se suprime.
