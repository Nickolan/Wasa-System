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
