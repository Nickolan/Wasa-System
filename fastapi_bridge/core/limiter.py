"""Singleton de rate limiting del FastAPI Bridge (D-4, D-5, D-9, D-10).

Sólo expone el decorador `scan_rate_limit` para aplicarlo por endpoint
(D-4): este módulo **no** configura `SlowAPIMiddleware` ni `default_limits`,
así que ninguna ruta queda limitada salvo la que decore explícitamente con
`scan_rate_limit`. `POST /api/v1/scan/start` lo hará en CHANGE-12.

`key_func=get_remote_address` usa `request.client.host` — la IP de la
conexión TCP — sin leer `X-Forwarded-For`/`X-Real-IP` (D-10): confiar en
esos headers sin un proxy de confianza que los reescriba vuelve el límite
decorativo.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

from fastapi_bridge.core.settings import get_settings


def build_limiter() -> Limiter:
    """Construye un `Limiter` nuevo. Los tests de rate limit lo usan para
    aislar el contador en memoria por test (D-9) en vez de compartir el
    singleton de módulo `limiter`.
    """
    return Limiter(key_func=get_remote_address)


# Singleton de producción: lo publica `main.py` en `app.state.limiter`.
limiter: Limiter = build_limiter()


def scan_limit_string() -> str:
    """Limit string del dominio scan, resuelta de forma perezosa (D-5).

    `Limiter.limit()` acepta un callable que se evalúa **en cada request**;
    `get_settings()` se llama acá adentro (no en el import del módulo) para
    que la política nunca quede congelada en el momento en que se decora
    el endpoint.
    """
    settings = get_settings()
    return f"{settings.RATE_LIMIT_REQUESTS} per {settings.RATE_LIMIT_WINDOW} second"


# Decorador reutilizable que CHANGE-12 aplica sobre `POST /start` con una
# sola línea, sin conocer slowapi ni `Settings`.
scan_rate_limit = limiter.limit(scan_limit_string)
