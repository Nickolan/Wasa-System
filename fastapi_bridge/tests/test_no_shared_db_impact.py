"""El scaffold no toca la base de datos compartida `db_fuzzing` (bridge-bootstrap).

Ver requirement "El scaffold no toca la base de datos compartida" en
`specs/bridge-bootstrap/spec.md` y DD-02 en `09_decisiones_y_supuestos.md`.

Se verifica sobre el CÓDIGO (ast, sin docstrings) y no sobre el texto crudo del
archivo: los docstrings de D-9 nombran explícitamente `scans`/`vulnerabilities`
como documentación de la restricción, y eso no debe contar como violación.
"""

import ast
from pathlib import Path

FASTAPI_BRIDGE_ROOT = Path(__file__).resolve().parent.parent

FORBIDDEN_TABLE_NAMES = ["scans", "vulnerabilities"]

# Módulos de nivel superior que abren infraestructura si se llaman a nivel de módulo.
MODULE_LEVEL_FORBIDDEN_CALLS = {"create_all", "create_async_engine"}


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


def test_no_reference_to_existing_shared_tables():
    for py_file in _production_python_files():
        code_without_docstrings = _production_code_without_docstrings(py_file)
        for table_name in FORBIDDEN_TABLE_NAMES:
            assert table_name not in code_without_docstrings, (
                f"{py_file} referencia en código (no docstring) la tabla existente "
                f"'{table_name}' — el Bridge no debe tocar scans/vulnerabilities de db_fuzzing"
            )


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


async def test_lifespan_cycle_opens_no_network_or_db_connection():
    # Con PostgreSQL y n8n inaccesibles, importar fastapi_bridge.main y correr
    # el ciclo completo de lifespan (startup + shutdown) no debe lanzar ninguna
    # excepción de conexión — el hook está vacío por diseño (D-10).
    from fastapi_bridge.main import app

    async with app.router.lifespan_context(app):
        pass
