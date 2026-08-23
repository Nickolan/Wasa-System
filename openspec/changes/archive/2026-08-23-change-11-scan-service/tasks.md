# Tasks — change-11-scan-service

> Strict TDD activo. Cada grupo 3..8 es un ciclo completo **RED → GREEN → TRIANGULATE → REFACTOR**:
> el test se escribe y se ejecuta *antes* que el código de producción que lo satisface.
> Referencias: `specs/scan-initiation/spec.md` (qué), `design.md` D-1..D-10 (cómo).
> **Se tocan exactamente dos archivos de producción/test propios de este change**:
> `fastapi_bridge/services/scan_service.py` (reescritura del placeholder) y
> `fastapi_bridge/tests/test_scan_service.py` (nuevo).
> `schemas/scan_schemas.py`, `uow/scan_unit_of_work.py`, `repositories/n8n_repository.py`,
> `exceptions/`, `core/`, `api/`, `main.py`, `test_layer_boundaries.py` y `pytest.ini`
> **NO se modifican**: CHANGE-08/09/10 están archivados y sus contratos se consumen tal cual (D-10).
> **Excepción puntual, aprobada por el usuario (ver 9.4)**: `fastapi_bridge/tests/test_no_shared_db_impact.py`
> (CHANGE-00a) se corrigió con un patrón de límite de palabra porque el nombre de clase
> `ScanService`, mandado por D-1/D-2 de este change, disparaba un falso positivo en su
> checker de subcadena; es la única tercera modificación de código/test fuera de las dos
> declaradas arriba.
> **Ningún test hace red real**, ninguno instancia un `httpx.AsyncClient` y ninguno assertea
> valores reales de `N8N_WEBHOOK_URL` / `N8N_WEBHOOK_TOKEN`: el ámbito de recursos se sustituye
> por un doble escrito a mano (D-9), así que la configuración nunca entra en juego.
> Las dos Open Questions de `design.md` son deferibles y **no** condicionan estas tasks.

## 1. Safety net y preparación

- [x] 1.1 Ejecutar `pytest` completo y anotar el baseline (`N passed`); si algo ya falla, reportarlo como fallo preexistente y NO arreglarlo en este change
- [x] 1.2 Confirmar que `fastapi_bridge/services/scan_service.py` es sólo el docstring placeholder y que ningún módulo de producción lo importa — buscar `scan_service` y `ScanService` en `fastapi_bridge/` (excluyendo `.venv`) y verificar que los únicos hits fuera de tests son docstrings
- [x] 1.3 Releer `fastapi_bridge/schemas/scan_schemas.py` y confirmar de primera mano los nombres y tipos exactos de los campos de `ScanRequest`, `ScanResponse` y `N8nPayload` (D-8 depende de escribirlos uno por uno sin equivocarse)
- [x] 1.4 Releer `fastapi_bridge/uow/scan_unit_of_work.py` y `fastapi_bridge/repositories/n8n_repository.py` y confirmar el contrato que este change consume: `ScanUoW(settings=None)` como async context manager con propiedad `n8n`, y `async forward_scan(payload) -> bool` que levanta `N8nUnavailableError`
- [x] 1.5 Verificar en el entorno que `ScanUoW()` se construye sin `.env` y sin red (`python -c "from fastapi_bridge.uow.scan_unit_of_work import ScanUoW; ScanUoW()"`), premisa de la que depende el test de conformidad de 8.1 (D-9)
- [x] 1.6 Crear `fastapi_bridge/tests/test_scan_service.py` con docstring de módulo en español al estilo de `test_scan_unit_of_work.py`, más un helper `build_request(**overrides) -> ScanRequest` que devuelva una `ScanRequest` válida; verificar que `pytest fastapi_bridge/tests/test_scan_service.py` recolecta el archivo sin errores de import

## 2. Doble de prueba del ámbito de recursos (D-9)

- [x] 2.1 Escribir en el archivo de tests `FakeN8nRepository`: acumula en una lista pública los `N8nPayload` recibidos por `forward_scan`, devuelve `True` por defecto y admite configurarse para levantar `N8nUnavailableError`; verificar con un test directo del propio doble que registra el payload y que levanta cuando se lo configura así
- [x] 2.2 Escribir `FakeScanUoW`: async context manager que expone `.n8n` (un `FakeN8nRepository`), lleva contadores públicos de entradas y salidas, marca `closed = True` en `__aexit__` y está anotado `-> None` para **no** suprimir excepciones; verificar con un test directo que al salir por excepción la excepción se propaga y `closed` quedó en `True`
- [x] 2.3 Escribir la fábrica de prueba (`FakeUoWFactory`) que, invocada sin argumentos, devuelve una `FakeScanUoW` **nueva** cada vez y guarda todas las creadas en una lista; verificar con un test que dos invocaciones devuelven objetos distintos (es la premisa de los tests de "un ámbito por operación" del grupo 6)

## 3. `ScanService` — construcción e inyección de la fábrica (D-1, D-2)

- [x] 3.1 RED: escribir el test que importa `ScanService` desde `fastapi_bridge.services.scan_service` y lo construye **sin argumentos**, afirmando que la instancia se crea sin error; ejecutar y verificar que falla porque la clase no existe
- [x] 3.2 GREEN: reemplazar el placeholder de `scan_service.py` por el docstring de módulo actualizado (referencia a CHANGE-11 y no a CHANGE-12; responsabilidad de iniciación; nota de que la propagación de `N8nUnavailableError` es deliberada y que no se agrega logging por el `phpsessid`) más `class ScanService` con `__init__(self, uow_factory: Callable[[], ScanUoW] = ScanUoW) -> None`, `Callable` importado de `collections.abc`; ejecutar y verificar que el test de 3.1 pasa
- [x] 3.3 TRIANGULATE: agregar el test que afirma que la fábrica por defecto **es** `ScanUoW`, de modo que el call site de producción sea literalmente `async with ScanUoW() as uow:` (D-2); ejecutar y verificar que pasa
- [x] 3.4 TRIANGULATE: agregar el test que construye `ScanService(uow_factory=FakeUoWFactory())` y afirma que la fábrica inyectada **gana** sobre el default — se completa junto con el grupo 4, cuando `start_scan` exista; dejarlo escrito ahora en RED si hace falta
- [x] 3.5 Confirmar por revisión que `__init__` no guarda nada más que la fábrica (D-7: sin estado por operación) y que el módulo no importa `httpx`, `sqlalchemy`, `fastapi`, `starlette`, `slowapi` ni `fastapi_bridge.core.settings`

## 4. `start_scan` — camino feliz mínimo (D-1, D-5)

- [x] 4.1 RED: escribir el test que hace `await ScanService(uow_factory=FakeUoWFactory()).start_scan(build_request())` y afirma que devuelve una `ScanResponse`; ejecutar y verificar que falla porque el método no existe
- [x] 4.2 GREEN: implementar `async def start_scan(self, request: ScanRequest) -> ScanResponse` con el cuerpo mínimo — generar `scan_id`, componer el `N8nPayload`, `async with self._uow_factory() as uow: await uow.n8n.forward_scan(payload)`, devolver la `ScanResponse` — con type hints completos y sin ningún `try`/`except`; ejecutar y verificar que el test de 4.1 pasa
- [x] 4.3 TRIANGULATE: completar el test de 3.4 — afirmar que la fábrica inyectada fue invocada exactamente una vez y que el payload llegó al `FakeN8nRepository` de la `FakeScanUoW` que ella creó, probando que no se usó el default; ejecutar y verificar que pasa
- [x] 4.4 Confirmar por revisión que `forward_scan` se llama sin capturar su valor de retorno y que no existe ninguna rama `if not ok:` (D-5), y que el orden es generar → componer → abrir ámbito (D-8: nada que pueda fallar por validación ocurre con el canal abierto)

## 5. Identificador del escaneo (D-3)

- [x] 5.1 RED/GREEN: escribir el test que afirma que `response.scan_id` se interpreta como un UUID y que `uuid.UUID(response.scan_id).version == 4`; ejecutar y verificar (si el GREEN de 4.2 ya generó `str(uuid.uuid4())`, dejar constancia de que este test lo confirma en vez de forzarlo)
- [x] 5.2 TRIANGULATE: agregar el test de unicidad — dos `start_scan` con **la misma** `ScanRequest` y sobre **la misma** instancia de `ScanService` producen identificadores distintos; ejecutar y verificar que pasa (cubre además D-7, sin estado entre operaciones)
- [x] 5.3 TRIANGULATE: agregar el test que afirma que el identificador **no deriva de la entrada** — ninguno de los valores de la solicitud (URL objetivo, sesión, nivel, riesgo) aparece contenido en el identificador generado; ejecutar y verificar que pasa
- [x] 5.4 TRIANGULATE: agregar el test de "ningún campo de la solicitud puede fijar el identificador" — construir la `ScanRequest` a partir de un dict que incluya una clave desconocida del estilo `scan_id`, y afirmar que el identificador devuelto es un UUID v4 generado y no ese valor (se apoya en `extra="ignore"` de CHANGE-08); ejecutar y verificar que pasa
- [x] 5.5 Confirmar por revisión que se usa `uuid.uuid4()` y **no** `uuid.uuid1()` ni un contador (D-3), que la conversión a texto se hace una sola vez en el punto de generación, y que no se agregó ningún parámetro `id_factory` al constructor

## 6. Composición del mensaje y una sola entrega por solicitud (D-8)

- [x] 6.1 RED/GREEN: escribir el test que afirma el mapeo campo a campo — el payload capturado por el doble lleva `target_url`, `phpsessid`, `sqlmap_level` y `sqlmap_risk` con exactamente los valores de la solicitud validada; ejecutar y verificar
- [x] 6.2 TRIANGULATE: agregar el test de la URL como texto — afirmar `isinstance(payload.target_url, str)` y que su valor es `str(request.target_url)`, **nunca** el literal de entrada (Pydantic normaliza el host desnudo agregando barra final, D-8); ejecutar y verificar que pasa
- [x] 6.3 TRIANGULATE: agregar el test de defaults y normalizaciones — solicitud que omite nivel y riesgo y que trae la sesión con espacios en los extremos; afirmar que el payload lleva `1`/`1` y la sesión ya sin espacios; ejecutar y verificar que pasa
- [x] 6.4 TRIANGULATE: agregar el test que afirma que el payload lleva **exactamente** los cinco campos del contrato al serializarse, incluso cuando la solicitud incluyó campos desconocidos; ejecutar y verificar que pasa
- [x] 6.5 TRIANGULATE: agregar el test de "exactamente una entrega" — tras un `start_scan` exitoso, el `FakeN8nRepository` registró exactamente un payload y la fábrica creó exactamente un ámbito; ejecutar y verificar que pasa
- [x] 6.6 TRIANGULATE: agregar el test de "un ámbito propio por operación" — dos `start_scan` sucesivos sobre la misma instancia de `ScanService` crean dos ámbitos distintos (`is not`), y ninguno se reutiliza; ejecutar y verificar que pasa
- [x] 6.7 Confirmar por revisión que el mapeo está escrito campo a campo y que **no** se usa `**request.model_dump()` en ninguna forma (D-8)

## 7. Confirmación devuelta y propagación del error (D-4, D-6)

- [x] 7.1 RED/GREEN: escribir el test que afirma que `response.scan_id` es **idéntico** al `scan_id` del payload realmente capturado por el doble — el test más importante del change (Risks); ejecutar y verificar
- [x] 7.2 TRIANGULATE: agregar el test que afirma `response.status == "queued"` y que `response.message` es la constante `SCAN_QUEUED_MESSAGE` **importada del módulo de producción**, nunca un texto duplicado en el test (D-4); ejecutar y verificar que pasa
- [x] 7.3 GREEN: si aún no existe, agregar `SCAN_QUEUED_MESSAGE` como constante de módulo en `scan_service.py` con un texto legible en español que **no** interpole ningún campo de la solicitud ni el identificador (D-4); ejecutar y verificar que 7.2 pasa
- [x] 7.4 RED: escribir el test que configura el doble para levantar `N8nUnavailableError` y afirma, con `pytest.raises(N8nUnavailableError)`, que la condición llega al llamador con su **tipo original**; ejecutar y verificar
- [x] 7.5 TRIANGULATE: agregar el test que afirma que en ese camino **no** se devolvió ninguna confirmación (el `start_scan` no completó) y que el ámbito quedó cerrado (`closed is True` en la `FakeScanUoW` creada); ejecutar y verificar que pasa
- [x] 7.6 TRIANGULATE: agregar el test que afirma que la excepción propagada **no** viene envuelta — su tipo es exactamente `N8nUnavailableError`, no una subclase nueva ni una excepción de la capa de negocio que la contenga; ejecutar y verificar que pasa
- [x] 7.7 TRIANGULATE: agregar el test de "ninguna otra condición se enmascara" — el doble levanta un `ValueError` arbitrario dentro del ámbito y el llamador lo recibe como `ValueError`, no como `N8nUnavailableError`; ejecutar y verificar que pasa
- [x] 7.8 Confirmar por revisión que `start_scan` no contiene ningún `try`, `except` ni `finally` (D-6), y que la propagación es por ausencia de código

## 8. Pureza de capa, no filtración de credenciales y conformidad del doble

- [x] 8.1 Agregar el test de conformidad del doble (D-9): sobre la clase **real** `ScanUoW`, afirmar que se construye sin argumentos y que expone `__aenter__`, `__aexit__` y `n8n` — la costura que evita que el doble derive del contrato real; ejecutar y verificar que pasa sin red ni `.env`
- [x] 8.2 Agregar el test por AST sobre `services/scan_service.py` que afirma que no importa `httpx`, `sqlalchemy`, `asyncpg` ni `fastapi_bridge.db` (requirements de no abrir canales ni tocar la base compartida), siguiendo el criterio de `test_layer_boundaries.py` y `test_no_shared_db_impact.py`; ejecutar y verificar que pasa
- [x] 8.3 Agregar el test por AST que afirma que el módulo no importa `fastapi`, `starlette` ni `slowapi` y que no construye respuestas HTTP (requirement de independencia del framework web, verificado localmente sin ampliar `LAYER_IMPORT_RULES` — D-10); ejecutar y verificar que pasa
- [x] 8.4 Agregar el test que ejercita un `start_scan` completo **sin** instanciar la app FastAPI ni importar `fastapi_bridge.main`, con el nombre del test dejando explícito que la iniciación funciona sin la aplicación web levantada; ejecutar y verificar que pasa
- [x] 8.5 Agregar el test que afirma que el módulo no contiene URL ni credencial de orquestador literal, no lee `os.environ`/`os.getenv` y no importa `fastapi_bridge.core.settings` (requirement "no conoce el destino ni la credencial"); ejecutar y verificar que pasa
- [x] 8.6 Agregar los tests de no filtración de credenciales: la confirmación devuelta no contiene el `phpsessid` en ninguno de sus tres campos; el texto de la condición de error propagada tampoco lo contiene; y por AST/revisión, el módulo no importa `logging` ni emite registros con campos de la solicitud; ejecutar y verificar que pasan
- [x] 8.7 Agregar el test que afirma que el módulo **no revalida** — no contiene comprobaciones propias de esquema de URL, presencia de sesión ni rangos de nivel/riesgo (requirement "no revalida ni relaja el contrato de entrada"); ejecutar y verificar que pasa
- [x] 8.8 Verificar que los diez casos preexistentes de `LAYER_IMPORT_RULES` siguen en verde, en particular `("services", "httpx")` y `("services", "sqlalchemy")`, que pasan de vacuos a proteger código real, **sin modificar `test_layer_boundaries.py`** (D-10)

## 9. REFACTOR y cierre

- [x] 9.1 REFACTOR: revisar `scan_service.py` — sin literales duplicados, type hints en toda función sin excepción, docstrings en español al estilo de la casa, un único atributo privado (`_uow_factory`), imports ordenados; ejecutar la suite completa después de cada paso de refactor y verificar que sigue verde
- [x] 9.2 REFACTOR: revisar `test_scan_service.py` — un solo helper de construcción de `ScanRequest`, dobles definidos una sola vez, nombres de test que describan comportamiento y no implementación, parametrización donde haya repetición, y ninguna aserción contra el texto de `SCAN_QUEUED_MESSAGE` duplicado; ejecutar y verificar que sigue verde
- [x] 9.3 Verificar que `fastapi_bridge/tests/test_structure.py` sigue verde: `services/scan_service.py` continúa existiendo y conserva su docstring de módulo
- [x] 9.4 Ejecutar `pytest` completo con warnings como error y verificar que el total es el baseline de 1.1 más los tests nuevos, sin ninguna regresión y sin warnings nuevos
  - **Resuelto**: el primer corrido reportó `247 passed, 1 failed` por un falso positivo preexistente en `fastapi_bridge/tests/test_no_shared_db_impact.py::test_no_reference_to_existing_shared_tables` (CHANGE-00a) — buscaba la subcadena literal `"scans"` en minúsculas, y `class ScanService:` en minúsculas (`class scanservice:`) la contiene sin ser una referencia real a la tabla. Con aprobación puntual del usuario se endureció el checker a `\bscans\b` / `\bvulnerabilities\b` (word boundary) en ese archivo — excepción a la regla de dos archivos de este change. Resultado final: `248 passed, 0 failed` (215 baseline + 33 tests nuevos de este change), sin warnings nuevos.
- [x] 9.5 Verificar con `git status` / `git diff --stat` que ningún archivo fuera de los dos declarados en el encabezado fue modificado — en particular `schemas/`, `uow/`, `repositories/`, `exceptions/`, `core/`, `api/`, `main.py`, `test_layer_boundaries.py`, `pytest.ini` y `.env*` siguen intactos
- [x] 9.6 Marcar los cuatro criterios de aceptación de CHANGE-11 en `CHANGES.md` con el nombre del test que los cubre, siguiendo el formato que dejaron CHANGE-08, CHANGE-09 y CHANGE-10, y actualizar el `Scope` de CHANGE-11 con la firma real `ScanService(uow_factory: Callable[[], ScanUoW] = ScanUoW)` (D-2, extensión deliberada respecto del constructor sin argumentos que lista el roadmap)
- [x] 9.7 Dejar anotado en el reporte de cierre, para CHANGE-12: que el Router debe llamar `await ScanService().start_scan(request)` sin construir nada de infraestructura; que `N8nUnavailableError` llega sin envolver y es el **único** caso a mapear a 502 RFC 7807; que la respuesta 202 se arma con la `ScanResponse` devuelta tal cual; y que sus tests de router deben sustituir el `ScanService` completo (vía `dependency_overrides` del Router) porque `app.dependency_overrides[get_settings]` no alcanza al UoW (nota heredada de CHANGE-10, D-2)
