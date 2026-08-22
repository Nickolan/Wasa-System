"""Único punto de lectura de configuración del FastAPI Bridge (D-4, D-5, D-6, D-7).

Ningún otro módulo de `fastapi_bridge/` debe leer `os.environ` / `os.getenv`
directamente ni hardcodear configuración: todo pasa por `Settings` vía
`Depends(get_settings)`.
"""

from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

# Relativo al paquete, no al cwd: `uvicorn`/`pytest` pueden lanzarse desde
# cualquier directorio y `fastapi_bridge/.env` se sigue encontrando.
_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV_FILE, env_file_encoding="utf-8", extra="ignore")

    # Auth (CHANGE-01+)
    JWT_SECRET: SecretStr = SecretStr("dev-only-insecure-change-me")
    TOKEN_EXPIRE_HOURS: int = 24

    # Persistencia (CHANGE-02) — apunta a la instancia compartida db_fuzzing
    DB_URL: str = "postgresql+asyncpg://wasa:wasa@localhost:5432/db_fuzzing"

    # Integración n8n (CHANGE-12)
    N8N_WEBHOOK_URL: str = "http://localhost:5678/webhook/wasa-scan"
    N8N_WEBHOOK_TOKEN: SecretStr = SecretStr("dev-only-insecure-change-me")

    # CORS (CHANGE-11)
    # NoDecode: evita que pydantic-settings intente json.loads() sobre el
    # string crudo del entorno antes de que corra el field_validator (D-7).
    CORS_ORIGINS: Annotated[list[str], NoDecode] = ["http://localhost:5173"]

    # Rate limiting (CHANGE-11)
    RATE_LIMIT_REQUESTS: int = 10
    RATE_LIMIT_WINDOW: int = 3600

    # Entorno
    APP_ENV: str = "development"

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _split_comma_separated_origins(cls, value: object) -> object:
        # D-7: las variables de entorno son strings; CORSMiddleware (CHANGE-11)
        # espera una lista. Se resuelve acá, en la capa de config, no en el
        # consumidor. Excepción justificada a la regla general de la skill
        # `pydantic` de preferir mode="after": acá hace falta transformar el
        # input crudo (string) antes de la coerción al tipo destino (lista).
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    """Instancia cacheada de `Settings` (D-4). Los routers la reciben vía
    `Depends(get_settings)`; los tests la sustituyen con
    `app.dependency_overrides[get_settings]`.
    """
    return Settings()
