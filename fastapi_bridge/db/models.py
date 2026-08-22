"""Modelo ORM `User` — placeholder de estructura.

Responsabilidad: la única tabla que este servicio crea (`Base.metadata.create_all`
para `User` exclusivamente). NUNCA referencia ni migra las tablas existentes `scans`
ni `vulnerabilities` de `db_fuzzing` — esas son del sistema WASA y son intocables
desde el FastAPI Bridge (DD-02, `knowledge-base/04_modelo_de_datos.md`).
Se implementa en CHANGE-02.
"""
