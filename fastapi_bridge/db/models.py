"""Modelo ORM `User` (CHANGE-01).

`User` es la única tabla que este servicio crea en `db_fuzzing`
(`Base.metadata.create_all` restringido explícitamente a `User.__table__` en
el `lifespan` de `main.py`). NUNCA referencia ni migra las tablas existentes
`scans` ni `vulnerabilities` de `db_fuzzing` — esas son del sistema WASA y son
intocables desde el FastAPI Bridge (DD-02, `knowledge-base/04_modelo_de_datos.md`).

Tipos de columna (D-3): `email` es `String(320)` (máximo de un email por
RFC 5321) y `hashed_password` es `String(255)` (holgado para un hash bcrypt);
la KB describe ambos como `TEXT`, pero el usuario confirmó acotar el tipo en
el motor sin costo de rendimiento/almacenamiento adicional en PostgreSQL.
`created_at` usa `server_default=func.now()` con `timezone=True` (D-4): el
default vive en el DDL, así que una fila insertada fuera del ORM también lo
recibe, con el reloj de PostgreSQL como única referencia horaria.
"""

from datetime import datetime

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from sqlalchemy.types import DateTime

from fastapi_bridge.db.base import Base


class User(Base):
    """Entidad de usuario del SaaS (`knowledge-base/04_modelo_de_datos.md`)."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
