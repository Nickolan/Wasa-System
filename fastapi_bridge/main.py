"""Punto de entrada ASGI del FastAPI Bridge.

Expone únicamente `GET /health` en este estadio (CHANGE-00a). Los routers de
dominio (`api/v1/auth`, `api/v1/scan`) existen como módulos pero no se montan
acá todavía — ver D-8 en `openspec/changes/fastapi-bridge-scaffold/design.md`.

El `lifespan` ya no está vacío (CHANGE-01): en el arranque crea, de forma
idempotente y acotada a `User.__table__`, la tabla `users` en `db_fuzzing`
(D-2), y en el apagado libera el pool de conexiones (`engine.dispose()`).
No hay `try/except` alrededor de la conexión (D-6): si `db_fuzzing` no
responde, el arranque falla de forma ruidosa en vez de levantar un servicio
que devolvería 500 en el primer `POST /register`. `GET /health` sigue sin
consultar la base — es liveness del proceso, no readiness.
"""

from contextlib import asynccontextmanager
from typing import AsyncIterator, Literal

from fastapi import FastAPI
from pydantic import BaseModel

from fastapi_bridge.core.settings import get_settings
from fastapi_bridge.db.base import Base, get_engine
from fastapi_bridge.db.models import User


class HealthResponse(BaseModel):
    """Contrato exacto de `GET /health` — fijado por tipos, no por un dict suelto (D-11)."""

    status: Literal["ok"]
    service: Literal["wasa-fastapi-bridge"]


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # CHANGE-01: el arranque crea la tabla `users` en `db_fuzzing` si no
    # existe (idempotente, D-2) y libera el pool de conexiones al apagar.
    # Sin try/except alrededor de la conexión (D-6): si `db_fuzzing` no
    # responde, el arranque debe fallar de forma ruidosa, no silenciarlo.
    settings = get_settings()
    engine = get_engine(settings)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=[User.__table__])
    try:
        yield
    finally:
        await engine.dispose()


app = FastAPI(
    title="WASA FastAPI Bridge",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", service="wasa-fastapi-bridge")
