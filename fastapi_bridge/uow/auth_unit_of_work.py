"""`AuthUoW` — placeholder de estructura.

Responsabilidad: context manager async que abre y cierra una `AsyncSession` de
SQLAlchemy (de `db/session.py`) alrededor de cada operación de `services/auth_service.py`,
incluso ante excepción. Es el único punto por el que `AuthService` toca `UserRepository`.

`UserRepository` (CHANGE-03, `repositories/user_repository.py`) ya expone su
superficie completa: `get_by_email(email: str) -> User | None` y
`create(email: str, hashed_password: str) -> User` — ambos reciben
primitivos, no una entidad `User` ya construida (D-8). `create` solo hace
`flush()`/`refresh()`, nunca `commit()`/`rollback()`: ese límite
transaccional es responsabilidad de esta `AuthUoW`, que debe confirmar en el
camino feliz y deshacer ante cualquier excepción (D-5 de CHANGE-03). Se
implementa en CHANGE-04.
"""
