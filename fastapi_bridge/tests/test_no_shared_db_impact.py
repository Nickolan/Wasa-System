"""El servicio no escribe ni migra la base de datos compartida `db_fuzzing` (bridge-bootstrap).

Ver requirement "El servicio no escribe ni migra la base de datos compartida"
en `specs/bridge-bootstrap/spec.md` y DD-02 en `09_decisiones_y_supuestos.md`.

Se verifica sobre el CÓDIGO (ast, sin docstrings) y no sobre el texto crudo del
archivo: los docstrings de D-9 nombran explícitamente `scans`/`vulnerabilities`
como documentación de la restricción, y eso no debe contar como violación.

CHANGE-25 (dashboard-read-router, D-6) reescribe la garantía vieja ("cero
menciones a las tablas compartidas en todo el árbol de producción") por una
más precisa: "cero escrituras y cero mapeo ORM sobre esas tablas". La única
excepción es `repositories/dashboard_repository.py`, que lee (nunca escribe)
`scans`/`vulnerabilities` -- ver `SHARED_TABLE_REFERENCE_ALLOWLIST` abajo. El
resto del árbol de producción sigue sin poder mencionarlas.
"""

import ast
import re
from pathlib import Path

FASTAPI_BRIDGE_ROOT = Path(__file__).resolve().parent.parent

FORBIDDEN_TABLE_NAMES = ["scans", "vulnerabilities"]

# Módulos de nivel superior que abren infraestructura si se llaman a nivel de módulo.
MODULE_LEVEL_FORBIDDEN_CALLS = {"create_all", "create_async_engine"}

# CHANGE-25, D-6 punto 1 / R-6: archivos de producción autorizados a
# mencionar `scans`/`vulnerabilities`. Literal y explícito a propósito --
# ampliarlo sin revisión es exactamente el riesgo que R-6 documenta en
# `design.md`. Las garantías más fuertes (metadata declarativa, solo-lectura,
# sin interpolación, sin commit) no dependen de esta allowlist; viven en los
# tests de abajo.
#
# `schemas/dashboard_schemas.py` se agrega a la allowlist como DESVIACIÓN
# respecto de design.md D-6, descubierta durante la implementación (grupo 3):
# el requirement "Respuesta exitosa" de `dashboard-endpoint` exige que
# `DashboardResponse` tenga literalmente los campos `scans` y
# `vulnerabilities` (task 3.3) para que el JSON de salida tenga esas dos
# claves de primer nivel -- design.md no anticipó que ese nombre de campo
# colisionaría con el mismo regex de palabra completa que protege las
# referencias a las TABLAS. No es una referencia a la base de datos: el
# módulo no importa `sqlalchemy`, no ejecuta SQL, no abre conexión alguna
# (anclado por `test_layer_boundaries.py`, filas `("schemas", "sqlalchemy")`)
# -- es un nombre de clave JSON que coincide por completo con el nombre de la
# tabla, no una mención al esquema de la base compartida.
SHARED_TABLE_REFERENCE_ALLOWLIST = {
    Path("repositories") / "dashboard_repository.py",
    Path("schemas") / "dashboard_schemas.py",
}


def _production_python_files():
    for py_file in FASTAPI_BRIDGE_ROOT.rglob("*.py"):
        if "tests" in py_file.relative_to(FASTAPI_BRIDGE_ROOT).parts:
            continue
        if ".venv" in py_file.parts:
            continue
        yield py_file


def _strip_docstrings(tree: ast.Module) -> ast.AST:
    class DocstringStripper(ast.NodeTransformer):
        def _strip_leading_docstring(self, node):
            self.generic_visit(node)
            if (
                node.body
                and isinstance(node.body[0], ast.Expr)
                and isinstance(node.body[0].value, ast.Constant)
                and isinstance(node.body[0].value.value, str)
            ):
                node.body = node.body[1:]
            return node

        visit_Module = _strip_leading_docstring
        visit_ClassDef = _strip_leading_docstring
        visit_FunctionDef = _strip_leading_docstring
        visit_AsyncFunctionDef = _strip_leading_docstring

    return DocstringStripper().visit(tree)


def _production_code_without_docstrings(py_file: Path) -> str:
    tree = ast.parse(py_file.read_text(encoding="utf-8"), filename=str(py_file))
    stripped = _strip_docstrings(tree)
    return ast.unparse(stripped).lower()


def _referenced_forbidden_table(py_file: Path) -> str | None:
    """Nombre de la primera tabla prohibida referenciada en código (no
    docstring) de `py_file`, o `None` si no hay ninguna. Extraído a función
    para poder ejercitarlo en aislamiento (ver
    `test_referenced_forbidden_table_detects_a_mention_in_a_temp_file` /
    `..._ignores_docstrings`), sin depender de que el árbol de producción
    real tenga o no un archivo ofensor en un momento dado."""
    code_without_docstrings = _production_code_without_docstrings(py_file)
    for table_name in FORBIDDEN_TABLE_NAMES:
        # \b evita falsos positivos como `ScanService`/`scan_service`, cuyo
        # lower() ("scanservice") contiene "scans" como mero substring sin
        # ser una referencia a la tabla compartida.
        if re.search(rf"\b{table_name}\b", code_without_docstrings):
            return table_name
    return None


def test_no_reference_to_existing_shared_tables():
    for py_file in _production_python_files():
        relative_path = py_file.relative_to(FASTAPI_BRIDGE_ROOT)
        if relative_path in SHARED_TABLE_REFERENCE_ALLOWLIST:
            # CHANGE-25, D-6: única excepción autorizada -- ver comentario en
            # `SHARED_TABLE_REFERENCE_ALLOWLIST`. Sus propias garantías de
            # solo-lectura viven en `test_dashboard_repository_sql_is_read_only`
            # y `test_dashboard_repository_sql_is_not_built_by_interpolation`.
            continue
        offending_table = _referenced_forbidden_table(py_file)
        assert offending_table is None, (
            f"{py_file} referencia en código (no docstring) la tabla existente "
            f"'{offending_table}' — el Bridge no debe escribir ni mapear scans/vulnerabilities "
            "de db_fuzzing (excepción única: repositories/dashboard_repository.py, sólo lectura)"
        )


def test_allowlist_for_shared_table_references_has_exactly_the_two_known_entries():
    # R-6: ancla que la allowlist es un literal cerrado y explícito -- un
    # change futuro que la ensanche sin revisión deja este test en rojo. Los
    # dos elementos están documentados arriba: el repositorio (lee la base
    # real) y el schema de respuesta (nombra una clave JSON homónima, no
    # toca la base -- ver comentario extenso junto a la constante).
    assert SHARED_TABLE_REFERENCE_ALLOWLIST == {
        Path("repositories") / "dashboard_repository.py",
        Path("schemas") / "dashboard_schemas.py",
    }


def test_referenced_forbidden_table_detects_a_mention_in_a_temp_file(tmp_path):
    # 2.3: confirma que la detección de menciones sigue funcionando -- si el
    # helper dejara de detectar nada, `test_no_reference_to_existing_shared_tables`
    # pasaría por vacuidad para todo archivo fuera de la allowlist.
    offending_file = tmp_path / "offending_module.py"
    offending_file.write_text("QUERY = 'SELECT * FROM scans'\n", encoding="utf-8")
    assert _referenced_forbidden_table(offending_file) == "scans"


def test_referenced_forbidden_table_ignores_docstrings(tmp_path):
    clean_file = tmp_path / "clean_module.py"
    clean_file.write_text(
        '"""Este módulo documenta que no debe tocar scans/vulnerabilities."""\nX = 1\n',
        encoding="utf-8",
    )
    assert _referenced_forbidden_table(clean_file) is None


def test_shared_tables_are_not_in_the_declarative_metadata():
    # CHANGE-25, D-6 punto 2 / D-1: aserto en runtime, más fuerte que
    # cualquier análisis AST -- ninguna `Table` de `scans`/`vulnerabilities`
    # existe en el proceso, sin importar qué módulo se importe.
    import fastapi_bridge.main  # noqa: F401  -- importa el árbol de producción completo
    from fastapi_bridge.db.base import Base

    assert set(Base.metadata.tables) == {"users"}


DASHBOARD_REPOSITORY_PATH = FASTAPI_BRIDGE_ROOT / "repositories" / "dashboard_repository.py"
DASHBOARD_UOW_PATH = FASTAPI_BRIDGE_ROOT / "uow" / "dashboard_unit_of_work.py"

_FORBIDDEN_SQL_VERBS = ("insert", "update", "delete", "drop", "alter", "truncate", "create")
_SQL_KEYWORD_PATTERN = re.compile(
    r"\b(select|insert|update|delete|drop|alter|truncate|create)\b", re.IGNORECASE
)


def _string_literals(py_file: Path) -> list[str]:
    tree = ast.parse(py_file.read_text(encoding="utf-8"), filename=str(py_file))
    return [
        node.value
        for node in ast.walk(tree)
        if isinstance(node, ast.Constant) and isinstance(node.value, str)
    ]


def _sql_like_literals(literals: list[str]) -> list[str]:
    return [literal for literal in literals if _SQL_KEYWORD_PATTERN.search(literal)]


def test_dashboard_repository_sql_is_read_only():
    # CHANGE-25, D-6 punto 3 / D-1: todo literal que "parece SQL" (contiene
    # alguna palabra clave del lenguaje) empieza por SELECT y no contiene
    # ningún verbo de escritura ni de DDL.
    assert DASHBOARD_REPOSITORY_PATH.exists(), (
        "repositories/dashboard_repository.py debe existir (grupo 4 de tasks.md)"
    )
    literals = _string_literals(DASHBOARD_REPOSITORY_PATH)
    sql_literals = _sql_like_literals(literals)
    assert sql_literals, "no se encontró ningún literal SQL en dashboard_repository.py"
    for literal in sql_literals:
        assert literal.strip().upper().startswith("SELECT"), (
            f"literal SQL no empieza por SELECT: {literal!r}"
        )
        for verb in _FORBIDDEN_SQL_VERBS:
            assert not re.search(rf"\b{verb}\b", literal, re.IGNORECASE), (
                f"literal SQL contiene el verbo de escritura {verb!r}: {literal!r}"
            )


def test_dashboard_repository_sql_is_not_built_by_interpolation():
    # CHANGE-25, D-6 punto 4 / D-1: sin f-strings, sin `%`/`+` sobre texto,
    # sin `.format(` en todo el módulo del repositorio.
    assert DASHBOARD_REPOSITORY_PATH.exists(), (
        "repositories/dashboard_repository.py debe existir (grupo 4 de tasks.md)"
    )
    tree = ast.parse(DASHBOARD_REPOSITORY_PATH.read_text(encoding="utf-8"), filename=str(DASHBOARD_REPOSITORY_PATH))

    assert not any(isinstance(node, ast.JoinedStr) for node in ast.walk(tree)), (
        "dashboard_repository.py usa un f-string -- el SQL debe armarse sólo con fragmentos constantes"
    )

    format_calls = [
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "format"
    ]
    assert format_calls == [], "dashboard_repository.py usa .format( sobre texto SQL"

    def _is_string_constant(node: ast.AST) -> bool:
        return isinstance(node, ast.Constant) and isinstance(node.value, str)

    for node in ast.walk(tree):
        if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Mod, ast.Add)):
            assert not (_is_string_constant(node.left) or _is_string_constant(node.right)), (
                "dashboard_repository.py concatena/interpola texto con %/+ -- los valores deben "
                "viajar como parámetros ligados, nunca como texto SQL"
            )


def test_dashboard_uow_never_commits():
    # CHANGE-25, D-6 punto 5 / D-4: ninguna llamada a un atributo `commit`
    # en `uow/dashboard_unit_of_work.py` -- `__aexit__` sólo puede `rollback`.
    assert DASHBOARD_UOW_PATH.exists(), "uow/dashboard_unit_of_work.py debe existir (grupo 4 de tasks.md)"
    tree = ast.parse(DASHBOARD_UOW_PATH.read_text(encoding="utf-8"), filename=str(DASHBOARD_UOW_PATH))
    commit_calls = [node for node in ast.walk(tree) if isinstance(node, ast.Attribute) and node.attr == "commit"]
    assert commit_calls == [], "dashboard_unit_of_work.py referencia 'commit' -- la UoW de dashboard nunca confirma"


def _has_module_level_forbidden_call(py_file: Path) -> str | None:
    tree = ast.parse(py_file.read_text(encoding="utf-8"), filename=str(py_file))
    for node in tree.body:  # sólo statements de nivel superior del módulo
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            # El cuerpo de una función/clase no se ejecuta al importar el módulo.
            continue
        for call_node in ast.walk(node):
            if isinstance(call_node, ast.Call):
                func = call_node.func
                name = func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", None)
                if name in MODULE_LEVEL_FORBIDDEN_CALLS:
                    return name
    return None


def test_no_module_level_create_all_or_create_engine():
    for py_file in _production_python_files():
        offending_call = _has_module_level_forbidden_call(py_file)
        assert offending_call is None, (
            f"{py_file} ejecuta '{offending_call}' a nivel de módulo — abriría "
            "conexión/DDL en el import, prohibido en este change"
        )


def _uses_os_environ_access(py_file: Path) -> bool:
    tree = ast.parse(py_file.read_text(encoding="utf-8"), filename=str(py_file))
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute) and node.attr == "environ":
            return True
        if isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Attribute) and func.attr == "getenv":
                return True
            if isinstance(func, ast.Name) and func.id == "getenv":
                return True
    return False


def test_only_settings_module_reads_os_environ():
    settings_module = FASTAPI_BRIDGE_ROOT / "core" / "settings.py"
    for py_file in _production_python_files():
        if py_file == settings_module:
            continue
        assert not _uses_os_environ_access(py_file), (
            f"{py_file} usa os.environ/os.getenv directamente — toda config debe "
            "pasar por core/settings.py (regla dura del proyecto)"
        )


async def test_lifespan_cycle_only_opens_connection_to_create_users_table(
    monkeypatch, fake_engine_factory
):
    # D-9: la garantía vieja ("el lifespan no abre conexión") se vuelve falsa
    # a propósito en CHANGE-01 — DD-02 exige que `users` viva en `db_fuzzing`.
    # La garantía nueva y más fuerte: el lifespan abre conexión ÚNICAMENTE
    # para crear `users`, con el DDL acotado explícitamente a esa tabla — no
    # a `Base.metadata.create_all()` a secas. Se verifica con un doble del
    # engine (D-8 punto 3), sin conectar contra PostgreSQL real.
    from fastapi_bridge.db.base import Base
    from fastapi_bridge.db.models import User

    fake_engine = fake_engine_factory()
    monkeypatch.setattr("fastapi_bridge.main.get_engine", lambda settings: fake_engine)

    from fastapi_bridge.main import app

    async with app.router.lifespan_context(app):
        pass

    assert len(fake_engine.connection.run_sync_calls) == 1
    fn, kwargs = fake_engine.connection.run_sync_calls[0]
    assert fn.__self__ is Base.metadata
    assert fn.__func__ is Base.metadata.create_all.__func__
    assert kwargs == {"tables": [User.__table__]}
