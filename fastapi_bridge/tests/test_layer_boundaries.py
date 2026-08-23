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
    ("repositories", "starlette"),
    ("repositories", "slowapi"),
    ("api", "sqlalchemy"),
    ("api", "httpx"),
    ("services", "sqlalchemy"),
    ("services", "httpx"),
    ("uow", "fastapi"),
    ("uow", "starlette"),
    ("uow", "slowapi"),
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
