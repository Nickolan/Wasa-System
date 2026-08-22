"""Punto de entrada ASGI del FastAPI Bridge.

Expone únicamente `GET /health` en este estadio (CHANGE-00a). Los routers de
dominio (`api/v1/auth`, `api/v1/scan`) existen como módulos pero no se montan
acá todavía — ver D-8 en `openspec/changes/fastapi-bridge-scaffold/design.md`.
"""

from contextlib import asynccontextmanager
from typing import AsyncIterator, Literal

from fastapi import FastAPI
from pydantic import BaseModel


class HealthResponse(BaseModel):
    """Contrato exacto de `GET /health` — fijado por tipos, no por un dict suelto (D-11)."""

    status: Literal["ok"]
    service: Literal["wasa-fastapi-bridge"]


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Vacío por diseño (D-10): los pools de recursos async (engine SQLAlchemy,
    # httpx.AsyncClient) se abren/cierran acá recién cuando un change de dominio
    # (CHANGE-02, CHANGE-05) los introduzca. No hay conexión que abrir todavía.
    yield


app = FastAPI(
    title="WASA FastAPI Bridge",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", service="wasa-fastapi-bridge")
