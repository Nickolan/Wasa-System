"""`ScanUoW` — placeholder de estructura.

Responsabilidad: context manager async que abre y cierra un `httpx.AsyncClient`
alrededor de cada operación de `services/scan_service.py`, incluso ante excepción.
Es el único punto por el que `ScanService` toca `N8nRepository`.
Se implementa en CHANGE-12.
"""
