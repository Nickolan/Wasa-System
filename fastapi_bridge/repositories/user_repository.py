"""`UserRepository` — placeholder de estructura.

Responsabilidad: `get_by_email(email)` y `create(user)` contra la tabla `User` propia
del Bridge en PostgreSQL `db_fuzzing`, vía la `AsyncSession` que le inyecta `AuthUoW`.
Regla de capa (dura): este módulo NO SHALL importar nada de `fastapi` (`Request`,
`Response`, `Depends`, `HTTPException`) — debe ser reutilizable fuera del framework web.
Se implementa en CHANGE-02/CHANGE-04.
"""
