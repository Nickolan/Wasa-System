"""Lógica de negocio de scan — placeholder de estructura.

Responsabilidad: generar el UUID del escaneo y disparar el forward al Webhook
Trigger de n8n vía `uow/scan_unit_of_work.py` (patrón fire-and-forward: el Bridge
no espera el resultado del escaneo, sólo confirma el disparo).
Regla de capa: este módulo NO instancia `httpx` ni `sqlalchemy` directamente; el
acceso a infraestructura pasa siempre por la UoW correspondiente.
Se implementa en CHANGE-12.
"""
