# Tasks — n8n-webhook-trigger (CHANGE-21)

> Governance **ALTO**: no ejecutar ninguna tarea contra la instancia n8n real ni escribir el `.env` real
> sin las respuestas a OQ-1/OQ-2 (design.md) y sin la revisión humana de D-1, D-2, D-3, D-6.
> La mayor parte de este change es configuración de un sistema externo (n8n), no código unit-testeable
> del Bridge — la verificación es por prueba manual (curl), no por test unitario. La única tarea con
> superficie de código del repo es la actualización del `.env`/`.env.example`, que sigue las reglas duras.

## 0. Prerrequisitos y bloqueo de gobernanza

- [x] 0.1 Confirmar con el usuario los valores reales de `N8N_WEBHOOK_URL` y `N8N_WEBHOOK_TOKEN` (OQ-1, pregunta abierta Alta de `10_preguntas_abiertas.md`). Sin ellos, detenerse: sólo se puede dejar todo listo con placeholders. — Resuelto en sesión previa (2026-08-22): valores ya cargados en `fastapi_bridge/.env`, confirmados vigentes.
- [x] 0.2 Confirmar el modelo de exposición de n8n: HTTPS sí/no, red interna vs. expuesta (OQ-2, D-2). — n8n local (localhost:5678), sin exposición externa por ahora.
- [x] 0.3 Revisión humana de las decisiones marcadas [GOV-ALTO]: D-1 (Header Auth + credential manager), D-2 (origen de la URL), D-3 (Respond Immediately), D-6 (verificación y error-handling). No avanzar a las secciones 2+ sin esta revisión. — Confirmadas por el usuario en el chat.
- [x] 0.4 Verificar en el archivo `scan-forwarding` (archivado en CHANGE-12) el contrato exacto que emite el Bridge: ruta destino, header `X-WASA-TOKEN`, cuerpo JSON de cinco campos — para reproducirlo fielmente en la prueba.

## 1. Credencial y nodo Webhook Trigger en n8n (Schedule aún activo)

- [x] 1.1 Dar de alta en el credential manager de n8n una credencial **Header Auth** con nombre de header `X-WASA-TOKEN` y valor = `N8N_WEBHOOK_TOKEN` del Bridge (D-1). No embeber el secreto en parámetros del nodo. — Credencial `n8n-api-key-wasa`, campo Name=`X-WASA-TOKEN`, ya existía.
- [x] 1.2 Agregar el nodo **Webhook Trigger** al workflow WASA: verbo `POST`, ruta `/webhook/wasa-scan`, autenticación = la credencial Header Auth de 1.1, respuesta = **Respond Immediately** (200 OK, background execution) (D-1, D-3). — Nodo `Webhook` agregado.
- [x] 1.3 Dejar el **Schedule Trigger existente activo por ahora**: el workflow sigue funcionando por el disparador viejo mientras se prueba el nuevo (Migration Plan paso 2).

## 2. Recablear los nodos downstream a `$json.*` del webhook

- [x] 2.1 Inventariar cuántos y cuáles nodos downstream consumen los datos que antes proveía el Schedule (OQ-5) y decidir mapeo directo vs. nodo Set normalizador (D-4). — **Desviación del plan original**: se descartó tanto el mapeo directo como un nodo Set separado porque los nodos downstream (`ffuf`, `Alertas ZAP`, `ZAP Spider (Descubrimiento)`, `Reporte Final`) referencian `$('URL Ejemplo')` por nombre — un nodo nuevo en paralelo no se ejecuta en las corridas disparadas por Webhook y esas referencias fallarían. Se optó por modificar `URL Ejemplo` in-place con una rama webhook/fallback (ver design.md D-4 actualizado).
- [x] 2.2 Cablear `$json.target_url` y `$json.phpsessid` a los nodos ZAP / Nuclei / ffuf. — Vía la rama webhook del nodo `URL Ejemplo` (sigue alimentando a los mismos nodos por su mecanismo original de referencia).
- [x] 2.3 Cablear `$json.sqlmap_level` y `$json.sqlmap_risk` al nodo LPUSH de Redis (`sqlmap_tasks`). — `Redis.messageData` ahora lee `$('URL Ejemplo').item.json.sqlmap_level`/`.sqlmap_risk` en vez de los hardcodeados `2`/`1`.
- [x] 2.4 Cablear `$json.scan_id` al nodo INSERT de la tabla `scans`. — **Desviación del plan original**: no aplicable. `scans.id` es `SERIAL PK` autoincremental sin columna para un UUID externo, y por regla dura no se modifica el esquema. El `scan_id` (UUID) del Bridge es sólo un token de confirmación cara al cliente; se descarta dentro de n8n, que sigue generando su propio `id` vía `Crear ID` como antes (decisión confirmada por el usuario en el chat).

## 3. Verificación por prueba manual (datos de muestra, antes de tocar el Schedule)

- [x] 3.1 Preparar un cuerpo de escaneo de muestra con los cinco campos válidos (`target_url` http/https válida, `phpsessid` no vacío, `sqlmap_level`/`sqlmap_risk` en rango, `scan_id`).
- [x] 3.2 **Caso positivo**: `POST` a `/webhook/wasa-scan` con header `X-WASA-TOKEN` correcto + cuerpo de muestra → verificar respuesta `200` inmediata (D-3, criterio de aceptación). Correr sin dejar el token en el historial de shell/logs (OQ-6, D-6). — Verificado desde Thunder Client con variable de entorno para el token; `200` confirmado.
- [x] 3.3 Verificar que el workflow se disparó y que los cinco campos llegaron a sus nodos downstream correctos (target_url/phpsessid en ZAP/Nuclei/ffuf; sqlmap_level/risk en LPUSH; scan_id en INSERT) (HU-04-02, criterio de aceptación). — Confirmado por el usuario (datos correctos en Executions). Nota: "scan_id en INSERT" no aplica tras la decisión de 2.4 — se verificaron los otros cuatro campos.
- [x] 3.4 **Caso negativo (borde de seguridad)**: `POST` sin `X-WASA-TOKEN`, y `POST` con `X-WASA-TOKEN` incorrecto → ambos deben responder `403` y NO disparar el workflow (D-1, criterio de aceptación). — Confirmado: n8n devuelve `403 "Authorization data is wrong!"` (comportamiento nativo, ver design.md D-1 "Aprendizaje"); criterio corregido de `401` a `403` en todos los artefactos.
- [x] 3.5 Verificar que la respuesta `200` llega dentro de la ventana de 10 s que el Bridge impone a la entrega, para que el Bridge la interprete como `202` y no como `502` (D-3). — Confirmado, respuesta rápida.

## 4. Actualizar configuración del Bridge (superficie de código del repo)

- [x] 4.1 Actualizar `N8N_WEBHOOK_URL` en `fastapi_bridge/.env` con la ruta real del Webhook Trigger (D-2). No tocar `settings.py` ni el código de entrega (ya lee la variable tipada). — Ya apuntaba a la URL real de producción (`http://localhost:5678/webhook/wasa-scan`), confirmado vigente.
- [x] 4.2 Mantener en `fastapi_bridge/.env.example` un placeholder **inerte** para `N8N_WEBHOOK_URL` (no el valor real): los valores reales nunca entran al repositorio (`runtime-configuration`).
- [x] 4.3 Verificar que `Settings()` sigue instanciando correctamente con el nuevo valor (arranque del Bridge sin error de configuración), respetando el contrato de nueve variables de `runtime-configuration`. — Confirmado por el usuario: el Bridge arranca sin error.

## 5. Corte al disparo por evento y cierre

- [x] 5.1 **Desactivar** el nodo Schedule Trigger (no eliminarlo — D-5): el Webhook Trigger queda como único disparador activo. — Confirmado desactivado.
- [x] 5.2 Confirmar que el workflow ya no se ejecuta por transcurso de tiempo (esperar el intervalo previo del Schedule sin enviar webhook → no hay ejecución) y que el Schedule sigue presente en el workflow (reversibilidad). — Confirmado por el usuario.
- [ ] 5.3 (Opcional, según OQ-3) Exportar el JSON del workflow n8n y decidir con el usuario si se versiona en el repo para trazabilidad. — **Pendiente, a cargo del usuario**: tiene el flujo actualizado y va a reemplazar `Flujo_Fuzzing_N8N.json` por la versión actual fuera de esta sesión.
- [ ] 5.4 (Opcional, según OQ-4/D-6) Evaluar/agregar nodos de manejo de error en el workflow, o dejar constancia de que queda fuera de alcance v1.2. — Fuera de alcance v1.2 (decisión del usuario).
- [x] 5.5 Marcar los criterios de aceptación de CHANGE-21 en `CHANGES.md` y dejar el change listo para `archive`.
