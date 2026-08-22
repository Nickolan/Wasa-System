"""Factory de `AsyncSession` — placeholder de estructura.

Responsabilidad: `async_sessionmaker` ligado al engine de `db/base.py`, expuesto para
que `uow/auth_unit_of_work.py` abra y cierre la sesión dentro de su context manager.
Se implementa en CHANGE-02.
"""
