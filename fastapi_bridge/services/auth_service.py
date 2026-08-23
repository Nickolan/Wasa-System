"""`AuthService` — las dos operaciones de negocio del dominio auth (CHANGE-04).

`register` y `login` orquestan hashing, persistencia y emisión de JWT
detrás de un único límite transaccional (`AuthUoW`, recibido por
constructor). Ninguna de las dos instancia SQLAlchemy, ni confirma o deshace
transacciones por su cuenta — ese límite pertenece enteramente a la UoW — ni
importa FastAPI: el servicio se puede ejercitar sin levantar la app web.

## `register` — RN-WS-12, deja al usuario autenticado

Hashea la contraseña, da de alta el usuario a través de la UoW y devuelve un
token ya emitido: el registro no obliga a loguearse a continuación. El email
duplicado se reporta como `EmailAlreadyExistsError`, propagada tal cual desde
`UserRepository.create` — **sin** pre-consulta de existencia (D-10): la
garantía de unicidad la da la constraint del motor, no un `SELECT` previo,
que además no cubre dos altas concurrentes con el mismo email.

## `login` — 401 indistinguible en mensaje y en tiempo (RN-WS-12 §Excepciones globales)

Busca el usuario por email, verifica la contraseña y emite el token solo si
la verificación tiene éxito. Ante email inexistente **o** contraseña
incorrecta lanza la **misma** `InvalidCredentialsError`, con el mismo
mensaje (D-11: la excepción no lleva el email). Cuando el email no existe,
`login` **igual** ejecuta `verify_password` contra `_DUMMY_PASSWORD_HASH`
—un hash bcrypt constante de módulo, derivado una sola vez— y descarta el
resultado (D-8): sin esa verificación señuelo, el camino "email inexistente"
retorna en microsegundos mientras que "contraseña incorrecta" paga el coste
completo de bcrypt, y esa diferencia de latencia permite enumerar usuarios
con la misma eficacia que si el mensaje lo dijera. No se borra "por parecer
código muerto": es lo que cierra el canal temporal.

## Por qué el hashing no bloquea el event loop (D-3, R-4)

`hash_password`/`verify_password` (`core/security.py`) son síncronas: bcrypt
es trabajo de CPU, no de I/O. Esta capa —la que sí conoce el contexto
asíncrono de la petición— las ejecuta vía `anyio.to_thread.run_sync(...)`,
nunca directamente dentro de la corrutina. Sin el offload, un solo registro
concurrente serializaría todas las peticiones del servicio, incluida
`/health`.

## Por qué `Settings` se obtiene con `get_settings()` y no por parámetro

A diferencia de `create_access_token`/`decode_access_token` (D-5: reciben
`Settings` explícito porque son funciones puras de `core/security.py`),
`AuthService` recibe únicamente la `AuthUoW` por constructor (`auth-session`
spec, `CHANGES.md`) y obtiene `Settings` internamente vía el mismo
`get_settings()` cacheado que usa el resto del Bridge. `expires_in` de
`TokenResponse` (D-12) se calcula acá, en segundos, a partir del mismo
`timedelta` que expira el token — nunca de una constante separada, para que
el cliente no pueda considerar vigente un token ya vencido.

Ninguna operación de este módulo registra la contraseña, el hash, el token
ni —en el camino de rechazo de `login`— el email consultado.
"""

from __future__ import annotations

from datetime import timedelta

import anyio

from fastapi_bridge.core.security import create_access_token, hash_password, verify_password
from fastapi_bridge.core.settings import get_settings
from fastapi_bridge.exceptions.domain import InvalidCredentialsError
from fastapi_bridge.schemas.auth_schemas import TokenResponse, UserLogin, UserRegister
from fastapi_bridge.uow.auth_unit_of_work import AuthUoW

# D-8: hash señuelo constante de módulo, derivado una sola vez. `login` lo
# verifica —descartando el resultado— cuando el email no existe, para que el
# rechazo "email inexistente" pague el mismo coste de CPU que "contraseña
# incorrecta" y las dos rutas de rechazo sean indistinguibles también en
# tiempo, no solo en mensaje.
_DUMMY_PASSWORD_HASH = hash_password("dummy-password-for-timing-parity")


class AuthService:
    """Operaciones de negocio de auth, sobre una `AuthUoW` inyectada."""

    def __init__(self, uow: AuthUoW) -> None:
        self._uow = uow

    async def register(self, data: UserRegister) -> TokenResponse:
        hashed = await anyio.to_thread.run_sync(hash_password, data.password)

        async with self._uow as uow:
            user = await uow.users.create(data.email, hashed)

        settings = get_settings()
        expires_delta = timedelta(hours=settings.TOKEN_EXPIRE_HOURS)
        token = create_access_token({"sub": user.email}, expires_delta, settings)
        return TokenResponse(
            access_token=token,
            expires_in=int(expires_delta.total_seconds()),
        )

    async def login(self, data: UserLogin) -> TokenResponse:
        async with self._uow as uow:
            user = await uow.users.get_by_email(data.email)

        if user is None:
            # D-8: se paga el coste de una verificación igual, contra el
            # señuelo, para que este camino no retorne más rápido que el de
            # contraseña incorrecta. El resultado se descarta a propósito.
            await anyio.to_thread.run_sync(verify_password, data.password, _DUMMY_PASSWORD_HASH)
            raise InvalidCredentialsError()

        password_ok = await anyio.to_thread.run_sync(verify_password, data.password, user.hashed_password)
        if not password_ok:
            raise InvalidCredentialsError()

        settings = get_settings()
        expires_delta = timedelta(hours=settings.TOKEN_EXPIRE_HOURS)
        token = create_access_token({"sub": user.email}, expires_delta, settings)
        return TokenResponse(
            access_token=token,
            expires_in=int(expires_delta.total_seconds()),
        )
