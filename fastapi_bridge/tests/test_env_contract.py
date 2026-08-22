"""Tests de contrato de configuración (runtime-configuration, D-7).

Verifica el CONTRATO de `.env.example` frente a `Settings`, nunca valores
reales:
- Paridad: las claves de `.env.example` son exactamente los campos de `Settings`.
- Cargabilidad: los placeholders de `.env.example` coercen a los tipos declarados.
- Ignorado: los `.env` reales no están trackeados por git.
- Versionado: los `.env.example` sí están trackeados por git.

Ningún test de este módulo assertea un valor real de credencial (D-7): sólo
nombres de claves, tipos y estado de git.

Los tests que dependen de que `.env.example` exista en disco se saltean
(`skip`, no `fail`) cuando el archivo todavía no fue pegado a mano por el
usuario (D-6: los permisos del agente deniegan escritura sobre rutas
`.env*`). Una vez pegado el archivo, correr la suite de nuevo confirma la
paridad real.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from fastapi_bridge.core.settings import Settings

FASTAPI_BRIDGE_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = FASTAPI_BRIDGE_ROOT.parent
BACKEND_ENV_EXAMPLE = FASTAPI_BRIDGE_ROOT / ".env.example"
FRONTEND_ENV_EXAMPLE = REPO_ROOT / "wasa-landing" / ".env.example"
BACKEND_ENV = FASTAPI_BRIDGE_ROOT / ".env"
FRONTEND_ENV = REPO_ROOT / "wasa-landing" / ".env"


def _parse_env_file_keys(path: Path) -> set[str]:
    keys: set[str] = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, _, _ = stripped.partition("=")
        keys.add(key.strip())
    return keys


@pytest.mark.skipif(
    not BACKEND_ENV_EXAMPLE.is_file(),
    reason="fastapi_bridge/.env.example no existe todavía en este checkout (CHANGE-00c, D-6)",
)
def test_env_example_keys_match_settings_fields_exactly():
    example_keys = _parse_env_file_keys(BACKEND_ENV_EXAMPLE)
    settings_fields = set(Settings.model_fields.keys())
    assert example_keys == settings_fields, (
        f"desincronizado: en .env.example y no en Settings: {example_keys - settings_fields}; "
        f"en Settings y no en .env.example: {settings_fields - example_keys}"
    )


@pytest.mark.skipif(
    not BACKEND_ENV_EXAMPLE.is_file(),
    reason="fastapi_bridge/.env.example no existe todavía en este checkout (CHANGE-00c, D-6)",
)
def test_env_example_is_loadable_and_coerces_declared_types():
    settings = Settings(_env_file=BACKEND_ENV_EXAMPLE)
    assert isinstance(settings.TOKEN_EXPIRE_HOURS, int)
    assert isinstance(settings.RATE_LIMIT_REQUESTS, int)
    assert isinstance(settings.RATE_LIMIT_WINDOW, int)
    assert isinstance(settings.CORS_ORIGINS, list)
    assert isinstance(settings.APP_ENV, str)


def _is_git_ignored(path: Path) -> bool:
    result = subprocess.run(
        ["git", "check-ignore", "-q", str(path)],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )
    return result.returncode == 0


def _tracked_files(*paths: Path) -> list[str]:
    result = subprocess.run(
        ["git", "ls-files", *[str(p) for p in paths]],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    return [line.strip().replace("\\", "/") for line in result.stdout.splitlines() if line.strip()]


@pytest.mark.parametrize("real_env_path", [BACKEND_ENV, FRONTEND_ENV])
def test_real_env_files_are_git_ignored(real_env_path: Path):
    assert _is_git_ignored(real_env_path), f"{real_env_path} no está cubierto por .gitignore"


def test_real_env_files_are_never_tracked_by_git():
    tracked = _tracked_files(BACKEND_ENV, FRONTEND_ENV)
    assert tracked == [], f".env real trackeado por git: {tracked}"


@pytest.mark.skipif(
    not (BACKEND_ENV_EXAMPLE.is_file() and FRONTEND_ENV_EXAMPLE.is_file()),
    reason="los .env.example todavía no existen en este checkout (CHANGE-00c, D-6)",
)
def test_env_example_files_are_tracked_by_git():
    tracked = _tracked_files(BACKEND_ENV_EXAMPLE, FRONTEND_ENV_EXAMPLE)
    assert str(BACKEND_ENV_EXAMPLE.relative_to(REPO_ROOT)).replace("\\", "/") in tracked
    assert str(FRONTEND_ENV_EXAMPLE.relative_to(REPO_ROOT)).replace("\\", "/") in tracked
