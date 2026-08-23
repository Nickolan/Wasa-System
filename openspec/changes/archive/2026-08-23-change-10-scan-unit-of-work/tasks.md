# Tasks — change-10-scan-unit-of-work

> Strict TDD activo. Cada grupo 2..8 es un ciclo completo **RED → GREEN → TRIANGULATE → REFACTOR**:
> el test se escribe y se ejecuta *antes* que el código de producción que lo satisface.
> Referencias: `specs/scan-resource-lifecycle/spec.md` (qué), `design.md` D-1..D-10 (cómo).
> Se tocan tres archivos de código y ninguno más del repo:
> `fastapi_bridge/uow/scan_unit_of_work.py`,
> `fastapi_bridge/tests/test_scan_unit_of_work.py` (nuevo) y tres líneas de tabla en
> `fastapi_bridge/tests/test_layer_boundaries.py`.
> **Corrección post-auditoría (re-verificación CHANGE-10)**: además se agregó una
> línea a `pytest.ini` (`asyncio_default_fixture_loop_scope = function`). Sin ella,
> `pytest -W error` sobre la suite completa con `test_scan_unit_of_work.py` incluido
> imprime `PytestDeprecationWarning: The configuration option
> "asyncio_default_fixture_loop_scope" is unset` (emitido por `pytest_asyncio/plugin.py`
> durante el bootstrap, antes de que el filtro de warnings de la línea de comandos
> aplique — por eso no hacía fallar el test run, pero sí violaba el requisito de cero
> warnings). Confirmado por diferencia: sin el archivo nuevo de este change, el warning
> no aparece; con él y sin la línea en `pytest.ini`, aparece; con la línea, desaparece.
> No es exclusivo de `ScanUoW` — es config global de pytest-asyncio — por eso vive en
> `pytest.ini` y no en el módulo. Era un archivo genuinamente no declarado en el
> encabezado original; queda documentado acá en vez de revertido, porque revertirlo
> reintroduce el warning.
> **Ningún test hace red real** y **ningún test assertea valores reales de
> `N8N_WEBHOOK_URL` / `N8N_WEBHOOK_TOKEN`**: se construyen instancias de `Settings` con valores
> de prueba, siguiendo la política de `test_env_contract.py` y `test_n8n_repository.py`.
> **`repositories/n8n_repository.py` NO se modifica**: CHANGE-09 está archivado y su contrato
> —`N8nRepository(client, settings)`, `REQUEST_TIMEOUT_SECONDS = 10.0`— se consume tal cual.

## 1. Safety net y preparación

- [x] 1.1 Ejecutar `pytest` completo y anotar el baseline (`N passed`); si algo ya falla, reportarlo como fallo preexistente y NO arreglarlo en este change
- [x] 1.2 Confirmar que `fastapi_bridge/uow/scan_unit_of_work.py` es sólo el docstring placeholder y que ningún módulo lo importa — buscar `scan_unit_of_work` y `ScanUoW` en `fastapi_bridge/` (excluyendo `.venv`) y verificar que no hay importadores en código de producción
- [x] 1.3 Releer `fastapi_bridge/repositories/n8n_repository.py` y confirmar de primera mano la firma `N8nRepository(client: httpx.AsyncClient, settings: Settings)` y los nombres exactos de las constantes públicas `WEBHOOK_TOKEN_HEADER` y `REQUEST_TIMEOUT_SECONDS` (D-4 depende de importar esta última por su nombre real)
- [x] 1.4 Confirmar en la versión instalada que `httpx.AsyncClient` expone `is_closed`, `aclose()` y el atributo `timeout` inspeccionable (`python -c "import httpx; c=httpx.AsyncClient(timeout=10.0); print(c.is_closed, c.timeout)"`), que son los tres observables sobre los que se apoya toda la suite (D-10)
- [x] 1.5 Crear `fastapi_bridge/tests/test_scan_unit_of_work.py` con el docstring de módulo en español al estilo de `test_n8n_repository.py`, más un helper `build_settings(...)` que devuelva una `Settings` con URL y token de prueba (nunca los reales); verificar que `pytest fastapi_bridge/tests/test_scan_unit_of_work.py` recolecta el archivo sin errores de import

## 2. `ScanUoW` — construcción y resolución de `Settings` (D-2)

- [x] 2.1 RED: escribir el test que importa `ScanUoW` desde `fastapi_bridge.uow.scan_unit_of_work` y lo construye con una `Settings` de prueba inyectada, afirmando que la instancia se crea sin error; ejecutar y verificar que falla porque la clase no existe
- [x] 2.2 GREEN: reemplazar el placeholder de `scan_unit_of_work.py` por el docstring de módulo actualizado (referencia a CHANGE-10 y no a CHANGE-12; patrón Unit of Work; nota de que la re-entrada anidada de la misma instancia no está soportada, ver Risks) y `class ScanUoW` con `__init__(self, settings: Settings | None = None) -> None` que resuelva `settings if settings is not None else get_settings()` y deje `_client`/`_n8n` en `None`, con type hints completos; ejecutar y verificar que el test de 2.1 pasa
- [x] 2.3 TRIANGULATE: agregar el test que construye `ScanUoW()` **sin argumentos** y afirma que se crea sin error, cubriendo el escenario "el ámbito se abre sin necesidad de argumentos"; ejecutar y verificar que pasa
- [x] 2.4 TRIANGULATE: agregar el test que afirma que la `Settings` inyectada **gana** — construir `ScanUoW(settings=build_settings(url=...))` y verificar, tras entrar al contexto, que el repositorio expuesto quedó apoyado sobre esa configuración y no sobre la vigente del sistema (se completa junto con el grupo 3, cuando `__aenter__` exista); dejar el test escrito ahora en estado RED si hace falta
- [x] 2.5 Confirmar por revisión del archivo que no hay ninguna lectura de `os.environ`/`os.getenv`, ninguna URL ni token literal, y que `get_settings` se importa desde `fastapi_bridge.core.settings` (requirement de configuración del entorno)

## 3. `__aenter__` — apertura del ámbito (D-1, D-3, D-4)

- [x] 3.1 RED: escribir el test que hace `async with ScanUoW(settings=build_settings()) as uow:` y afirma que el objeto cedido es la propia instancia (`uow is the_uow`); ejecutar y verificar que falla porque `__aenter__` no existe
- [x] 3.2 GREEN: implementar `async def __aenter__(self) -> ScanUoW` que construya `httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS)`, guarde el cliente en `self._client`, construya `N8nRepository(self._client, self._settings)` en `self._n8n` y devuelva `self`; agregar `from __future__ import annotations` para poder anotar el retorno con la propia clase; ejecutar y verificar que el test de 3.1 pasa
- [x] 3.3 TRIANGULATE: agregar el test que afirma que **dentro** del bloque el canal está abierto — capturar `uow._client` en un helper con comentario que explique el acceso deliberado al privado (D-10) y afirmar `is_closed is False`; ejecutar y verificar que pasa
- [x] 3.4 TRIANGULATE: agregar el test del timeout por defecto del cliente — afirmar que `uow._client.timeout` refleja el valor de `REQUEST_TIMEOUT_SECONDS` importado de `n8n_repository`, comparando contra la **constante importada** y nunca contra un literal `10.0` escrito en el test (escenario "sin literales duplicados que puedan divergir", D-4); ejecutar y verificar que pasa
- [x] 3.5 TRIANGULATE: completar el test de 2.4 — dentro del contexto, montar un `httpx.MockTransport` sobre el cliente del UoW, ejecutar una entrega a través de `uow.n8n.forward_scan(payload)` y afirmar que la request salió hacia la URL de la `Settings` inyectada; ejecutar y verificar que pasa
- [x] 3.6 Confirmar por revisión que `__aenter__` no hace `await` de I/O y no necesita `try/except` de limpieza parcial (D-3), y que el import del repositorio es `from fastapi_bridge.repositories.n8n_repository import N8nRepository, REQUEST_TIMEOUT_SECONDS`

## 4. `n8n` — punto de acceso al mecanismo de entrega (D-6)

- [x] 4.1 RED: escribir el test que, dentro del contexto, afirma que `uow.n8n` es una instancia de `N8nRepository`; ejecutar y verificar que falla porque la propiedad no existe
- [x] 4.2 GREEN: implementar la `@property n8n(self) -> N8nRepository` que devuelva `self._n8n` cuando no es `None`; ejecutar y verificar que el test de 4.1 pasa
- [x] 4.3 TRIANGULATE: agregar el test de estabilidad — dos accesos a `uow.n8n` dentro del mismo contexto devuelven **el mismo objeto** (`is`); ejecutar y verificar que pasa
- [x] 4.4 RED: agregar el test que accede a `uow.n8n` **antes** de entrar al contexto, afirmando `pytest.raises(RuntimeError)`; ejecutar y verificar que falla (hoy devuelve `None` en vez de levantar)
- [x] 4.5 GREEN: agregar la guarda `if self._n8n is None: raise RuntimeError(...)` con un mensaje que nombre el uso correcto (`async with ScanUoW() as uow:`) y no incluya ninguna configuración ni secreto; ejecutar y verificar que el test de 4.4 pasa
- [x] 4.6 TRIANGULATE: agregar el test que accede a `uow.n8n` **después** de que el contexto terminó, afirmando el mismo `RuntimeError` (depende del grupo 5, que limpia el estado en `__aexit__`; dejarlo RED hasta entonces si hace falta); ejecutar y verificar
- [x] 4.7 Confirmar por revisión que la guarda usa `raise RuntimeError`, **no** `assert` (se evapora con `python -O`) y **no** una excepción de dominio de `exceptions/errors.py` (D-6: es un bug de programación, no una condición de negocio)

## 5. `__aexit__` — cierre garantizado y no supresión (D-5)

- [x] 5.1 RED: escribir el test de salida normal — entrar y salir del contexto sin error, capturando la referencia al cliente dentro del bloque, y afirmar `client.is_closed is True` después; ejecutar y verificar que falla porque `__aexit__` no existe
- [x] 5.2 GREEN: implementar `async def __aexit__(self, exc_type: type[BaseException] | None, exc: BaseException | None, tb: TracebackType | None) -> None` que capture el cliente en una local, ponga `self._client` y `self._n8n` en `None` **antes** del `await`, y luego haga `await client.aclose()` si el cliente no es `None`; importar `TracebackType` desde `types`; ejecutar y verificar que el test de 5.1 pasa
- [x] 5.3 TRIANGULATE: agregar el test de salida por excepción arbitraria — levantar un `ValueError` dentro del bloque, envolver en `pytest.raises(ValueError)` y afirmar que el cliente capturado quedó `is_closed is True`; ejecutar y verificar que pasa (cubre "salida por error también cierra el canal" + "el ámbito no suprime los errores")
- [x] 5.4 TRIANGULATE: agregar el test de salida por `N8nUnavailableError` — con un `MockTransport` que responda 500, llamar `uow.n8n.forward_scan(payload)` dentro del bloque, afirmar `pytest.raises(N8nUnavailableError)` en el llamador **y** que el cliente quedó cerrado, verificando que la condición atraviesa el ámbito con su **tipo original** intacto; ejecutar y verificar que pasa
- [x] 5.5 TRIANGULATE: agregar el test de cierre sin haber entregado nada — entrar y salir sin llamar a `forward_scan`, afirmando que el cliente quedó cerrado; ejecutar y verificar que pasa
- [x] 5.6 TRIANGULATE: agregar el test que afirma que el cierre ocurre **antes** de que el llamador observe la falla — dentro del `except` del `pytest.raises`, el cliente capturado ya está `is_closed is True`; ejecutar y verificar que pasa
- [x] 5.7 Confirmar por revisión que `__aexit__` está anotado `-> None` (nunca `-> bool`), que no hay `return True` en ninguna rama y que no hay `except` alrededor de `aclose()` (D-5); dejar en el docstring del módulo la nota de que un fallo de `aclose()` reemplaza a la excepción del bloque conservándola como `__context__`

## 6. Aislamiento entre ámbitos y no participación en la entrega (D-7)

- [x] 6.1 RED/GREEN: escribir el test que abre dos `ScanUoW` distintos y afirma que sus clientes son objetos **distintos** (`is not`); ejecutar y verificar
- [x] 6.2 TRIANGULATE: agregar el test de no interferencia — dos ámbitos abiertos anidadamente sobre **instancias distintas**; al cerrar el interior, afirmar que el cliente del exterior sigue `is_closed is False`; ejecutar y verificar que pasa
- [x] 6.3 TRIANGULATE: agregar el test de recuperación — un ámbito que termina por excepción, y a continuación un ámbito nuevo que se abre correctamente con un cliente propio y abierto; ejecutar y verificar que pasa
- [x] 6.4 RED/GREEN: escribir el test de "el ámbito no altera el mensaje" — con `MockTransport` capturando la request, afirmar que el cuerpo JSON entregado tiene exactamente los cinco campos del `N8nPayload` que el llamador construyó, sin agregados ni renombres del UoW; ejecutar y verificar
- [x] 6.5 TRIANGULATE: agregar el test de "sin reintento del ámbito" — handler que cuenta invocaciones y responde 500; tras la `N8nUnavailableError` que atraviesa el ámbito, afirmar que el contador es exactamente `1` (el UoW no reintenta al cerrar); ejecutar y verificar que pasa
- [x] 6.6 Confirmar por revisión que `scan_unit_of_work.py` no contiene ninguna referencia a `N8nPayload`, `uuid`, `forward_scan` ni lógica de veredicto: el UoW gobierna recursos y nada más (requirement de no participación)

## 7. Pureza de capa verificada (D-9)

- [x] 7.1 RED: agregar `("uow", "fastapi")`, `("uow", "starlette")` y `("uow", "slowapi")` a la tabla `LAYER_IMPORT_RULES` de `fastapi_bridge/tests/test_layer_boundaries.py`; ejecutar `pytest fastapi_bridge/tests/test_layer_boundaries.py` y verificar que los tres casos nuevos pasan sobre el código ya escrito (si fallaran, es que la implementación arrastró framework y hay que sacarlo)
- [x] 7.2 Verificar que los siete casos preexistentes de la tabla siguen en verde —en particular `("services", "httpx")`, que es la regla que este change vuelve cumplible— y que `test_helper_detects_a_forbidden_import` sigue pasando
- [x] 7.3 Agregar en `test_scan_unit_of_work.py` un test que abra un ámbito, ejercite una entrega con `MockTransport` y lo cierre **sin** instanciar en ningún momento la app FastAPI ni importar `fastapi_bridge.main`, dejando explícito en el nombre del test que el ámbito funciona sin la aplicación web levantada
- [x] 7.4 Agregar el test que afirma que abrir, usar y cerrar un ámbito **no** abre ninguna conexión a la base de datos compartida — verificar por AST/revisión que el módulo no importa `sqlalchemy`, `asyncpg` ni `fastapi_bridge.db`, siguiendo el criterio de `test_no_shared_db_impact.py`; ejecutar y verificar que pasa

## 8. REFACTOR y cierre

- [x] 8.1 REFACTOR: revisar `scan_unit_of_work.py` — sin literales duplicados (el timeout llega importado, D-4), type hints en toda función sin excepción, docstrings en español al estilo de la casa, atributos privados con nombres consistentes (`_settings`, `_client`, `_n8n`); ejecutar la suite completa después de cada paso de refactor y verificar que sigue verde
- [x] 8.2 REFACTOR: revisar `test_scan_unit_of_work.py` — helper único para capturar el cliente del UoW (un solo punto de acceso al privado, con su comentario justificativo), helper único de `MockTransport`, nombres de test que describan el comportamiento y no la implementación, parametrización donde haya repetición; ejecutar y verificar que sigue verde
- [x] 8.3 Verificar que `fastapi_bridge/tests/test_structure.py` sigue verde: `uow/scan_unit_of_work.py` continúa existiendo y conserva su docstring de módulo
- [x] 8.4 Ejecutar `pytest` completo y verificar que el total es el baseline de 1.1 más los tests nuevos, sin ninguna regresión
- [x] 8.5 Verificar que ningún archivo fuera de los tres declarados en el encabezado (más `pytest.ini`, ver nota post-auditoría arriba) fue modificado (`git status` / `git diff --stat`), en particular que `repositories/n8n_repository.py`, `exceptions/`, `core/settings.py`, `main.py`, `services/`, `api/`, `uow/auth_unit_of_work.py` y `.env*` siguen intactos. **Corrección**: la primera pasada de este change marcó esta tarea `[x]` sin haber detectado que `pytest.ini` también quedó modificado (una línea, necesaria para cero warnings — ver nota arriba); quedó corregido en la re-verificación
- [x] 8.6 Marcar los cuatro criterios de aceptación de CHANGE-10 en `CHANGES.md` con el nombre del test que los cubre, siguiendo el formato que dejaron CHANGE-08 y CHANGE-09, y actualizar el `Scope` de CHANGE-10 con la firma real `ScanUoW(settings: Settings | None = None)` (D-2, extensión deliberada respecto de la firma sin argumentos que lista el roadmap)
- [x] 8.7 Dejar anotado en el reporte de cierre, para CHANGE-11, que `ScanService` debe usar `async with ScanUoW() as uow:` sin argumentos y consumir `uow.n8n`; y para CHANGE-12, que `app.dependency_overrides[get_settings]` **no** alcanza al UoW (D-2), por lo que sus tests de router deben sustituir el `ScanService`/`ScanUoW` completo en lugar de la configuración
