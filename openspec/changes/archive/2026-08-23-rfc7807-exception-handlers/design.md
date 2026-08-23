## Context

**Estado actual.** `exceptions/handlers.py` existe desde CHANGE-00d con dos cosas: el constructor `problem_detail_response(...)` y un único handler (`RateLimitExceeded` → 429). El resto de la superficie de error del servicio sale en el formato por defecto de FastAPI/Starlette. Todo lo que este change necesita está ya construido:

| Pieza | Origen | Lo que aporta a este change |
|---|---|---|
| `problem_detail_response(status_code, instance, detail, title, type_) -> JSONResponse` | CHANGE-00d | Constructor único del cuerpo; su docstring instruye **extender** este módulo, no reescribirlo |
| `PROBLEM_DETAIL_MEDIA_TYPE`, `DEFAULT_PROBLEM_TYPE`, `DEFAULT_PROBLEM_TITLE` | CHANGE-00d | Literales RFC 7807 centralizados; los handlers nuevos los reutilizan en vez de repetir strings |
| `rate_limit_exceeded_handler` + `RATE_LIMIT_PROBLEM_TYPE` | CHANGE-00d | El **patrón de referencia**: URI de tipo propio bajo `https://wasa.dev/errors/…`, `instance = request.url.path`, header extra seteado sobre la respuesta ya construida |
| `ErrorDetail` (`schemas/error_schemas.py`) | CHANGE-02 | El modelo Pydantic del cuerpo; hoy declarado pero sin ningún consumidor |
| `DomainError` / `EmailAlreadyExistsError(email)` / `InvalidCredentialsError()` | CHANGE-03 / CHANGE-04 | Los errores de negocio a traducir; `domain.py` no importa nada, ni siquiera stdlib |
| `create_app(settings)` con `add_exception_handler(RateLimitExceeded, …)` | CHANGE-00d | El punto de registro; ya hay un precedente exacto de cómo se registra |
| `LAYER_IMPORT_RULES` + helper AST (`tests/test_layer_boundaries.py`) | CHANGE-00a/03/04 | El mecanismo con que las fronteras se verifican, no solo se declaran |

**Restricciones que condicionan el diseño:**

1. **Regla dura del proyecto** (`CLAUDE.md`): "NUNCA un error de la API se retorna fuera de formato RFC 7807 → todos pasan por `exceptions/handlers.py`". El alcance de "todos" incluye los errores que genera el **framework**, no solo los que escribe el proyecto: un 404 de ruta inexistente y un 405 de método equivocado son errores de la API.
2. **RN-WS-09** + **§Dominio: Excepciones globales** (`knowledge-base/05_reglas_de_negocio.md`): "Todos los errores 400/401/409/422/429/502/500 pasan por el handler global RFC 7807, sin excepción por dominio (Auth y Scan comparten el mismo formato de error)" y "el mensaje 401 de login NO distingue si falló el email o la contraseña".
3. **RN-WS-12**: el texto plano de la contraseña "nunca se persiste ni se retorna en ninguna respuesta". El cuerpo de un 422 de validación **es** una respuesta.
4. **HU-03-07**: "400/401/409/422/429/502/500 cubiertos con `type/title/status/detail/instance`".
5. **Reglas duras de capas**: `exceptions/domain.py` es capa de dominio y no puede conocer HTTP. `handlers.py` es capa web y sí puede importar dominio (ya lo hace en la dirección correcta: web → dominio).
6. **Governance MEDIO** (`CHANGES.md` y `CLAUDE.md` coinciden): se implementa en pasos, surfaceando las decisiones no obvias antes de escribir código. Las decisiones marcadas **⚠ REVISIÓN** se presentan en el checkpoint (tarea 1.5) y las demás se aplican tal cual.
7. **Superficie vacía**: `main.py` monta únicamente `GET /health`. Ningún endpoint de producción puede producir hoy un 409, un 401 ni un 422 de body. Los tests de este change no pueden apoyarse en la app de producción para ejercitar los handlers.

### Hallazgos del entorno, verificados en este repo (no supuestos)

Ejecutados contra `fastapi_bridge/.venv` (FastAPI + Starlette + Pydantic v2 instalados):

```
# H-1 — Pydantic v2 expone el valor de entrada en el error de validación
POST body {"email":"a@b.com","password":"short"}
exc.errors() → [{"type":"string_too_short", "loc":["body","password"],
                 "msg":"String should have at least 8 characters",
                 "input":"short",              ← LA CONTRASEÑA EN TEXTO PLANO
                 "ctx":{"min_length":8}}]

# H-2 — registrar sobre fastapi.HTTPException NO cubre 404/405
app.add_exception_handler(fastapi.HTTPException, h)
GET /ruta-inexistente → 404 {"detail":"Not Found"}      ← el handler no corrió
POST /ok (solo GET)   → 405 {"detail":"Method Not Allowed"}  ← tampoco

# H-3 — exc.headers existe pero se pierde si el handler no lo copia
raise HTTPException(401, headers={"WWW-Authenticate":"Bearer"})
handler recibe exc.headers == {'WWW-Authenticate': 'Bearer'}
respuesta emitida     → header WWW-Authenticate: None    ← se descartó

# H-4 — el 500 del handler genérico NO lleva headers CORS
Origin permitido, 422 → Access-Control-Allow-Origin: http://x.test
Origin permitido, 401 → Access-Control-Allow-Origin: http://x.test
Origin permitido, 500 → Access-Control-Allow-Origin: None    ← ausente

# H-5 — cuerpo no parseable llega como RequestValidationError, no como otra cosa
POST content=b"{not json"
exc.errors() → [{"type":"json_invalid", "loc":["body",1],
                 "msg":"JSON decode error", "ctx":{"error":"Expecting property name…"}}]
                                       ↑ loc[1] es un OFFSET DE CARACTER, no un campo

# H-6 — TestClient por defecto re-lanza en vez de devolver el 500 del handler
TestClient(app).get("/boom")  → RuntimeError propagado al test
TestClient(app, raise_server_exceptions=False).get("/boom") → 500 con el cuerpo del handler
```

H-1 es la razón por la que la composición del `detail` de validación es una decisión de seguridad y no de estética. H-2 decide sobre qué clase se registra. H-3 decide la firma del handler HTTP. H-4 es una limitación del stack que hay que aceptar o rodear conscientemente. H-5 da el discriminante entre 400 y 422 **y** advierte que `loc` no siempre nombra un campo. H-6 determina cómo se escriben los tests del grupo 6, y sin él esos tests verificarían lo contrario de lo que dicen verificar.

## Goals / Non-Goals

**Goals:**
- Que **ninguna** ruta de error del servicio salga fuera de RFC 7807, incluidas las que genera el framework y las que nadie previó.
- Cerrar el flanco de RN-WS-12 en la superficie de error: que la contraseña que el usuario tipeó no pueda aparecer en el cuerpo de un 422 ni por descuido ni por copiar el patrón habitual.
- Que el 500 sea informativo del lado servidor (stack completo en el log) y opaco del lado cliente (mensaje fijo, sin tipo de excepción, sin mensaje original, sin rutas).
- Dejar un mecanismo de despacho por el que CHANGE-11 y cualquier error de dominio futuro quedan cubiertos con una fila de tabla, no con un handler nuevo.
- Dejar cada garantía anclada por un test, de modo que revertirla sea un test rojo y no un hallazgo en producción.
- No inflar la superficie: cuatro handlers, una tabla, cero dependencias nuevas.

**Non-Goals:**
- Montar routers o endpoints (CHANGE-05). Este change instala handlers sobre una app que sigue exponiendo solo `GET /health`.
- `get_current_user` y la emisión concreta del 401 por token ausente o inválido (CHANGE-06). Se deja el handler que le dará forma, no la dependencia.
- El cliente httpx de n8n y su 502 (CHANGE-11). Se deja el mecanismo de despacho; la fila de la tabla la agrega aquel change.
- Renderizar estos errores en el frontend (HU-05-03, fase 3).
- Reporte a un servicio externo de errores (Sentry, Rollbar): ninguna historia de v1.2 lo pide.
- Configurar el formato o los sinks de `logging` a nivel aplicación. Este change emite en el logger del módulo y deja la configuración global para quien la necesite.
- Internacionalización de los mensajes: el proyecto es monolingüe en español.
- Un catálogo de URIs de tipo de problema publicado y navegable en `https://wasa.dev/errors/…`. Las URIs se usan como **identificadores estables**, igual que ya hace CHANGE-00d con `RATE_LIMIT_PROBLEM_TYPE`; que resuelvan a una página de documentación es explícitamente futuro.

## Decisions

> Las decisiones marcadas **⚠ REVISIÓN** se presentan al usuario en el checkpoint de governance (tarea 1.5 de `tasks.md`) **antes** de escribir código de producción. Las demás se aplican tal cual.

### D-1 ⚠ REVISIÓN — `ErrorDetail` pasa a construir el cuerpo, y `detail` se relaja a `str | None`

**Decisión.** `problem_detail_response(...)` deja de armar un `dict` literal y pasa a construir el cuerpo con `ErrorDetail(...).model_dump()`. Como consecuencia directa, `ErrorDetail.detail` pasa de `str` a `str | None = None`.

**Por qué.** Hoy la forma del error está declarada **dos veces**: en el modelo Pydantic de `schemas/error_schemas.py` y en el `dict` de `handlers.py`. Eso contradice literalmente el requirement vigente de `error-contract` ("no existe una segunda definición de la forma de error de la API") y el escenario "Los consumidores importan el contrato desde el módulo transversal", que nombra a los manejadores globales como consumidores de `ErrorDetail` — consumidores que hasta hoy no consumen nada. Peor: las dos declaraciones pueden divergir sin que nada se ponga rojo. Al enrutar por el modelo, la restricción `status: int = Field(ge=100, le=599)` deja de ser decorativa y se convierte en una red real bajo cada handler; el escenario "Estado fuera del rango falla" pasa a proteger algo.

El cambio de `detail` a opcional no es una concesión: RFC 7807 §3.1 declara los cinco miembros opcionales, `problem_detail_response` ya admite `detail=None` desde CHANGE-00d, y hay un test (`test_problem_detail_response_allows_missing_detail`) que fija que el cuerpo emite `"detail": null`. Sin relajar el modelo, enrutar por él rompería ese test.

**Alternativas consideradas.** (a) Dejar el `dict` literal y no tocar `ErrorDetail` — cero riesgo, pero conserva la doble declaración y deja un modelo Pydantic que nadie usa, que es deuda con apariencia de contrato. (b) Enrutar por `ErrorDetail` manteniendo `detail: str` obligatorio y hacer que `problem_detail_response` caiga a `detail = title` cuando no se le pasa nada — inventa texto que nadie pidió y rompe el mismo test por el otro lado. (c) Emitir el cuerpo con `model_dump(exclude_none=True)` para que un `detail` ausente desaparezca de la respuesta en vez de salir como `null` — más purista respecto de RFC 7807, pero cambia el contrato que el frontend ya puede asumir (cinco claves siempre presentes) y rompería el escenario "los miembros del modelo son exactamente los cinco". Se descarta: la forma estable vale más que la pureza.

**Si el usuario prefiere (a)**, se revierte el delta de `error-contract`, `problem_detail_response` queda como está y el resto del change no cambia — los cuatro handlers nuevos lo usan igual.

### D-2 ⚠ REVISIÓN — 422 para violación de schema, 400 para cuerpo no parseable

**Decisión.** El handler de `RequestValidationError` no emite un estado fijo. Inspecciona los tipos de error de Pydantic y decide:
- si **algún** error tiene `type == "json_invalid"` → **400 Bad Request** (el cliente mandó algo que no es JSON; la petición está mal formada);
- en cualquier otro caso → **422 Unprocessable Entity** (el JSON es válido, la semántica no).

**Por qué.** El roadmap dice "400/422" sin decir cuándo cada uno, y RN-WS-09 enumera los dos estados por separado — o sea que ambos deben existir, y hace falta un criterio. Este es el criterio que la semántica HTTP ya define: 400 es "no pude entender la petición", 422 es "entendí la petición y no puedo procesar el contenido". H-5 confirma que Pydantic v2 distingue exactamente ese caso con `type == "json_invalid"`, así que el discriminante no hay que inventarlo.

**Conflicto conocido que hay que resolver acá.** El criterio de aceptación de **CHANGE-05** dice: *"POST /api/v1/auth/register con password < 8 chars: **400** RFC 7807"*. Bajo D-2 ese caso da **422**, no 400. Las opciones son tres y la decisión hay que tomarla ahora, no en CHANGE-05:
- **(recomendada)** Mantener D-2 y **corregir el criterio de CHANGE-05 a 422**. HU-05-03 ya especifica el frontend como "400/422 campo inválido" — trata a los dos como la misma rama de UI, así que el cambio no tiene ningún costo del lado del cliente.
- Mapear **toda** `RequestValidationError` a 400. Cumple la letra de CHANGE-05, pero entonces el 422 de RN-WS-09 no lo produce nadie nunca, y el servicio queda emitiendo 400 para un cuerpo perfectamente parseable.
- Mapear toda `RequestValidationError` a 422 y aceptar que el 400 solo lo produzcan el preflight CORS rechazado (que ya existe, CHANGE-00d) y futuros errores de dominio. Simplifica el handler pero desperdicia un discriminante que Pydantic regala.

### D-3 — Registrar sobre `starlette.exceptions.HTTPException`, y preservar `exc.headers`

**Decisión.** El handler de excepciones HTTP se registra sobre `starlette.exceptions.HTTPException`, **no** sobre `fastapi.HTTPException`. Copia `exc.status_code` al estado, `exc.detail` al `detail` del cuerpo, y **vuelca `exc.headers` sobre la respuesta construida** antes de devolverla.

**Por qué.** H-2 lo demuestra: `fastapi.HTTPException` es subclase de la de Starlette, y los 404/405 que genera el router de Starlette son de la clase **base**. Registrar sobre la subclase deja esos dos afuera y el servicio sigue emitiendo `{"detail":"Not Found"}` — un error de la API fuera de RFC 7807, que es exactamente lo que la regla dura prohíbe. Registrar sobre la base cubre las dos.

Sobre los headers: H-3 muestra que `exc.headers` llega al handler pero se descarta si nadie lo copia. Es el mecanismo del que depende CHANGE-06: `HTTPException(401, headers={"WWW-Authenticate": "Bearer"})` sin ese header es un 401 que incumple RFC 7235. El patrón de volcado ya existe en el módulo — `rate_limit_exceeded_handler` setea `Retry-After` sobre la respuesta ya construida (CHANGE-00d) — así que esto es la generalización de algo que el módulo ya hace, no una técnica nueva.

**Cuidado explícito**: los headers se vuelcan **sin** permitir que sobrescriban `Content-Type`. `problem_detail_response` fija `application/problem+json`, y un `exc.headers` con su propio `Content-Type` rompería el contrato de todos los demás escenarios.

**Alternativa considerada.** Registrar handlers separados para 404/405 y para el resto. Rechazada: dos handlers para el mismo tipo de excepción, con la misma traducción, sin ninguna diferencia de comportamiento que lo justifique.

### D-4 — Un handler sobre `DomainError` + tabla de mapeo en la capa web

**Decisión.** Un único `exception_handler` registrado sobre la clase base `DomainError`. El estado HTTP, el título y la URI de tipo de cada error concreto salen de una tabla declarada **en `handlers.py`**:

```
_DOMAIN_ERROR_MAP: dict[type[DomainError], ProblemSpec] = {
    EmailAlreadyExistsError: (409, "Conflict",     "…/email-already-exists"),
    InvalidCredentialsError: (401, "Unauthorized", "…/invalid-credentials"),
}
```

El `detail` de `EmailAlreadyExistsError` se compone desde `exc.email` (el email **ya normalizado**, sin volver a consultar la base — traspaso explícito de CHANGE-03). El de `InvalidCredentialsError` es un **literal fijo** que no interpola nada.

**Por qué la base y no cada subclase.** Es el traspaso literal que dejó escrito el docstring de `exceptions/domain.py` en CHANGE-03. Registrar por subclase obliga a que cada change futuro se acuerde de registrar su handler en `main.py`; registrar sobre la base hace que agregar una fila a la tabla sea suficiente, y CHANGE-11 (502 de n8n) ya está previsto en ese camino.

**Por qué la tabla vive en la capa web y no como atributo de la excepción.** La alternativa obvia es colgar `status_code = 409` de `EmailAlreadyExistsError`. Se rechaza: `exceptions/domain.py` hoy no importa **nada** —ni stdlib— y esa pureza es deliberada (su docstring explica por qué el módulo no vive junto a los handlers). Un código de estado HTTP es una decisión de la capa de transporte; el mismo error de negocio podría mapearse distinto en un consumidor no-HTTP. Meterlo en el dominio invierte la dependencia conceptual aunque no agregue un import.

**El `DomainError` sin mapear.** Una subclase futura que nadie agregue a la tabla cae a **500** con el `detail` genérico —el mismo que el handler de `Exception`— porque un error de negocio que la capa web no sabe traducir *es* un defecto del servidor, y devolver un 400 inventado enmascararía la omisión. Para que esa omisión no llegue a producción, un test estructural recorre **todas** las subclases concretas de `DomainError` vía `__subclasses__()` recursivo y exige que cada una esté en la tabla. Agregar una excepción de dominio sin mapearla pone la suite en rojo en el mismo commit.

**El 401 no lleva el email.** `InvalidCredentialsError` deliberadamente no tiene el atributo (CHANGE-04, D-8), y la fila de la tabla usa un literal. Un test lo ancla: el cuerpo del 401 no contiene el email consultado por ninguna vía.

### D-5 — El 500 es opaco hacia afuera y completo hacia adentro

**Decisión.** El handler de `Exception` devuelve siempre exactamente el mismo cuerpo, sin importar qué excepción lo causó:

```
{"type": "…/internal-server-error", "title": "Internal Server Error",
 "status": 500, "detail": "Ocurrió un error inesperado procesando la solicitud.",
 "instance": "<path>"}
```

Antes de devolverlo, registra la excepción con `logging.getLogger(__name__).exception(...)`, que emite el stack trace completo al logger del módulo.

**Por qué el cuerpo es un literal y no se deriva de la excepción.** Cualquier derivación filtra internals, y no de forma abstracta: un `IntegrityError` de SQLAlchemy trae en su `str()` la sentencia SQL y el nombre de la constraint violada; un `OperationalError` de asyncpg trae el host y el nombre de la base; un `KeyError` trae el nombre de la clave, que en este servicio puede ser un claim de JWT. Incluso el **nombre de la clase** dice qué motor de base de datos hay detrás. El `detail` es un literal de módulo, no una f-string, precisamente para que no haya dónde interpolar.

**Por qué el handler no ejecuta lógica que pueda fallar.** Es el último recurso: si él lanza, Starlette ya no tiene a quién delegar y la conexión se cierra sin respuesta. Sus únicas operaciones son leer `request.url.path`, llamar al logger y construir el cuerpo con constantes. En particular, **no** inspecciona la excepción, no ramifica por tipo, no toca la base y no lee configuración.

**Sobre el logger.** Se usa `logging` de la stdlib, sin configurar handlers ni formato desde este change: `logger.exception` respeta la configuración que tenga el proceso (uvicorn configura el root logger), y forzar una configuración propia acá pisaría la del entorno. Un test verifica que el stack trace llega al logger — un 500 que se traga la causa es peor que un 500 que la imprime en el cuerpo.

**Alternativa considerada.** Incluir un identificador de correlación en el `detail` (`"…referencia: 7f3a"`) para cruzar la respuesta con el log. Es la práctica correcta a escala y sería un buen agregado — pero requiere un mecanismo de correlación por request que hoy no existe en el servicio, y montarlo acá excedería el change. Se anota en Open Questions.

### D-6 ⚠ REVISIÓN — El 500 sin CORS: se acepta y se documenta

**Decisión.** Se acepta que la respuesta 500 del handler genérico no lleve headers CORS, se documenta en el módulo, y se ancla con un test que fija el comportamiento **real** (para que sea una limitación conocida y no un descubrimiento futuro).

**Por qué.** H-4 lo confirma: `ServerErrorMiddleware` de Starlette envuelve por **fuera** de la pila de middlewares de usuario, así que el 500 se genera cuando `CORSMiddleware` ya no está en el camino. Los 400/401/404/409/422/429 sí llevan CORS porque se generan en `ExceptionMiddleware`, por dentro. El efecto práctico: ante un 500, un navegador con origen cruzado no puede leer el cuerpo y el `fetch` falla como error de red. Como el cuerpo del 500 es un literal genérico que no aporta nada al usuario (D-5), la pérdida de información es nula — HU-05-03 ya tiene una rama "error de red" que cubre exactamente ese caso.

**Alternativa considerada.** Agregar un `BaseHTTPMiddleware` propio, por dentro de CORS, que capture `Exception` y devuelva el 500. Funcionaría, pero `BaseHTTPMiddleware` tiene interacciones conocidas y desagradables con respuestas en streaming y con `BackgroundTasks`, y agregaría una capa de middleware permanente al servicio para mejorar el único cuerpo de error que a nadie le sirve leer. Se rechaza por relación costo/beneficio, no por imposibilidad. **Si el usuario prefiere esta alternativa**, se agrega un grupo de tareas y una requirement al spec; el resto del change no cambia.

### D-7 — El `detail` de validación se compone, y `input`/`ctx` nunca lo tocan

**Decisión.** El handler de validación construye un `detail` legible recorriendo `exc.errors()` y usando **solo** dos campos de cada error: `loc` (para nombrar el campo) y `msg` (para describir el problema). `input`, `ctx` y `url` se descartan sin excepción. Formato: `"campo: mensaje"`, unidos por `"; "` cuando hay varios.

Del `loc` se descarta el primer elemento cuando es `"body"`, `"query"`, `"path"` o `"header"` —es la ubicación, no el nombre del campo— y los elementos restantes se unen con `"."`. Si tras el descarte no queda ningún elemento **de tipo `str`** (el caso de `json_invalid`, cuyo `loc` es `["body", 1]` con un offset de caracter — H-5), el error se describe sin nombre de campo, con el `msg` solo.

**Por qué.** H-1 es la razón entera: `input` **es el valor que el usuario tipeó**, y en el endpoint de registro ese valor es la contraseña. Serializar `exc.errors()` tal cual —el patrón que aparece en la mayoría de los ejemplos de FastAPI— publica la contraseña en el cuerpo de la respuesta, en el DevTools del navegador, en los logs de cualquier proxy que capture cuerpos de error y en cualquier monitoreo de APM. Es una violación directa de RN-WS-12. `ctx` es una fuga menor pero de la misma clase: puede contener el patrón regex o los límites internos de validación. La lista de campos permitidos es **allowlist, no denylist**: se nombran los dos campos que sí se usan, de modo que un campo nuevo que Pydantic agregue en una versión futura quede excluido por defecto.

**El ancla del test es específica, no genérica.** No alcanza con "el cuerpo no contiene la clave `input`". El test manda una contraseña con un valor reconocible (`"corta-y-secreta"`) y exige que **ese string** no aparezca en ninguna parte del cuerpo serializado. Es el test que se pone rojo si alguien "mejora" el handler devolviendo `exc.errors()` entero.

**Por qué un string y no un miembro de extensión.** RFC 7807 permite miembros de extensión, y lo natural sería un array `errors` con los campos que fallaron. Se rechaza: el requirement vigente de `error-contract` fija que los miembros del cuerpo son **exactamente** los cinco de RFC 7807, y hay un escenario que lo verifica. Cambiar eso es un cambio de contrato con el frontend que ninguna historia de usuario pide — HU-05-03 quiere un mensaje por código de estado, no un mapa de errores por campo. Si en fase 3 el frontend necesita marcar campos individualmente, ese será su propio change, con su propio delta de `error-contract`.

### D-8 — URIs de tipo de problema por clase de error, siguiendo el precedente de CHANGE-00d

**Decisión.** Cada clase de error recibe su URI de tipo estable bajo `https://wasa.dev/errors/…`, declarada como constante de módulo junto a su título, igual que `RATE_LIMIT_PROBLEM_TYPE` / `RATE_LIMIT_PROBLEM_TITLE`:

| Handler / error | `type` | `title` | `status` |
|---|---|---|---|
| Validación de schema | `…/validation-error` | `Unprocessable Entity` | 422 |
| Cuerpo no parseable | `…/malformed-request` | `Bad Request` | 400 |
| `EmailAlreadyExistsError` | `…/email-already-exists` | `Conflict` | 409 |
| `InvalidCredentialsError` | `…/invalid-credentials` | `Unauthorized` | 401 |
| `RateLimitExceeded` (existente) | `…/rate-limit-exceeded` | `Too Many Requests` | 429 |
| `Exception` no manejada | `…/internal-server-error` | `Internal Server Error` | 500 |
| `HTTPException` genérica | `about:blank` | frase de estado HTTP | de `exc.status_code` |

**Por qué `about:blank` para `HTTPException`.** RFC 7807 §4.2 prescribe `about:blank` exactamente para el caso "el error no tiene un tipo de problema propio más allá del código de estado HTTP", que es la definición de una `HTTPException` genérica: el 404 de una ruta inexistente no es un tipo de problema del dominio WASA. El default de `problem_detail_response` ya es `about:blank`, así que el handler no pasa `type_` y hereda el comportamiento correcto sin código extra. El `title` sale de la frase de estado HTTP estándar (`http.HTTPStatus(exc.status_code).phrase`), con caída a `DEFAULT_PROBLEM_TITLE` si el código no es estándar.

**Por qué constantes de módulo y no strings en línea.** Es la convención que el módulo ya estableció en CHANGE-00d, y hace que el catálogo de tipos de problema del servicio sea legible en un solo lugar en vez de estar disperso entre cuerpos de función.

### D-9 — Los tests ejercitan una app de prueba, no la de producción

**Decisión.** `tests/test_exception_handlers.py` construye su propia `FastAPI` con rutas que fallan a propósito (una que valida un body, una que lanza `EmailAlreadyExistsError`, una que lanza `InvalidCredentialsError`, una que lanza `HTTPException` con headers, una que lanza `RuntimeError`) y le registra los mismos handlers. La verificación de que la app **de producción** los tiene registrados vive aparte, en `tests/test_app_wiring.py`, como afirmación sobre `app.exception_handlers`.

**Por qué.** Restricción 7: la app de producción no tiene ninguna ruta capaz de producir un 409, un 401 o un 422 de body hasta CHANGE-05. Sin rutas que fallen, los handlers solo se pueden testear llamándolos a mano con un `Request` sintético (el patrón de `test_problem_details.py`) — que es válido para el cuerpo, pero **no** verifica el despacho: no prueba que Starlette elija el handler correcto para cada tipo de excepción, que es justamente donde vive H-2. La app de prueba cierra ese hueco. Cuando CHANGE-05 monte los endpoints reales, sus propios tests ejercitarán el camino completo; los de este change siguen valiendo como cobertura del mecanismo.

**Y `raise_server_exceptions=False`.** H-6: con el default, `TestClient` re-lanza la excepción original en vez de devolver la respuesta del handler, y un test escrito con el default verificaría el comportamiento del `TestClient`, no el del handler. Va comentado en el test, porque es exactamente la clase de detalle que se borra en un refactor.

### D-10 — Orden de registro y precedencia

**Decisión.** Los cinco handlers se registran en `create_app()` en este orden, con `app.add_exception_handler`: `RequestValidationError`, `StarletteHTTPException`, `DomainError`, `RateLimitExceeded` (ya existente, se mantiene donde está), `Exception`.

**Por qué el orden no cambia el comportamiento, pero igual se fija.** Starlette despacha recorriendo el MRO de la excepción lanzada y quedándose con el handler más específico registrado, no por orden de registro — así que `RequestValidationError` (subclase de `ValueError`) y `DomainError` ganan sobre `Exception` independientemente del orden. El orden se fija de todos modos por legibilidad: de lo más específico a lo más general, que es como se lee el módulo.

**Un caso que sí importa.** `RateLimitExceeded` de slowapi hereda de `Exception`, no de `HTTPException`, así que su handler propio sigue ganando y el comportamiento de CHANGE-00d no cambia. Un test lo ancla, porque si una versión futura de slowapi cambiara esa herencia, el 429 perdería silenciosamente su header `Retry-After` al caer en el handler genérico.

## Risks / Trade-offs

- **[La contraseña en texto plano se filtra en el cuerpo del 422]** — H-1 confirma que `exc.errors()` la trae en `input`. Es el riesgo más alto del change y el más fácil de reintroducir, porque el patrón inseguro es el que aparece en la documentación informal de FastAPI. → **Mitigación**: allowlist de dos campos (D-7), más un test que manda un valor de contraseña reconocible y exige que ese string exacto no aparezca en el cuerpo serializado. Requirement con escenario propio en el spec, no un comentario en el código.
- **[Internals del servidor en el cuerpo del 500]** — `str(exc)` de un error de SQLAlchemy trae SQL y nombres de constraint; de asyncpg, host y base. → **Mitigación**: el `detail` del 500 es un literal de módulo, no una f-string; el handler no inspecciona la excepción. Test que lanza una excepción cuyo mensaje contiene un marcador reconocible y exige que no aparezca en el cuerpo.
- **[404 y 405 siguen escapando a RFC 7807]** — es el estado actual del servicio y la trampa que H-2 documenta: registrar sobre `fastapi.HTTPException` *parece* correcto y deja los dos afuera. → **Mitigación**: registrar sobre `starlette.exceptions.HTTPException` (D-3) + tests explícitos de 404 y 405 sobre la app de prueba, que fallan si alguien "corrige" el import a la clase de FastAPI.
- **[Un `DomainError` futuro sin mapear devuelve 500 en producción]** — CHANGE-11 y siguientes agregan excepciones de dominio; olvidar la fila de la tabla convierte un error de negocio legítimo en un 500. → **Mitigación**: test estructural que recorre `DomainError.__subclasses__()` recursivamente y exige cobertura completa de la tabla. La omisión se descubre en el commit que la introduce, no en producción.
- **[El handler genérico rompe dentro del handler]** — si el último recurso lanza, la conexión se cierra sin respuesta y el cliente ve un error de red sin diagnóstico. → **Mitigación**: D-5 lo reduce a leer un path, loguear y componer constantes. Se refuerza con D-1: al enrutar el cuerpo por `ErrorDetail`, un `status` fuera de rango en cualquier handler falla en test, no en runtime.
- **[El 500 no lleva CORS y el navegador no puede leerlo]** — H-4, limitación estructural de Starlette. → **Mitigación**: se acepta conscientemente (D-6), se documenta en el módulo y se ancla con un test que fija el comportamiento real. El cuerpo del 500 es genérico, así que el navegador no se pierde nada accionable, y HU-05-03 ya tiene la rama de error de red.
- **[Enumeración de usuarios vía el cuerpo del 401]** — un `detail` que interpolara el email confirmaría qué cuentas existen, que es lo que §Excepciones globales prohíbe. → **Mitigación**: la fila de `InvalidCredentialsError` usa un literal; la excepción no tiene el email (CHANGE-04, D-8); test que lo ancla.
- **[Trade-off: sin detalle por campo en el 422]** — D-7 emite un string compuesto, no un array de errores por campo. Un formulario que quiera marcar el campo exacto en rojo tendrá que parsear texto o pedir un cambio de contrato. → **Aceptado**: ninguna historia de v1.2 lo pide (HU-05-03 quiere un mensaje por código), y romper el requirement de "exactamente los cinco miembros" para una necesidad hipotética es peor deuda que la que evita.
- **[Trade-off: acoplamiento del formato del `detail` de validación]** — el texto sale de `msg` de Pydantic, que está en inglés ("String should have at least 8 characters") mientras el resto de los mensajes del servicio están en español, y puede cambiar entre versiones de Pydantic. → **Aceptado para v1.2**: traducir o normalizar esos mensajes es un catálogo que ninguna historia pide, y el frontend ramifica por código de estado, no por texto. Los tests afirman sobre el nombre del campo y sobre la ausencia de `input`, **no** sobre el texto literal de Pydantic, para no romperse en cada upgrade.
- **[Riesgo de alcance: este change toca `error_schemas.py`, que es contrato de CHANGE-02]** — relajar `detail` a opcional modifica un módulo ya especificado y archivado. → **Mitigación**: va como delta explícito de `error-contract` en `specs/`, con los escenarios afectados reescritos, y D-1 queda como ⚠ REVISIÓN con la alternativa de no tocarlo.

## Migration Plan

No hay migración de datos ni de esquema: el change no toca persistencia. El despliegue es un reinicio del proceso.

**Compatibilidad hacia atrás.** Los consumidores actuales del servicio son la Landing (todavía sin integrar) y el health check. `GET /health` no cambia. Lo que sí cambia es la **forma del cuerpo de los errores** que hoy salen en formato FastAPI (404, 405, 422) — pero como ningún cliente los consume todavía, no hay contrato que romper. Este es precisamente el argumento de oportunidad del proposal: hacerlo antes de CHANGE-05 es gratis, hacerlo después es un breaking change de API.

**Rollback.** Quitar los cuatro `add_exception_handler` de `create_app()` restaura el comportamiento por defecto del framework. Si además se aceptó D-1, revertir `error_schemas.py` y `problem_detail_response` a su forma anterior es un segundo paso independiente. Ninguno de los dos deja estado persistido que limpiar.

## Open Questions

1. **Identificador de correlación en el 500** (D-5, alternativa). Un `detail` del tipo `"Ocurrió un error inesperado. Referencia: 7f3a2c"` con la misma referencia en el log permitiría cruzar un reporte de usuario con el stack trace. Requiere un mecanismo de correlación por request que hoy no existe. ¿Se agenda como change propio de la fase de observabilidad, o se descarta para v1.2?
   **Resolución (checkpoint 1.5, apply):** se difiere. Ningún endpoint de producción existe todavía para que un correlation-id tenga con qué cruzarse, y montar el mecanismo acá habría excedido el alcance del change (D-5 ya lo marca como alternativa rechazada por scope). Queda abierta para una fase de observabilidad futura, no descartada.
2. **El criterio de aceptación de CHANGE-05** dice 400 para `password < 8 chars`; bajo D-2 ese caso es 422. Si el usuario acepta la recomendación de D-2, hay que **editar `CHANGES.md`** para que el criterio de CHANGE-05 diga 422 y no quede una contradicción latente en el roadmap. Es una edición de una línea, pero conviene hacerla en este change y no descubrirla en el siguiente.
   **Resolución (checkpoint 1.5, apply):** aceptada la recomendación de D-2 tal cual. `CHANGES.md` línea 523 corregida de 400 a 422, con nota explicando el criterio semántico (400 = cuerpo no parseable, 422 = JSON válido que viola el schema). Tarea 9.4 de `tasks.md`.
3. **Publicar el catálogo de URIs de tipo** (`https://wasa.dev/errors/…`). Hoy son identificadores estables que no resuelven a ninguna página. RFC 7807 lo permite explícitamente, pero si el dominio `wasa.dev` no está bajo control del proyecto, conviene decidir ahora si el prefijo debe cambiar — mover las URIs después es un cambio de contrato con el frontend. **CHANGE-00d ya fijó `https://wasa.dev/errors/rate-limit-exceeded`**, así que este change sigue el precedente; la pregunta es si el precedente debía ser ese.
   **Resolución (checkpoint 1.5, apply):** se difiere. Este change sigue el precedente exacto de CHANGE-00d (`https://wasa.dev/errors/…`) para las seis URIs nuevas (`validation-error`, `malformed-request`, `email-already-exists`, `invalid-credentials`, `internal-server-error`, más `about:blank` para la excepción HTTP genérica) por consistencia interna del catálogo. Si el dominio `wasa.dev` cambia, es una migración de contrato futura que afecta a las siete URIs por igual (la de CHANGE-00d incluida), no algo que este change deba resolver de forma aislada.
