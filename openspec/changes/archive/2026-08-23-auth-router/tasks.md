> **Governance: MEDIUM** (override del proyecto para el dominio Auth, CHANGE-01..07 — `CHANGES.md` marca este change como CRÍTICO y el `CLAUDE.md` del proyecto lo baja a MEDIO por decisión explícita del usuario; ver `design.md` §Context, restricción 7).
> **Checkpoint de governance ABIERTO** (tarea 1.5): las cuatro decisiones **⚠ REVISIÓN** de `design.md` (D-1, D-4, D-5, D-6) se presentan al usuario con recomendación y alternativa **antes** de abrir el grupo 2. D-5 (token en cuerpo vs cookie `HttpOnly`) y D-6 (rate limiting sobre auth) son las dos que pueden cambiar el alcance del change.
>
> **Strict TDD**: cada tarea de implementación arranca por el test (RED), sigue con el mínimo código (GREEN), triangula con casos adicionales y refactoriza. El orden va de adentro hacia afuera: la dependencia que compone el servicio (grupo 3), después cada operación con su camino feliz y sus rechazos (grupos 4, 5, 6), y al final la documentación y los anclajes estructurales (grupos 7, 8).
>
> **Comando de test del proyecto**: `fastapi_bridge/.venv/Scripts/python.exe -m pytest fastapi_bridge/tests/ -q`.

## 1. Red de seguridad y checkpoint de governance

- [x] 1.1 Correr la suite completa y registrar el baseline (`N passed`). Si algo ya falla, reportarlo como falla preexistente y **no** arreglarlo dentro de este change. Baseline esperado según el cierre de CHANGE-07. — Baseline: **360 passed**.
- [x] 1.2 Identificar y anotar los dos tests que anclan el contrato viejo y que este change reescribe: `tests/test_health.py::test_domain_routers_are_not_mounted_yet` y `tests/test_edge_policy_exclusions.py::test_domain_routers_still_return_404_on_production_app`. Confirmar que hoy pasan — son la evidencia del contrato que se reemplaza, no un daño colateral. — Confirmados en el baseline. Descubrimiento adicional: `tests/test_app_wiring.py::test_route_surface_does_not_change_after_registering_handlers` y `::test_unmounted_domain_route_returns_404_in_rfc7807_format` anclan el mismo contrato viejo y no estaban listados; se reescriben junto con los otros dos en 4.3.
- [x] 1.3 Confirmar que las fixtures `user_session_factory` (SQLite en memoria, sólo `User.__table__`) y `user_session` de `tests/conftest.py` siguen disponibles: los grupos 4 y 5 se apoyan enteramente en la primera (D-9). — Confirmado.
- [x] 1.4 Releer `fastapi_bridge/core/dependencies.py` y confirmar que su docstring dice que el módulo es sólo para `get_current_user` y que se implementa en CHANGE-06. Anotarlo para reescribirlo en 3.6, no ahora. — Confirmado.
- [x] 1.5 **Checkpoint con el usuario (MEDIUM governance)**: presentar las cuatro decisiones **⚠ REVISIÓN** con recomendación y alternativa — **D-1** `get_auth_service` en `core/dependencies.py` (alternativa: `api/v1/auth/dependencies.py`); **D-4** cuerpo JSON, no `OAuth2PasswordRequestForm` (con la nota sobre el botón "Authorize" de `/docs` para CHANGE-06); **D-5** token Bearer en el cuerpo, no cookie `HttpOnly` (la menos reversible: toca frontend, CORS y specs); **D-6** sin rate limiting sobre auth (alternativa: cupo propio `AUTH_RATE_LIMIT_*`, que agranda el alcance del change y agrega un delta a `api-edge-security`). No abrir el grupo 2 hasta cerrarlo. — Cerrado: el usuario aprobó las cuatro recomendaciones (D-1 `core/dependencies.py`, D-4 JSON, D-5 Bearer en cuerpo, D-6 sin rate limiting) explícitamente antes de esta sesión de apply.

## 2. Ajustes derivados del checkpoint

> Este grupo existe sólo si el checkpoint cambió algo. Si el usuario aceptó las cuatro recomendaciones, marcar las tareas como no aplicables y seguir.

- [x] 2.1 No aplica — D-1 se resolvió por la recomendación (`core/dependencies.py`).
- [x] 2.2 No aplica — D-5 se resolvió por la recomendación (Bearer en el cuerpo, no cookie).
- [x] 2.3 No aplica — D-6 se resolvió por la recomendación (sin rate limiting sobre auth, deuda consciente).
- [x] 2.4 No aplica — D-4 se resolvió por la recomendación (cuerpo JSON).

## 3. `get_auth_service` — composición del servicio por `Depends` (D-1, D-8)

- [x] 3.1 RED — crear `fastapi_bridge/tests/test_auth_dependencies.py` importando `get_auth_service` desde el módulo resuelto en D-1 (todavía inexistente: el `ImportError` es el RED). Primer test: invocarla con un `Settings` de prueba devuelve una instancia de `AuthService`.
- [x] 3.2 GREEN — implementar `get_auth_service(settings: Annotated[Settings, Depends(get_settings)]) -> AuthService`, componiendo `AuthService(AuthUoW(get_session_factory(settings)))`, con type hints completos. Sin literales de configuración propios (regla dura): la cadena de conexión sale de `Settings`.
- [x] 3.3 TRIANGULATE — instancia por petición (D-8): dos invocaciones consecutivas devuelven objetos distintos, y ninguna abre una conexión (verificar que construirla no dispara I/O: `get_session_factory` sólo devuelve la factory cacheada).
- [x] 3.4 TRIANGULATE — la configuración llega por `Depends(get_settings)`, no por lectura directa: pasar un `Settings` con otro `DB_URL` produce un servicio ligado a otra factory. Ancla el escenario "Sin configuración fija en el código".
- [x] 3.5 TRIANGULATE — el servicio compuesto es funcional: construirlo sobre la fixture `user_session_factory` y ejercitar `register` seguido de `login` end-to-end, sin HTTP. Confirma que la composición es correcta antes de agregarle transporte encima.
- [x] 3.6 REFACTOR — reescribir el docstring de `core/dependencies.py`: qué compone `get_auth_service`, por qué la composición vive acá y no bajo `api/` (D-1, restricción 4), y por qué es una instancia por petición (D-8). Mantener la nota de que `get_current_user` llega en CHANGE-06.

## 4. `POST /api/v1/auth/register` — camino feliz y montaje (D-2, D-3, D-9, D-10, D-12)

- [x] 4.1 RED — crear `fastapi_bridge/tests/test_auth_router.py` con una fixture `auth_app` que construya `create_app()` y sustituya `app.dependency_overrides[get_auth_service]` por un `AuthService` sobre `user_session_factory` (D-9), ejercitado con `httpx.ASGITransport` (que no dispara el `lifespan`). Primer test: `POST /api/v1/auth/register` con email y contraseña válidos devuelve `201`. RED actual: `404`.
- [x] 4.2 GREEN — declarar la operación en `api/v1/auth/router.py`: `@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=TokenResponse)` (D-3, D-10), firma `async def register(data: UserRegister, service: Annotated[AuthService, Depends(get_auth_service)]) -> TokenResponse`, cuerpo de una línea: `return await service.register(data)`. Sin `try/except` (D-2). Montar el router en `create_app()` con `include_router(auth_router)` **sin** `prefix` (D-12).
- [x] 4.3 GREEN — actualizar en la misma tarea los dos tests identificados en 1.2, para que la suite no afirme dos contratos incompatibles: `test_domain_routers_are_not_mounted_yet` pasa a exigir que `/api/v1/auth/register` **no** devuelva `404` y que `/api/v1/scan/start` sí (el aserto de scan se conserva); ídem en `test_edge_policy_exclusions.py`. Renombrarlos para que digan lo que ahora afirman. — Extendida: `tests/test_app_wiring.py` tenía otros dos tests con el mismo contrato viejo, no listados originalmente (ver nota en 1.2); se reescribieron acá también.
- [x] 4.4 TRIANGULATE — el cuerpo de la respuesta es un `TokenResponse` completo: trae `access_token` no vacío, `token_type == "bearer"` y `expires_in` entero mayor que cero.
- [x] 4.5 TRIANGULATE — el token devuelto decodifica al email registrado (`decode_access_token` con el `Settings` de prueba devuelve ese `sub`), y el usuario quedó persistido con un hash distinto de la contraseña enviada. Son dos escenarios del spec y cierran el camino completo router → service → uow → repository.
- [x] 4.6 TRIANGULATE — la respuesta no filtra material sensible: el JSON de un `201` no contiene la contraseña enviada ni el hash almacenado, y su conjunto de claves es exactamente `{access_token, token_type, expires_in}` (ancla del filtrado por `response_model`, D-10).
- [x] 4.7 TRIANGULATE — el prefijo no se duplica: `POST /api/v1/auth/api/v1/auth/register` devuelve `404` (D-12), y la lista de rutas de aplicación registradas es exactamente `GET /health` + las de auth. — Leída desde `app.openapi()["paths"]`, no desde `app.routes`: esta versión instalada de FastAPI (0.141.1) resuelve `include_router` de forma perezosa (`_IncludedRouter`, sin `.path` propio en `app.routes`); el schema OpenAPI es la superficie estable, no un detalle interno de esta versión.

## 5. `POST /api/v1/auth/login` — camino feliz y rechazo indistinguible (D-2, D-3)

- [x] 5.1 RED — test: registrar un usuario por el endpoint y luego `POST /api/v1/auth/login` con las mismas credenciales devuelve `200`. RED actual: `404`.
- [x] 5.2 GREEN — declarar `@router.post("/login", response_model=TokenResponse)` (200 por defecto, D-3), firma análoga a la de registro, cuerpo `return await service.login(data)`. Sin `try/except`.
- [x] 5.3 TRIANGULATE — el token del login decodifica al email del usuario; el login con el email en otra capitalización (`USER@TEST.COM` sobre un usuario registrado como `user@test.com`) devuelve `200`.
- [x] 5.4 TRIANGULATE — registro y login devuelven la **misma forma** de respuesta: mismo conjunto de claves, distinto código de estado (`201` vs `200`). Ancla el escenario homónimo del spec.
- [x] 5.5 RED — email inexistente devuelve `401`, y contraseña incorrecta devuelve `401`. RED esperado sólo si algo del cableado captura la excepción; si ya pasan, quedan como ancla de regresión de que `domain_error_handler` alcanza al router. — Pasaron en verde de inmediato (GREEN de 5.2 ya cubría el camino), confirmando que `domain_error_handler` alcanza al router sin mediación.
- [x] 5.6 TRIANGULATE — los dos `401` son **idénticos**: comparar los cuerpos completos de ambas respuestas y exigir igualdad campo por campo. Es el escenario que hace cumplible RN-WS-12 §Excepciones globales en el borde HTTP, no sólo en el servicio.
- [x] 5.7 TRIANGULATE — el `401` es RFC 7807 completo: `Content-Type: application/problem+json`, campos `type`/`title`/`status`/`detail`/`instance`, `status == 401`, `instance == "/api/v1/auth/login"`, y el email enviado **no** aparece en ninguna parte del cuerpo.

## 6. Rechazos del registro y de la validación de entrada

- [x] 6.1 RED/GREEN — email duplicado: registrar dos veces el mismo email devuelve `409` con cuerpo RFC 7807, `instance == "/api/v1/auth/register"` y `status == 409`. Verificar además que no quedó una segunda fila para ese email.
- [x] 6.2 TRIANGULATE — la colisión también ocurre con otra capitalización: registrar `user@test.com` y después `USER@TEST.COM` devuelve `409`, no `201`.
- [x] 6.3 TRIANGULATE — contraseña de menos de 8 caracteres devuelve `422` (no `400`: CHANGE-07 D-2), con `detail` que nombra el campo de la contraseña y **sin** la contraseña enviada en ninguna parte del cuerpo. Son dos criterios de aceptación de `CHANGES.md` en un solo test.
- [x] 6.4 TRIANGULATE — resto de los rechazos de validación, todos `422`: email sin arroba; campo faltante; campo adicional no declarado (`extra="forbid"` de CHANGE-02 — el test documenta explícitamente el riesgo de `confirmPassword` para CHANGE-16, ver `design.md` §Risks).
- [x] 6.5 TRIANGULATE — cuerpo que no es JSON parseable devuelve `400` (no `422`), distinguiéndose del caso anterior. Ancla la rama `json_invalid` de `request_validation_exception_handler` desde el borde real.
- [x] 6.6 TRIANGULATE — la validación ocurre antes del servicio: sustituir la dependencia por un doble que registre si fue invocado y confirmar que un `422` nunca lo alcanza (no se derivó ningún hash ni se abrió transacción).
- [x] 6.7 TRIANGULATE — método no permitido: `GET /api/v1/auth/login` devuelve `405` con cuerpo RFC 7807, no la respuesta por defecto de Starlette. Ancla desde el borde el escenario 404/405 de CHANGE-07.
- [x] 6.8 TRIANGULATE — un `DomainError` no mapeado sale como `500` RFC 7807: sustituir la dependencia por un doble cuyo `register` lanza una subclase de `DomainError` ajena a `_DOMAIN_ERROR_MAP` y exigir `500` con el detalle genérico, sin nombre de excepción ni traza.

## 7. Documentación OpenAPI (D-7)

- [x] 7.1 RED — test sobre `app.openapi()`: ambas rutas están declaradas, la de registro con respuesta exitosa `201` y la de login con `200`, ambas referenciando el schema de `TokenResponse`.
- [x] 7.2 GREEN — completar los decoradores con `summary`, `description` y el bloque `responses={...}` usando `ErrorDetail` (`schemas/error_schemas.py`) y el media type `application/problem+json`: `409` y `422` en registro, `401` y `422` en login (D-7).
- [x] 7.3 TRIANGULATE — los errores documentados usan el modelo del proyecto, **no** el `HTTPValidationError` por defecto del framework: afirmar que el `422` de ambas rutas referencia `ErrorDetail` y que su media type es `application/problem+json`.
- [x] 7.4 TRIANGULATE — las dos operaciones quedan etiquetadas bajo `auth` y separadas de `/health`; el esquema OpenAPI se genera sin errores (`app.openapi()` no lanza).

## 8. Anclajes estructurales de la capa de transporte (D-2, D-11)

- [x] 8.1 RED/GREEN — test AST sobre `api/v1/auth/router.py` (reutilizando el helper de `tests/test_layer_boundaries.py`): el módulo no contiene ningún `ast.Try` ni construye `HTTPException`. Es el ancla de D-2: un change futuro que "arregle" el router con un `except` queda en rojo.
- [x] 8.2 TRIANGULATE — test AST: el módulo del router no contiene ninguna sentencia de `logging` (D-11), y ningún módulo bajo `api/` importa `sqlalchemy`, `httpx`, la librería de hashing ni la de JWT. Verificar que `LAYER_IMPORT_RULES` ya cubre `("api", "sqlalchemy")` y `("api", "httpx")`; agregar las filas de hashing/JWT para `api` si no están. — Se agregaron `("api", "bcrypt")`, `("api", "passlib")`, `("api", "jose")`.
- [x] 8.3 TRIANGULATE — con los logs capturados (`caplog`), un `401` de login no emite ningún registro que contenga el email enviado, y un `422` de registro no emite ninguno que contenga la contraseña enviada (D-11).
- [x] 8.4 TRIANGULATE — el router no construye el servicio: test AST que confirma que `api/v1/auth/router.py` no menciona `AuthUoW`, `get_session_factory` ni `Settings`. Ancla el escenario "El router sólo declara la dependencia".
- [x] 8.5 TRIANGULATE — la dependencia es sustituible: un test que sustituye `get_auth_service` por un doble y verifica que la ruta usa el doble (ya cubierto de hecho por la fixture del grupo 4; acá se afirma explícitamente, porque es lo que necesitan CHANGE-06 y CHANGE-12).

## 9. Cierre

- [x] 9.1 Correr la suite completa y comparar con el baseline de 1.1: todos los tests previos siguen pasando salvo los dos reescritos en 4.3, más los nuevos de este change. Registrar el número final. — **399 passed** (baseline 360 + 39 nuevos), 0 regresiones.
- [x] 9.2 REFACTOR — docstring del módulo `api/v1/auth/router.py`: reemplazar el texto de placeholder de CHANGE-00a por el definitivo — las dos operaciones, por qué no hay `try/except` (D-2), por qué el prefijo se declara una sola vez (D-12), y la nota de D-4 sobre el botón "Authorize" de `/docs` para que no se lea como un bug en CHANGE-06.
- [x] 9.3 REFACTOR — revisar que `main.py` no haya quedado con comentarios que digan que los routers de dominio no se montan (D-8 de CHANGE-00a): actualizar el docstring del módulo al contrato vigente — auth montado, scan pendiente de CHANGE-12.
- [x] 9.4 Verificar manualmente `/docs`: ambas operaciones visibles bajo `auth`, con sus schemas de entrada, su respuesta exitosa y sus errores. Es el sexto criterio de aceptación de `CHANGES.md` y el único que no se puede afirmar sólo desde el esquema JSON. — Verificado vía `TestClient`: `/docs` → 200, `/openapi.json` → 200 con `register`/`login` bajo el tag `auth` y los cinco schemas (`ErrorDetail`, `HealthResponse`, `TokenResponse`, `UserLogin`, `UserRegister`).
- [x] 9.5 Correr `openspec validate auth-router --strict` y confirmar que sigue en verde tras cualquier ajuste de specs hecho en el grupo 2. — `Change 'auth-router' is valid`.
- [x] 9.6 Marcar `[CHANGE-05] auth-router` como completado en `CHANGES.md` y anotar allí el traspaso a CHANGE-06 (el `tokenUrl` ya apunta a una ruta real; el botón "Authorize" de `/docs` no funciona contra un endpoint JSON) y a CHANGE-16 (el cliente manda `{email, password}`, nunca el formulario completo con `confirmPassword`, por `extra="forbid"`).
