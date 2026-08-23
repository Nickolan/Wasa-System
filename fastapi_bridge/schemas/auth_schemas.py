"""Contratos Pydantic v2 del dominio auth (CHANGE-02, capability `auth-contracts`).

Define la forma de los datos en la frontera HTTP del Bridge:

- `UserRegister` / `UserLogin`: contratos de entrada de `POST /auth/register`
  y `POST /auth/login` (CHANGE-05). Codifican RN-WS-15 (política de longitud
  de contraseña) del lado del backend, con independencia de la validación
  equivalente en Zod (CHANGE-14) — esa es conveniencia de UX, esta es la
  garantía real.
- `TokenResponse`: la única forma de respuesta exitosa de ambos endpoints.
- `TokenData`: la representación tipada del payload de un JWT ya decodificado,
  que consume `get_current_user` (CHANGE-06). No es un schema de HTTP.

Ningún modelo de este módulo expone `password` ni `hashed_password` en una
salida (RN-WS-12): el registro devuelve un token, nunca un eco del usuario
creado. Los schemas son Pydantic puro — sin imports de FastAPI, SQLAlchemy,
httpx ni `Settings` — para que CHANGE-03..07 los importen sin arrastrar
dependencias de framework ni de infraestructura.
"""

from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field

# RN-WS-15: mínimo de 8 caracteres para la contraseña de registro.
REGISTER_PASSWORD_MIN_LENGTH = 8

# D-2: techo duro del algoritmo bcrypt (bcrypt >= 4.1 lanza ValueError por
# encima de 72 bytes, en vez de truncar). Medido en bytes UTF-8, no en
# caracteres: max_length de Pydantic cuenta caracteres y dejaría pasar una
# contraseña multibyte que después revienta en bcrypt.
_BCRYPT_MAX_PASSWORD_BYTES = 72


def _validate_password_byte_ceiling(value: str) -> str:
    if len(value.encode("utf-8")) > _BCRYPT_MAX_PASSWORD_BYTES:
        raise ValueError(f"la contraseña no puede superar {_BCRYPT_MAX_PASSWORD_BYTES} bytes UTF-8")
    return value


# Alias compartido por UserRegister y UserLogin (D-2): ambos comparten el
# mismo techo de bcrypt, aunque difieran en el mínimo (D-3).
PasswordWithByteCeiling = Annotated[str, AfterValidator(_validate_password_byte_ceiling)]


class UserRegister(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: PasswordWithByteCeiling = Field(..., min_length=REGISTER_PASSWORD_MIN_LENGTH, repr=False)


class UserLogin(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    # D-3: min_length=1, NO el mínimo de 8 de UserRegister -- ver el test
    # test_user_login_short_password_is_accepted_deliberately para el porqué.
    password: PasswordWithByteCeiling = Field(..., min_length=1, repr=False)


class TokenResponse(BaseModel):
    """Respuesta única de `POST /auth/register` (201) y `POST /auth/login` (200).

    `expires_in` está expresado en **segundos** (semántica de la respuesta de
    token de OAuth 2.0, RFC 6749 §5.1), no en horas. La conversión desde
    `settings.TOKEN_EXPIRE_HOURS` es responsabilidad del `AuthService`
    (CHANGE-04): este schema no importa `Settings` (D-8).
    """

    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int = Field(..., gt=0)


class TokenData(BaseModel):
    """Representación tipada del payload de un JWT ya decodificado.

    NO es un schema de HTTP: nunca se serializa hacia el cliente.

    Asimetría deliberada respecto de `UserRegister`/`UserLogin` (no "corregir"
    en un refactor futuro, rompe CHANGE-06):
    - `email` es `str | None`, no `EmailStr` (D-1): un `sub` malformado en un
      token es un fallo de *autenticación* (401) a resolver por la dependencia
      que lo consume (`get_current_user`, CHANGE-06), no un error de
      *validación de request* (422).
    - Sin `extra="forbid"` (D-5): el payload de un JWT decodificado siempre
      trae claims estándar adicionales (`exp`, `iat`, `sub`); con `forbid`,
      todo token válido fallaría al parsearse.
    """

    email: str | None = None
