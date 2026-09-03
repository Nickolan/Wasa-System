"""Verificación previa de R-3 (design.md, dashboard-read-router).

Antes de escribir cualquier capa del dominio dashboard, este test confirma
cuál de los dos mecanismos de D-2 sirve: si un modelo Pydantic con
`extra="allow"` conserva un campo no declarado cuando se serializa a través
de un `response_model` de FastAPI. Si este test pasa, D-2 se implementa tal
cual está escrita (schemas con `extra="allow"` + `response_model`). Si
fallara, el fallback (`response_model=None` + `JSONResponse` +
`responses={200: ...}`) queda documentado en `design.md` y las tareas 5.2/5.3
se ajustan en consecuencia (tarea 1.2).
"""

from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel, ConfigDict


class _PermissiveModel(BaseModel):
    model_config = ConfigDict(extra="allow")

    known_field: str | None = None


def _build_probe_app() -> FastAPI:
    app = FastAPI()

    @app.get("/__probe__", response_model=_PermissiveModel)
    async def probe() -> _PermissiveModel:
        return _PermissiveModel.model_validate(
            {"known_field": "hello", "unexpected_column": "should-survive"}
        )

    return app


def test_extra_allow_field_survives_serialization_through_response_model():
    client = TestClient(_build_probe_app())

    response = client.get("/__probe__")

    assert response.status_code == 200
    body = response.json()
    assert body["known_field"] == "hello"
    assert body["unexpected_column"] == "should-survive"
