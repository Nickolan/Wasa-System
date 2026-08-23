"""Excepciones de dominio del FastAPI Bridge (D-2, CHANGE-09).

Módulo Python puro, sin ningún import de terceros ni de framework: a
diferencia de `exceptions/handlers.py` (que importa `starlette` y `slowapi`
para el mapeo a RFC 7807), este módulo lo puede importar la capa Repository
sin arrastrar el framework web, respetando la regla dura de pureza de capa
(`Router → Service → UoW → Repository`).

`N8nUnavailableError` señaliza que la entrega de un escaneo al orquestador
n8n no pudo completarse con éxito (timeout, conexión rechazada, cualquier
falla de transporte, o una respuesta fuera del rango 2xx). El borde HTTP
(CHANGE-12) la mapea a 502 Bad Gateway. Su mensaje nunca debe incluir el
token de webhook ni el cuerpo de la respuesta de n8n (D-8).
"""


class N8nUnavailableError(Exception):
    """El orquestador n8n no aceptó o no pudo recibir la entrega de un escaneo."""
