# Tasks — change-12-scan-router-protected

> Strict TDD activo. Cada grupo 4..10 es un ciclo completo **RED → GREEN → TRIANGULATE → REFACTOR**:
> el test se escribe y se ejecuta *antes* que el código de producción que lo satisface.
> Referencias: `specs/scan-endpoint/spec.md` (qué), `design.md` D-1..D-10 (cómo).
>
> **PRECONDICIÓN BLOQUEANTE (D-1, governance ALTO)**: el grupo 1 **no** se puede completar
> hasta que `get_current_user` exista en `fastapi_bridge/core/dependencies.py` (CHANGE-06) y
> los handlers de `HTTPException` / `RequestValidationError` estén registrados (CHANGE-07).
> Hoy ninguno de los dos está en este branch. **No arrancar el apply sin confirmación explícita
> del usuario** sobre la opción A/B/C de D-1.
>
> **Archivos de producción que este change toca (y ningún otro)**:
> `fastapi_bridge/api/v1/scan/router.py`, `fastapi_bridge/core/dependencies.py` (append de
> `get_scan_service`), `fastapi_bridge/exceptions/handlers.py` (append del handler de
> `N8nUnavailableError`) y `fastapi_bridge/main.py`.
> **Tests**: `fastapi_bridge/tests/test_scan_router.py` (nuevo) más las dos actualizaciones
> declaradas por adelantado en D-10 (`test_edge_policy_exclusions.py`, `test_app_wiring.py`).
> **NO se modifican**: `services/scan_service.py`, `uow/`, `repositories/`, `schemas/`,
> `core/limiter.py`, `core/settings.py`, `core/security.py`, `api/v1/auth/router.py`, `pytest.ini`.
>
> **Ningún test hace red real**, ninguno instancia un `httpx.AsyncClient` y ninguno assertea
> valores reales de `N8N_WEBHOOK_URL` / `N8N_WEBHOOK_TOKEN` (D-9).

## 1. Precondición: verificar la dependencia de CHANGE-06 / CHANGE-07

- [ ] 1.1 Confirmar con el usuario cuál de las opciones A/B/C de `design.md` D-1 se aplica; no continuar sin respuesta explícita (governance ALTO)
- [ ] 1.2 Verificar en el árbol que `from fastapi_bridge.core.dependencies import get_current_user` importa sin error y que la función acepta un token *bearer* y devuelve el email del `sub`; si falla, detenerse y reportar la dependencia como no satisfecha
- [ ] 1.3 Verificar que `create_app()` registra handlers para `RequestValidationError` y `HTTPException` (CHANGE-07) — de lo contrario los criterios de `401` y `422` en RFC 7807 no son alcanzables y hay que reportarlo antes de escribir un solo test
- [ ] 1.4 Identificar y anotar cómo se firma un token de prueba con el `JWT_SECRET` del entorno de test (`create_access_token` de `core/security.py`), incluida la forma de generar uno **expirado** y uno firmado con **otro** secreto — los tests del grupo 6 dependen de las tres variantes

## 2. Safety net

- [ ] 2.1 Ejecutar `pytest` completo y anotar el baseline (`N passed`); si algo ya falla, reportarlo como fallo preexistente y NO arreglarlo en este change
- [ ] 2.2 Ejecutar aislados `pytest fastapi_bridge/tests/test_edge_policy_exclusions.py fastapi_bridge/tests/test_app_wiring.py fastapi_bridge/tests/test_rate_limit.py` y anotar el conteo verde: son los tres archivos que este change puede alterar por efecto colateral (D-5, D-10)
- [ ] 2.3 Releer `fastapi_bridge/services/scan_service.py` y confirmar de primera mano la firma exacta que este change consume: `ScanService()` sin argumentos y `async start_scan(request: ScanRequest) -> ScanResponse`, sin captura de `N8nUnavailableError`
- [ ] 2.4 Releer `fastapi_bridge/schemas/scan_schemas.py` y anotar los nombres exactos de los campos de `ScanRequest` y `ScanResponse` (los tests de cuerpo del `202` los assertean uno por uno)

## 3. Andamiaje de tests y dobles (D-9)

- [ ] 3.1 Crear `fastapi_bridge/tests/test_scan_router.py` con docstring de módulo en español al estilo de `test_scan_service.py`, y verificar que `pytest fastapi_bridge/tests/test_scan_router.py` lo recolecta sin errores de import
- [ ] 3.2 Escribir `FakeScanService`: registra en una lista pública las `ScanRequest` recibidas por `start_scan`, devuelve una `ScanResponse` fija configurable y admite configurarse para levantar `N8nUnavailableError`; verificar con un test directo del propio doble que registra la solicitud y que levanta cuando se lo configura así
- [ ] 3.3 Escribir el helper `build_client(app, *, client_host=...)` sobre `httpx.ASGITransport` (mismo patrón que `test_rate_limit.py`) y el helper `valid_body()` que devuelva un cuerpo JSON válido según `ScanRequest`; verificar que ambos funcionan contra `GET /health` y contra una ruta desechable
- [ ] 3.4 Escribir la fixture que construye la app vía `create_app()`, sustituye `get_scan_service` y `get_current_user` con `app.dependency_overrides`, y **limpia los overrides al salir**; verificar con un test que tras la fixture `app.dependency_overrides` queda vacío (un override filtrado contamina los tests de `401`)

## 4. La operación existe y está montada (spec: "Existe una operación de disparo alcanzable por red")

- [ ] 4.1 RED: escribir el test que importa `fastapi_bridge.api.v1.scan.router` y afirma que el router tiene exactamente una ruta registrada, con path `/api/v1/scan/start` y métodos `{"POST"}`; ejecutar y verificar que falla porque no hay ninguna ruta (este test aísla además el fallo de import de R-3)
- [ ] 4.2 GREEN: agregar en `router.py` el decorador `@router.post("/start", status_code=202, response_model=ScanResponse)` sobre `async def start_scan(request: Request, scan_request: ScanRequest) -> JSONResponse` con un cuerpo mínimo que devuelva un `JSONResponse` fijo; ejecutar y verificar que el test de 4.1 pasa
- [ ] 4.3 RED/GREEN: escribir el test que hace `POST /api/v1/scan/start` sobre la app de producción y afirma que la respuesta **no** es `404`; montar el router en `create_app()` con `include_router(scan_router)` **sin `prefix`** (el router ya lo declara, D-12 de CHANGE-05); ejecutar y verificar que pasa
- [ ] 4.4 TRIANGULATE: agregar el test que afirma que `GET /api/v1/scan/start` responde `405` (el verbo de disparo es el único admitido); ejecutar y verificar que pasa
- [ ] 4.5 TRIANGULATE: agregar el test que afirma que, descartando `/docs`, `/openapi.json` y `/redoc`, las únicas rutas de aplicación son `GET /health` y `POST /api/v1/scan/start` — y que no existe ninguna otra ruta bajo el prefijo del dominio scan; ejecutar y verificar que pasa
- [ ] 4.6 Confirmar por revisión que `router.py` no importa `httpx`, `sqlalchemy`, `slowapi` ni `jose` de forma directa, y ejecutar `pytest fastapi_bridge/tests/test_layer_boundaries.py` para verificar que las fronteras siguen verdes

## 5. Delegación al Service y respuesta `202` (spec: "Una solicitud aceptada recibe una confirmación de aceptación")

- [ ] 5.1 RED: escribir el test que, con `get_current_user` y `get_scan_service` sustituidos, hace `POST` con cuerpo válido y afirma status `202`; ejecutar y verificar que falla contra el cuerpo fijo de 4.2
- [ ] 5.2 GREEN: agregar `get_scan_service() -> ScanService` a `core/dependencies.py` (D-3, un `return ScanService()` sin argumentos) y hacer que el handler reciba `service: ScanService = Depends(get_scan_service)`, llame `await service.start_scan(scan_request)` y devuelva `JSONResponse(status_code=202, content=response.model_dump(mode="json"))`; ejecutar y verificar que el test de 5.1 pasa
- [ ] 5.3 TRIANGULATE: agregar el test que afirma que el cuerpo del `202` tiene **exactamente** las claves de `ScanResponse` (`scan_id`, `status`, `message`), con los mismos valores que devolvió el doble — ni una clave agregada, ni una renombrada; ejecutar y verificar que pasa
- [ ] 5.4 TRIANGULATE: agregar el test que afirma que la `ScanRequest` que recibió el doble lleva exactamente los valores del cuerpo enviado, incluidos los valores por defecto de `sqlmap_level` / `sqlmap_risk` cuando se omiten; ejecutar y verificar que pasa (prueba que el Router no transforma la entrada)
- [ ] 5.5 TRIANGULATE: agregar el test que afirma que el status **no** es `200` ni `201`, y que una solicitud produce exactamente **una** llamada a `start_scan`; ejecutar y verificar que pasa
- [ ] 5.6 REFACTOR: confirmar por revisión que el cuerpo del handler no tiene ningún `if`, ningún `try`, ninguna referencia a `Settings`, `ScanUoW` ni `httpx`, y que `current_user` no participa en la construcción de la respuesta; ejecutar la suite del archivo y verificar que sigue verde

## 6. Guard JWT (spec: "El disparo de escaneo está cerrado a quien no presenta credencial válida")

> En este grupo **no** se sustituye `get_current_user`: se ejercita el guard real (D-9).

- [ ] 6.1 RED: escribir el test que hace `POST` con cuerpo válido y **sin** cabecera `Authorization`, afirmando status `401`; agregar `current_user: str = Depends(get_current_user)` a la firma del handler (D-6); ejecutar y verificar que pasa
- [ ] 6.2 TRIANGULATE: agregar el test con un token expirado (emitido con expiración en el pasado) → `401`; ejecutar y verificar que pasa
- [ ] 6.3 TRIANGULATE: agregar el test con un token malformado (texto que no es un JWT) → `401`; ejecutar y verificar que pasa
- [ ] 6.4 TRIANGULATE: agregar el test con un token bien formado pero firmado con **otro** secreto → `401`; ejecutar y verificar que pasa
- [ ] 6.5 TRIANGULATE: agregar el test que afirma que los cuerpos de `401` de 6.2 y 6.4 **no** permiten distinguir el motivo (no dicen "expired" ni "signature"); ejecutar y verificar que pasa
- [ ] 6.6 TRIANGULATE: agregar el test que afirma que en todos los caminos de `401` el `FakeScanService` registró **cero** llamadas — el rechazo ocurre antes de cualquier lógica de negocio y antes de cualquier contacto con el orquestador; ejecutar y verificar que pasa
- [ ] 6.7 TRIANGULATE: agregar el test de camino feliz con un token **válido** real (no sustituido), afirmando que la solicitud es atendida; ejecutar y verificar que pasa

## 7. Mapeo `N8nUnavailableError` → `502` (spec: "La indisponibilidad del orquestador se reporta como falla de la pasarela")

- [ ] 7.1 RED: escribir el test que configura el `FakeScanService` para levantar `N8nUnavailableError` y afirma status `502`; ejecutar y verificar que falla (hoy sale como error no manejado)
- [ ] 7.2 GREEN: agregar `n8n_unavailable_handler` a `exceptions/handlers.py` construido con `problem_detail_response(...)` y sus literales como constantes de módulo (D-2), y registrarlo en `create_app()` con `add_exception_handler(N8nUnavailableError, ...)`; ejecutar y verificar que el test de 7.1 pasa
- [ ] 7.3 TRIANGULATE: agregar el test que afirma que el cuerpo del `502` tiene exactamente las cinco claves RFC 7807, que `status` es `502`, que el `content-type` es `application/problem+json` y que `instance` es `/api/v1/scan/start`; ejecutar y verificar que pasa
- [ ] 7.4 TRIANGULATE: agregar el test que afirma que el cuerpo del `502` **no** contiene la URL del orquestador, su token de webhook, trazas de pila, rutas de archivos del servidor ni nombres de módulos internos; ejecutar y verificar que pasa
- [ ] 7.5 TRIANGULATE: agregar el test que afirma que el `phpsessid` enviado en la solicitud **no** aparece en el cuerpo de ninguna respuesta de error (`401`, `422`, `429`, `502`); ejecutar y verificar que pasa (R-6)
- [ ] 7.6 REFACTOR: confirmar por revisión que el Router no contiene ningún `try`/`except` de `N8nUnavailableError` y que el handler nuevo construye su respuesta **sólo** vía `problem_detail_response(...)`, sin repetir literales de formato; ejecutar la suite del archivo y verificar que sigue verde

## 8. Validación del cuerpo (spec: "Toda respuesta de rechazo de la operación es Problem Details")

- [ ] 8.1 RED/GREEN: escribir el test que, con credencial válida, envía un cuerpo sin `target_url` y afirma un rechazo de validación (`400` o `422`) con cuerpo RFC 7807 e `instance` igual a la ruta; ejecutar y verificar (lo satisface el handler de CHANGE-07, no código nuevo de este change — dejar constancia)
- [ ] 8.2 TRIANGULATE: agregar los tests de los demás casos del contrato de CHANGE-08 — `target_url` que no es URL, `phpsessid` vacío o sólo espacios, `sqlmap_level` fuera de `1..5`, `sqlmap_risk` fuera de `1..3` — cada uno rechazado y con `FakeScanService` en cero llamadas; ejecutar y verificar que pasan
- [ ] 8.3 TRIANGULATE: agregar el test que afirma que un cuerpo válido **con un campo desconocido extra** es aceptado (`extra="ignore"`, CHANGE-08 D-7) y que ese campo no llega al Service — el borde no endurece ni relaja el contrato de datos; ejecutar y verificar que pasa
- [ ] 8.4 Confirmar por revisión que `router.py` no contiene ninguna validación manual de campos (ni `if not scan_request.target_url`, ni chequeos de rango): toda la validación es de Pydantic

## 9. Cupo por IP sobre la ruta real (spec: "El disparo de escaneo aplica el cupo por origen del dominio scan sobre la ruta real")

- [ ] 9.1 RED: escribir el test que, tras `limiter.reset()` y con `limiter_module.get_settings` sustituido por un cupo chico (patrón de `test_rate_limit.py`), agota el cupo desde una IP y afirma que la solicitud siguiente es `429`; ejecutar y verificar que falla porque el endpoint no está decorado
- [ ] 9.2 GREEN: aplicar `@scan_rate_limit` sobre el handler (importado de `core/limiter.py`, sin importar `slowapi` en `api/`), respetando el parámetro obligatorio `request: Request` de D-6; ejecutar y verificar que el test de 9.1 pasa
- [ ] 9.3 TRIANGULATE: agregar el test que afirma que el cuerpo del `429` es RFC 7807 con las cinco claves y que la respuesta trae la cabecera `Retry-After` (lo produce el handler ya existente de CHANGE-00d); ejecutar y verificar que pasa
- [ ] 9.4 TRIANGULATE: agregar el test que afirma que la solicitud rechazada por cupo **no** llegó al `FakeScanService` (cero llamadas adicionales); ejecutar y verificar que pasa
- [ ] 9.5 TRIANGULATE: agregar el test que afirma que una IP distinta, sin historial, es atendida normalmente mientras la primera ya agotó su cupo; ejecutar y verificar que pasa
- [ ] 9.6 TRIANGULATE: agregar el test que afirma que, con el cupo de scan agotado, `GET /health` sigue respondiendo `200` — el cupo no se derrama al resto del servicio; ejecutar y verificar que pasa
- [ ] 9.7 TRIANGULATE: agregar el test estructural que afirma que la ruta de disparo de escaneo figura registrada en `limiter._dynamic_route_limits` del **singleton de módulo** (D-5), y que es la única ruta de producción registrada ahí; ejecutar y verificar que pasa
- [ ] 9.8 Verificar que las fixtures de este grupo hacen `limiter.reset()` antes y después, y que dos ejecuciones consecutivas del mismo test pasan ambas (mismo control de aislamiento que `test_rate_limit.py`)

## 10. Documentación OpenAPI (spec: "La documentación interactiva declara la operación como protegida")

- [ ] 10.1 RED/GREEN: escribir el test que obtiene `app.openapi()` y afirma que la operación `post` de `/api/v1/scan/start` declara un requisito `security` no vacío, y que el esquema referenciado es de tipo *bearer* (D-8); ejecutar y verificar (lo satisface el `OAuth2PasswordBearer` de CHANGE-06 — dejar constancia de que no se agregó `security` a mano)
- [ ] 10.2 TRIANGULATE: agregar el test que afirma que la operación declara `202` entre sus respuestas y referencia el esquema de `ScanResponse`, y que su `requestBody` referencia el de `ScanRequest`; ejecutar y verificar que pasa
- [ ] 10.3 TRIANGULATE: agregar el test que afirma que `GET /health` **no** declara requisito de seguridad — la protección es por operación, no global; ejecutar y verificar que pasa
- [ ] 10.4 Verificar manualmente en `/docs` que la operación aparece con el candado y que el botón "Authorize" está disponible, y anotar el resultado (criterio de aceptación de `CHANGES.md` verificado en vivo)

## 11. Reconciliación de los tests archivados que este change invalida (D-10)

- [ ] 11.1 Actualizar `test_edge_policy_exclusions.py::test_domain_routers_still_return_404_on_production_app`: renombrarlo a lo que ahora afirma, dejar el `404` para `POST /api/v1/auth/register` y afirmar que `POST /api/v1/scan/start` ya **no** es `404`; ejecutar el archivo completo y verificar que queda verde
- [ ] 11.2 Reescribir `test_app_wiring.py::test_no_production_route_has_a_rate_limit_applied` para que inspeccione el singleton `core.limiter.limiter` en vez de `app.state.limiter`, afirmando que la **única** ruta de producción marcada es el disparo de escaneo (D-5, R-2); ejecutar el archivo y verificar que queda verde
- [ ] 11.3 Verificar que ningún otro test archivado depende de que el router de scan no esté montado — buscar `scan/start` y `404` en `fastapi_bridge/tests/` y revisar cada hit; reportar cualquier hallazgo no previsto en vez de arreglarlo en silencio

## 12. Verificación final

- [ ] 12.1 Ejecutar `pytest` completo y verificar que el total es el baseline de 2.1 más los tests nuevos de este change, con `0 failed`; anotar el conteo
- [ ] 12.2 Recorrer los siete criterios de aceptación de `CHANGE-12` en `CHANGES.md` y marcar cada uno contra el test concreto que lo cubre (o contra la verificación en vivo de 10.4); reportar cualquiera que quede sin cubrir
- [ ] 12.3 Ejecutar `openspec validate --strict` sobre el change y verificar que no reporta errores
- [ ] 12.4 Confirmar que los archivos de producción tocados son exactamente los cuatro declarados en el encabezado de este archivo (`git status` / `git diff --stat`), y reportar cualquier archivo extra con su justificación
- [ ] 12.5 Levantar el servicio (`uvicorn fastapi_bridge.main:app`) y verificar en vivo el camino completo con un JWT real: `202` con n8n disponible y `502` con n8n apagado; anotar ambos resultados
