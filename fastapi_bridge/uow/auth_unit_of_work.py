"""`AuthUoW` — Unit of Work del dominio auth (CHANGE-04, D-9).

Context manager asíncrono y reentrante: el único punto por el que
`AuthService` toca la persistencia. Al entrar abre una `AsyncSession` **nueva**
desde la `session_factory` recibida por constructor y construye un
`UserRepository` sobre ella; al salir confirma la transacción si el bloque
terminó sin excepción, la deshace ante **cualquier** excepción —incluidas las
de dominio, como `EmailAlreadyExistsError`— y cierra la sesión siempre.

El constructor recibe la `session_factory`, no una sesión ya abierta ni
`Settings`: el ciclo de vida de la sesión es exactamente la razón de existir
de esta clase. Por eso `__aenter__` abre una sesión nueva cada vez en lugar
de reutilizar una guardada — así un `AuthService` inyectado con vida larga
(CHANGE-05, `Depends`) puede reutilizar la misma instancia de `AuthUoW` entre
peticiones sin que el estado de una se filtre a la siguiente.

El `commit` vive en `__aexit__`, no al final de cada método del Service:
es la definición de Unit of Work — un límite transaccional que abarca la
operación de negocio completa, no cada escritura individual (traspaso D-5 de
CHANGE-03: `UserRepository.create` solo hace `flush()`/`refresh()`, nunca
`commit()`/`rollback()`).

Acceder a `.users` fuera del bloque `async with` es un error de programación,
no un estado válido: se lanza `RuntimeError` explícito en vez de devolver
`None` y dejar que el llamador reciba un `AttributeError` opaco varias capas
más arriba.
"""

from __future__ import annotations

from types import TracebackType

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from fastapi_bridge.repositories.user_repository import UserRepository


class AuthUoW:
    """Unit of Work asíncrona y reentrante sobre `UserRepository`."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory
        self._session: AsyncSession | None = None
        self._users: UserRepository | None = None

    @property
    def users(self) -> UserRepository:
        if self._users is None:
            raise RuntimeError("AuthUoW no está activa: entrá al bloque `async with` antes de usar `.users`")
        return self._users

    async def __aenter__(self) -> "AuthUoW":
        self._session = self._session_factory()
        self._users = UserRepository(self._session)
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        assert self._session is not None
        try:
            if exc_type is None:
                await self._session.commit()
            else:
                await self._session.rollback()
        finally:
            await self._session.close()
            self._session = None
            self._users = None
        # Devolver None (falsy): la excepción, si la hubo, nunca se suprime.
