"""Engine SQLAlchemy async y `Base` declarativa — placeholder de estructura.

Responsabilidad: `create_async_engine(settings.DB_URL)` y la `DeclarativeBase` de la
que hereda el modelo `User` de `db/models.py`. El engine NO se crea a nivel de módulo
en este change (CHANGE-00a): eso abriría un pool de conexiones contra `db_fuzzing` en
el import, violando el requirement "El scaffold no toca la base de datos compartida".
Regla de capa: sólo lo consume `uow/auth_unit_of_work.py`, nunca un Router directamente.
Se implementa en CHANGE-02.
"""
