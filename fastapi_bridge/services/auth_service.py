"""Lógica de negocio de auth — placeholder de estructura.

Responsabilidad: hash de contraseña (passlib/bcrypt, rounds=12), verificación de
credenciales y emisión de JWT (vía `core/security.py`). NUNCA compara ni almacena
contraseñas en texto plano.
Regla de capa: este módulo NO instancia `sqlalchemy` ni `httpx` directamente; el
acceso a datos pasa siempre por `uow/auth_unit_of_work.py`.
Se implementa en CHANGE-03 (hashing) y CHANGE-04/CHANGE-06 (registro/login).
"""
