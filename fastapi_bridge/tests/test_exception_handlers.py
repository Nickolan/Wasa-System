"""Tests de despacho de los handlers globales RFC 7807 (CHANGE-07, D-9).

Ejercita los handlers de punta a punta contra una app de **prueba** propia,
con rutas que fallan a propósito — no contra la app de producción, que hasta
CHANGE-05 no expone ningún endpoint capaz de producir un 409, un 401 o un 422
de body (D-9, restricción 7 de `design.md`). Verifica el **despacho real**:
que Starlette elige el manejador correcto para cada tipo de excepción, no
solo que cada manejador produce el cuerpo esperado cuando se lo invoca a
mano (eso ya lo cubre `test_problem_details.py`).

`TestClient(app, raise_server_exceptions=False)`: con el valor por defecto,
`TestClient` **re-lanza** la excepción original en vez de devolver la
respuesta que produjo el handler (H-6, verificado en este repo). Un test
escrito con el default verificaría el comportamiento de `TestClient`, no el
del handler — por eso todas las instancias de este archivo lo desactivan.
"""

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field

# `starlette.exceptions.HTTPException` (no `fastapi.HTTPException`) es la
# clase sobre la que se registra el handler (D-3, H-2): los 404/405 que
# genera el propio router de Starlette son de la clase base, y registrar
# sobre la subclase de FastAPI los deja afuera. Alias explícito para que la
# elección de clase sea visible.
from starlette.exceptions import HTTPException as StarletteHTTPException

from fastapi_bridge.exceptions.domain import EmailAlreadyExistsError, InvalidCredentialsError


class _ValidateBody(BaseModel):
    email: str
    password: str = Field(min_length=8)


def _build_app() -> FastAPI:
    from fastapi_bridge.exceptions.domain import DomainError
    from fastapi_bridge.exceptions.handlers import (
        domain_error_handler,
        http_exception_handler,
        request_validation_exception_handler,
        unhandled_exception_handler,
    )

    app = FastAPI()
    app.add_exception_handler(RequestValidationError, request_validation_exception_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(DomainError, domain_error_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)

    @app.post("/validate")
    def validate(body: _ValidateBody) -> dict:
        return {"ok": True}

    @app.get("/ok")
    def ok() -> dict:
        return {"ok": True}

    @app.get("/challenge")
    def challenge() -> dict:
        raise HTTPException(401, detail="No autenticado", headers={"WWW-Authenticate": "Bearer"})

    @app.get("/forbidden")
    def forbidden() -> dict:
        raise HTTPException(403)

    @app.get("/content-type-override")
    def content_type_override() -> dict:
        raise HTTPException(400, headers={"Content-Type": "text/plain"})

    @app.get("/conflict")
    def conflict(email: str = "dup@b.com") -> dict:
        from fastapi_bridge.exceptions.domain import EmailAlreadyExistsError

        raise EmailAlreadyExistsError(email)

    @app.get("/invalid")
    def invalid(email: str = "someone@b.com") -> dict:
        from fastapi_bridge.exceptions.domain import InvalidCredentialsError

        raise InvalidCredentialsError()

    @app.get("/boom")
    def boom() -> dict:
        raise RuntimeError("MARCADOR-INTERNO-XYZ users.email_key SELECT * FROM users")

    @app.get("/boom-other")
    def boom_other() -> dict:
        raise ValueError("MARCADOR-INTERNO-XYZ users.email_key SELECT * FROM users")

    return app


def _client(app: FastAPI | None = None) -> TestClient:
    return TestClient(app or _build_app(), raise_server_exceptions=False)


def test_request_validation_exception_handler_is_importable_and_registered():
    client = _client()

    response = client.post("/validate", json={"email": "a@b.com", "password": "short"})

    assert response.status_code == 422
    body = response.json()
    assert set(body.keys()) == {"type", "title", "status", "detail", "instance"}
    assert body["status"] == 422
    assert response.headers["content-type"] == "application/problem+json"


def test_validation_error_body_never_leaks_the_password_the_user_typed():
    # D-7 / H-1 — el test más importante del change. `exc.errors()` de
    # Pydantic v2 trae el valor de entrada en `input`: para un campo
    # `password` que falla su longitud mínima, ese valor es la contraseña
    # en texto plano que el usuario tipeó (RN-WS-12). Serializar
    # `exc.errors()` tal cual —el patrón que copia y pega media
    # documentación informal de FastAPI— la publica en el cuerpo del 422.
    # El ancla es un string exacto y reconocible, no una aserción genérica
    # sobre la clave "input".
    reconocible = "corta-y-secreta"
    client = _client()

    response = client.post("/validate", json={"email": "a@b.com", "password": reconocible})

    assert reconocible not in response.text


def test_validation_error_detail_names_the_failing_field():
    client = _client()

    response = client.post("/validate", json={"email": "a@b.com", "password": "short"})

    body = response.json()
    assert "password" in body["detail"]


# --- `_format_validation_detail` como función pura (3.6) ---


def test_format_validation_detail_single_error():
    from fastapi_bridge.exceptions.handlers import _format_validation_detail

    detail = _format_validation_detail(
        [{"loc": ["body", "password"], "msg": "String should have at least 8 characters"}]
    )
    assert detail == "password: String should have at least 8 characters"


def test_format_validation_detail_two_errors_both_appear():
    from fastapi_bridge.exceptions.handlers import _format_validation_detail

    detail = _format_validation_detail(
        [
            {"loc": ["body", "email"], "msg": "value is not a valid email address"},
            {"loc": ["body", "password"], "msg": "String should have at least 8 characters"},
        ]
    )
    assert "email: value is not a valid email address" in detail
    assert "password: String should have at least 8 characters" in detail


def test_format_validation_detail_loc_is_only_the_body_prefix():
    from fastapi_bridge.exceptions.handlers import _format_validation_detail

    detail = _format_validation_detail([{"loc": ["body"], "msg": "field required"}])
    assert detail == "field required"


def test_format_validation_detail_nested_loc_joins_with_dots():
    from fastapi_bridge.exceptions.handlers import _format_validation_detail

    detail = _format_validation_detail(
        [{"loc": ["body", "user", "email"], "msg": "value is not a valid email address"}]
    )
    assert detail == "user.email: value is not a valid email address"


# --- 400 para cuerpo no parseable, 422 para violación de schema (D-2, H-5) ---


def test_malformed_json_body_returns_400_not_422():
    client = _client()

    response = client.post(
        "/validate",
        content=b"{not json",
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 400
    body = response.json()
    assert body["status"] == 400


def test_malformed_json_detail_does_not_contain_a_fake_field_name():
    # H-5: el `loc` de `json_invalid` es `["body", 1]` -- un desplazamiento
    # de caracter, no un nombre de campo. El detalle no debe inventar
    # "body.1" ni ".1" como si fuera un campo.
    client = _client()

    response = client.post(
        "/validate",
        content=b"{not json",
        headers={"Content-Type": "application/json"},
    )

    body = response.json()
    assert "body.1" not in body["detail"]
    assert ".1" not in body["detail"]


def test_missing_required_field_is_422():
    client = _client()

    response = client.post("/validate", json={"password": "longenough"})

    assert response.status_code == 422


def test_wrong_type_field_is_422():
    client = _client()

    response = client.post("/validate", json={"email": "a@b.com", "password": 12345678})

    assert response.status_code == 422


def test_two_invalid_fields_both_named_in_detail():
    client = _client()

    response = client.post("/validate", json={"email": 123, "password": "short"})

    assert response.status_code == 422
    body = response.json()
    assert "email" in body["detail"]
    assert "password" in body["detail"]


def test_validation_error_response_has_exact_rfc7807_shape():
    client = _client()

    response = client.post("/validate", json={"email": "a@b.com", "password": "short"})

    assert response.headers["content-type"] == "application/problem+json"
    body = response.json()
    assert set(body.keys()) == {"type", "title", "status", "detail", "instance"}
    assert body["status"] == response.status_code
    assert body["instance"] == "/validate"


def test_validation_error_body_never_exposes_the_constraint_context():
    # "El contexto interno de la restricción no se expone": el nombre de la
    # restricción violada (`min_length`, el nombre de la clave que Pydantic
    # usa en `ctx`) no debe aparecer en el cuerpo. `msg` sí puede mencionar
    # el número en prosa ("at least 8 characters") -- D-7 excluye `ctx`, no
    # el texto legible de `msg`.
    client = _client()

    response = client.post("/validate", json={"email": "a@b.com", "password": "short"})

    assert "min_length" not in response.text
    body = response.json()
    assert "ctx" not in body


# ---------------------------------------------------------------------------
# Grupo 4 — Handler de excepciones HTTP: la clase base y los headers (D-3)
# ---------------------------------------------------------------------------


def test_http_exception_challenge_returns_401_problem_detail_with_its_message():
    client = _client()

    response = client.get("/challenge")

    assert response.status_code == 401
    body = response.json()
    assert body["detail"] == "No autenticado"
    assert set(body.keys()) == {"type", "title", "status", "detail", "instance"}


def test_route_not_found_returns_rfc7807_body_not_the_default_shape():
    # H-2: registrar sobre `starlette.exceptions.HTTPException` (y no sobre
    # `fastapi.HTTPException`) es lo único que hace que este 404 -generado
    # por el router de Starlette, no por código de la aplicación- pase por
    # el handler. Si alguien "corrige" el import a la clase de FastAPI, este
    # test es el que se pone rojo.
    client = _client()

    response = client.get("/no-existe")

    assert response.status_code == 404
    body = response.json()
    assert set(body.keys()) == {"type", "title", "status", "detail", "instance"}
    assert body != {"detail": "Not Found"}


def test_method_not_allowed_returns_rfc7807_body():
    client = _client()

    response = client.post("/ok")

    assert response.status_code == 405
    body = response.json()
    assert set(body.keys()) == {"type", "title", "status", "detail", "instance"}


def test_www_authenticate_header_survives_the_translation():
    # H-3: `exc.headers` llega al handler pero se descarta si nadie lo
    # copia. Es el mecanismo del que depende CHANGE-06 -- un 401 sin este
    # header incumple RFC 7235.
    client = _client()

    response = client.get("/challenge")

    assert response.headers["www-authenticate"] == "Bearer"


def test_exception_headers_cannot_override_the_problem_json_content_type():
    client = _client()

    response = client.get("/content-type-override")

    assert response.headers["content-type"] == "application/problem+json"


def test_http_exception_without_headers_does_not_break_the_handler():
    client = _client()

    response = client.get("/forbidden")

    assert response.status_code == 403
    body = response.json()
    assert body["title"] == "Forbidden"


def test_title_derives_from_the_http_status_phrase_for_several_codes():
    client = _client()

    not_found = client.get("/no-existe")
    method_not_allowed = client.post("/ok")
    forbidden = client.get("/forbidden")

    assert not_found.json()["title"] == "Not Found"
    assert method_not_allowed.json()["title"] == "Method Not Allowed"
    assert forbidden.json()["title"] == "Forbidden"


def test_generic_http_exception_uses_about_blank_type():
    client = _client()

    for path, method in [("/no-existe", "get"), ("/forbidden", "get")]:
        response = getattr(client, method)(path)
        assert response.json()["type"] == "about:blank"


# ---------------------------------------------------------------------------
# Grupo 5 — Handler de errores de dominio: un handler, una tabla (D-4)
# ---------------------------------------------------------------------------


def test_email_already_exists_error_returns_409():
    client = _client()

    response = client.get("/conflict")

    assert response.status_code == 409
    body = response.json()
    assert set(body.keys()) == {"type", "title", "status", "detail", "instance"}


def test_invalid_credentials_error_returns_401():
    client = _client()

    response = client.get("/invalid")

    assert response.status_code == 401
    body = response.json()
    assert set(body.keys()) == {"type", "title", "status", "detail", "instance"}


def test_conflict_detail_identifies_the_duplicate_email():
    client = _client()

    response = client.get("/conflict", params={"email": "dup@b.com"})

    assert "dup@b.com" in response.json()["detail"]


def test_domain_error_handler_does_not_query_the_database():
    # Verificación estructural: el handler compone el `detail` del 409
    # exclusivamente desde `exc.email` -- no hay ningún import de la capa de
    # persistencia en el módulo de handlers.
    import ast
    from pathlib import Path

    handlers_path = Path(__file__).resolve().parent.parent / "exceptions" / "handlers.py"
    tree = ast.parse(handlers_path.read_text(encoding="utf-8"))
    imported_modules = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported_modules.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported_modules.add(node.module.split(".")[0])
    assert "sqlalchemy" not in imported_modules
    assert "asyncpg" not in imported_modules


def test_invalid_credentials_body_never_contains_an_email():
    # D-4 -- ancla anti-enumeración: el 401 no debe contener el email
    # consultado por ninguna vía, y su `detail` debe ser un literal fijo.
    client = _client()

    response = client.get("/invalid", params={"email": "someone@b.com"})

    assert "someone@b.com" not in response.text
    assert "@" not in response.json()["detail"]


def test_nonexistent_email_and_wrong_password_are_indistinguishable():
    # Dos intentos de login -- uno con un email no registrado, otro con un
    # email registrado y contraseña incorrecta -- llegan al mismo
    # `InvalidCredentialsError`. El cuerpo debe ser idéntico salvo `instance`.
    client = _client()

    first = client.get("/invalid", params={"email": "no-existe@b.com"})
    second = client.get("/invalid", params={"email": "existe@b.com"})

    first_body, second_body = first.json(), second.json()
    assert first_body["status"] == second_body["status"]
    assert first_body["title"] == second_body["title"]
    assert first_body["type"] == second_body["type"]
    assert first_body["detail"] == second_body["detail"]


def test_unmapped_domain_error_falls_back_to_500_not_an_invented_400():
    from fastapi_bridge.exceptions.domain import DomainError

    app = _build_app()

    class _UnmappedDomainError(DomainError):
        """Subclase de dominio local, deliberadamente sin fila en la tabla."""

    @app.get("/unmapped")
    def unmapped() -> dict:
        raise _UnmappedDomainError("no mapeada")

    client = _client(app)

    response = client.get("/unmapped")

    assert response.status_code == 500
    body = response.json()
    assert set(body.keys()) == {"type", "title", "status", "detail", "instance"}


def test_domain_error_subclass_of_a_mapped_class_still_resolves():
    from fastapi_bridge.exceptions.domain import EmailAlreadyExistsError

    app = _build_app()

    class _MoreSpecificConflict(EmailAlreadyExistsError):
        """Subclase de una excepción ya mapeada -- debe seguir resolviendo por MRO."""

    @app.get("/specific-conflict")
    def specific_conflict() -> dict:
        raise _MoreSpecificConflict("mas@especifico.com")

    client = _client(app)

    response = client.get("/specific-conflict")

    assert response.status_code == 409


def test_type_differs_across_validation_domain_and_internal_errors():
    client = _client()

    validation = client.post("/validate", json={"password": "short"})
    conflict = client.get("/conflict")
    invalid = client.get("/invalid")
    internal = client.get("/boom")

    types = {
        validation.json()["type"],
        conflict.json()["type"],
        invalid.json()["type"],
        internal.json()["type"],
    }
    assert len(types) == 4


# ---------------------------------------------------------------------------
# Grupo 6 — Handler de último recurso: 500 opaco, log completo (D-5)
# ---------------------------------------------------------------------------


def test_unhandled_exception_returns_500_problem_detail():
    client = _client()

    response = client.get("/boom")

    assert response.status_code == 500
    body = response.json()
    assert set(body.keys()) == {"type", "title", "status", "detail", "instance"}


def test_unhandled_exception_does_not_leak_internal_information():
    client = _client()

    response = client.get("/boom")

    assert "MARCADOR-INTERNO-XYZ" not in response.text
    assert "users.email_key" not in response.text
    assert "SELECT" not in response.text
    assert "RuntimeError" not in response.text


def test_two_different_exceptions_same_path_produce_identical_bodies():
    app = _build_app()

    @app.get("/boom")
    def boom_runtime() -> dict:
        raise RuntimeError("mensaje distinto uno")

    client = _client(app)
    first = client.get("/boom")

    app2 = _build_app()

    @app2.get("/boom")
    def boom_value() -> dict:
        raise ValueError("mensaje distinto dos")

    client2 = _client(app2)
    second = client2.get("/boom")

    assert first.json() == second.json()


def test_different_paths_differ_only_in_instance():
    client = _client()

    first = client.get("/boom")
    second = client.get("/boom-other")

    first_body, second_body = first.json(), second.json()
    assert first_body["instance"] != second_body["instance"]
    for key in ("type", "title", "status", "detail"):
        assert first_body[key] == second_body[key]


def test_stack_trace_reaches_the_logger(caplog):
    import logging

    client = _client()

    with caplog.at_level(logging.ERROR, logger="fastapi_bridge.exceptions.handlers"):
        client.get("/boom")

    error_records = [r for r in caplog.records if r.levelno == logging.ERROR]
    assert error_records, "se esperaba al menos un registro de nivel ERROR"
    assert any(record.exc_info is not None for record in error_records)
    assert "MARCADOR-INTERNO-XYZ" in caplog.text


def test_logger_does_not_receive_sensitive_material():
    # Inspección del código: la llamada al logger no debe pasar secretos,
    # contraseñas ni tokens -- solo la excepción (para el stack trace) y,
    # indirectamente, el path de la solicitud. El módulo entero de handlers
    # no debe mencionar ninguno de estos identificadores sensibles.
    from pathlib import Path

    handlers_path = Path(__file__).resolve().parent.parent / "exceptions" / "handlers.py"
    source = handlers_path.read_text(encoding="utf-8")
    for forbidden in ("JWT_SECRET", "password", "hashed_password", "access_token"):
        assert forbidden not in source


def test_unhandled_exception_handler_body_has_no_conditional_or_settings_access():
    # Estructural (D-5): el handler de último recurso no ramifica por el
    # tipo de excepción, no consulta la base y no lee configuración -- si él
    # mismo falla, no queda nadie a quien delegar.
    import ast
    from pathlib import Path

    handlers_path = Path(__file__).resolve().parent.parent / "exceptions" / "handlers.py"
    tree = ast.parse(handlers_path.read_text(encoding="utf-8"))
    func_node = next(
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.AsyncFunctionDef) and node.name == "unhandled_exception_handler"
    )
    has_if = any(isinstance(node, ast.If) for node in ast.walk(func_node))
    assert not has_if

    calls = [node.func for node in ast.walk(func_node) if isinstance(node, ast.Call)]
    called_names = set()
    for func in calls:
        if isinstance(func, ast.Name):
            called_names.add(func.id)
        elif isinstance(func, ast.Attribute):
            called_names.add(func.attr)
    assert "get_settings" not in called_names


# ---------------------------------------------------------------------------
# Grupo 8 — Anclas de regresión, precedencia y CORS
# ---------------------------------------------------------------------------


def test_every_concrete_domain_error_subclass_is_mapped():
    # 8.1 (D-4): recorre recursivamente las subclases concretas de
    # `DomainError` **del código de producción** (filtra por `__module__`
    # para no capturar las subclases que los propios tests definen a
    # propósito, como `_UnmappedDomainError`) y exige que cada una tenga
    # fila en `_DOMAIN_ERROR_MAP`. Agregar un error de dominio sin mapearlo
    # pone esta suite en rojo en el mismo commit.
    import fastapi_bridge.exceptions.domain as domain_module
    from fastapi_bridge.exceptions.domain import DomainError
    from fastapi_bridge.exceptions.handlers import _DOMAIN_ERROR_MAP

    def _production_subclasses(base: type) -> set[type]:
        found: set[type] = set()
        for subclass in base.__subclasses__():
            if subclass.__module__ == domain_module.__name__:
                found.add(subclass)
            found |= _production_subclasses(subclass)
        return found

    concrete_subclasses = _production_subclasses(DomainError)
    assert concrete_subclasses, "se esperaba al menos una subclase concreta en domain.py"
    assert concrete_subclasses.issubset(_DOMAIN_ERROR_MAP.keys())


def test_rate_limit_exceeded_still_resolves_to_its_own_handler_with_all_five_registered():
    # 8.2 (D-10): con los cinco handlers registrados, `RateLimitExceeded`
    # (que hereda de `Exception`, no de `HTTPException`) debe seguir
    # resolviendo a su propio handler y no al genérico -- si no, pierde
    # silenciosamente su `Retry-After`. Se verifica sobre el mecanismo real
    # de resolución de Starlette (`_lookup_exception_handler`), no solo
    # sobre la presencia de la clave en el dict: el riesgo es que una
    # versión futura de slowapi cambie la herencia de `RateLimitExceeded` y
    # el 429 caiga en el genérico sin que nadie lo note.
    from slowapi.errors import RateLimitExceeded
    from starlette.exceptions import HTTPException as StarletteHTTPException

    from fastapi_bridge.exceptions.domain import DomainError
    from fastapi_bridge.exceptions.handlers import rate_limit_exceeded_handler
    from fastapi_bridge.main import create_app

    app = create_app()
    resolved = app.exception_handlers[RateLimitExceeded]
    assert resolved is rate_limit_exceeded_handler
    # Y no debe coincidir por accidente con ninguno de los otros cuatro.
    assert resolved is not app.exception_handlers[Exception]
    assert resolved is not app.exception_handlers[DomainError]
    assert resolved is not app.exception_handlers[StarletteHTTPException]


def test_instance_never_carries_the_query_string():
    client = _client()

    response = client.get("/challenge?token=abc123")

    body = response.json()
    assert body["instance"] == "/challenge"
    assert "token" not in body["instance"]
    assert "abc123" not in body["instance"]


@pytest.mark.parametrize(
    "method, path, kwargs, expected_status",
    [
        ("post", "/validate", {"content": b"{not json", "headers": {"Content-Type": "application/json"}}, 400),
        ("get", "/invalid", {}, 401),
        ("get", "/no-existe", {}, 404),
        ("post", "/ok", {}, 405),
        ("get", "/conflict", {}, 409),
        ("post", "/validate", {"json": {"password": "short"}}, 422),
        ("get", "/boom", {}, 500),
    ],
)
def test_full_error_chain_shape_across_all_seven_states(method, path, kwargs, expected_status):
    # 8.4 -- ancla de "Ninguna respuesta de error escapa al formato RFC 7807"
    # en una única tabla legible: los siete estados producibles hoy por
    # RN-WS-09 (400, 401, 404, 405, 409, 422, 500).
    client = _client()

    response = getattr(client, method)(path, **kwargs)

    assert response.status_code == expected_status
    assert response.headers["content-type"] == "application/problem+json"
    body = response.json()
    assert set(body.keys()) == {"type", "title", "status", "detail", "instance"}
    assert body["status"] == response.status_code
    assert body["instance"] == path
