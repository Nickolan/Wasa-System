## Context

Ver `proposal.md` §Why para la motivación. Lo que este documento necesita fijar es **cómo**
viaja el email desde el JWT hasta el nodo `Send email` de n8n, atravesando cuatro piezas que
hoy ya existen y funcionan.

Estado actual verificado en el repo (2026-08-28):

- `fastapi_bridge/core/dependencies.py::get_current_user` devuelve `str` — el email del usuario
  autenticado, tomado del `sub` del JWT. El módulo además ya expone la anotación canónica
  `CurrentUserEmail = Annotated[str, Depends(get_current_user)]` (D-6 de CHANGE-06), declarada
  como "la anotación única que los routers **deben** usar".
- `fastapi_bridge/api/v1/scan/router.py` resuelve `current_user: str = Depends(get_current_user)`
  y **no lo usa**: llama `service.start_scan(scan_request)`. El guard funciona (401 correcto),
  el dato se descarta.
- `fastapi_bridge/services/scan_service.py::ScanService.start_scan(request)` compone el
  `N8nPayload` campo por campo y entrega dentro de un `async with self._uow_factory()`.
- `fastapi_bridge/repositories/n8n_repository.py::forward_scan` hace
  `payload.model_dump(mode="json")` — genérico respecto de los campos del contrato.
- `Herramientas/Flujo_Fuzzing_N8N.json`: cadena de ejecución confirmada leyendo el bloque
  `connections` del JSON:

  ```
  Webhook / Manual Trigger / Schedule Trigger
        └─> URL Ejemplo  (code — único punto de normalización)
              └─> Loop Over Items
                    └─> Crear ID ─> ZAP Spider ─> {ffuf, Alertas ZAP, Nuclei Scann, Item Lists}
                                          └─> ... ─> Reporte Final ─> reporteHTML ─> AddHTML ─> Send email
  ```

  El **input directo** de `Send email` es `AddHTML`, cuyo `return` es exactamente
  `[{ json: { correoFinal } }]`. Es decir: en el item que `Send email` recibe **no existe**
  ningún campo `email`. Cualquier expresión de la forma `$json.email` en ese nodo resolvería a
  `undefined`. Esto condiciona la decisión D-6.

Restricciones duras del proyecto que aplican (ver `CLAUDE.md`): el Router no contiene lógica de
negocio; el Service no instancia `httpx`/`SQLAlchemy`; el Repository no importa nada de
FastAPI; nada de configuración hardcodeada; type hints obligatorios; TDD estricto activo.

## Goals / Non-Goals

**Goals:**

- Que el email del usuario autenticado atraviese Router → Service → `N8nPayload` → webhook →
  nodo de envío, sin que ninguna capa lo invente, lo valide de nuevo ni lo reemplace.
- Que la imposibilidad de que el cliente elija destinatario quede **verificada por tests**, no
  solo documentada.
- Que el diff de producción quede acotado a tres archivos del Bridge y dos nodos del workflow.

**Non-Goals:**

- No se cambia el contrato HTTP del endpoint (mismos campos de entrada, misma respuesta,
  mismos códigos de estado). Ningún cliente existente necesita cambiar.
- No se toca el frontend: no hay campo de email que agregar al formulario, por diseño.
- No se persiste el email del solicitante en la tabla `scans` ni en ninguna otra: el reporte se
  envía en el momento, no se re-envía después. (Si más adelante se quisiera reenviar un reporte
  viejo, eso es otro change.)
- No se cambia el `fromEmail` del nodo `Send email` (ver D-7).
- No se agregan reintentos, colas ni confirmación de entrega del correo: si el SMTP de n8n
  falla, falla igual que hoy.
- No se toca `core/settings.py`: el Bridge no gana ninguna variable de entorno nueva.

## Decisions

### D-1 — El email del reporte se toma del JWT, nunca de un campo del cliente

**Decisión**: la única fuente del email que viaja en el `N8nPayload` es `get_current_user`, es
decir el `sub` del JWT que el guard ya validó. `ScanRequest` no declara ni declarará un campo
de email, y `model_config = ConfigDict(extra="ignore")` garantiza que un campo `email` enviado
igual por el cliente sea descartado en la validación, antes de llegar al Service.

**Alternativas consideradas**:

1. Agregar `email: EmailStr` a `ScanRequest` y que el usuario lo complete en el formulario —
   **rechazada**. Permitiría que cualquier usuario autenticado exfiltre a una casilla ajena un
   reporte con hallazgos de seguridad de un objetivo real (rutas descubiertas, alertas ZAP,
   inyecciones SQLMap). El costo de la vulnerabilidad supera ampliamente la comodidad.
2. Campo opcional que, si viene, sobrescribe el del JWT — **rechazada**. Es la alternativa 1
   con una capa de falsa seguridad: el camino explotable sigue existiendo.
3. Que n8n resuelva el email consultando la tabla `users` por `scan_id` — **rechazada**.
   Agrega una consulta a la base y un acoplamiento nuevo del workflow al esquema de `users`,
   para obtener un dato que el Bridge ya tiene en la mano y puede mandar gratis.

**Justificación**: es exactamente el mismo patrón que `scan_id` — un dato que el Bridge aporta
y el cliente no puede fijar ni influir (ver `scan-initiation`, requisito "Cada escaneo iniciado
recibe un identificador generado por el Bridge"). Formalizado en RN-WS-16 y DD-05.

> **Nota de governance (MEDIO)**: ésta es la decisión no obvia de este change y se deja
> explícita acá para revisión del usuario antes del apply, aunque ya esté pre-respondida en la
> KB. Si el usuario prefiriera permitir un destinatario elegible, **cambian los specs**
> (`scan-payload-contract`) y hay que rehacer la propuesta — no es un ajuste de implementación.

### D-2 — `user_email` es un parámetro obligatorio de `start_scan`, sin valor por defecto

**Decisión**: la firma pasa a `async def start_scan(self, request: ScanRequest, user_email: str)
-> ScanResponse`. Sin `= None`, sin `= ""`, sin destinatario de respaldo del lado del Bridge.

**Alternativas consideradas**:

1. `user_email: str | None = None` y omitir el campo del payload si es `None` — **rechazada**.
   Haría que un call site que se olvide de pasar el email siga compilando y siga pasando los
   tests, y el síntoma aparecería recién como "el reporte no llegó" en producción.
2. Leer el email desde un contexto/`ContextVar` poblado por un middleware — **rechazada**.
   Acopla el Service a un mecanismo del framework web y viola la regla dura de que la
   iniciación es independiente de FastAPI (hay tests que lo verifican por AST).

**Trade-off aceptado**: es **BREAKING** para los call sites internos. Rompe deliberadamente las
~23 invocaciones de `start_scan(...)` en `test_scan_service.py` y el doble `FakeScanService` de
`test_scan_router.py`. Esa rotura es la red de seguridad: el compilador/los tests señalan cada
lugar que hay que revisar. La actualización de los tests es trabajo previsto, no daño colateral
(ver `tasks.md`).

### D-3 — El email viaja **dentro** del `N8nPayload`, no como header ni como argumento aparte

**Decisión**: `N8nPayload` gana `email: str` y `N8nRepository.forward_scan` **no cambia**.

**Justificación**: `forward_scan` ya serializa con `payload.model_dump(mode="json")`, así que el
campo nuevo viaja solo. Mandarlo como header (`X-WASA-USER-EMAIL`) obligaría a tocar el
Repository, a que n8n lo lea de un lugar distinto que el resto de los campos del escaneo, y
rompería la propiedad de que "el cuerpo del webhook ES el contrato del escaneo". El único
trabajo del Repository en este change es **verificar** por test que el campo nuevo aparece en
el JSON enviado, sin modificar el módulo.

### D-4 — `N8nPayload.email` se tipa como `str`, no como `EmailStr`

**Decisión**: `email: str`.

**Justificación**: `N8nPayload` es un contrato de **transporte**, no un borde de validación de
entrada — misma razón por la que `target_url` es `str` y no `HttpUrl` (D-5 de CHANGE-08). El
valor ya fue validado como `EmailStr` en el registro (`auth_schemas.py` usa `EmailStr` en
`RegisterRequest`/`LoginRequest`) y viene firmado dentro del JWT; revalidarlo acá no agrega
seguridad y agrega un modo de falla nuevo: un email legítimo que `email-validator` rechace por
una regla más estricta convertiría un escaneo válido en un `500`. Además `TokenData.email` ya es
`str | None` y no `EmailStr` por esta misma razón (D-1 de CHANGE-04).

**Alternativa considerada**: `EmailStr` — rechazada por lo anterior.

### D-5 — El router adopta la anotación canónica `CurrentUserEmail`

**Decisión**: al tocar la firma del handler, el parámetro pasa de
`current_user: str = Depends(get_current_user)` a `current_user: CurrentUserEmail`, que es la
forma que `core/dependencies.py` documenta como obligatoria para routers (D-6 de CHANGE-06), y
el cuerpo pasa a `await service.start_scan(scan_request, current_user)`.

**Justificación**: es la misma dependencia envuelta en `Annotated`, así que el guard, el
esquema OpenAPI y los `app.dependency_overrides[get_current_user]` de los tests siguen
funcionando idénticos. Alinea el router con su propia convención mientras se edita esa línea.

**Alternativa considerada**: dejar `Depends(get_current_user)` tal cual — **aceptable**. Si
alguno de los tests de OpenAPI ya existentes
(`test_scan_start_declares_a_bearer_security_requirement`) fallara con la anotación, se revierte
a la forma actual: el reenvío del email no depende de esta elección. Esta decisión es cosmética
y aislable.

### D-6 — En n8n, el email se propaga en `URL Ejemplo` y `toEmail` lo referencia por nodo, no por `$json`

**Decisión**:

- Nodo `URL Ejemplo` (rama Webhook): agregar al objeto devuelto
  `email: webhookPayload.email ?? NOTIFICATION_EMAIL_FALLBACK`.
- Nodo `URL Ejemplo` (rama Manual/Schedule): agregar `email: NOTIFICATION_EMAIL_FALLBACK`,
  donde `NOTIFICATION_EMAIL_FALLBACK = getEnv('WASA_NOTIFICATION_EMAIL', '<casilla fija actual>')`,
  usando el helper `getEnv` que el nodo **ya tiene** y con el mismo patrón que
  `ZAP_API_KEY` / `WASA_PHPSESSID` / `WASA_TARGET_URL`.
- Nodo `Send email`: `toEmail` pasa de `"tu-correo@example.com"` a la expresión

  ```
  ={{ $('URL Ejemplo').first().json.email }}
  ```

**Justificación de la referencia por nodo** (esto es lo que no se podía dar por sentado): el
input directo de `Send email` es `AddHTML`, que devuelve exactamente
`[{ json: { correoFinal } }]`. Por lo tanto `$json.email` en `Send email` sería `undefined` y
el envío fallaría o se mandaría sin destinatario. `$('URL Ejemplo')` sí resuelve: es un ancestro
de `Send email` en la misma ejecución, y el workflow **ya usa exactamente ese patrón** desde
otros nodos igual de downstream — `Reporte Final`, `ffuf`, `Nuclei Scann`,
`ZAP Spider (Descubrimiento)` y `Redis` referencian `$('URL Ejemplo').first().json.X`. No se
introduce un mecanismo nuevo: se reusa el que el workflow ya tiene.

**Justificación del fallback**: el workflow se sigue ejecutando manualmente para las corridas de
prueba documentadas en la tesis, sin cuerpo de webhook. Sin fallback, esas corridas quedarían
sin destinatario. El fallback vive del lado de n8n (`WASA_NOTIFICATION_EMAIL`), **no** del lado
del Bridge: el Bridge nunca manda un destinatario de respaldo (D-2).

**Alternativa considerada**: propagar el email nodo por nodo hasta `Send email` — **rechazada**:
`URL Ejemplo` es el único punto de normalización del flujo justamente para no tener que hacer
eso, y `AddHTML` reconstruye el item desde cero, así que la propagación se perdería igual.

### D-7 — `fromEmail` no se toca

**Decisión**: `fromEmail` sigue siendo el literal actual.

**Justificación**: `fromEmail` es la identidad del **remitente**, atada a la credencial SMTP
configurada en n8n. Cambiarlo por el email del usuario haría que n8n intente enviar en nombre
de una casilla sobre la que no tiene credencial: SPF/DKIM lo marcarían como spam o el servidor
SMTP lo rechazaría directamente. El pedido del usuario es sobre el destinatario, no sobre el
remitente.

### D-8 — Orden de implementación: contrato → servicio → borde → workflow

**Decisión**: `N8nPayload` primero, después `ScanService`, después el router, y el workflow de
n8n al final.

**Justificación**: cada paso deja el anterior verde antes de avanzar, y el workflow es el único
paso que no se puede cubrir con tests automáticos (se verifica manualmente). Poniéndolo último,
todo lo verificable queda demostrado antes de depender de una verificación manual. Además, con
TDD estricto, tocar el contrato primero hace que los tests de las capas de arriba fallen por la
razón correcta (falta el campo) y no por una cascada de errores mezclados.

## Risks / Trade-offs

- **[El apply rompe ~25 tests existentes de golpe y se pierde la señal]** → Red de seguridad
  obligatoria (paso 0 de `tasks.md`): correr `test_scan_schemas.py`, `test_scan_service.py` y
  `test_scan_router.py` **antes** de tocar nada y anotar el baseline en verde. Cualquier fallo
  posterior que no esté explicado por la firma nueva es una regresión real, no ruido esperado.
- **[Un usuario recibe el reporte de un escaneo que no disparó]** → Es el peor fallo posible de
  este change (fuga de hallazgos de seguridad de un objetivo ajeno). Mitigación: test explícito
  de que dos solicitantes distintos con cuerpos idénticos producen dos payloads con emails
  distintos, en la capa Service **y** en la capa router con dos overrides distintos de
  `get_current_user`.
- **[El cliente logra fijar el destinatario por un campo extra]** → Test explícito que envía
  `email="atacante@example.com"` en el cuerpo del `POST /api/v1/scan/start` y verifica que el
  payload entregado lleva el email del JWT y que el valor del atacante no aparece en ninguna
  parte del payload. `extra="ignore"` ya lo garantiza, pero sin test es una garantía que se
  puede perder con un `extra="allow"` distraído.
- **[El email queda registrado en logs o en cuerpos de error]** → `scan_service.py` ya tiene
  tests que prohíben `logging`/`print` en el módulo, y `test_scan_router.py` ya verifica que el
  `phpsessid` nunca aparece en un cuerpo de error. Extender esa verificación al email: es un
  dato personal, no debe aparecer en un `502` RFC 7807 ni en la respuesta `202`.
- **[`toEmail` referencia mal el nodo y el envío falla silenciosamente]** → Riesgo real: en n8n
  una expresión que resuelve a `undefined` puede producir un envío fallido cuyo error no se ve
  hasta revisar el execution history. Mitigación: la referencia elegida (D-6) es la misma que
  ya usan cinco nodos del workflow, y la verificación de aceptación incluye disparar un escaneo
  real y confirmar la recepción en la casilla del usuario de prueba.
- **[Editar el JSON del repo no cambia la instancia de n8n que corre]** → Ver Open Question
  O-1. Es la única parte de este change que no se puede cerrar sin una acción explícita del
  usuario sobre su instancia.
- **[Un cliente viejo o un test manual dispara el webhook sin `email`]** → El nodo
  `URL Ejemplo` usa `??` con el fallback de entorno, así que el workflow no aborta. El costo es
  que un payload mal formado se manifiesta como "el reporte llegó a la casilla de respaldo" en
  vez de como un error ruidoso; se acepta a cambio de no romper las corridas manuales.

## Migration Plan

No hay migración de datos: sin cambios de esquema, sin tablas nuevas, sin `.env` nuevo del lado
del Bridge.

**Despliegue** (dos piezas, en este orden):

1. **Bridge**: desplegar los tres archivos modificados. El endpoint sigue aceptando exactamente
   los mismos cuerpos, así que no hay ventana de incompatibilidad con el frontend. A partir de
   este momento el webhook recibe un campo `email` extra que el workflow viejo simplemente
   ignora — el sistema queda funcionando igual que antes (reporte a la casilla fija), sin
   romperse.
2. **n8n**: aplicar los cambios de `URL Ejemplo` y `Send email` (por el camino que decida el
   usuario en O-1) y definir `WASA_NOTIFICATION_EMAIL` en el entorno del orquestador. Recién acá
   el reporte empieza a llegar a la casilla del usuario.

Este orden hace que el paso 1 sea seguro por sí solo: entre el paso 1 y el paso 2 el sistema no
queda roto, solo queda con el comportamiento viejo.

**Rollback**: revertir el nodo `Send email` a su `toEmail` literal restaura el comportamiento
anterior de inmediato, sin necesidad de revertir el Bridge (el campo extra en el cuerpo del
webhook es inocuo para el workflow viejo).

**Verificación post-despliegue** (nota de CHANGE-23 en `CHANGES.md`): re-ejercitar manualmente
el criterio "POST a /scan/start con JWT válido" del smoke test de CHANGE-22 y confirmar que el
correo llega a la casilla del usuario de prueba. Esto **no** reabre ni modifica los criterios ya
registrados de CHANGE-22.

## Open Questions (resueltas)

### O-1 — ¿Quién aplica los cambios al workflow de n8n? — **Resuelto 2026-08-28: opción (a)**

**Decisión del usuario**: el agente edita `Herramientas/Flujo_Fuzzing_N8N.json` directamente en
el repo, durante el `apply` (paso 4 de `tasks.md`), con los cambios exactos fijados en D-6. El
usuario se encarga después de importar ese JSON en su instancia real de n8n — el `apply` de este
change **no** toca ni tiene acceso a la instancia en ejecución, solo deja el export del repo
consistente y listo para importar.

### O-2 — Valor concreto de `WASA_NOTIFICATION_EMAIL` — **Resuelto 2026-08-28**

**Decisión del usuario**: `lautiferreria@gmail.com` — casilla personal del usuario, usada como
destinatario de respaldo únicamente para las corridas Manual Trigger / Schedule Trigger (sin
webhook, sin usuario autenticado real detrás). El nodo `URL Ejemplo` debe leerla vía
`getEnv('WASA_NOTIFICATION_EMAIL', 'lautiferreria@gmail.com')` — mismo patrón que
`ZAP_API_KEY`/`WASA_PHPSESSID` — de modo que sea configurable por variable de entorno en el
orquestador n8n sin quedar hardcodeada de forma no overridable.
