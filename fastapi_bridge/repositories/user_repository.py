"""`UserRepository` (CHANGE-03, user-registry).

Superficie de dos métodos y una excepción para `AuthService` (CHANGE-04):
`get_by_email(email) -> User | None` y `create(email, hashed_password) -> User`,
que lanza `EmailAlreadyExistsError` (`fastapi_bridge/exceptions/domain.py`)
ante un email duplicado.

El constructor recibe una `AsyncSession` ya abierta y no hace nada más: no
construye engines, no lee `Settings`, no decide el ciclo de vida de la
transacción. Todo eso es responsabilidad de la `AuthUoW` (CHANGE-04) que lo
instancia — el mismo patrón que ya sigue `db/session.py`.

`create` recibe **primitivos** (D-8), no una entidad `User` ya construida:
así `AuthService` nunca necesita importar `fastapi_bridge.db.models`, ni por
lo tanto SQLAlchemy. El único módulo que conoce la clase `User` es este.

El email se normaliza a minúsculas con `_normalize_email`, definida una sola
vez e invocada tanto por `create` como por `get_by_email` (D-4): la
normalización es simétrica a propósito. Normalizar solo al escribir dejaría
usuarios inalcanzables al iniciar sesión con otra capitalización que la que
usaron al registrarse, y el 401 genérico de login (HU-03-02) volvería ese
síntoma indistinguible de una contraseña mal escrita (R-1).

`create` hace `flush()` (nunca `commit()`), que es lo que asigna el `id`
generado por la base y lo que dispara la violación de la constraint `UNIQUE`
de `email` dentro del propio método, donde puede atraparse y traducirse
(D-5). El `try/except IntegrityError` es deliberadamente amplio, sin
inspeccionar `exc.orig`/SQLSTATE (D-3): hoy `users` tiene exactamente una
constraint que un `INSERT` puede violar (la unicidad de `email`, sin claves
foráneas), premisa que ancla `tests/test_user_repository.py::
test_users_table_has_exactly_one_unique_constraint_and_no_foreign_keys` — si
un change futuro agrega otra constraint, ese test se pone en rojo y obliga a
revisar esta decisión (R-2). Este módulo **no** hace `commit` ni `rollback`
sobre la sesión: ese límite transaccional pertenece a la `AuthUoW`.

Regla dura de capas: este módulo NO SHALL importar nada de `fastapi`
(`Request`, `Response`, `Depends`) ni de `passlib` — el repositorio recibe
el hash ya calculado y lo trata como texto opaco (RN-WS-12), y debe ser
reutilizable fuera del framework web. Anclado por
`tests/test_layer_boundaries.py` (filas `("repositories", "fastapi")` y
`("repositories", "passlib")`).
"""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi_bridge.db.models import User
from fastapi_bridge.exceptions.domain import EmailAlreadyExistsError


def _normalize_email(email: str) -> str:
    """Normalización de email compartida por `create` y `get_by_email` (D-4)."""
    return email.strip().lower()


class UserRepository:
    """Acceso a la tabla `users` a través de una `AsyncSession` inyectada."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, email: str, hashed_password: str) -> User:
        """Da de alta un usuario a partir de primitivos (D-8).

        Normaliza el email (D-4), hace `flush()` para poblar `id` y disparar
        la violación de unicidad si corresponde, y `refresh()` para
        garantizar que `created_at` (poblado por `server_default` en la
        base) esté disponible en el objeto devuelto (D-5).
        """
        normalized_email = _normalize_email(email)
        user = User(email=normalized_email, hashed_password=hashed_password)
        self._session.add(user)
        try:
            await self._session.flush()
        except IntegrityError as exc:
            raise EmailAlreadyExistsError(normalized_email) from exc
        await self._session.refresh(user)
        return user

    async def get_by_email(self, email: str) -> User | None:
        """Busca un usuario por email, normalizado con la misma función que `create` (D-4, D-7).

        `scalar_one_or_none()` expresa la firma `User | None` con precisión:
        `None` con cero filas, la entidad con una, y **lanza** con más de
        una — deseable, porque si alguna vez hubiera dos usuarios con el
        mismo email la constraint estaría rota, y fallar ruidosamente es
        mejor que devolver uno arbitrario (`first()` taparía la corrupción).
        La comparación genera un parámetro ligado, no concatenación de
        texto: un email con comillas o fragmentos de SQL se trata como dato.
        """
        normalized_email = _normalize_email(email)
        result = await self._session.execute(select(User).where(User.email == normalized_email))
        return result.scalar_one_or_none()
