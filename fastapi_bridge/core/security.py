"""Firma y verificación de JWT (python-jose, HS256) — placeholder de estructura.

Responsabilidad: `create_access_token(data) -> str` y `decode_access_token(token) -> dict`,
usando `Settings.JWT_SECRET` (nunca hardcodeado) vía `Depends(get_settings)`.
Regla de capa: este módulo NO debe importar `sqlalchemy` ni `httpx`; es infraestructura
de seguridad pura, consumida por `core/dependencies.py` y por `services/auth_service.py`.
Se implementa en CHANGE-01 (registro/login) y CHANGE-06 (montaje del router de auth).
"""
