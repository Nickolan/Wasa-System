## Context

Ver `proposal.md` — Why para la motivación, y `specs/scan-forwarding/spec.md` para los requirements normativos. Este documento cubre únicamente el *cómo*.

Estado actual verificado en el repo:

- `fastapi_bridge/repositories/n8n_repository.py` existe pero es sólo el docstring placeholder del scaffold de CHANGE-00a. **Nadie lo importa**: ni `services/scan_service.py` ni `uow/scan_unit_of_work.py` están implementados todavía. Reescribir el archivo no rompe nada.
- El placeholder dice *"Se implementa en CHANGE-12"*; `CHANGES.md` dice CHANGE-09. El placeholder es el desactualizado (mismo desfasaje que ya se corrigió en `scan_schemas.py` durante CHANGE-08). Al reescribir el archivo, el conflicto desaparece.
- `fastapi_bridge/schemas/scan_schemas.py` ya define `N8nPayload` (CHANGE-08, archivado) con los cinco campos y `target_url: str` — deliberadamente `str` y no `HttpUrl` (D-5 de CHANGE-08) *justamente* para que este change no tenga que transformar nada antes de serializar.
- `fastapi_bridge/core/settings.py` ya expone `N8N_WEBHOOK_URL: str` y `N8N_WEBHOOK_TOKEN: SecretStr` (CHANGE-00c). El `.env` real del servidor ya tiene los valores correctos; este change **no** los toca, no los inventa y no los assertea en ningún test.
- `fastapi_bridge/exceptions/` contiene sólo `handlers.py`, que importa `starlette` y `slowapi`. No existe todavía ningún módulo de excepciones de dominio.
- `fastapi_bridge/tests/test_layer_boundaries.py` ya verifica por AST que `repositories/` no importa `fastapi`, con una tabla `LAYER_IMPORT_RULES` diseñada explícitamente para que agregar una regla sea una línea.
- Entorno: `httpx>=0.27` en `requirements.txt` (instalado: httpx moderno con `MockTransport` en API pública), pytest 8 con `pytest.ini` → `testpaths = fastapi_bridge/tests`, `asyncio_mode = auto` (los tests `async def` corren sin decorador).
- Convención de tests de configuración ya establecida (`test_settings.py`): se instancia `Settings()` **directamente**, no `get_settings()` — porque `get_settings` está bajo `@lru_cache` y ensuciaría el estado entre tests. Esa convención condiciona D-1.

Restricciones del proyecto que condicionan el diseño:

- Reglas duras de `CLAUDE.md`: el Repository NUNCA importa nada de FastAPI; nada de config hardcodeada (todo por `core/settings.py`); type hints obligatorios en toda función; `async` en toda la capa de I/O; `PascalCase` para clases, `snake_case` para funciones/archivos.
- Regla de capas de la KB: `Router → Service → UoW → Repository → (SQLAlchemy/httpx, Settings)`. El Repository **sí** puede depender de `Settings` — es la única capa junto al UoW que toca infraestructura.
- Governance **MEDIO**: adaptador de I/O saliente que maneja un secreto. Se implementa en pasos y se surfacean las decisiones no obvias (D-1, D-3, D-4, D-6).

## Goals / Non-Goals

**Goals:**

- Que `N8nRepository` sea el **único** punto del sistema que hace I/O contra n8n, de modo que cambiar la forma de hablar con el orquestador sea cambiar un archivo.
- Que sea testeable **sin red y sin n8n levantado**, sin agregar dependencias de desarrollo y sin monkeypatchear internals de `httpx`.
- Que toda falla de infraestructura salga traducida a **una** condición de dominio (`N8nUnavailableError`), para que CHANGE-12 tenga exactamente un `except` que mapear a 502 RFC 7807.
- Que el secreto del webhook no pueda filtrarse por accidente: entra por configuración, sale sólo en el header, no aparece en ningún mensaje de error.
- Que la regla dura de pureza de la capa Repository quede **verificada automáticamente**, no sólo prometida en un docstring.

**Non-Goals:**

- No se crea ni se cierra el `httpx.AsyncClient`. Su ciclo de vida es de `ScanUoW` (CHANGE-10). Este change asume el cliente ya construido.
- No se registra ningún handler de excepción, ni se mapea nada a 502. `exceptions/handlers.py` no se toca: eso es CHANGE-12.
- No se genera el `scan_id` ni se construye el `N8nPayload` a partir del `ScanRequest`: eso es `ScanService` (CHANGE-11). Acá el payload llega ya armado.
- No se implementa logging estructurado ni métricas de la integración. No hay infraestructura de logging en el Bridge todavía y agregarla acá sería inventar un patrón fuera de alcance.
- No se implementan reintentos, backoff, circuit breaker ni cola de reenvío (ver D-11).
- No se valida el contenido del payload. `scan-payload-contract` ya lo hizo; revalidar sería duplicar la autoridad.

## Decisions

### D-1 — `Settings` se inyecta por constructor; el repositorio no llama a `get_settings()`

Firma adoptada:

```
class N8nRepository:
    def __init__(self, client: httpx.AsyncClient, settings: Settings) -> None: ...
```

`CHANGES.md` describe el constructor como "recibe `client: httpx.AsyncClient`" y no menciona `Settings`. Es una **extensión deliberada y mínima** de ese scope, por tres razones:

1. **Testabilidad.** La convención de casa (`test_settings.py`) es construir `Settings()` directamente porque `get_settings()` está bajo `@lru_cache`. Si el repositorio llamara a `get_settings()` internamente, cada test tendría que hacer `get_settings.cache_clear()` + `monkeypatch.setenv(...)` y confiar en que ningún test previo dejó la cache caliente — frágil y contagioso.
2. **Pureza de capa.** Un repositorio que se auto-resuelve su configuración es un repositorio con una dependencia oculta. Inyectarla lo deja completamente determinado por sus argumentos, que es justamente lo que exige el requirement "el mecanismo de entrega funciona sin la aplicación web levantada".
3. **Composition root natural.** `ScanUoW.__aenter__` (CHANGE-10) ya va a ser el punto que construye el cliente; que construya también el repositorio pasándole `Settings` no le agrega ninguna complejidad.

- *Alternativa descartada*: `get_settings()` dentro de `forward_scan`. Rechazada por (1) y (2). Además obligaría a que la capa Repository conozca el mecanismo de cacheo de la app, que es una decisión de la capa `core`.
- *Alternativa descartada*: `settings: Settings | None = None` con fallback a `get_settings()`. Es lo peor de ambos mundos: mantiene la dependencia oculta *y* agrega una rama que nadie usa en producción.
- *Impacto en CHANGE-10*: `ScanUoW` deberá pasar `Settings` al construir el repositorio. Queda anotado acá para que ese change no se sorprenda.

### D-2 — `N8nUnavailableError` vive en `fastapi_bridge/exceptions/errors.py`, módulo nuevo y puro

`exceptions/handlers.py` importa `starlette` y `slowapi`. Si `N8nUnavailableError` viviera ahí, `repositories/n8n_repository.py` tendría que importar Starlette para levantarla — arrastrando el framework web a la capa que por regla dura debe ser reutilizable fuera de él. El test de fronteras hoy no lo detectaría (sólo prohíbe `fastapi`), pero la regla se estaría violando igual.

Por eso: módulo nuevo `fastapi_bridge/exceptions/errors.py`, **sin ningún import**, con las excepciones de dominio del Bridge. `N8nUnavailableError(Exception)` es la primera; CHANGE-04/CHANGE-05 (email duplicado, credenciales inválidas) tienen ahí su lugar natural cuando lleguen.

- *Alternativa descartada*: definir la excepción dentro de `repositories/n8n_repository.py`. Funciona, pero obliga a `api/v1/scan/router.py` (CHANGE-12) a importar desde la capa Repository para poder capturarla — un router importando del repositorio salta dos capas y contradice el flujo `Router → Service → UoW → Repository`. Un módulo de excepciones transversal no pertenece a ninguna capa y lo pueden importar todas.
- *Alternativa descartada*: `exceptions/handlers.py`. Rechazada por el arrastre de Starlette explicado arriba.
- *Alternativa descartada*: heredar de `HTTPException` de FastAPI. Rechazada frontalmente: metería FastAPI en el repositorio. El mapeo a HTTP es responsabilidad del borde, no del dominio.
- Hereda de `Exception` a secas, no de una `WasaError` base. Una jerarquía de una sola hoja es ceremonia; cuando haya una segunda excepción de dominio se evalúa la base con evidencia real.

### D-3 — El timeout de 10s se pasa por request, no se configura en el cliente

`await self._client.post(url, json=..., headers=..., timeout=REQUEST_TIMEOUT_SECONDS)`.

El requirement dice que el límite es una garantía **del mecanismo de entrega**, no del canal. Como el cliente lo inyecta `ScanUoW` (y mañana podría inyectarlo un test, un script o un change futuro), configurar el timeout en el cliente dejaría la garantía en manos de quien lo construye. Pasarlo por request lo hace incondicional: no importa cómo venga configurado el `AsyncClient`, esta entrega se corta a los 10 segundos.

- *Alternativa descartada*: `httpx.AsyncClient(timeout=10.0)` en el UoW. Deja la garantía fuera del módulo que la promete y fuera del alcance de los tests de este change.
- El valor vive en una constante de módulo (`REQUEST_TIMEOUT_SECONDS: float = 10.0`), no como literal en la llamada. **No** se agrega a `Settings`: `CHANGES.md` no lo lista como variable de entorno, `.env.example` no lo tiene, y `test_env_contract.py` verifica **paridad exacta** entre las claves de `.env.example` y los campos de `Settings` — agregar un campo rompería ese test. Si algún día el timeout necesita ser configurable, se agrega en ambos lados a la vez, en un change propio.

### D-4 — Éxito es cualquier código 2xx (`response.is_success`), no `== 200` exacto

**Actualizado tras revisión del usuario** (reemplaza la decisión original de este documento). Se usa `response.is_success` (equivalente a `200 <= status_code < 300`), no la comparación estricta `== 200` ni `raise_for_status()`.

- `raise_for_status()` sigue descartado: sólo levanta para 4xx/5xx, así que no distingue 2xx de éxito por sí solo y de todos modos habría que envolverlo.
- La comparación estricta `== 200` fue la decisión original, pero el código de respuesta real del Webhook Trigger de n8n (200, 204, u otro 2xx según cómo esté configurado el nodo "Respond to Webhook" del workflow) no está confirmado desde el repo — el export versionado (`Flujo_Fuzzing_N8N.json`) arranca con un `manualTrigger` y no incluye el Webhook Trigger definitivo. Exigir exactamente 200 arriesgaba marcar como "orquestador no disponible" una entrega que en realidad fue aceptada, con el mismo efecto visible para el usuario que una falla real (502 "El sistema de escaneo no está disponible").
- `is_success` cubre 200, 201, 204 y cualquier otro 2xx futuro sin que este repositorio deba conocer la configuración exacta del nodo de respuesta de n8n. Sigue excluyendo — y tratando como indisponibilidad — 3xx, 4xx y 5xx, que es el comportamiento que protege el requirement de "código distinto de 2xx es indisponibilidad".

Decisión no obvia, **surfaceada al usuario y confirmada por él**: ablandar el criterio a 2xx corre el riesgo (menor) de aceptar como éxito una redirección accidental del lado de n8n si algún día el Webhook Trigger devolviera un 2xx sin haber realmente encolado el escaneo — no se ha visto ese caso en la práctica y el smoke test E2E de CHANGE-22 lo detectaría. El usuario aceptó ese trade-off explícitamente en lugar del riesgo inverso (falsos negativos con 200 estricto).

### D-5 — Se capturan las excepciones de `httpx` por su raíz `RequestError`, y se re-levanta con `raise ... from exc`

```
try:
    response = await self._client.post(...)
except httpx.RequestError as exc:
    raise N8nUnavailableError(...) from exc
```

`httpx.TimeoutException` y `httpx.ConnectError` son ambas subclases de `httpx.RequestError`, que cubre además `ReadError`, `WriteError`, `ProtocolError` y los errores de proxy — todos casos de "no pude completar la entrega" que el spec agrupa bajo la misma condición. Capturar la raíz evita una lista de `except` que envejece mal con cada versión de httpx.

- *Alternativa descartada*: `except (httpx.TimeoutException, httpx.ConnectError)`. Deja escapar `ReadError` y `ProtocolError` crudos hacia el service, violando el requirement de que ninguna falla de transporte se escape sin traducir.
- *Alternativa descartada*: `except Exception`. Atraparía bugs de programación (un `TypeError` en la construcción del payload) y los disfrazaría de "n8n no disponible", que es exactamente el modo de falla más difícil de diagnosticar en producción.
- `from exc` preserva la causa original en el traceback para diagnóstico, **sin** meterla en el mensaje de la excepción (D-8). El traceback es interno; el mensaje puede terminar cerca de una respuesta HTTP.

### D-6 — `forward_scan` devuelve `bool` aunque sólo pueda devolver `True`

La firma `-> bool` viene de `CHANGES.md` y la consume CHANGE-11. Es un booleano degenerado: o devuelve `True`, o levanta. Se mantiene igual, por dos razones: es el contrato que el roadmap ya fijó para el service, y un `-> None` obligaría a que CHANGE-11 (que hoy espera un booleano) cambie su forma de llamar.

El diseño **no** usa el `False` como canal de error: devolver `False` ante una falla obligaría al service a chequear el retorno *y* a manejar excepciones, dos caminos de error para la misma condición. Un único canal —la excepción— es lo que hace que CHANGE-12 tenga un solo `except`.

### D-7 — El cuerpo se manda con `json=payload.model_dump(mode="json")`

`json=` deja que httpx serialice y ponga `Content-Type: application/json` solo. `mode="json"` garantiza tipos JSON-nativos aunque `N8nPayload` gane en el futuro un campo que no sea `str`/`int` (hoy los cinco lo son, gracias a D-5 de CHANGE-08).

- *Alternativa descartada*: `content=payload.model_dump_json()` + header `Content-Type` manual. Más código para el mismo resultado, y un header más que mantener a mano.
- *Alternativa descartada*: pasar el modelo Pydantic directo a `json=`. httpx no sabe serializar un `BaseModel`; fallaría en runtime.
- El repositorio no agrega ni renombra campos: lo que sale es exactamente el `model_dump` del contrato, que es lo que el spec exige.

### D-8 — El token se desenvuelve sólo para el header; el mensaje de error no lo menciona ni cita a n8n

`headers={WEBHOOK_TOKEN_HEADER: settings.N8N_WEBHOOK_TOKEN.get_secret_value()}`, con `WEBHOOK_TOKEN_HEADER: str = "X-WASA-TOKEN"` como constante de módulo (único lugar del proyecto que declara ese literal).

El `.get_secret_value()` es imprescindible: sin él, `SecretStr` se interpolaría como `**********` y n8n rechazaría todas las entregas — un bug silencioso y difícil de ver en una revisión rápida. Por eso hay un escenario dedicado en el spec.

Los mensajes de `N8nUnavailableError` describen la causa en términos neutros —"el orquestador no respondió dentro del límite de espera", "el orquestador respondió con un código inesperado: {status_code}"— y **no** incluyen: el token, la URL del webhook, ni el cuerpo de la respuesta de n8n. El `status_code` sí se incluye porque es diagnóstico puro y no es secreto.

### D-9 — Los tests simulan n8n con `httpx.MockTransport`, sin agregar dependencias

`httpx.MockTransport(handler)` es API pública de httpx: se le pasa una función que recibe la `httpx.Request` real y devuelve una `httpx.Response`. Montado como `httpx.AsyncClient(transport=mock_transport)`, intercepta en la capa de transporte y permite:

- afirmar sobre la request saliente **real** (URL, headers, cuerpo JSON) — que es exactamente lo que piden los escenarios de destino, header y payload;
- devolver 200/500/201/204/302 a voluntad;
- simular timeout e inalcanzabilidad haciendo que el handler levante `httpx.ReadTimeout` / `httpx.ConnectError`;
- contar invocaciones, para el requirement de "un solo intento".

- *Alternativa descartada*: `respx`. Es la librería idiomática para esto, pero es una dependencia de desarrollo nueva para algo que httpx ya resuelve. `requirements-dev.txt` tiene hoy tres líneas y la política del proyecto es no agregar dependencias sin necesidad.
- *Alternativa descartada*: levantar un servidor HTTP de prueba. Red real, puertos, flakiness y lentitud, sin ganancia sobre `MockTransport`.
- *Alternativa descartada*: `unittest.mock.AsyncMock` sobre `client.post`. No ejercita la construcción real de la request, así que los escenarios de header y cuerpo se volverían tautológicos (afirmarían sobre los argumentos que el propio test le pasó al mock).

### D-10 — La pureza de capa se verifica extendiendo la tabla existente, no con un test nuevo

`test_layer_boundaries.py` se diseñó (D-12 de CHANGE-00a) para que agregar una frontera sea una línea en `LAYER_IMPORT_RULES`. Se agregan dos entradas: `("repositories", "starlette")` y `("repositories", "slowapi")`. Con eso, el requirement "ningún import del framework web en la capa de entrega" queda verificado por AST sobre **todos** los archivos de `repositories/`, presentes y futuros — no sólo sobre el que escribe este change.

No se escribe un test nuevo de imports en `test_n8n_repository.py`: sería duplicar una verificación que ya existe y que además cubre más superficie.

### D-11 — Un solo intento: sin reintentos, sin backoff, sin circuit breaker

El escaneo es una operación con efecto lateral pesado del otro lado (ZAP + Nuclei + ffuf + SQLMap). Un reintegro automático ante timeout puede disparar el mismo escaneo **dos veces** si la primera solicitud sí llegó y lo que se perdió fue la respuesta. Sin idempotencia del lado de n8n —el `scan_id` viaja en el payload pero el workflow no lo usa hoy para deduplicar— reintentar es peligroso, no resiliente.

La semántica correcta es la que ya define el sistema: el Bridge falla rápido, el usuario ve un 502 con "El sistema de escaneo no está disponible. Intente más tarde" (Flujo 3) y decide él si reintenta. El reintento queda en manos de la persona, que es quien sabe si el escaneo anterior arrancó.

## Risks / Trade-offs

- **[El criterio 2xx podría aceptar una respuesta que no significa "escaneo encolado"]** → Si el nodo Webhook de n8n devolviera algún 2xx sin haber realmente aceptado el disparo, la entrega reportaría éxito de forma optimista. Mitigación: es el trade-off que el usuario confirmó explícitamente al ablandar D-4 (ver esa decisión), y el smoke test E2E de CHANGE-22 contra el n8n real lo detectaría de inmediato.
- **[`MockTransport` no ejercita la red real]** → TLS, proxies, resolución DNS y el comportamiento real del nodo de n8n quedan sin cubrir por esta suite. Mitigación: es el alcance correcto para un test unitario; la verificación end-to-end contra el n8n real es CHANGE-22, que existe exactamente para eso.
- **[El timeout por request pisa el del cliente]** → Si CHANGE-10 configurara un timeout distinto en el `AsyncClient`, el valor de `forward_scan` gana y el del cliente queda muerto para esta llamada. Es el comportamiento deseado (D-3), pero puede confundir a quien lea sólo el UoW. Mitigación: queda documentado en el docstring del módulo y anotado acá para CHANGE-10.
- **[Fire-and-forward sin reintento pierde escaneos ante un blip de red]** → Un corte de un segundo hace fallar el disparo. Trade-off aceptado conscientemente (D-11): perder un disparo que el usuario puede repetir es preferible a lanzar dos escaneos activos contra un objetivo real.
- **[`N8nUnavailableError` sin handler hasta CHANGE-12]** → Entre este change y CHANGE-12, si alguien conectara la cadena a medias, la excepción llegaría al handler genérico y saldría como 500 en vez de 502. Mitigación: nadie instancia `N8nRepository` en producción hasta CHANGE-10/11, y CHANGE-12 tiene el mapeo a 502 como criterio de aceptación explícito.
- **[Riesgo de filtración del secreto por una futura línea de logging]** → El diseño garantiza hoy que el token no sale del header, pero no hay nada que impida que un change futuro loguee la request completa. Mitigación: el escenario del spec ("el error de indisponibilidad no contiene el token") queda como test permanente, y el docstring del módulo lo deja escrito.
- **[Divergencia con `CHANGES.md` en la firma del constructor]** → D-1 agrega un parámetro que el roadmap no lista. Mitigación: está surfaceado en este documento y en el reporte al usuario; CHANGE-10 debe pasar `Settings` al construir el repositorio, y esa dependencia queda anotada para no descubrirse tarde.

## Open Questions

- **¿El Webhook Trigger de n8n responde exactamente 200?** **Resuelta durante apply**: el usuario confirmó ablandar el criterio a cualquier 2xx (D-4 actualizado) precisamente porque el workflow versionado en el repo (`Flujo_Fuzzing_N8N.json`) arranca con un `manualTrigger` y el Webhook Trigger definitivo no está en ese export, así que su código de respuesta exacto no se puede verificar desde el repo. La respuesta real se sigue confirmando en el smoke test de CHANGE-22.
- **¿Conviene que `scan_id` se use como clave de idempotencia del lado de n8n?** Habilitaría reintentos seguros y cambiaría el cálculo de D-11. Es una decisión del workflow de n8n, fuera del alcance del Bridge, y no bloquea nada acá: hoy no se reintenta, y si mañana n8n deduplica, agregar reintentos es un change propio.
