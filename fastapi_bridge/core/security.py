"""Superficie única de criptografía del FastAPI Bridge (CHANGE-04).

Cuatro primitivas, sin conocer usuarios, sesiones ni HTTP. Ningún otro módulo
de `services/`, `repositories/`, `api/` o `schemas/` SHALL importar `bcrypt`
ni `jose` directamente (`tests/test_layer_boundaries.py`): todo el hashing y
todo el JWT del servicio pasa por acá.

## Hashing de contraseñas (RN-WS-12) — D-1, D-2, D-3

`hash_password`/`verify_password` usan la librería `bcrypt` directamente
(D-1 de `design.md`): `passlib 1.7.4` no tiene release desde 2020 y está
roto contra `bcrypt >= 4.1` (`AttributeError: module 'bcrypt' has no
attribute '__about__'`, reproducido en este repo — ver `design.md`
§Hallazgo del entorno verificado). `_BCRYPT_ROUNDS` es una constante de
módulo, no una variable de entorno (D-2): el coste queda embebido en el
propio hash (`$2b$12$…`) y bajarlo desde `.env` degradaría en silencio la
seguridad de todos los usuarios nuevos sin dejar rastro en el repositorio.

Ambas primitivas son **síncronas** (D-3): bcrypt es trabajo de CPU, no de
I/O. El offload a thread pool (`anyio.to_thread.run_sync`) es responsabilidad
de `AuthService`, que es quien conoce el contexto async de la petición —
declararlas `async def` acá mentiría sobre su naturaleza y no las haría
menos bloqueantes. `verify_password` nunca propaga la excepción de la
librería ante un hash corrupto: un registro corrupto en la base debe
producir un login fallido, no un 500.

## JWT (RN-WS-14) — D-5, D-6, D-7, D-13

`create_access_token`/`decode_access_token` reciben `Settings` **por
parámetro** (D-5), nunca vía `get_settings()`: así quedan puras y testeables
sin tocar el cache `lru_cache` global, siguiendo el mismo patrón que
`get_engine(settings)`/`get_session_factory(settings)` de CHANGE-01.

`_JWT_ALGORITHM = "HS256"` es una constante de módulo (D-6), igual que
`_BCRYPT_ROUNDS`: es una propiedad del diseño criptográfico del servicio, no
de su despliegue. Al decodificar, la lista de algoritmos aceptados se pasa
**explícita** (`algorithms=[_JWT_ALGORITHM]`) y NUNCA se deriva de la
cabecera del propio token — es la defensa contra `alg: none`/`alg: RS256`,
el vector clásico de suplantación de JWT (R-5, el test con más valor de todo
el change).

`decode_access_token` nunca lanza (D-7): cualquier `JWTError` (firma
inválida, expirado, malformado, sin `sub`, algoritmo no permitido) se
traduce a `TokenData(email=None)`. Un token que no sirve es un fallo de
*autenticación* (401), no de *validación de request* (422); el motivo del
rechazo no debe llegar al llamador, porque distinguir "expiró" de "firma
inválida" es información útil para un atacante.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from jose import JWTError, jwt

from fastapi_bridge.core.settings import Settings
from fastapi_bridge.schemas.auth_schemas import TokenData

# D-2: coste fijo, no configuración. Ver docstring del módulo.
_BCRYPT_ROUNDS = 12

# D-6: algoritmo fijo, no configuración ni parámetro del llamador.
_JWT_ALGORITHM = "HS256"


def hash_password(plain: str) -> str:
    """Deriva un hash bcrypt en formato modular (`$2b$12$…`) de `plain`.

    Síncrona a propósito (D-3): es trabajo de CPU. El llamador async
    (`AuthService`) es responsable de descargarla a un thread pool.
    """
    salt = bcrypt.gensalt(rounds=_BCRYPT_ROUNDS)
    hashed = bcrypt.hashpw(plain.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Verifica `plain` contra `hashed` con la primitiva de comparación en
    tiempo constante de bcrypt. Devuelve `False` ante un hash malformado o
    vacío en vez de propagar la excepción de la librería (un registro
    corrupto en la base debe producir un login fallido, no un 500)."""
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(data: dict[str, Any], expires_delta: timedelta, settings: Settings) -> str:
    """Emite un JWT HS256 con los claims de `data` más `exp` e `iat` (D-13),
    firmado con `settings.JWT_SECRET`. El `SecretStr` se desenvuelve
    exclusivamente acá adentro (D-5), nunca fuera de este módulo."""
    now = datetime.now(timezone.utc)
    to_encode = dict(data)
    to_encode["iat"] = now
    to_encode["exp"] = now + expires_delta
    return jwt.encode(to_encode, settings.JWT_SECRET.get_secret_value(), algorithm=_JWT_ALGORITHM)


def decode_access_token(token: str, settings: Settings) -> TokenData:
    """Decodifica y valida firma, algoritmo (lista explícita, D-6) y
    vencimiento. Nunca lanza (D-7): cualquier token inválido, expirado,
    manipulado o firmado con otra clave devuelve `TokenData(email=None)`."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET.get_secret_value(), algorithms=[_JWT_ALGORITHM])
    except JWTError:
        return TokenData(email=None)
    return TokenData(email=payload.get("sub"))
