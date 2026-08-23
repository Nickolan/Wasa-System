"""Tests de `get_auth_service` (CHANGE-05, D-1/D-8) — composición del
`AuthService` por `Depends`, sin HTTP de por medio.

Grupo 3 de `openspec/changes/auth-router/tasks.md`. Ejercita la dependencia
directamente, como una función Python común (`Depends(...)` sólo fija el
valor por defecto del parámetro; nada impide invocarla a mano pasando
`settings` explícito), antes de que exista cualquier ruta HTTP que la use.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import async_sessionmaker

from fastapi_bridge.core.dependencies import get_auth_service
from fastapi_bridge.core.settings import Settings
from fastapi_bridge.db.session import get_session_factory
from fastapi_bridge.schemas.auth_schemas import UserLogin, UserRegister
from fastapi_bridge.services.auth_service import AuthService
from fastapi_bridge.uow.auth_unit_of_work import AuthUoW


def test_get_auth_service_returns_an_auth_service_instance():
    settings = Settings()
    service = get_auth_service(settings)
    assert isinstance(service, AuthService)


def test_get_auth_service_returns_a_new_instance_on_each_call():
    # D-8: una instancia de AuthService por petición, no un singleton.
    settings = Settings()
    first = get_auth_service(settings)
    second = get_auth_service(settings)
    assert first is not second
    # Construirla no dispara I/O: get_session_factory está cacheada por
    # DB_URL, así que ninguna de las dos invocaciones abre una conexión.
    assert isinstance(first._uow, AuthUoW)
    assert isinstance(second._uow, AuthUoW)


def test_get_auth_service_uses_the_session_factory_for_the_settings_passed_in():
    # La configuración llega por el parámetro `settings`, no por lectura
    # directa de un cache global fijo: dos Settings con distinto DB_URL
    # producen servicios ligados a factories distintas (identidad de la
    # factory cacheada por get_session_factory, D-7 de db/session.py).
    settings_a = Settings(DB_URL="sqlite+aiosqlite:///./does-not-exist-a.db")
    settings_b = Settings(DB_URL="sqlite+aiosqlite:///./does-not-exist-b.db")

    service_a = get_auth_service(settings_a)
    service_b = get_auth_service(settings_b)

    factory_a = get_session_factory(settings_a)
    factory_b = get_session_factory(settings_b)

    assert isinstance(factory_a, async_sessionmaker)
    assert factory_a is not factory_b
    assert service_a._uow._session_factory is factory_a
    assert service_b._uow._session_factory is factory_b


async def test_auth_service_built_like_get_auth_service_does_is_functional_end_to_end(user_session_factory):
    # Confirma que la composición AuthService(AuthUoW(session_factory)) -- la
    # misma que arma get_auth_service -- es funcional de punta a punta antes
    # de agregarle transporte HTTP encima. Se usa la fixture SQLite en vez de
    # get_session_factory(settings) para no depender de db_fuzzing.
    service = AuthService(AuthUoW(user_session_factory))

    register_data = UserRegister(email="triangulate@test.com", password="a-valid-password")
    register_token = await service.register(register_data)
    assert register_token.access_token

    login_data = UserLogin(email="triangulate@test.com", password="a-valid-password")
    login_token = await service.login(login_data)
    assert login_token.access_token
