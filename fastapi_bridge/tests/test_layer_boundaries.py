"""Tests de fronteras de import entre capas, vía `ast` (D-12, no requiere importar)."""

import ast
from pathlib import Path

import pytest

FASTAPI_BRIDGE_ROOT = Path(__file__).resolve().parent.parent

# Tabla única de reglas: directorio (relativo a fastapi_bridge/, recursivo con **)
# -> paquetes cuyo import está prohibido en ese directorio. Agregar una regla
# nueva en un change futuro es una línea acá (D-12 / 5.5).
LAYER_IMPORT_RULES: list[tuple[str, str]] = [
    ("repositories", "fastapi"),
    ("repositories", "passlib"),
    ("repositories", "bcrypt"),
    ("api", "sqlalchemy"),
    ("api", "httpx"),
    # CHANGE-05, 8.2: el router de auth compone `AuthService` por `Depends`
    # sin conocer las librerías de hashing/JWT que ese servicio usa
    # internamente. Mismas filas que ya existían para `services/`.
    ("api", "bcrypt"),
    ("api", "passlib"),
    ("api", "jose"),
    ("services", "sqlalchemy"),
    ("services", "httpx"),
    ("services", "bcrypt"),
    ("services", "passlib"),
    ("services", "jose"),
    ("schemas", "fastapi"),
    ("schemas", "sqlalchemy"),
    ("schemas", "httpx"),
]


def get_imported_top_level_modules(file_path: Path) -> set[str]:
    """Devuelve los nombres de módulo de nivel superior importados por `file_path`,
    cubriendo tanto `import x` como `from x import y`."""
    tree = ast.parse(file_path.read_text(encoding="utf-8"), filename=str(file_path))
    modules: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                modules.add(alias.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom):
            if node.module is not None:
                modules.add(node.module.split(".")[0])
    return modules


@pytest.mark.parametrize("directory, forbidden_package", LAYER_IMPORT_RULES)
def test_layer_respects_import_boundary(directory: str, forbidden_package: str):
    layer_dir = FASTAPI_BRIDGE_ROOT / directory
    for py_file in layer_dir.rglob("*.py"):
        imported = get_imported_top_level_modules(py_file)
        assert forbidden_package not in imported, (
            f"{py_file} importa '{forbidden_package}', prohibido en '{directory}/'"
        )


# CHANGE-07, 8.6: se evaluó agregar una fila `("exceptions", "starlette")` /
# `("exceptions", "fastapi")` a `LAYER_IMPORT_RULES` para anclar D-4
# estructuralmente (que `exceptions/domain.py` no importe el framework web).
# Se descarta: `LAYER_IMPORT_RULES` aplica por **directorio completo**, y
# `exceptions/handlers.py` -- en el mismo directorio -- SÍ debe importar
# `fastapi`/`starlette` (es la capa web de manejo de errores). Una regla de
# directorio rompería `handlers.py`, que es exactamente lo que no queremos.
# El ancla correcta ya existe, a nivel de módulo, en
# `test_domain_exceptions.py::test_domain_module_does_not_import_the_web_framework_or_persistence_stack`
# (verifica `domain.py` puntualmente, no todo `exceptions/`). Este test
# documenta la decisión y confirma la dirección permitida: `handlers.py`
# importa desde `domain.py` y desde `schemas/`, nunca al revés.


def test_handlers_module_imports_domain_and_schemas_not_the_other_way_around():
    handlers_path = FASTAPI_BRIDGE_ROOT / "exceptions" / "handlers.py"
    domain_path = FASTAPI_BRIDGE_ROOT / "exceptions" / "domain.py"
    error_schemas_path = FASTAPI_BRIDGE_ROOT / "schemas" / "error_schemas.py"

    handlers_source = handlers_path.read_text(encoding="utf-8")
    assert "from fastapi_bridge.exceptions.domain import" in handlers_source
    assert "from fastapi_bridge.schemas.error_schemas import" in handlers_source

    # y la dirección inversa no existe: ni domain.py ni error_schemas.py
    # importan nada de `exceptions.handlers` ni de `fastapi`/`starlette`.
    domain_imports = get_imported_top_level_modules(domain_path)
    schemas_imports = get_imported_top_level_modules(error_schemas_path)
    assert {"fastapi", "starlette"}.isdisjoint(domain_imports)
    assert {"fastapi", "starlette"}.isdisjoint(schemas_imports)


def test_helper_detects_a_forbidden_import(tmp_path):
    # Caso negativo: si el helper dejara de detectar imports, los tests de
    # frontera de arriba pasarían "por no detectar nada" — esto lo evita.
    offending_file = tmp_path / "offending_module.py"
    offending_file.write_text(
        "import fastapi\nfrom fastapi import Depends\n",
        encoding="utf-8",
    )
    imported = get_imported_top_level_modules(offending_file)
    assert "fastapi" in imported


# ---------------------------------------------------------------------------
# CHANGE-05, grupo 8 -- anclajes estructurales del router de auth (D-2, D-11)
# ---------------------------------------------------------------------------

AUTH_ROUTER_PATH = FASTAPI_BRIDGE_ROOT / "api" / "v1" / "auth" / "router.py"


def _parse(file_path: Path) -> ast.Module:
    return ast.parse(file_path.read_text(encoding="utf-8"), filename=str(file_path))


def test_auth_router_module_contains_no_try_and_builds_no_http_exception():
    # D-2: sin `try`/`except` y sin `HTTPException` construida a mano — las
    # dos formas concretas de "el router no captura errores de dominio". Un
    # change futuro que "arregle" el router agregando un `except` queda en
    # rojo acá.
    tree = _parse(AUTH_ROUTER_PATH)

    assert not any(isinstance(node, ast.Try) for node in ast.walk(tree))

    called_names = {
        node.func.id
        for node in ast.walk(tree)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
    }
    assert "HTTPException" not in called_names


def test_auth_router_module_has_no_logging_statements():
    # D-11: ningún handler de este módulo registra nada -- el único dato que
    # podría loguear es el email o la contraseña recibidos en texto plano.
    tree = _parse(AUTH_ROUTER_PATH)
    imported = get_imported_top_level_modules(AUTH_ROUTER_PATH)
    assert "logging" not in imported

    logging_calls = [
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and isinstance(node.func.value, ast.Name)
        and node.func.value.id in {"logging", "logger"}
    ]
    assert logging_calls == []


async def test_login_401_does_not_log_the_email_and_register_422_does_not_log_the_password(caplog):
    # D-11 desde el borde HTTP: ni el 401 de login ni el 422 de registro
    # dejan un registro que contenga el dato sensible correspondiente.
    import logging as logging_module

    import httpx

    from fastapi_bridge.main import create_app

    app = create_app()
    transport = httpx.ASGITransport(app=app)
    caplog.set_level(logging_module.DEBUG)

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        with caplog.at_level(logging_module.DEBUG):
            login_response = await client.post(
                "/api/v1/auth/login",
                json={"email": "must-not-be-logged@test.com", "password": "whatever-1"},
            )
            register_response = await client.post(
                "/api/v1/auth/register",
                json={"email": "another@test.com", "password": "short"},
            )

    assert login_response.status_code == 401
    assert register_response.status_code == 422
    for record in caplog.records:
        assert "must-not-be-logged@test.com" not in record.getMessage()
        assert "short" not in record.getMessage()


def test_auth_router_module_does_not_construct_its_own_service():
    # El router sólo declara la dependencia (`Depends(get_auth_service)`) --
    # no menciona ninguno de los símbolos con los que se compone el
    # servicio, que es exactamente lo que `core/dependencies.py` encapsula.
    source = AUTH_ROUTER_PATH.read_text(encoding="utf-8")
    for forbidden_symbol in ("AuthUoW", "get_session_factory", "Settings("):
        assert forbidden_symbol not in source


# ---------------------------------------------------------------------------
# CHANGE-06, grupo 7 -- anclajes estructurales de get_current_user (D-10, D-12)
# ---------------------------------------------------------------------------

DEPENDENCIES_PATH = FASTAPI_BRIDGE_ROOT / "core" / "dependencies.py"


def _get_current_user_function_def(tree: ast.Module) -> ast.AsyncFunctionDef:
    for node in ast.walk(tree):
        if isinstance(node, ast.AsyncFunctionDef) and node.name == "get_current_user":
            return node
    raise AssertionError("get_current_user no encontrado en core/dependencies.py")


def test_dependencies_module_does_not_import_jose_and_has_no_try():
    # 7.1: ancla de D-10 (sin captura de excepciones -- decode_access_token
    # nunca lanza) y D-12 (sin criptografía propia -- ninguna librería de JWT).
    tree = _parse(DEPENDENCIES_PATH)

    assert "jose" not in get_imported_top_level_modules(DEPENDENCIES_PATH)
    assert not any(isinstance(node, ast.Try) for node in ast.walk(tree))


def test_get_current_user_body_does_not_reference_persistence_symbols():
    # 7.2: el módulo sí importa get_session_factory (para get_auth_service),
    # así que el aserto es sobre el CUERPO de get_current_user, no sobre los
    # imports del archivo (D-5: sin sesión, Unit of Work ni repositorio).
    tree = _parse(DEPENDENCIES_PATH)
    function_def = _get_current_user_function_def(tree)

    referenced_names = {
        node.id for node in ast.walk(function_def) if isinstance(node, ast.Name)
    } | {
        node.attr for node in ast.walk(function_def) if isinstance(node, ast.Attribute)
    }
    forbidden = {"AuthUoW", "get_session_factory", "UserRepository", "session", "Session"}
    assert referenced_names.isdisjoint(forbidden)


def test_get_current_user_does_not_log_and_does_not_call_get_settings_in_its_body():
    # 7.3: ancla "sin registro del token" y "la configuración es un
    # parámetro inyectado" desde el código -- get_settings sólo se declara
    # por Depends(...) en la firma, nunca se invoca dentro del cuerpo.
    imported = get_imported_top_level_modules(DEPENDENCIES_PATH)
    assert "logging" not in imported

    tree = _parse(DEPENDENCIES_PATH)
    function_def = _get_current_user_function_def(tree)

    logging_calls = [
        node
        for node in ast.walk(function_def)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and isinstance(node.func.value, ast.Name)
        and node.func.value.id in {"logging", "logger"}
    ]
    assert logging_calls == []

    get_settings_calls = [
        node
        for node in ast.walk(function_def)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "get_settings"
    ]
    assert get_settings_calls == []


def test_get_current_user_body_has_no_string_literals_beyond_the_header_name():
    # 7.4: los dos `detail` y las dos formas del desafío son constantes de
    # módulo -- el cuerpo de la función no contiene ningún literal de string
    # propio más allá del nombre del header "WWW-Authenticate" (la clave del
    # dict de `headers=`), que no es información sensible ni un mensaje.
    tree = _parse(DEPENDENCIES_PATH)
    function_def = _get_current_user_function_def(tree)

    # El primer statement es el docstring: se excluye explícitamente, no es
    # parte del comportamiento en tiempo de ejecución.
    body_without_docstring = function_def.body[1:] if ast.get_docstring(function_def) else function_def.body

    string_literals = {
        node.value
        for statement in body_without_docstring
        for node in ast.walk(statement)
        if isinstance(node, ast.Constant) and isinstance(node.value, str)
    }
    assert string_literals <= {"WWW-Authenticate"}


# CHANGE-06, 7.5: se evaluó agregar `("core", "jose")` a `LAYER_IMPORT_RULES`
# para anclar D-12 con el mismo mecanismo que el resto de las fronteras. Se
# descarta por el mismo motivo ya documentado arriba (CHANGE-07, 8.6) para
# `exceptions/`: la regla aplica por **directorio completo y recursivo**, y
# `core/security.py` -- en el mismo directorio que `core/dependencies.py` --
# **debe** importar `jose`: es la superficie criptográfica del servicio. Una
# fila de directorio rompería `security.py`. El ancla correcta es la de
# arriba, a nivel de módulo puntual
# (`test_dependencies_module_does_not_import_jose_and_has_no_try`), que
# verifica `core/dependencies.py` sin tocar `core/security.py`.


async def test_get_auth_service_dependency_is_substitutable_by_the_route():
    # Lo que necesitan CHANGE-06 y CHANGE-12: `app.dependency_overrides` para
    # `get_auth_service` cambia efectivamente qué servicio usa la ruta.
    import httpx

    from fastapi_bridge.core.dependencies import get_auth_service
    from fastapi_bridge.main import create_app
    from fastapi_bridge.schemas.auth_schemas import TokenResponse, UserLogin, UserRegister

    class _Double:
        async def register(self, data: UserRegister) -> TokenResponse:
            return TokenResponse(access_token="double-token", expires_in=1)

        async def login(self, data: UserLogin) -> TokenResponse:
            return TokenResponse(access_token="double-token", expires_in=1)

    app = create_app()
    app.dependency_overrides[get_auth_service] = lambda: _Double()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/auth/register", json={"email": "double@test.com", "password": "a-valid-password"}
        )

    assert response.json()["access_token"] == "double-token"
