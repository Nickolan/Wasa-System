"""`AuthUoW` — placeholder de estructura.

Responsabilidad: context manager async que abre y cierra una `AsyncSession` de
SQLAlchemy (de `db/session.py`) alrededor de cada operación de `services/auth_service.py`,
incluso ante excepción. Es el único punto por el que `AuthService` toca `UserRepository`.
Se implementa en CHANGE-02/CHANGE-04.
"""
