"""Tests de la topología de capas del backend (bridge-bootstrap, D-9).

Verifica que el árbol de directorios de `knowledge-base/08_arquitectura_propuesta.md`
existe materializado en el filesystem como paquetes Python importables.
"""

import importlib
from pathlib import Path

import pytest

FASTAPI_BRIDGE_ROOT = Path(__file__).resolve().parent.parent

# Los 18 módulos del árbol de la KB, relativos a fastapi_bridge/.
EXPECTED_MODULES = [
    "main.py",
    "core/settings.py",
    "core/security.py",
    "core/dependencies.py",
    "db/base.py",
    "db/session.py",
    "db/models.py",
    "api/v1/auth/router.py",
    "api/v1/scan/router.py",
    "services/auth_service.py",
    "services/scan_service.py",
    "uow/auth_unit_of_work.py",
    "uow/scan_unit_of_work.py",
    "repositories/user_repository.py",
    "repositories/n8n_repository.py",
    "schemas/auth_schemas.py",
    "schemas/scan_schemas.py",
    "exceptions/handlers.py",
]

# Dotted module paths equivalentes, para el test de importabilidad (4.5).
EXPECTED_DOTTED_MODULES = [
    "fastapi_bridge." + module.removesuffix(".py").replace("/", ".") for module in EXPECTED_MODULES
]


@pytest.mark.parametrize("relative_path", EXPECTED_MODULES)
def test_expected_module_file_exists(relative_path: str):
    assert (FASTAPI_BRIDGE_ROOT / relative_path).is_file(), f"falta {relative_path}"


@pytest.mark.parametrize("dotted_module", EXPECTED_DOTTED_MODULES)
def test_expected_module_is_importable(dotted_module: str):
    # Confirma que cada nivel del árbol tiene su __init__.py: si faltara alguno,
    # el import fallaría con ModuleNotFoundError.
    importlib.import_module(dotted_module)


# Capas que tienen módulos por dominio: prefijo del módulo -> {auth, scan}.
DOMAIN_LAYERS = {
    "api/v1/{domain}/router.py": ["auth", "scan"],
    "services/{domain}_service.py": ["auth", "scan"],
    "uow/{domain}_unit_of_work.py": ["auth", "scan"],
    "schemas/{domain}_schemas.py": ["auth", "scan"],
}


@pytest.mark.parametrize("template", DOMAIN_LAYERS)
def test_domain_layer_has_both_auth_and_scan_counterparts(template: str):
    for domain in DOMAIN_LAYERS[template]:
        relative_path = template.format(domain=domain)
        assert (FASTAPI_BRIDGE_ROOT / relative_path).is_file(), (
            f"la capa '{template}' no tiene su contraparte de dominio '{domain}' ({relative_path})"
        )
