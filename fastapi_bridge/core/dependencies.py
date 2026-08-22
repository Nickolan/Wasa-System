"""Dependencias de FastAPI compartidas entre routers — placeholder de estructura.

Responsabilidad: `get_current_user(token: str = Depends(oauth2_scheme))`, que decodifica
el Bearer token vía `core/security.py` y protege `/api/v1/scan/start`. Los endpoints de
auth (`/register`, `/login`) NO usan esta dependencia.
Regla de capa: expone `Depends(...)` de FastAPI; puede importar `core/security.py` y
`core/settings.py`, pero no accede directamente a SQLAlchemy ni httpx.
Se implementa en CHANGE-06 (montaje del router de auth) y CHANGE-12 (protección de scan).
"""
