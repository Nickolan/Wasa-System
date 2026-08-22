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

`create_app()` arma la aplicación con su política de borde (CORS + rate
limiting, CHANGE-00d, D-1): es el único punto donde `Settings` puede entrar
al middleware, porque `CORSMiddleware` recibe su configuración en tiempo de
construcción de la app, no por request vía `Depends`. `app = create_app()`
se mantiene a nivel de módulo para que `uvicorn fastapi_bridge.main:app` y
`from fastapi_bridge.main import app` sigan funcionando sin cambios.
"""

from contextlib import asynccontextmanager
from typing import AsyncIterator, Literal

from fastapi import FastAPI
from pydantic import BaseModel
from slowapi.errors import RateLimitExceeded
from starlette.middleware.cors import CORSMiddleware

from fastapi_bridge.core.limiter import build_limiter
from fastapi_bridge.core.settings import Settings, get_settings
from fastapi_bridge.exceptions.handlers import rate_limit_exceeded_handler

# D-2: mínimo privilegio explícito, no `["*"]`. Los únicos verbos que el
# sistema usa: `GET /health`, `POST` de auth y de scan.
_ALLOWED_METHODS = ["GET", "POST", "OPTIONS"]
# Lo que el frontend efectivamente manda: el JWT Bearer y `Content-Type: application/json`.
_ALLOWED_HEADERS = ["Authorization", "Content-Type"]

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


def create_app(settings: Settings | None = None) -> FastAPI:
    """Arma la `FastAPI` con su política de borde HTTP (CORS + rate limit).

    `settings` es inyectable para tests que quieran una política distinta
    sin tocar variables de entorno del proceso ni invalidar el `lru_cache`
    de `get_settings()` (D-1). En producción se resuelve la instancia
    cacheada normal.
    """
    resolved_settings = settings if settings is not None else get_settings()

    app = FastAPI(
        title="WASA FastAPI Bridge",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=resolved_settings.CORS_ORIGINS,
        allow_credentials=False,
        allow_methods=_ALLOWED_METHODS,
        allow_headers=_ALLOWED_HEADERS,
    )

    # D-4: sólo el decorador `scan_rate_limit` limita rutas. Ningún
    # `SlowAPIMiddleware` ni `default_limits` se registra acá — de lo
    # contrario todas las rutas (incluida auth y /health) quedarían
    # limitadas por defecto, invirtiendo el requisito.
    app.state.limiter = build_limiter()
    app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

    @app.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse(status="ok", service="wasa-fastapi-bridge")

    return app


app = create_app()
