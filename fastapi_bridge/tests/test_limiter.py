"""Tests de `fastapi_bridge.core.limiter` — Limiter configurable (D-4, D-5, D-9, D-10)."""

import ast
import inspect

from slowapi import Limiter
from slowapi.util import get_remote_address

import fastapi_bridge.core.limiter as limiter_module
from fastapi_bridge.core.limiter import build_limiter, scan_limit_string, scan_rate_limit
from fastapi_bridge.core.settings import Settings


def _source_without_docstrings(module: object) -> str:
    # Igual que el patrón de `test_no_shared_db_impact.py`: comprobar sobre el
    # código (ast, sin docstrings) evita falsos positivos por prosa
    # explicativa en los docstrings del propio módulo.
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

    tree = ast.parse(inspect.getsource(module))
    stripped = DocstringStripper().visit(tree)
    return ast.unparse(stripped)


def test_scan_limit_string_matches_default_settings():
    # Settings() por defecto: RATE_LIMIT_REQUESTS=10, RATE_LIMIT_WINDOW=3600.
    assert scan_limit_string() == "10 per 3600 second"


def test_build_limiter_returns_a_limiter_instance():
    assert isinstance(build_limiter(), Limiter)


def test_scan_limit_string_reflects_substituted_settings(monkeypatch):
    monkeypatch.setattr(
        limiter_module,
        "get_settings",
        lambda: Settings(RATE_LIMIT_REQUESTS=2, RATE_LIMIT_WINDOW=60),
    )

    assert scan_limit_string() == "2 per 60 second"


def test_scan_limit_string_reads_settings_lazily_without_reimport(monkeypatch):
    # Escenario: cambiar Settings DESPUÉS de haber importado el módulo cambia
    # el resultado, sin volver a importar `fastapi_bridge.core.limiter` (D-5).
    monkeypatch.setattr(
        limiter_module,
        "get_settings",
        lambda: Settings(RATE_LIMIT_REQUESTS=5, RATE_LIMIT_WINDOW=120),
    )
    first_value = scan_limit_string()

    monkeypatch.setattr(
        limiter_module,
        "get_settings",
        lambda: Settings(RATE_LIMIT_REQUESTS=7, RATE_LIMIT_WINDOW=900),
    )
    second_value = scan_limit_string()

    assert first_value == "5 per 120 second"
    assert second_value == "7 per 900 second"
    assert first_value != second_value


def test_scan_rate_limit_is_a_reusable_callable_decorator():
    # Contrato de handoff hacia CHANGE-12: debe poder aplicarse sobre una
    # función de endpoint con una sola línea. slowapi exige un parámetro
    # `request` en la firma decorada (lo tendrá `POST /start` en CHANGE-12).
    from starlette.requests import Request

    assert callable(scan_rate_limit)

    @scan_rate_limit
    async def _dummy_endpoint(request: Request) -> dict[str, str]:
        return {"status": "ok"}

    assert callable(_dummy_endpoint)


def test_limiter_module_does_not_configure_default_limits_or_middleware():
    code = _source_without_docstrings(limiter_module)
    assert "default_limits" not in code
    assert "SlowAPIMiddleware" not in code


def test_limiter_key_func_is_get_remote_address_without_forwarded_headers():
    assert limiter_module.limiter._key_func is get_remote_address
    code = _source_without_docstrings(limiter_module)
    assert "X-Forwarded-For" not in code
    assert "X-Real-IP" not in code
