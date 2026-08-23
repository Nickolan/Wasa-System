"""`ScanUoW` — gobierno del ciclo de vida del canal de escaneo (CHANGE-10).

Patrón Unit of Work: `ScanUoW` es el único punto del sistema que abre y cierra
el `httpx.AsyncClient` usado para entregar un escaneo al orquestador n8n, y el
único punto por el que `ScanService` (CHANGE-11) llega a `N8nRepository`
(CHANGE-09). El Service NUNCA instancia `httpx` directamente — regla dura del
proyecto que este módulo hace cumplible.

Uso de producción, sin argumentos:

    async with ScanUoW() as uow:
        await uow.n8n.forward_scan(payload)

La `Settings` se resuelve en `__init__`: si no se inyecta una explícita, se
toma `core.settings.get_settings()` (instancia cacheada de la app). Un uso
controlado (test, script) puede inyectar una `Settings` propia sin tocar
`get_settings.cache_clear()` ni variables de entorno (ver design.md D-2).

`__aexit__` cierra el cliente siempre —salida normal, por excepción arbitraria
o por `N8nUnavailableError`— y nunca suprime la excepción del bloque: está
anotado `-> None`, nunca `-> bool` (D-5). Si el propio cierre (`aclose()`)
fallara mientras ya hay una excepción en vuelo dentro del bloque, esa falla de
cierre reemplaza a la excepción original en lo que ve el llamador, que queda
preservada como `__context__` (comportamiento estándar de Python ante una
excepción durante el manejo de otra) — trade-off consciente, ver Risks en
design.md.

Uso no soportado: reentrar la misma instancia de `ScanUoW` en un `async with`
anidado. `ScanService` construye una instancia nueva por operación; anidar la
misma instancia sobrescribiría `_client` y perdería la referencia al primer
cliente, sin que exista ningún caso de uso legítimo para ese patrón.
"""

from __future__ import annotations

from types import TracebackType

import httpx

from fastapi_bridge.core.settings import Settings, get_settings
from fastapi_bridge.repositories.n8n_repository import N8nRepository, REQUEST_TIMEOUT_SECONDS


class ScanUoW:
    """Ámbito de recursos de una operación de escaneo (async context manager)."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings: Settings = settings if settings is not None else get_settings()
        self._client: httpx.AsyncClient | None = None
        self._n8n: N8nRepository | None = None

    async def __aenter__(self) -> ScanUoW:
        self._client = httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS)
        self._n8n = N8nRepository(self._client, self._settings)
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        client = self._client
        self._client = None
        self._n8n = None
        if client is not None:
            await client.aclose()

    @property
    def n8n(self) -> N8nRepository:
        """Mecanismo de entrega al orquestador, válido sólo dentro del ámbito."""
        if self._n8n is None:
            raise RuntimeError(
                "ScanUoW.n8n sólo está disponible dentro de 'async with ScanUoW() as uow:'"
            )
        return self._n8n
