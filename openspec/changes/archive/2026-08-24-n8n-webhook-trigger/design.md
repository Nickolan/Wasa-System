## Context

El FastAPI Bridge ya está terminado del lado emisor: `scan-forwarding` (CHANGE-12, archivado) hace `POST` httpx al webhook del orquestador con header `X-WASA-TOKEN`, cuerpo JSON de cinco campos (`target_url`, `phpsessid`, `sqlmap_level`, `sqlmap_risk`, `scan_id`), timeout de 10 s, y trata como aceptación sólo un `2xx`. Lo que falta es la **puerta de entrada en n8n**: hoy el workflow WASA arranca por un Schedule Trigger periódico, no por evento. Este change es, en su mayor parte, **configuración de un sistema externo ya desplegado** (n8n self-hosted, docker, puerto 5678), no código de este repositorio.

Restricciones que enmarcan el diseño:
- n8n es un sistema existente que **no se reconstruye** — se lo configura para recibir el disparo que el Bridge ya emite.
- El contrato de recepción está fijado por lo que el Bridge envía: ruta/verbo, header de auth, forma del cuerpo. No hay libertad de rediseño del lado del Bridge (ya archivado).
- Governance del dominio: **ALTO**. La puerta de entrada del orquestador es un borde de seguridad (autenticación de webhook + superficie expuesta a la red). Las decisiones de configuración se surfacean acá para revisión humana **antes** de aplicar.
- Reglas duras del proyecto: la config del Bridge no se hardcodea (viene de `settings`); `N8N_WEBHOOK_TOKEN` nunca se loguea; env vars en `UPPER_SNAKE_CASE`.

## Goals / Non-Goals

**Goals:**
- Que un `POST` válido y autenticado a `/webhook/wasa-scan` dispare el workflow WASA completo.
- Que los cinco campos del escaneo lleguen a los nodos downstream vía `$json.*`, reemplazando la fuente del disparador periódico.
- Que el webhook responda `200 OK` de inmediato (background execution) dentro de la ventana de 10 s del Bridge.
- Que sin `X-WASA-TOKEN` correcto la solicitud sea rechazada con `403` sin ejecutar nada.
- Que el Schedule Trigger quede desactivado (reversible), dejando el webhook como único disparador activo.
- Que `N8N_WEBHOOK_URL` del `.env` del Bridge apunte a la ruta real del webhook.

**Non-Goals:**
- No se modifica código de aplicación del Bridge (routers, services, repositorios): el lado emisor ya está implementado.
- No se cambia el contrato de datos (`scan-payload-contract`) ni el mecanismo de entrega (`scan-forwarding`).
- No se rediseña el workflow WASA downstream (ZAP → Nuclei → ffuf → Redis → SQLMap worker → INSERT): sólo se recablea su **fuente de entrada** del Schedule al Webhook.
- No se define observabilidad/reintentos del workflow en background (fuera de alcance v1.2; el Bridge no espera el resultado).
- No se versiona el export JSON del workflow n8n en este repo salvo que el usuario lo pida (ver Open Questions).

## Decisions

> Las decisiones **D-1, D-2, D-3 y D-6** son las de mayor sensibilidad de gobernanza (ALTO) y necesitan revisión humana explícita antes del `apply`. Están marcadas con **[GOV-ALTO]**.

### D-1 [GOV-ALTO] — Autenticación del webhook: Header Auth sobre `X-WASA-TOKEN` vía credential manager

**Decisión**: El nodo Webhook Trigger usa autenticación **Header Auth** de n8n, configurada para exigir el header `X-WASA-TOKEN` con el secreto compartido. El secreto se da de alta como **credencial en el credential manager de n8n**, nunca embebido en los parámetros del nodo ni en el workflow exportado.

**Por qué**: El Bridge ya envía `X-WASA-TOKEN` en cada entrega (`scan-forwarding`). La compact rule de la skill `n8n-workflow` es explícita: credenciales siempre vía credential manager, nunca hardcodeadas. Header Auth es el mecanismo nativo de n8n para exactamente este caso y produce el `403` esperado sin lógica custom.

**Alternativas consideradas**: (a) Webhook sin auth + validar el token en un nodo IF/Code downstream — rechazada: ejecutaría el workflow (al menos el primer nodo) antes de rechazar, viola "no ejecuta nada sin credencial", y deja el secreto en un parámetro de nodo. (b) Basic Auth / query param token — rechazada: no coincide con lo que el Bridge ya envía (header `X-WASA-TOKEN`).

**Necesita revisión**: confirmar que el valor de la credencial Header Auth en n8n es **idéntico** a `N8N_WEBHOOK_TOKEN` del Bridge, y decidir quién custodia ese secreto.

**Aprendizaje (verificado en apply)**: el mecanismo Header Auth nativo de n8n rechaza con `403 "Authorization data is wrong!"`, no con `401` como se asumió originalmente — no es configurable por parámetros del nodo. Se decidió no revertir a la alternativa (a) solo para forzar `401`, porque reintroduciría el riesgo que esa alternativa tenía (ejecutar el primer nodo antes de rechazar). El criterio de aceptación se corrigió a `403` en `CHANGES.md`, este design y la spec — la garantía real (rechazo sin ejecutar nada) se mantiene intacta.

### D-2 [GOV-ALTO] — Origen y forma del valor de `N8N_WEBHOOK_URL`

**Decisión**: `N8N_WEBHOOK_URL` en `fastapi_bridge/.env` se actualiza al valor real de la ruta del Webhook Trigger (`<base-n8n>/webhook/wasa-scan`). Es un cambio de **valor operativo**, no de contrato: la variable ya está declarada en `runtime-configuration` y `scan-forwarding` ya la lee tipada desde `settings`. No se toca `settings.py` ni el código de entrega. En `.env.example` se mantiene un **placeholder inerte** (no el valor real), respetando "los valores reales nunca entran al repositorio".

**Por qué**: Regla dura del proyecto — nada de config hardcodeada; todo desde `.env`. El mecanismo de entrega no debe cambiar para cambiar el destino.

**Alternativas consideradas**: hardcodear la URL en algún lado del código — rechazada de plano por las reglas duras.

**Necesita revisión / bloqueante**: el valor real de `N8N_WEBHOOK_URL` (base host/puerto/esquema de la instancia n8n desplegada) es una **pregunta abierta de prioridad Alta** en `10_preguntas_abiertas.md` y no está documentado en las fuentes. Sin ese valor real no se puede completar la actualización del `.env` real (sí se puede dejar todo listo con placeholder). Definir también: ¿n8n queda detrás de HTTPS? ¿La URL es interna (docker network / `n8n.local`) o expuesta?

### D-3 [GOV-ALTO] — "Respond Immediately" (200) vs. esperar el resultado del workflow

**Decisión**: El Webhook Trigger responde en modo **Respond Immediately**: devuelve `200 OK` al recibir la solicitud, y el workflow ejecuta en background. No se espera a que ZAP/Nuclei/ffuf/SQLMap terminen.

**Por qué**: El Bridge impone timeout de 10 s a la entrega (`scan-forwarding`) y trata como aceptación cualquier `2xx`; el flujo E2E (Flujo 3, paso 10) dice explícitamente "n8n ejecuta el workflow en background". Un escaneo real tarda mucho más de 10 s: si el webhook esperara el resultado, el Bridge lo abortaría por timeout y devolvería `502` al usuario aunque el escaneo estuviera corriendo bien. Respond Immediately alinea la semántica: `200` inmediato → Bridge `202 Accepted` → usuario "escaneo encolado".

**Alternativas consideradas**: (a) "Respond When Last Node Finishes" — rechazada: garantiza timeout del Bridge en escaneos reales. (b) "Respond to Webhook" node al final — mismo problema de latencia.

**Necesita revisión**: confirmar que un `200` inmediato es aceptable como "encolado" para el negocio (el usuario no recibe confirmación de que el escaneo terminó, sólo de que arrancó — que es justamente RN-WS-08 / redirección al dashboard).

### D-4 — Recableado de la fuente de datos downstream: del Schedule al `$json.*` del webhook

**Decisión**: En cada nodo downstream que hoy consume datos del Schedule Trigger, se reemplaza la referencia por `$json.<campo>` del Webhook Trigger (`$json.target_url`, `$json.phpsessid`, `$json.sqlmap_level`, `$json.sqlmap_risk`, `$json.scan_id`). Se verifica con un `POST` de prueba que cada valor llega sin transformación al nodo correcto (ZAP/Nuclei/ffuf ← target_url+phpsessid; LPUSH Redis ← sqlmap_level+sqlmap_risk; INSERT scans ← scan_id).

**Por qué**: HU-04-02 y el criterio de aceptación exigen que los cinco campos lleguen downstream. Al cambiar el disparador, la forma del `$json` de entrada cambia y las referencias viejas quedarían rotas.

**Alternativas consideradas**: un nodo Set/Code intermedio que normalice el `$json` a la forma que esperaba el Schedule — posible mitigación si las referencias downstream son muchas y frágiles; se evalúa en apply según cuántos nodos haya que tocar. No se adopta por defecto para no agregar un nodo si el mapeo directo alcanza.

### D-5 — Schedule Trigger: desactivar, no borrar

**Decisión**: El Schedule Trigger se **desactiva** (queda en el workflow, inactivo), no se elimina.

**Por qué**: Reversibilidad. Si el webhook falla en producción, reactivar el Schedule es inmediato. Borrarlo perdería su configuración (intervalo, parámetros).

### D-6 [GOV-ALTO] — Manejo de fallas del lado del webhook y verificación

**Decisión**: La verificación de aceptación se hace con un `POST` manual (curl) que reproduce exactamente lo que envía el Bridge: header `X-WASA-TOKEN` correcto + cuerpo de cinco campos → espera `200`. Se agrega un caso negativo: sin/incorrecto `X-WASA-TOKEN` → espera `403`. La skill `n8n-workflow` recomienda nodos de manejo de error explícitos y probar con datos de muestra antes de cablear a producción; se prueba primero contra los datos de muestra y sólo después se desactiva el Schedule.

**Por qué**: Es un borde de seguridad. Hay que probar el rechazo `403` y la aceptación `200` antes de dar el cambio por hecho, y hacerlo sin exponer el token en logs/historial de shell.

**Necesita revisión**: (a) ¿Se agregan nodos de error-handling en el workflow (p. ej. notificación si un nodo downstream falla), o queda fuera de alcance v1.2? (b) ¿Cómo se ejecuta el curl de prueba sin dejar `X-WASA-TOKEN` en el historial de la shell / logs? (variable de entorno de shell, `--header @file`, etc.)

## Risks / Trade-offs

- **[El valor real de `N8N_WEBHOOK_URL`/`N8N_WEBHOOK_TOKEN` no está documentado]** → Mitigación: dejar el `.env.example` con placeholder inerte y la lógica lista; la actualización del `.env` real y la credencial en n8n quedan como paso operativo que requiere los valores reales del usuario (pregunta abierta Alta). Es un bloqueante para el criterio "POST manual dispara el workflow" contra la instancia real.
- **[Respond Immediately oculta fallas del workflow en background]** → Mitigación aceptada para v1.2: el Bridge no espera el resultado por diseño; el estado del escaneo se observa en el dashboard existente, no en la respuesta del webhook. Error-handling downstream se evalúa en D-6.
- **[Referencias downstream rotas al cambiar el disparador]** → Mitigación: probar con datos de muestra ANTES de desactivar el Schedule; verificar los cinco campos en sus nodos; si el mapeo es frágil, insertar un nodo Set normalizador (D-4 alternativa).
- **[Webhook expuesto a la red = superficie de ataque]** → Mitigación: Header Auth obliga token en cada request; sin él, `403` sin ejecutar. Confirmar además si n8n queda tras HTTPS y con acceso restringido (D-2).
- **[Secreto filtrado en logs o historial de shell durante la prueba]** → Mitigación: token vía credential manager en n8n (nunca en el workflow export); curl de prueba sin el token en claro en el historial (D-6).
- **[Cambio no versionable en este repo]** → La config de n8n vive en el sistema externo, no en git. Riesgo de deriva/pérdida. Mitigación posible: exportar el workflow JSON y versionarlo (Open Question).

## Migration Plan

1. **Preparación (sin tocar producción)**: dar de alta la credencial Header Auth `X-WASA-TOKEN` en el credential manager de n8n con el valor de `N8N_WEBHOOK_TOKEN`.
2. **Agregar el Webhook Trigger** (`POST /webhook/wasa-scan`, Header Auth, Respond Immediately) **con el Schedule aún activo** — el workflow sigue funcionando por el disparador viejo mientras se prueba el nuevo.
3. **Recablear** los nodos downstream a `$json.*` (D-4).
4. **Probar con datos de muestra**: curl con token correcto → `200` + verificar los cinco campos downstream; curl sin/incorrecto token → `403`.
5. **Actualizar `N8N_WEBHOOK_URL`** en `fastapi_bridge/.env` a la ruta real; `.env.example` con placeholder.
6. **Desactivar el Schedule Trigger** (D-5) — recién ahora el webhook es el único disparador.
7. **Rollback**: reactivar el Schedule Trigger (sigue presente, sólo desactivado) y, si hace falta, revertir el valor de `N8N_WEBHOOK_URL`. Ningún dato migrado, ninguna tabla tocada — rollback es puramente reconfiguración.

## Open Questions

- **OQ-1 [bloqueante, prioridad Alta]**: ¿Cuál es el valor real de `N8N_WEBHOOK_URL` (esquema/host/puerto de la instancia n8n desplegada) y de `N8N_WEBHOOK_TOKEN`? Sin ellos no se completa el `.env` real ni la credencial en n8n (ver `10_preguntas_abiertas.md`).
- **OQ-2**: ¿n8n queda detrás de HTTPS y con acceso de red restringido, o expuesto? Afecta el riesgo de superficie (D-2).
- **OQ-3**: ¿Se versiona el export JSON del workflow n8n en este repo para trazabilidad, o la config vive sólo en el sistema externo?
- **OQ-4**: ¿Se agregan nodos de manejo de error en el workflow (notificación ante falla de un nodo downstream) o queda fuera de alcance de v1.2? (D-6)
- **OQ-5**: ¿Cuántos nodos downstream referencian los datos del Schedule? Determina si el recableado directo alcanza o conviene un nodo Set normalizador (D-4).
- **OQ-6**: ¿Cómo se corre el curl de verificación sin exponer `X-WASA-TOKEN` en el historial de shell / logs?
