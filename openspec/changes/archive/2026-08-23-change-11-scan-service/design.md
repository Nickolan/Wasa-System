## Context

Ver `proposal.md` — Why para la motivación, y `specs/scan-initiation/spec.md` para los requirements normativos. Este documento cubre únicamente el *cómo*.

Estado actual verificado leyendo el repo (no asumido):

- `fastapi_bridge/services/scan_service.py` existe pero es sólo el docstring placeholder del scaffold de CHANGE-00a. Su texto dice *"Se implementa en CHANGE-12"*; `CHANGES.md` dice CHANGE-11 — el mismo desfasaje de numeración que ya se corrigió al reescribir `scan_schemas.py` (CHANGE-08), `n8n_repository.py` (CHANGE-09) y `scan_unit_of_work.py` (CHANGE-10). Al reescribir el archivo, el conflicto desaparece.
- **Nadie importa `scan_service`** desde código de producción: `api/v1/scan/router.py` sólo declara `APIRouter(prefix="/api/v1/scan", tags=["scan"])` sin operaciones, y `main.py` no lo monta hasta CHANGE-12. Reescribir el módulo no rompe nada. `test_structure.py` sí exige que el archivo exista y conserve docstring de módulo.
- Contratos aguas abajo, verificados de primera mano:
  ```
  # schemas/scan_schemas.py  (CHANGE-08)
  ScanRequest:  target_url: HttpUrl,  phpsessid: str(strip, min_len 1),
                sqlmap_level: int 1..5 = 1,  sqlmap_risk: int 1..3 = 1,  extra="ignore"
  ScanResponse: scan_id: str,  status: Literal["queued"],  message: str
  N8nPayload:   target_url: str,  phpsessid: str,  sqlmap_level: int,
                sqlmap_risk: int,  scan_id: str

  # uow/scan_unit_of_work.py  (CHANGE-10)
  ScanUoW(settings: Settings | None = None)
      async __aenter__() -> ScanUoW ;  async __aexit__(...) -> None
      @property n8n -> N8nRepository

  # repositories/n8n_repository.py  (CHANGE-09)
  async N8nRepository.forward_scan(payload: N8nPayload) -> bool   # raises N8nUnavailableError
  ```
- `N8nUnavailableError` vive en `exceptions/errors.py`, un módulo Python puro sin imports de framework — importable desde `services/` sin arrastrar FastAPI.
- `fastapi_bridge/tests/test_layer_boundaries.py` ya tiene `("services", "httpx")` y `("services", "sqlalchemy")` en su tabla `LAYER_IMPORT_RULES` (10 entradas hoy). Este change **no** necesita agregar ninguna regla: necesita no violar las que ya están. Es el primer change que las pone a prueba sobre código real.
- `core/settings.py`: **todos** los campos de `Settings` tienen valor por defecto y no hay `.env` versionado en el repo. Consecuencia relevante para los tests: `ScanUoW()` se construye sin error en un entorno limpio, y construirlo no hace I/O (el `AsyncClient` recién nace en `__aenter__`). Eso habilita el test de conformidad de D-9 sin red ni credenciales.
- Entorno de test: `pytest.ini` con `testpaths = fastapi_bridge/tests`, `asyncio_mode = auto` (los `async def` corren sin decorador) y `asyncio_default_fixture_loop_scope = function`. Convención de la casa establecida en CHANGE-08/09/10: un único archivo de tests por change, sin fixtures compartidas, docstrings y nombres de test en español, y ningún test que assertee valores reales de `N8N_WEBHOOK_URL`/`N8N_WEBHOOK_TOKEN`.
- `uuid` no aparece hoy en ninguna línea de `fastapi_bridge/` fuera de `.venv`: este change introduce la primera generación de identificadores del sistema.

Restricciones del proyecto que condicionan el diseño:

- Reglas duras de `CLAUDE.md`: el Router NUNCA contiene lógica de negocio → toda la lógica va acá; el Service NUNCA instancia `httpx`/`SQLAlchemy` → siempre vía el UoW; nada de config hardcodeada; type hints obligatorios en **toda** función; `async` en toda la capa de I/O; `PascalCase` para clases, `snake_case` para funciones y archivos.
- Regla de capas de la KB: `Router → Service → UoW → Repository`. El Service puede depender del UoW, de los schemas y de las excepciones de dominio. **No** puede depender del framework web ni de infraestructura directa.
- Governance **MEDIO**: lógica de negocio del pipeline de escaneo, no dominio Auth. Se implementa en pasos y se surfacean las decisiones no obvias (D-2, D-3, D-4, D-5).
- Strict TDD activo: cada comportamiento se escribe primero como test que falla.

## Goals / Non-Goals

**Goals:**

- Que la traducción *solicitud validada → escaneo disparado* se lea **entera en un solo lugar**: qué se genera, qué se compone, qué se entrega, qué se responde. Nadie más en el sistema debería tener que saber cómo se arma un `N8nPayload`.
- Que la operación sea **testeable sin red, sin n8n y sin `Settings`**: sustituyendo un único colaborador (el ámbito de recursos) se ejercita el 100% del comportamiento, incluidos los caminos de error.
- Que el vínculo `scan_id` devuelto ↔ `scan_id` entregado quede **verificado por test**, no asumido: es el único hilo que conecta al usuario con sus resultados en el Dashboard, y romperlo sería un bug silencioso e indetectable en producción.
- Que la regla dura "el Service no instancia `httpx`" pase de promesa vacua a **regla que protege código real**, sin tocar el test que la implementa.
- Establecer el **precedente estructural del Service** en este repo (colaborador inyectable con default de producción, sin estado por operación) para que `AuthService` (CHANGE-04) no tenga que reinventarlo.

**Non-Goals:**

- No se registra ninguna operación HTTP, no se monta el router, no se mapea nada a 202 ni a 502, y no se toca `exceptions/handlers.py`: todo eso es CHANGE-12.
- No se implementa persistencia del escaneo en `db_fuzzing`. El Bridge **no** escribe la tabla `scans` — la escribe el pipeline de n8n. `ScanService` no toca base de datos (ver Risks).
- No se implementa reintento, backoff, cola interna, deduplicación de solicitudes idénticas ni idempotencia por clave de cliente (ver Risks).
- No se implementa logging estructurado ni métricas. El proyecto todavía no tiene una convención de logging, y este módulo maneja una credencial de sesión: introducir logs acá sin esa convención es exactamente cómo se filtra un `phpsessid`.
- No se modifican los schemas de CHANGE-08 ni se les agrega un `from_request` (D-6 de aquel change lo descartó deliberadamente, reservando el mapeo para esta capa).
- No se implementa `AuthService` ni se extrae una clase base común entre servicios.

## Decisions

### D-1 — `ScanService` es una clase con un único método público async, no una función libre

```python
class ScanService:
    async def start_scan(self, request: ScanRequest) -> ScanResponse: ...
```

`CHANGES.md` fija *clase `ScanService`, método async `start_scan(request: ScanRequest) -> ScanResponse`*, y CHANGE-12 la consumirá como `ScanService().start_scan(request)`. Una clase da además el lugar natural donde colgar el colaborador inyectable de D-2.

- *Alternativa descartada*: función libre `async def start_scan(request, uow_factory=ScanUoW)`. Menos ceremonia, pero rompe el contrato del roadmap, deja el punto de inyección como parámetro de cada llamada (el Router tendría que conocerlo para poder sustituirlo) y no deja precedente reutilizable para `AuthService`.
- El método es `async` aunque la generación del UUID y la composición del payload sean síncronas: la operación **como un todo** hace I/O a través del UoW, y la regla dura pide `async` en toda la capa de I/O.
- `start_scan` recibe la `ScanRequest` **ya validada**. No hay sobrecarga que acepte `dict` ni entrada cruda: la autoridad de validación es `scan-payload-contract` y esta capa no la duplica (requirement "La iniciación no revalida ni relaja el contrato de entrada").

### D-2 — El ámbito de recursos se inyecta como **fábrica** por constructor, con `ScanUoW` como default

```python
class ScanService:
    def __init__(self, uow_factory: Callable[[], ScanUoW] = ScanUoW) -> None:
        self._uow_factory: Callable[[], ScanUoW] = uow_factory

    async def start_scan(self, request: ScanRequest) -> ScanResponse:
        ...
        async with self._uow_factory() as uow:
            await uow.n8n.forward_scan(payload)
```

**Ésta es la decisión no obvia central del change** y la que el usuario debería revisar primero. El criterio de aceptación de `CHANGES.md` dice literalmente *"test unitario mockea `ScanUoW`"*; la pregunta es **cómo** se mockea.

Se elige la fábrica por constructor con default de producción, replicando el patrón que D-2 de CHANGE-10 ya estableció para la `Settings` del UoW: *la rama del default es la de producción, la rama explícita es la de test, y ninguna de las dos es código muerto*. El call site de producción sigue siendo exactamente el que fija el roadmap —`ScanService()` sin argumentos abre `async with ScanUoW() as uow:`— porque el valor por defecto **es** la clase `ScanUoW`.

- *Alternativa descartada*: importar `ScanUoW` a nivel de módulo y usarlo directo, mockeando con `monkeypatch.setattr("fastapi_bridge.services.scan_service.ScanUoW", Doble)`. Es la opción de menos código de producción, pero ata cada test a la ruta de import del módulo (un renombre de archivo rompe tests que no hablan de archivos), es global durante el test, y hace imposible correr dos configuraciones distintas en paralelo. La convención de la casa ya evita `monkeypatch` para colaboradores (CHANGE-10, D-2).
- *Alternativa descartada*: inyectar una **instancia** de `ScanUoW` en vez de una fábrica. Choca de frente con una restricción documentada de CHANGE-10: *"uso no soportado: reentrar la misma instancia de `ScanUoW` en un `async with` anidado"*. Una instancia compartida entre dos `start_scan` concurrentes sobrescribiría `_client` y perdería la referencia al primero — fuga de sockets garantizada bajo carga. La fábrica hace estructuralmente imposible ese bug: una instancia nueva por operación.
- *Alternativa descartada*: `Depends(get_scan_uow)` de FastAPI. Violaría el requirement "La iniciación es independiente del framework web" y arrastraría `fastapi` a `services/`.
- *Consecuencia deliberada*: la firma diverge levemente de la literal del roadmap (`ScanService()` sin parámetros). Es una **extensión compatible**, no un cambio de contrato — el mismo tipo de divergencia justificada que CHANGE-09 documentó en su D-1 y CHANGE-10 en su D-2. Se anota en `CHANGES.md` al cerrar el change.
- El tipo es `Callable[[], ScanUoW]`, importado de `collections.abc` — no un `Protocol` nuevo. Una `Callable` sin argumentos es exactamente el contrato que se necesita y la clase `ScanUoW` lo satisface tal cual.

### D-3 — El generador de identificadores **no** se inyecta: se verifica por propiedades

`scan_id = str(uuid.uuid4())`, con `uuid` importado de la biblioteca estándar y llamado directamente dentro de `start_scan`.

Se evaluó agregar un segundo parámetro inyectable (`id_factory: Callable[[], str] = lambda: str(uuid.uuid4())`) para que los tests tuvieran identificadores determinísticos. Se descarta:

1. **Un identificador fijo debilita el test más importante.** El requirement crítico es que el `scan_id` de la confirmación sea *el mismo* que viajó en el payload. Con un stub que siempre devuelve `"scan-1"`, esa aserción pasa aunque el código devuelva un literal `"scan-1"` en la respuesta sin haberlo tomado del payload. Con UUIDs reales, la aserción `response.scan_id == payload_capturado.scan_id` sólo puede pasar si el valor **fluyó** correctamente. El no-determinismo es acá una propiedad del test, no un obstáculo.
2. **Los requirements se verifican mejor por propiedades que por valor**: "es un UUID v4" se comprueba con `uuid.UUID(scan_id).version == 4`; "dos solicitudes idénticas reciben identificadores distintos" se comprueba iniciando dos escaneos y comparando; "no deriva de la entrada" se comprueba verificando que el identificador no contiene ningún campo de la solicitud. Ninguna necesita fijar el valor.
3. Agregar un segundo punto de inyección duplica la superficie del constructor para un beneficio que ningún test reclama.

- *Alternativa descartada*: `uuid.uuid1()`. Codifica dirección MAC y marca de tiempo — filtra información del anfitrión y produce identificadores parcialmente predecibles. Prohibido por el requirement ("SHALL NOT incorporar información del proceso, del anfitrión ni del instante de generación").
- *Alternativa descartada*: un contador o una secuencia de base de datos. Enumerable por un cliente y, además, obligaría a tocar `db_fuzzing` — prohibido por regla dura del proyecto.
- *Alternativa descartada*: `uuid4().hex` (sin guiones). Cosmético; se prefiere la forma canónica con guiones porque es la que el Dashboard y los logs de n8n van a mostrar, y `str(uuid4())` es lo que fija `CHANGES.md`.
- El campo destino es `str` en ambos contratos (D-8 de CHANGE-08 lo decidió así), de modo que la conversión a texto ocurre acá, una sola vez, en el momento de generar.

### D-4 — El texto de la confirmación es una constante de módulo, no configuración ni literal inline

```python
SCAN_QUEUED_MESSAGE = "Escaneo encolado correctamente. Los resultados aparecerán en el Dashboard."
```

`ScanResponse.message` es obligatorio y el requirement pide un mensaje legible no vacío. La pregunta es de dónde sale el texto.

- **No es configuración.** La regla dura "nada hardcodeado → todo viene de `core/settings.py`" apunta a *configuración de despliegue* (URLs, credenciales, timeouts, orígenes CORS). Un texto de interfaz en español no cambia entre entornos, no es un secreto y agregarlo a `Settings` rompería `test_env_contract.py`, que exige paridad exacta entre las claves de `.env.example` y los campos de `Settings`.
- **Tampoco es un literal inline.** Como constante con nombre queda en un solo lugar, se puede importar desde el test (que assertea contra la constante, nunca contra el texto duplicado — mismo criterio que CHANGE-10 aplicó a `REQUEST_TIMEOUT_SECONDS`) y deja el punto de extensión obvio si algún día se internacionaliza.
- El texto **no** menciona el `phpsessid`, la URL objetivo ni el propio `scan_id`: es una plantilla fija, no interpolada. Una plantilla sin interpolación no puede filtrar nada (requirement "Las credenciales de la solicitud no se filtran").

### D-5 — El booleano de `forward_scan` se ignora deliberadamente; el único señalizador de falla es la excepción

`forward_scan` está anotado `-> bool`, pero por construcción **nunca devuelve `False`**: o devuelve `True` (respuesta 2xx) o levanta `N8nUnavailableError`. El veredicto de qué cuenta como aceptación pertenece a `scan-forwarding` y ya está decidido ahí.

Se llama sin capturar el retorno (`await uow.n8n.forward_scan(payload)`), sin `if not ok:` y sin `assert`. Escribir una rama para un valor imposible sería código muerto no cubrible por ningún test —y una rama sin test es exactamente lo que Strict TDD prohíbe—, además de duplicar en el Service la autoridad de veredicto que vive en el repositorio.

- *Alternativa evaluada*: `if not await uow.n8n.forward_scan(payload): raise N8nUnavailableError(...)`. Parece defensivo, pero es una segunda definición de "qué es una entrega fallida" que puede divergir de la primera. Descartada.
- Si en el futuro `forward_scan` cambiara a devolver `False` en vez de levantar, ese cambio pertenece a `scan-forwarding` y traería consigo la actualización de este Service.

### D-6 — La propagación del error se implementa por **ausencia de código**, y se verifica con test

`start_scan` no tiene ningún `try` / `except` / `finally`. `N8nUnavailableError` sube desde el repositorio, atraviesa el `__aexit__` del UoW —que cierra el canal y no suprime (garantía de `scan-resource-lifecycle`)— y llega al llamador con su tipo original.

Que la propagación sea "no escribir nada" la hace fácil de romper por accidente en un refactor futuro (alguien agrega un `try` para loguear y se come la excepción). Por eso hay tests dedicados que afirman el tipo exacto que llega al llamador y que la confirmación **no** se emitió, y no sólo "que algo falló".

- El Service tampoco envuelve la condición en una excepción propia de la capa de negocio. Una segunda excepción obligaría a CHANGE-12 a reconocer dos casos para responder un solo 502, sin ganancia.

### D-7 — `ScanService` es sin estado entre operaciones

Lo único que guarda `self` es la fábrica de D-2, que es inmutable y se fija en el constructor. Ni el `scan_id`, ni el payload, ni el resultado se guardan en la instancia: son locales de `start_scan`. Una misma instancia de `ScanService` puede atender solicitudes concurrentes sin interferencia, que es exactamente el modo en que CHANGE-12 la va a usar detrás de un endpoint ASGI.

Corolario verificable: dos `start_scan` concurrentes sobre la **misma** instancia de `ScanService` producen dos identificadores distintos y dos ámbitos de recursos distintos.

### D-8 — El mapeo `ScanRequest → N8nPayload` es explícito campo a campo, nunca por desempaquetado

```python
payload = N8nPayload(
    target_url=str(request.target_url),
    phpsessid=request.phpsessid,
    sqlmap_level=request.sqlmap_level,
    sqlmap_risk=request.sqlmap_risk,
    scan_id=scan_id,
)
```

- `str(request.target_url)` es obligatorio: `ScanRequest.target_url` es un objeto `HttpUrl`, `N8nPayload.target_url` es `str`. D-5 de CHANGE-08 dejó esta conversión explícitamente reservada para esta capa *"para que CHANGE-11 no la improvise"*. Ojo con la normalización: en Pydantic ≥2.10 `HttpUrl` agrega barra final al host desnudo (`https://example.com` → `https://example.com/`), así que los tests comparan contra `str(request.target_url)` y nunca contra el literal de entrada.
- *Alternativa descartada*: `N8nPayload(**request.model_dump(), scan_id=scan_id)`. Más corto, pero (a) `model_dump()` sin `mode="json"` deja `target_url` como objeto `HttpUrl` y rompe la garantía de serialización de D-5 de CHANGE-08, y (b) acopla silenciosamente los dos contratos: si mañana `ScanRequest` gana un campo, viajaría al orquestador sin que nadie lo decida. El mapeo explícito convierte ese caso en un error visible de firma. El requirement "El mensaje lleva exactamente los campos del contrato" es precisamente eso.
- El orden de las operaciones importa y es parte del diseño: primero se genera el `scan_id`, después se compone el payload, y **recién entonces** se abre el ámbito de recursos. Nada que pueda fallar por validación ocurre con un canal de red abierto.

### D-9 — El doble de prueba del ámbito es una clase escrita a mano, no `AsyncMock`

El archivo `fastapi_bridge/tests/test_scan_service.py` define un doble propio, del orden de quince líneas:

```
FakeScanUoW: registra entradas/salidas, expone .n8n = FakeN8nRepository,
             marca closed=True en __aexit__, y no suprime excepciones
FakeN8nRepository: acumula los payloads recibidos en una lista y,
             opcionalmente, levanta N8nUnavailableError
```

- *Alternativa descartada*: `unittest.mock.AsyncMock`. Emular correctamente el protocolo de context manager async con `AsyncMock` (`__aenter__` devolviendo el objeto correcto, `__aexit__` devolviendo un falsy para no suprimir excepciones) es sutil y produce fallos confusos cuando se hace mal; además un mock permisivo pasa aserciones incluso cuando la producción llama a métodos que no existen. Un doble explícito hace visible el contrato exacto que `ScanService` consume y falla ruidosamente si el Service llama a otra cosa.
- **Riesgo del doble: divergencia con el real.** Mitigación explícita: un test de conformidad que verifica sobre la clase **real** `ScanUoW` que (a) se construye sin argumentos, (b) implementa `__aenter__`/`__aexit__` y (c) expone `n8n`. Es viable sin red y sin `.env` porque todos los campos de `Settings` tienen default y construir un `ScanUoW` no hace I/O. Ese test es la costura que evita que el doble derive del real sin que nadie se entere.
- Los pares de tests van sin fixtures compartidas y con un helper de construcción de `ScanRequest`, siguiendo D-9 de CHANGE-08.

### D-10 — La tabla de fronteras de import no se toca en este change

`("services", "httpx")` y `("services", "sqlalchemy")` ya están en `LAYER_IMPORT_RULES` y cubren los dos criterios de capa que este change necesita. No hace falta agregar nada; sí hace falta **verificar** que los casos ya existentes siguen verdes ahora que `services/` tiene código real — pasan de vacuos a significativos sin una sola línea nueva de test.

Se evaluó agregar `("services", "fastapi")`. Se defiere: afectaría también a `services/auth_service.py` (CHANGE-04), que todavía no está escrito, y decidir por decreto desde acá el contrato de otro change es precisamente lo que la disciplina de changes pequeños quiere evitar. Queda como Open Question. Mientras tanto, el requirement "La iniciación es independiente del framework web" se verifica en `test_scan_service.py` por AST sobre el módulo de este change, sin ampliar la tabla global.

## Risks / Trade-offs

- **[El `scan_id` devuelto y el entregado se desincronizan en un refactor futuro]** → Es el bug más caro posible acá: el escaneo corre, los resultados se guardan bajo un identificador, y el usuario recibe otro con el que nunca los encontrará. Silencioso en producción (nada falla, nada loguea) y no detectable por los tests de las capas vecinas. Mitigación: test dedicado que compara identidad entre el `scan_id` de la confirmación y el del payload realmente capturado por el doble, con UUIDs reales y no con un stub fijo (D-3.1), más el test de dos solicitudes idénticas que verifica que los identificadores no colisionan.
- **[Un `try/except` agregado por buenas intenciones convierte una falla en un éxito silencioso]** → Un futuro colaborador que quiera loguear el error puede envolver el `async with` y devolver una `ScanResponse` de todos modos, lo que haría creer al usuario que su escaneo corre cuando nunca se disparó. Mitigación: tests que afirman el tipo exacto propagado **y** que no se emitió confirmación; el requirement lo declara normativo; el docstring del módulo lo deja escrito.
- **[Fuga del `phpsessid` por logging]** → El campo es una credencial de sesión de la aplicación objetivo y atraviesa este módulo. Mitigación: este change no introduce ningún `logging`, la constante de mensaje de D-4 no interpola nada, la excepción se propaga sin enriquecerse con datos de la solicitud, y hay un test que inspecciona el módulo para verificar que no emite registros con campos de la solicitud. Cuando el proyecto adopte una convención de logging, este módulo debe entrar con una lista de campos a redactar, no por omisión.
- **[Sin idempotencia: un doble click dispara dos escaneos]** → Dos solicitudes idénticas reciben dos identificadores distintos y producen dos entregas, con doble carga sobre la aplicación objetivo. Aceptado en v1.2 y **fuera del alcance de este change**: la defensa vigente es el rate limit por IP (10 req/60 min, CHANGE-00d) que aplica el borde HTTP en CHANGE-12, más el bloqueo del botón en el frontend. Una idempotencia real necesitaría una clave de cliente y almacenamiento de solicitudes recientes — es un change propio, no una decisión de éste.
- **[El escaneo no queda registrado del lado del Bridge]** → Si la entrega es aceptada pero el pipeline de n8n muere después, el Bridge no tiene registro de que ese `scan_id` existió y no puede reconciliar nada. Aceptado y deliberado: la tabla `scans` de `db_fuzzing` pertenece al sistema WASA existente y la regla dura del proyecto prohíbe que el Bridge escriba sobre ella (DD-02 de la KB). El Bridge es un puente fire-and-forward, no un sistema de registro.
- **[El doble de prueba diverge de `ScanUoW`]** → Ver mitigación en D-9: test de conformidad contra la clase real. Sigue siendo un doble, así que un cambio *semántico* de `ScanUoW` que conserve la forma (por ejemplo, que dejara de cerrar el canal) no lo detectaría este change — lo detectan los tests de `scan-resource-lifecycle`, que son sus dueños.
- **[Divergencia entre la firma real y `CHANGES.md`]** → El roadmap describe `ScanService` sin parámetros de constructor; D-2 agrega uno con default. Mitigación: se actualiza el `Scope` de CHANGE-11 en `CHANGES.md` al cerrar, igual que hicieron CHANGE-09 (D-1) y CHANGE-10 (D-2).

## Open Questions

- **¿Se agrega `("services", "fastapi")` a `LAYER_IMPORT_RULES`?** Reforzaría por AST que el Service nunca construya respuestas HTTP ni use `Depends`, en línea con la regla dura de que el Router no contiene lógica y el Service no conoce el transporte. Se defiere porque la regla también gobernaría `services/auth_service.py` (CHANGE-04), que aún no existe. Responderla después no cambia los specs, ni el enfoque, ni las tasks de este change: el módulo de este change ya cumple la regla, y agregarla luego sería una línea. Sugerencia: decidirlo al proponer CHANGE-04, con los dos servicios a la vista.
- **¿El texto de `SCAN_QUEUED_MESSAGE` es el definitivo de cara al usuario?** El requirement sólo exige "legible y no vacío", y el frontend (CHANGE-20) muestra su propio mensaje de éxito antes de redirigir al Dashboard, así que este texto puede no llegar nunca a una pantalla. Cambiarlo después es editar una constante y un test que la importa.
