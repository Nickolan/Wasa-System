"""Handlers globales de excepción RFC 7807 — placeholder de estructura.

Responsabilidad: registrar `exception_handler`s en `main.py` que transforman toda
excepción de la API (validación, negocio, infraestructura) al formato uniforme
RFC 7807 (`type`, `title`, `status`, `detail`, `instance`). Ningún error de la API
SHALL retornarse fuera de este formato (regla dura del proyecto).
Se implementa en CHANGE-11.
"""
