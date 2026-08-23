## Context

Ver `proposal.md` — Why para la motivación, y `specs/scan-resource-lifecycle/spec.md` para los requirements normativos. Este documento cubre únicamente el *cómo*.

Estado actual verificado en el repo:

- `fastapi_bridge/uow/scan_unit_of_work.py` existe pero es sólo el docstring placeholder del scaffold de CHANGE-00a. **Nadie lo importa**: `services/scan_service.py` también sigue siendo placeholder. Reescribir el archivo no rompe nada. Su placeholder dice *"Se implementa en CHANGE-12"*; `CHANGES.md` dice CHANGE-10 — mismo desfasaje de numeración que ya se corrigió en `scan_schemas.py` (CHANGE-08) y en `n8n_repository.py` (CHANGE-09). Al reescribir el archivo, el conflicto desaparece.
- `fastapi_bridge/uow/auth_unit_of_work.py` es también placeholder. **No hay ningún UoW implementado en el repo todavía**: este change no tiene precedente estructural que copiar, lo establece. Se diseña con esa responsabilidad en mente — `AuthUoW` (CHANGE-02/04) debería poder seguir la misma forma sobre una `AsyncSession` en lugar de un `AsyncClient`.
- `fastapi_bridge/repositories/n8n_repository.py` está implementado y archivado (CHANGE-09). Firma real verificada leyendo el archivo:
  ```
  class N8nRepository:
      def __init__(self, client: httpx.AsyncClient, settings: Settings) -> None: ...
      async def forward_scan(self, payload: N8nPayload) -> bool: ...
  ```
  Toma **dos** argumentos, no uno: `CHANGES.md` describía sólo `client`, y D-1 de CHANGE-09 documentó la divergencia deliberada. El módulo también expone dos constantes públicas: `WEBHOOK_TOKEN_HEADER = "X-WASA-TOKEN"` y `REQUEST_TIMEOUT_SECONDS = 10.0`.
- `fastapi_bridge/core/settings.py` expone `Settings` (Pydantic `BaseSettings`) y `get_settings()` bajo `@lru_cache`. Los campos que interesan acá —`N8N_WEBHOOK_URL: str`, `N8N_WEBHOOK_TOKEN: SecretStr`— ya existen desde CHANGE-00c. Este change **no** agrega, quita ni renombra ningún campo: `test_env_contract.py` verifica paridad exacta entre las claves de `.env.example` y los campos de `Settings`, y agregar uno rompería ese test.
- `fastapi_bridge/tests/test_layer_boundaries.py` verifica fronteras de import por AST con una tabla `LAYER_IMPORT_RULES` diseñada para que agregar una regla sea una línea. Hoy tiene siete entradas y **ninguna** cubre `uow/`.
- `fastapi_bridge/tests/test_structure.py` ya exige que `uow/scan_unit_of_work.py` exista y tenga docstring de módulo — cualquier reescritura debe conservar el docstring.
- Entorno: `httpx>=0.27` en `requirements.txt`; pytest 8 con `pytest.ini` → `testpaths = fastapi_bridge/tests`, `asyncio_mode = auto` (los tests `async def` corren sin decorador). `httpx.AsyncClient` expone `is_closed` y `aclose()` como API pública, y `timeout` como atributo inspeccionable — los tres pilares de la suite de este change.
- Convención de tests de configuración ya establecida (`test_settings.py`, `test_n8n_repository.py`): se instancia `Settings()` **directamente**, nunca `get_settings()`, porque está bajo `@lru_cache` y ensuciaría el estado entre tests. Esa convención condiciona D-2.

Restricciones del proyecto que condicionan el diseño:

- Reglas duras de `CLAUDE.md`: el Service NUNCA instancia `httpx`/`SQLAlchemy` directamente → siempre a través del UoW correspondiente (este change **es** ese UoW); nada de config hardcodeada; type hints obligatorios en toda función; `async` en toda la capa de I/O; `PascalCase` para clases, `snake_case` para funciones/archivos.
- Regla de capas de la KB: `Router → Service → UoW → Repository → (SQLAlchemy/httpx, Settings)`. El UoW **sí** puede depender de `Settings`, de `httpx` y de la capa Repository — es, junto a Repository, la capa que toca infraestructura. Lo que **no** puede es depender de la capa Service ni del framework web.
- Governance **MEDIO**: gobierno de ciclo de vida de un recurso de infraestructura. Se implementa en pasos y se surfacean las decisiones no obvias (D-2, D-4, D-5, D-6).
- Strict TDD activo: cada comportamiento del ciclo de vida se escribe primero como test que falla.

## Goals / Non-Goals

**Goals:**

- Que exista **un solo lugar** en el sistema donde se abre y se cierra el `httpx.AsyncClient` de scan, de modo que auditar fugas de sockets sea leer un archivo.
- Que el cierre del cliente sea **incondicional**: ninguna ruta de salida del bloque —normal, por `N8nUnavailableError`, o por un bug arbitrario dentro del `async with`— puede dejarlo abierto.
- Que la superficie que ve `ScanService` (CHANGE-11) sea **mínima y mockeable**: constructor sin argumentos obligatorios, protocolo de context manager async, una sola propiedad `n8n`. Un doble de prueba de ese contrato debe caber en cinco líneas.
- Que la regla dura "el Service no instancia `httpx`" quede **verificada automáticamente** por AST, no sólo prometida en un docstring — extendiendo la frontera al propio `uow/` para que la única capa habilitada a abrir el cliente sea ésta.
- Establecer el **precedente estructural del patrón UoW** en este repo, para que `AuthUoW` no tenga que reinventarlo.

**Non-Goals:**

- No se genera el `scan_id`, no se construye el `N8nPayload` y no se llama a `forward_scan`: eso es `ScanService` (CHANGE-11). El UoW expone el repositorio; quien lo usa es otro.
- No se toca `N8nRepository`. CHANGE-09 está archivado; acá se consume su firma tal cual.
- No se implementa `AuthUoW` ni se define una clase base compartida entre ambos UoW (ver D-8).
- No se registra ningún handler de excepción ni se mapea nada a 502: eso es CHANGE-12.
- No se implementa pooling entre requests, keep-alive compartido, logging estructurado ni métricas del cliente (ver D-7 y Risks).
- No se agregan campos a `Settings` ni claves a `.env.example`.

## Decisions

### D-1 — `ScanUoW` es un async context manager escrito a mano (`__aenter__`/`__aexit__`), no un `@asynccontextmanager`

```
class ScanUoW:
    async def __aenter__(self) -> ScanUoW: ...
    async def __aexit__(self, exc_type, exc, tb) -> None: ...

    @property
    def n8n(self) -> N8nRepository: ...
```

`CHANGES.md` pide una **clase** `ScanUoW` con una **propiedad** `n8n`, y `ScanService` la usa como `async with ScanUoW() as uow: ... uow.n8n ...`. Un generador decorado con `@asynccontextmanager` produce un objeto de contexto anónimo, no una clase con propiedades: para exponer `uow.n8n` habría que hacer que el generador ceda una tupla o un objeto auxiliar, agregando una indirección sin ganancia.

- *Alternativa descartada*: `@asynccontextmanager` sobre una función `scan_uow()`. Menos código, pero rompe el contrato de `CHANGES.md` (clase + propiedad), dificulta el mockeo por parte de CHANGE-11 (no hay una clase que sustituir) y no deja precedente reutilizable para `AuthUoW`.
- *Alternativa descartada*: heredar de `contextlib.AbstractAsyncContextManager`. Aporta sólo un `__aenter__` por defecto que igual hay que sobrescribir; es ceremonia sin verificación real.
- `__aenter__` devuelve `self` (no el repositorio) para que el UoW pueda ganar más recursos en el futuro sin romper el contrato del `as uow`.

### D-2 — La `Settings` se inyecta por constructor con fallback a `get_settings()`; se resuelve en `__init__`

```
def __init__(self, settings: Settings | None = None) -> None:
    self._settings: Settings = settings if settings is not None else get_settings()
```

Ésta es **la decisión no obvia central de este change** y merece justificación explícita, porque D-1 de CHANGE-09 rechazó frontalmente este mismo patrón para el *repositorio*, con el argumento de que "mantiene la dependencia oculta *y* agrega una rama que nadie usa en producción".

Ese argumento **no se traslada al UoW, y de hecho se invierte**:

1. **Acá la rama del `None` ES la de producción.** En el repositorio, el fallback habría sido código muerto: `ScanUoW` siempre iba a pasarle una `Settings`. En el UoW, en cambio, `CHANGES.md` fija `async with ScanUoW() as uow:` sin argumentos como el uso de producción, y CHANGE-11 lo consume así. La rama explícita es la de test. Ninguna de las dos es código muerto.
2. **El UoW es el composition root.** Alguien tiene que traducir "configuración vigente de la app" a "objeto `Settings` concreto". La cadena `Router → Service → UoW → Repository` no puede terminar sin que alguna capa toque `core`. Que sea el UoW —la capa cuyo trabajo *es* construir infraestructura— y no el repositorio ni el service, mantiene a los otros dos completamente determinados por sus argumentos.
3. **La convención de tests de la casa sigue funcionando.** `Settings()` se construye directo en el test y se inyecta: `ScanUoW(settings=build_settings(...))`. Nadie necesita `get_settings.cache_clear()` ni `monkeypatch.setenv`, que es exactamente lo que D-1 de CHANGE-09 quería evitar.

- *Alternativa descartada*: `ScanUoW(settings: Settings)` obligatorio. Es más puro, pero obliga a que `ScanService` reciba y transporte la `Settings` hasta el UoW, contradiciendo el scope de CHANGE-11 (`async with ScanUoW() as uow:`) y empujando conocimiento de configuración a la capa de lógica de negocio, que no debería tener ninguno.
- *Alternativa descartada*: llamar a `get_settings()` dentro de `__aenter__` sin parámetro alguno. Dependencia totalmente oculta e intesteable sin manipular la cache global. Rechazada.
- *Alternativa descartada*: resolver en `__aenter__` en lugar de `__init__`. Difiere el fallo por configuración inválida hasta dentro del contexto async, donde el diagnóstico es peor. Resolver en `__init__` falla rápido y deja el objeto completamente determinado antes de tocar recursos. `get_settings()` está cacheado y es libre de efectos, así que llamarlo en el constructor no tiene costo.
- **Consecuencia conocida y aceptada**: `app.dependency_overrides[get_settings]` (el mecanismo que usan los tests de router) **no** alcanza a este `get_settings()`, porque no pasa por `Depends`. Los tests de integración de CHANGE-12 deberán sustituir el `ScanService`/`ScanUoW` completo, no la settings — que es de todos modos lo que corresponde para no hacer red real. Queda anotado acá para que ese change no se sorprenda.

### D-3 — `__aenter__` construye cliente y repositorio en ese orden, y guarda ambos

```
async def __aenter__(self) -> ScanUoW:
    self._client = httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS)
    self._n8n = N8nRepository(self._client, self._settings)
    return self
```

Se guarda **también** el cliente, no sólo el repositorio: `__aexit__` necesita cerrarlo y `N8nRepository` no expone el suyo (su atributo es privado, y alcanzarlo sería violar su encapsulamiento). Dos atributos privados, `_client` y `_n8n`, ambos inicializados a `None` en `__init__` con tipo `httpx.AsyncClient | None` / `N8nRepository | None`.

La construcción del cliente **no** es `await`-able ni hace I/O: `httpx.AsyncClient(...)` sólo arma el objeto y el pool de conexiones se abre perezosamente en la primera request. Por eso `__aenter__` no puede fallar por red, y no hace falta un `try/except` para deshacer una construcción parcial: si `N8nRepository(...)` fallara (no puede, su `__init__` sólo asigna), el cliente recién creado no tendría sockets abiertos que liberar.

### D-4 — El `AsyncClient` lleva como timeout por defecto la misma constante que usa la entrega, importada del repositorio

`httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS)`, con `REQUEST_TIMEOUT_SECONDS` **importada** de `fastapi_bridge.repositories.n8n_repository` — no redeclarada acá.

Decisión no obvia, surfaceada. D-3 de CHANGE-09 decidió pasar el timeout **por request** y descartó explícitamente "configurar el timeout en el cliente desde el UoW" como forma de *cumplir* la garantía. Esta decisión **no revierte aquélla**: la garantía sigue viviendo en `forward_scan`, que pasa `timeout=REQUEST_TIMEOUT_SECONDS` en cada llamada y gana sobre el default del cliente. Lo que se agrega acá es una **red de seguridad**, por dos razones concretas:

1. El default de `httpx.AsyncClient` sin argumento es **5 segundos**, un valor arbitrario y más corto que el que el sistema declara como su límite de entrega. Dejarlo así significa que cualquier llamada futura a través de este cliente que olvide su timeout queda acotada por un número que nadie eligió y que contradice al declarado.
2. Es literalmente un argumento, y al **importar** la constante en vez de escribir `10.0` no se crea ningún literal duplicado que pueda divergir. Si mañana el límite cambia, cambia en un solo archivo.

El import `from fastapi_bridge.repositories.n8n_repository import N8nRepository, REQUEST_TIMEOUT_SECONDS` no agrega acoplamiento nuevo: el UoW ya tiene que importar `N8nRepository` del mismo módulo, y la dirección `UoW → Repository` es la permitida por la regla de capas.

- *Alternativa descartada*: `httpx.AsyncClient()` sin timeout explícito. Deja el default de 5s de la librería gobernando cualquier llamada futura — bounded, sí, pero por un valor que el sistema no eligió y que contradice al que declara.
- *Alternativa descartada*: redeclarar `CLIENT_TIMEOUT_SECONDS = 10.0` en el UoW. Dos literales `10.0` en módulos distintos que hay que acordarse de mover juntos. Exactamente la duplicación que el spec prohíbe ("sin literales duplicados que puedan divergir").
- *Alternativa descartada*: `timeout=None` (sin límite). Un await colgado indefinidamente bloquea el worker. Prohibido por el requirement.

### D-5 — `__aexit__` cierra en `try/finally`, no suprime la excepción, y limpia el estado

```
async def __aexit__(self, exc_type, exc, tb) -> None:
    client = self._client
    self._client = None
    self._n8n = None
    if client is not None:
        await client.aclose()
```

Tres puntos, todos deliberados:

1. **Devuelve `None`** (anotado `-> None`, no `-> bool`). En el protocolo de context manager, un valor falsy propaga la excepción. `None` es falsy, así que la excepción del bloque llega intacta al llamador — que es lo que exige el requirement "el ámbito no suprime los errores". Anotar `-> bool` invitaría a que alguien devuelva `True` "para simplificar", suprimiendo silenciosamente todas las fallas de escaneo. La firma es la barrera.
2. **El estado se limpia antes del `await`**, no después. Si `aclose()` levantara, `_client`/`_n8n` ya están en `None` y el UoW queda en un estado coherente ("fuera de vigencia") en vez de apuntar a un cliente medio cerrado. Esto también hace que un `__aexit__` llamado dos veces sea inocuo.
3. **No hay `try/except` alrededor de `aclose()`.** Si el cierre falla, esa excepción propaga y —por semántica estándar de Python— reemplaza a la del bloque, conservándola como `__context__`. Ver Risks: es un trade-off consciente, no un olvido.

- *Alternativa descartada*: `except Exception: pass` alrededor de `aclose()`. Garantizaría no enmascarar la excepción original, pero silenciaría una falla real de cierre — el modo exacto de fuga de recursos que este change existe para prevenir. Un fallo de `aclose()` debe ser ruidoso.
- *Alternativa descartada*: `contextlib.AsyncExitStack` interno. Es la herramienta correcta cuando hay *varios* recursos con orden de cierre; con uno solo agrega una capa de indirección y una dependencia conceptual sin ganancia. Cuando `ScanUoW` tenga un segundo recurso, la migración a `AsyncExitStack` será un refactor local.

### D-6 — `n8n` es una `@property` que levanta `RuntimeError` fuera del contexto

```
@property
def n8n(self) -> N8nRepository:
    if self._n8n is None:
        raise RuntimeError(
            "ScanUoW.n8n sólo está disponible dentro de 'async with ScanUoW() as uow:'"
        )
    return self._n8n
```

Sin la guarda, `uow.n8n` fuera del contexto devolvería `None` y el error real aparecería una línea después como `AttributeError: 'NoneType' object has no attribute 'forward_scan'` — un mensaje que no dice nada sobre la causa. La guarda convierte un fallo diferido y opaco en uno inmediato y explícito.

- **`RuntimeError`, no una excepción de dominio.** Usar el UoW fuera de su contexto es un **bug de programación**, no una condición del negocio. Meterlo en `exceptions/errors.py` junto a `N8nUnavailableError` invitaría a que el borde HTTP lo mapee a una respuesta de usuario, cuando lo correcto es que salga como 500 y alguien lo arregle. `RuntimeError` es exactamente la categoría que la stdlib reserva para esto.
- La `@property` (sin setter) también deja `uow.n8n = otra_cosa` como error, cerrando la puerta a que un consumidor sustituya el repositorio a mano en producción.
- *Alternativa descartada*: atributo público simple `self.n8n`. Sin guarda, sin inmutabilidad, y el diagnóstico opaco descrito arriba.
- *Alternativa descartada*: `assert self._n8n is not None`. Los `assert` desaparecen con `python -O`, así que la guarda se evaporaría justo en producción.

### D-7 — Un cliente nuevo por ámbito; sin cliente compartido de proceso

Cada `__aenter__` construye su propio `httpx.AsyncClient`. No hay singleton de módulo, ni cliente en `app.state`, ni pool compartido entre requests.

Es una decisión con un costo real y conocido: se pierde el keep-alive entre escaneos, así que cada entrega paga un handshake TCP (y TLS, si el webhook es HTTPS). A cambio:

- Cumple el requirement de aislamiento: dos escaneos concurrentes no comparten estado, y uno que falla no puede dejar al otro sin canal.
- Elimina toda una clase de bugs de estado compartido en async (cliente cerrado por un request mientras otro lo usa).
- Es coherente con la semántica del sistema: el volumen esperado es **un escaneo manual por vez desde una landing**, no un flujo sostenido. Optimizar el keep-alive acá sería optimizar sin evidencia.

- *Alternativa descartada*: cliente compartido en el `lifespan` de FastAPI, inyectado al UoW. Es la solución correcta bajo carga y la que recomienda la skill `fastapi-async-patterns` para tráfico sostenido, pero acopla el UoW al ciclo de vida de la app —rompiendo el requirement "funciona sin la aplicación web levantada"— y no está justificada por el perfil de tráfico. Si el smoke test de CHANGE-22 o el uso real mostraran que el handshake pesa, la migración es un change propio y localizado: el UoW pasa a recibir el cliente en vez de construirlo, y `__aexit__` deja de cerrarlo.

### D-8 — No se crea una clase base `UnitOfWork` compartida con `AuthUoW`

`AuthUoW` (CHANGE-02/04) gobernará una `AsyncSession` de SQLAlchemy y necesitará `commit`/`rollback` — un protocolo que `ScanUoW` **no** tiene, porque una entrega HTTP no es transaccional y no se puede deshacer. Lo único genuinamente común entre ambos es `__aenter__`/`__aexit__`, que ya es un protocolo del lenguaje y no necesita una clase base para existir.

Extraer una base ahora sería diseñar para un segundo caso que todavía no está escrito, con el riesgo clásico de que la abstracción quede modelada sobre el único ejemplo disponible. Se deja el precedente **estructural** (mismo layout de archivo, mismos nombres de atributos privados, misma forma de `__aexit__`) y se evalúa la base cuando `AuthUoW` exista y se pueda comparar con evidencia real. Mismo criterio que D-2 de CHANGE-09 aplicó a la jerarquía de excepciones.

### D-9 — La pureza de capa se verifica extendiendo la tabla existente, con tres entradas nuevas

Se agregan `("uow", "fastapi")`, `("uow", "starlette")` y `("uow", "slowapi")` a `LAYER_IMPORT_RULES` en `test_layer_boundaries.py`. Con eso el requirement "el gobierno de recursos es independiente del framework web" queda verificado por AST sobre **todos** los archivos de `uow/`, presentes y futuros —incluido `auth_unit_of_work.py` cuando se implemente— y no sólo sobre el que escribe este change.

No se agrega `("services", "httpx")`: **ya está** en la tabla desde CHANGE-00a, y es justamente la regla que este change hace cumplible, al darle a `ScanService` un lugar legítimo desde donde alcanzar a n8n.

No se escribe un test de imports nuevo en `test_scan_unit_of_work.py`: duplicaría una verificación existente que además cubre más superficie.

### D-10 — El ciclo de vida se testea con `is_closed`, y las entregas con `MockTransport`

`httpx.AsyncClient.is_closed` es API pública y es el observable directo del requirement de cierre. La suite lo usa como aserción principal:

- entrar y salir limpio → `is_closed is True` al salir;
- levantar una excepción arbitraria dentro del bloque → `pytest.raises(...)` **y** `is_closed is True`;
- levantar `N8nUnavailableError` dentro del bloque → misma verificación, con el tipo preservado.

Para capturar la referencia al cliente y poder inspeccionarla **después** de que el `async with` terminó, el test toma `uow._client` dentro del bloque (acceso a un privado, deliberado y confinado a un helper del test: es la única forma de observar el objeto que el UoW encapsula, y el spec exige exactamente esa observación). Alternativa considerada y descartada: monkeypatchear `httpx.AsyncClient` con un doble que registre `aclose()` — verifica la *llamada* en vez del *efecto*, y pasaría igual si la implementación llamara a `aclose()` sobre el objeto equivocado.

Para los escenarios que necesitan una entrega real (que la config explícita gana, que el mensaje no se altera, que no hay reintento) se inyecta el transporte de prueba montando el `MockTransport` sobre el cliente que el UoW ya construyó — sustituyendo `uow._client._transport` dentro del bloque, o bien construyendo el `N8nRepository` sobre un cliente de prueba en los casos donde el escenario es sobre la entrega y no sobre el ciclo de vida. Ninguna de las dos rutas hace red real.

- *Alternativa descartada*: levantar un servidor HTTP de prueba. Red real, puertos, flakiness, sin ganancia sobre `MockTransport`.
- *Alternativa descartada*: agregar `respx` a `requirements-dev.txt`. Misma política que D-9 de CHANGE-09: no se agregan dependencias para algo que `httpx` ya resuelve.

## Risks / Trade-offs

- **[Un fallo de `aclose()` enmascara la excepción original del bloque]** → Si el trabajo dentro del `async with` falla *y además* el cierre del cliente falla, la excepción que ve el llamador es la del cierre; la original queda como `__context__` en el traceback, no perdida pero sí desplazada del mensaje. Mitigación: `AsyncClient.aclose()` sobre un cliente sano no hace I/O de red y prácticamente no levanta; y la alternativa (silenciar el fallo de cierre) esconde una fuga de recursos, que es peor. Queda documentado en D-5 y en el docstring del módulo.
- **[Sin keep-alive entre escaneos]** → Cada entrega paga handshake TCP/TLS completo, sumando latencia por escaneo. Trade-off aceptado en D-7 dado el perfil de tráfico (un escaneo manual por vez). Mitigación: si CHANGE-22 mostrara que pesa, migrar a un cliente compartido en el `lifespan` es un change localizado y la interfaz de `ScanUoW` no cambia para `ScanService`.
- **[El fallback a `get_settings()` esquiva `dependency_overrides`]** → Los tests de router de CHANGE-12 no podrán cambiar la config del UoW sustituyendo la dependencia de FastAPI. Mitigación: es la consecuencia conocida de D-2; esos tests deben sustituir el `ScanService`/`ScanUoW` completo, que es de todos modos lo correcto para no hacer red real desde un test de router. Anotado en D-2 para que CHANGE-12 no lo descubra tarde.
- **[Acoplamiento del UoW a la constante de timeout del repositorio]** → Importar `REQUEST_TIMEOUT_SECONDS` desde `n8n_repository` significa que el UoW conoce un detalle del repositorio. Mitigación: la dirección `UoW → Repository` es la permitida por la regla de capas, el módulo ya se importa por `N8nRepository`, y la alternativa (duplicar el `10.0`) es peor: dos valores que divergen en silencio.
- **[Los tests tocan `uow._client`, un atributo privado]** → Un refactor que renombre ese atributo rompe la suite aunque el comportamiento observable no cambie. Mitigación: el acceso está confinado a un helper del test con un comentario que explica por qué; es la única forma de observar el efecto que el requirement exige (el canal quedó cerrado), y el falso positivo que evita —una implementación que llama `aclose()` sobre el objeto equivocado— justifica el acoplamiento.
- **[`ScanUoW` sin consumidor hasta CHANGE-11]** → Entre este change y el siguiente, el UoW es código de producción que ningún camino de producción ejecuta. Mitigación: es el mismo estado en que quedó `N8nRepository` tras CHANGE-09; la suite unitaria lo cubre por completo y CHANGE-11 es el gate inmediato siguiente en el roadmap.
- **[Re-entrar el mismo `ScanUoW` anidadamente filtraría el primer cliente]** → `async with uow: async with uow: ...` sobre la *misma instancia* sobrescribiría `_client` y perdería la referencia al primero. No se agrega guarda contra esto: `ScanService` construye una instancia nueva por operación, la re-entrada anidada de un UoW no tiene ningún caso de uso legítimo, y una guarda adicional agregaría estado y superficie para un escenario que nadie va a escribir. Documentado en el docstring del módulo como uso no soportado.

## Open Questions

- **¿Conviene un cliente compartido en el `lifespan` de la app?** Deferible sin costo: la decisión depende de evidencia de carga que hoy no existe, y migrar no cambia el contrato que ve `ScanService` (`async with ScanUoW() as uow: uow.n8n`) — sólo cambia quién construye el cliente. Se revisita si el smoke test de CHANGE-22 o el uso real muestran que el handshake por escaneo pesa.
- **¿`AuthUoW` seguirá esta misma forma, o necesitará `commit`/`rollback` explícitos en `__aexit__`?** No bloquea nada acá (D-8 deja deliberadamente sin extraer la base). Se decide en CHANGE-02/CHANGE-04, con el caso real de SQLAlchemy a la vista.
