"""`N8nRepository` — placeholder de estructura.

Responsabilidad: `forward_scan(payload)` — POST al Webhook Trigger de n8n
(`N8N_WEBHOOK_URL`, autenticado con `N8N_WEBHOOK_TOKEN`) vía el `httpx.AsyncClient`
que le inyecta `ScanUoW`.
Regla de capa (dura): este módulo NO SHALL importar nada de `fastapi` — debe ser
reutilizable fuera del framework web.
Se implementa en CHANGE-12.
"""
