# Tasks — change-09-n8n-repository

> Strict TDD activo. Cada grupo 3..9 es un ciclo completo **RED → GREEN → TRIANGULATE → REFACTOR**:
> el test se escribe y se ejecuta *antes* que el código de producción que lo satisface.
> Referencias: `specs/scan-forwarding/spec.md` (qué), `design.md` D-1..D-11 (cómo).
> Se tocan cuatro archivos y ninguno más del repo:
> `fastapi_bridge/exceptions/errors.py` (nuevo), `fastapi_bridge/repositories/n8n_repository.py`,
> `fastapi_bridge/tests/test_n8n_repository.py` (nuevo) y una línea de tabla en
> `fastapi_bridge/tests/test_layer_boundaries.py`.
> **Ningún test hace red real** y **ningún test assertea valores reales de
> `N8N_WEBHOOK_URL` / `N8N_WEBHOOK_TOKEN`**: se construyen instancias de `Settings` con valores
> de prueba, siguiendo la política de `test_env_contract.py`.

## 1. Safety net y preparación

- [x] 1.1 Ejecutar `pytest` completo y anotar el baseline (`N passed`); si algo ya falla, reportarlo como fallo preexistente y NO arreglarlo en este change
- [x] 1.2 Confirmar que `fastapi_bridge/repositories/n8n_repository.py` es sólo el docstring placeholder y que ningún módulo lo importa — buscar `n8n_repository` y `N8nRepository` en `fastapi_bridge/` (excluyendo `.venv`) y verificar que no hay importadores
- [x] 1.3 Confirmar que `httpx.MockTransport` está disponible en la versión instalada (`python -c "import httpx; print(httpx.__version__, httpx.MockTransport)"`) y que no hace falta agregar ninguna dependencia (D-9)
- [x] 1.4 Crear `fastapi_bridge/tests/test_n8n_repository.py` con el docstring de módulo en español al estilo de `test_settings.py`, más un helper `build_settings(...)` que devuelva una `Settings` con URL y token de prueba (nunca los reales) y un helper `build_client(handler)` que arme un `httpx.AsyncClient(transport=httpx.MockTransport(handler))`; verificar que `pytest fastapi_bridge/tests/test_n8n_repository.py` recolecta el archivo sin errores de import

## 2. `N8nUnavailableError` — excepción de dominio (D-2)

- [x] 2.1 RED: escribir el test que importa `N8nUnavailableError` desde `fastapi_bridge.exceptions.errors` y afirma que es una subclase de `Exception` y que puede levantarse y capturarse con un mensaje; ejecutar y verificar que falla con `ModuleNotFoundError`
- [x] 2.2 GREEN: crear `fastapi_bridge/exceptions/errors.py` con el docstring de módulo (en español, explicando que es Python puro sin imports de framework para que la capa Repository pueda levantar sus excepciones sin violar la regla de pureza) y `class N8nUnavailableError(Exception)`; ejecutar y verificar que el test de 2.1 pasa
- [x] 2.3 TRIANGULATE: agregar un test que verifique por AST —reutilizando `get_imported_top_level_modules` de `test_layer_boundaries.py` o replicando la lectura del archivo— que `exceptions/errors.py` no importa **ningún** módulo de terceros ni de framework (`fastapi`, `starlette`, `slowapi`, `httpx`, `pydantic`); ejecutar y verificar que pasa
- [x] 2.4 Confirmar por revisión que `N8nUnavailableError` NO hereda de `HTTPException` ni de ninguna clase de framework, y que `exceptions/handlers.py` sigue sin modificarse (el mapeo a 502 es de CHANGE-12)

## 3. `N8nRepository` — construcción e inyección (D-1)

- [x] 3.1 RED: escribir el test que importa `N8nRepository` desde `fastapi_bridge.repositories.n8n_repository`, lo construye con un `httpx.AsyncClient` de prueba y una `Settings` de prueba, y afirma que la instancia se crea sin error; ejecutar y verificar que falla porque la clase no existe
- [x] 3.2 GREEN: reemplazar el placeholder de `n8n_repository.py` por el docstring de módulo actualizado (referencia a CHANGE-09, no CHANGE-12; regla de pureza de capa; nota de que el token nunca se loguea) y `class N8nRepository` con `__init__(self, client: httpx.AsyncClient, settings: Settings) -> None` que guarde ambos en atributos privados, con type hints completos; ejecutar y verificar que el test de 3.1 pasa
- [x] 3.3 TRIANGULATE: agregar un test que afirme que el repositorio **no** abre ni cierra el cliente — construir el repositorio, no llamar a nada, y verificar que `client.is_closed` sigue siendo `False`; ejecutar y verificar que pasa
- [x] 3.4 Confirmar por revisión del archivo que no hay ninguna llamada a `get_settings()`, ninguna lectura de `os.environ`/`os.getenv` y ninguna URL ni token literal (D-1, requirement de configuración del entorno)

## 4. `forward_scan` — camino feliz: destino, header y cuerpo (D-3, D-7, D-8)

- [x] 4.1 RED: escribir el test que construye un `N8nPayload` válido (importado de `fastapi_bridge.schemas.scan_schemas`), lo pasa a `await repository.forward_scan(payload)` con un handler que devuelve 200, y afirma que el resultado es `True`; ejecutar y verificar que falla porque `forward_scan` no existe
- [x] 4.2 GREEN: implementar `async def forward_scan(self, payload: N8nPayload) -> bool` con el `POST` a `settings.N8N_WEBHOOK_URL`, header `X-WASA-TOKEN` desde una constante de módulo `WEBHOOK_TOKEN_HEADER`, cuerpo `json=payload.model_dump(mode="json")`, `timeout=REQUEST_TIMEOUT_SECONDS` (constante de módulo con valor `10.0`) y `return True` ante 200; ejecutar y verificar que el test de 4.1 pasa
- [x] 4.3 TRIANGULATE: agregar el test de destino — el handler captura la `httpx.Request` recibida y el test afirma que `str(request.url)` es exactamente la URL declarada en la `Settings` de prueba; agregar un segundo caso con **otra** URL de prueba para probar que el destino sigue a la configuración y no está embebido; ejecutar y verificar que ambos pasan
- [x] 4.4 TRIANGULATE: agregar el test del header — afirmar que `request.headers["X-WASA-TOKEN"]` es igual al token de prueba **desenvuelto**, y agregar explícitamente la aserción de que NO es la representación ofuscada de `SecretStr` (`"**********"`), dejando en el nombre del test el motivo, para que nadie "simplifique" el `.get_secret_value()` después (D-8); ejecutar y verificar que pasa
- [x] 4.5 TRIANGULATE: agregar el test del cuerpo — parsear `json.loads(request.content)` y afirmar que tiene exactamente las cinco claves del contrato con los mismos valores del payload, que `target_url` es una `str`, y que el `Content-Type` de la request es JSON; ejecutar y verificar que pasa
- [x] 4.6 TRIANGULATE: agregar el test de que el header viaja en **cada** entrega — dos `forward_scan` consecutivos con el mismo repositorio, afirmando que ambas requests capturadas llevan el header; ejecutar y verificar que pasa
- [x] 4.7 TRIANGULATE: agregar el test del límite de espera — construir el cliente **sin** timeout propio, capturar el `request.extensions["timeout"]` que expone httpx y afirmar que el valor efectivo es 10 segundos (D-3: el límite lo impone la entrega, no el canal); ejecutar y verificar que pasa
- [x] 4.8 TRIANGULATE: agregar el test de que un 200 con cuerpo vacío y un 200 con cuerpo arbitrario/no parseable devuelven ambos `True` (el veredicto depende sólo del status code); ejecutar y verificar que pasan

## 5. `forward_scan` — respuestas no aceptadas (D-4)

- [x] 5.1 RED: escribir el test con handler que devuelve 500, afirmando `pytest.raises(N8nUnavailableError)`; ejecutar y verificar que falla porque hoy la implementación devuelve `True` para cualquier status
- [x] 5.2 GREEN: agregar la comparación explícita `if not response.is_success: raise N8nUnavailableError(...)` (equivalente a `not (200 <= response.status_code < 300)`) con un mensaje que incluya el `status_code` y nada más (sin token, sin URL, sin cuerpo); ejecutar y verificar que el test de 5.1 pasa
- [x] 5.3 TRIANGULATE: agregar tests parametrizados para 302, 401, 404 y 500, afirmando que **todos** levantan `N8nUnavailableError`, y tests separados para 201 y 204 afirmando que **ambos** devuelven `True`; ejecutar y verificar que pasan — esto confirma el criterio 2xx (`is_success`) en vez del `== 200` estricto original (D-4, actualizado)
- [x] 5.4 Dejar en el test de 201/204 un comentario que remita a D-4 (criterio 2xx) y a la Open Question del `design.md` sobre el código de respuesta real del Webhook Trigger de n8n

## 6. `forward_scan` — fallas de transporte (D-5)

- [x] 6.1 RED: escribir el test cuyo handler levanta `httpx.ReadTimeout("timeout de prueba")`, afirmando `pytest.raises(N8nUnavailableError)`; ejecutar y verificar que falla porque hoy la excepción de httpx se escapa cruda
- [x] 6.2 GREEN: envolver el `await self._client.post(...)` en `try/except httpx.RequestError as exc:` que levante `N8nUnavailableError(...) from exc` con un mensaje neutro de "no se pudo completar la entrega"; ejecutar y verificar que el test de 6.1 pasa
- [x] 6.3 TRIANGULATE: agregar tests para `httpx.ConnectError` (orquestador inalcanzable) y `httpx.ReadError` (falla de transporte a mitad de camino), afirmando que ambos producen `N8nUnavailableError`; ejecutar y verificar que pasan y que confirman por qué se captura la raíz `RequestError` y no una lista de subclases (D-5)
- [x] 6.4 TRIANGULATE: agregar el test que afirma que la excepción original queda preservada como causa — `exc_info.value.__cause__` es una instancia de `httpx.RequestError` — para que el diagnóstico no se pierda; ejecutar y verificar que pasa
- [x] 6.5 Confirmar por revisión que **no** hay ningún `except Exception` en el módulo: un bug de programación no debe disfrazarse de "n8n no disponible" (D-5)

## 7. Garantías transversales: secreto, intento único y fire-and-forward

- [x] 7.1 RED/GREEN: escribir el test que, para cada modo de falla (500, timeout, inalcanzable), captura la `N8nUnavailableError` y afirma que el token de prueba **no** aparece en `str(exc)` ni en `repr(exc)`; ejecutar y verificar el resultado (usar un token de prueba con un valor distintivo, fácil de buscar en el texto)
- [x] 7.2 TRIANGULATE: extender el test de 7.1 para afirmar que el mensaje tampoco incluye el cuerpo de la respuesta de n8n — devolver desde el handler un cuerpo con un marcador distintivo y verificar que no aparece en el texto del error (D-8)
- [x] 7.3 RED/GREEN: escribir el test de intento único — handler que cuenta invocaciones y devuelve 500; afirmar que tras la `N8nUnavailableError` el contador es exactamente `1`; ejecutar y verificar
- [x] 7.4 TRIANGULATE: agregar el mismo test de intento único para el caso timeout (handler que cuenta y levanta `httpx.ReadTimeout`), afirmando contador `1`; ejecutar y verificar
- [x] 7.5 RED/GREEN: escribir el test de fire-and-forward — camino feliz con handler que cuenta invocaciones, afirmando que tras un `forward_scan` exitoso el contador es exactamente `1` (no hay solicitud de seguimiento al orquestador); ejecutar y verificar

## 8. Pureza de capa verificada (D-10)

- [x] 8.1 RED: agregar `("repositories", "starlette")` y `("repositories", "slowapi")` a la tabla `LAYER_IMPORT_RULES` de `fastapi_bridge/tests/test_layer_boundaries.py`; ejecutar `pytest fastapi_bridge/tests/test_layer_boundaries.py` y verificar que los casos nuevos pasan sobre el código ya escrito (si fallaran, es que la implementación arrastró framework y hay que sacarlo)
- [x] 8.2 Verificar que el caso preexistente `("repositories", "fastapi")` sigue en verde ahora que `n8n_repository.py` tiene código real, y que el test negativo `test_helper_detects_a_forbidden_import` sigue pasando
- [x] 8.3 Agregar en `test_n8n_repository.py` un test que ejercite `forward_scan` **sin** instanciar en ningún momento la app FastAPI ni importar `fastapi_bridge.main`, dejando explícito en el nombre del test que la entrega funciona sin la aplicación web levantada

## 9. REFACTOR y cierre

- [x] 9.1 REFACTOR: revisar `n8n_repository.py` — constantes de módulo (`WEBHOOK_TOKEN_HEADER`, `REQUEST_TIMEOUT_SECONDS`) sin literales duplicados, type hints en toda función sin excepción, docstrings en español al estilo de la casa, mensajes de error consistentes; ejecutar la suite completa después de cada paso de refactor y verificar que sigue verde
- [x] 9.2 REFACTOR: revisar `test_n8n_repository.py` — helpers compartidos sin duplicación, nombres de test que describan el comportamiento (no la implementación), parametrización donde haya repetición de status codes; ejecutar y verificar que sigue verde
- [x] 9.3 Ejecutar `pytest` completo y verificar que el total es el baseline de 1.1 más los tests nuevos, sin ninguna regresión
- [x] 9.4 Verificar que ningún archivo fuera de los cuatro declarados en el encabezado fue modificado (`git status` / `git diff --stat`), en particular que `exceptions/handlers.py`, `main.py`, `services/`, `uow/`, `api/` y `.env*` siguen intactos
- [x] 9.5 Marcar los cinco criterios de aceptación de CHANGE-09 en `CHANGES.md` con el nombre del test que los cubre, siguiendo el formato que dejó CHANGE-08
- [x] 9.6 Dejar anotado en el reporte de cierre, para CHANGE-10, que `ScanUoW` debe construir `N8nRepository(client, settings)` — con `Settings` como segundo argumento (D-1, divergencia deliberada respecto de la firma que lista `CHANGES.md`)
