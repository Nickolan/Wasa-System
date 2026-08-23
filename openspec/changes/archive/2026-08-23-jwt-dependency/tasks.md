> **Governance: MEDIUM** (override del proyecto para el dominio Auth, CHANGE-01..07 — `CHANGES.md` marca este change como CRÍTICO y el `CLAUDE.md` del proyecto lo baja a MEDIO por decisión explícita del usuario; ver `design.md` §Context, restricción 7).
> **Checkpoint de governance CERRADO** (tarea 1.5): las tres decisiones **⚠ REVISIÓN** de `design.md` (D-1, D-2, D-5) fueron confirmadas por el usuario tal cual la recomendación — sin cambios de alcance. Grupo 2 no aplica.
>
> **Strict TDD**: cada tarea de implementación arranca por el test (RED), sigue con el mínimo código (GREEN), triangula con casos adicionales y refactoriza. El orden va de adentro hacia afuera: la dependencia como función pura (grupo 3), después la forma HTTP del rechazo sobre la ruta sonda (grupos 4, 5, 6), y al final los anclajes estructurales y la regresión de superficie (grupos 7, 8).
>
> **Comando de test del proyecto**: `fastapi_bridge/.venv/Scripts/python.exe -m pytest fastapi_bridge/tests/ -q`.
>
> **Único archivo de producción que este change toca**: `fastapi_bridge/core/dependencies.py`. Si una tarea parece necesitar modificar `core/security.py`, `exceptions/handlers.py`, `main.py` o cualquier router, es señal de que la dependencia se está quedando con responsabilidad que no le toca — parar y revisar contra `design.md` §Non-Goals.

## 1. Red de seguridad y checkpoint de governance

- [x] 1.1 Correr la suite completa y registrar el baseline (`N passed`). Si algo ya falla, reportarlo como falla preexistente y **no** arreglarlo dentro de este change. Baseline esperado según el cierre de CHANGE-05: **399 passed**. → Confirmado: 399 passed, 10 warnings (pre-existentes, no relacionados).
- [x] 1.2 Releer `fastapi_bridge/core/dependencies.py` y confirmar que `get_auth_service` está intacto y que el docstring del módulo ya reserva el lugar de `get_current_user` (líneas 27-29). Este change **agrega**, no reescribe: `get_auth_service` no se toca. → Confirmado.
- [x] 1.3 Confirmar el contrato del que depende D-10 ejecutando los tests de `tests/test_security.py` que cubren `decode_access_token`: devuelve `TokenData(email=None)` ante token malformado, firmado con otra clave, vencido, con algoritmo no permitido y sin `sub`, **sin lanzar**. Anotar los nombres de esos tests: son la evidencia de que el `try/except` de esta dependencia sería código muerto. → `test_decode_access_token_rejects_alg_none_token`, `test_decode_access_token_rejects_token_signed_with_a_different_key`, `test_decode_access_token_rejects_expired_token_without_raising`, `test_decode_access_token_rejects_rs256_header`, `test_decode_access_token_always_returns_token_data` (cubre "garbage"/malformado). Todos pasan sin lanzar.
- [x] 1.4 Verificar en el código instalado de FastAPI (`fastapi/security/oauth2.py`) que `OAuth2PasswordBearer.__call__` con `auto_error=False` devuelve `None` tanto si falta el header como si el esquema no es `Bearer`, y que el requisito de seguridad de OpenAPI se colecta por `isinstance(..., SecurityBase)` (`fastapi/dependencies/models.py`), con independencia de `auto_error`. Es la verificación que sostiene D-1; si esta versión se comportara distinto, D-1 se reabre. → Confirmado por lectura directa del código instalado: `__call__` devuelve `None` en el `else` de `if self.auto_error`, cubriendo ambos casos por la misma rama (`not authorization or scheme.lower() != "bearer"`); `models.py:127/133` colecta por `isinstance(unwrapped, SecurityBase)`.
- [x] 1.5 **Checkpoint con el usuario (MEDIUM governance)**: → Ya resuelto antes de esta sesión por decisión explícita del usuario (transmitida en el brief de la tarea): D-1 `auto_error=False`, D-2 `HTTPException(401)` (no `DomainError`), D-5 sin consulta a la base. Las tres recomendaciones de `design.md` fueron aceptadas tal cual. No se reabre la discusión.

## 2. Ajustes derivados del checkpoint

> Este grupo existe sólo si el checkpoint cambió algo. Si el usuario aceptó las tres recomendaciones, marcar las tareas como no aplicables y seguir.

- [x] 2.1 No aplica: el usuario confirmó `auto_error=False` (D-1) tal cual la recomendación.
- [x] 2.2 No aplica: el usuario confirmó `HTTPException(401)` (D-2) tal cual la recomendación.
- [x] 2.3 No aplica: el usuario confirmó sin consulta a la base (D-5) tal cual la recomendación.
- [x] 2.4 No aplica: los specs no se tocaron (checkpoint sin cambios).

## 3. `get_current_user` como función pura — camino feliz y rechazo (D-1, D-5, D-6, D-7, D-8, D-10)

- [x] 3.1 RED — agregar a `fastapi_bridge/tests/test_auth_dependencies.py` (donde ya viven los de `get_auth_service`) un test que importe `get_current_user` desde `fastapi_bridge.core.dependencies` (todavía inexistente: el `ImportError` es el RED) y la invoque directamente con un token emitido por `create_access_token` y un `Settings` de prueba, esperando el email del sujeto.
- [x] 3.2 GREEN — declarar en `core/dependencies.py`: `oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)` (D-1, D-13) y `async def get_current_user(token: Annotated[str | None, Depends(oauth2_scheme)], settings: Annotated[Settings, Depends(get_settings)]) -> str` (D-7, D-8), con type hints completos. Cuerpo mínimo: delegar en `decode_access_token(token, settings)` y devolver `token_data.email`. Sin `try/except` (D-10). Sin importar `jose` (D-12).
- [x] 3.3 TRIANGULATE — el email devuelto es exactamente el `sub` del token, y el token emitido por un login con el email en otra capitalización (`USER@TEST.COM` sobre un usuario registrado como `user@test.com`) resuelve al email normalizado `user@test.com`. Ancla los escenarios "El email devuelto es exactamente el sujeto del token" y "El email devuelto es el normalizado que persiste el sistema".
- [x] 3.4 RED — token inválido: invocar la dependencia con un token malformado debe lanzar `HTTPException` con `status_code == 401` (D-2). RED actual: devuelve `None` en vez de lanzar.
- [x] 3.5 GREEN — agregar la única rama del cuerpo: `if token_data.email is None: raise HTTPException(401, detail=<constante>, headers={"WWW-Authenticate": ...})` (D-2, D-3, D-4). Declarar los dos literales de `detail` y las dos formas del desafío como constantes de módulo, no en línea.
- [x] 3.6 TRIANGULATE — los otros tres motivos de rechazo con token presente, cada uno construido explícitamente: firmado con otra clave (`create_access_token` con un `Settings` de otra `JWT_SECRET`), vencido (`expires_delta` negativo — **no** un `sleep`, ver `design.md` §Risks) y sin `sub` (`jwt.encode` directo con un payload sin ese claim). Los tres lanzan `HTTPException(401)`.
- [x] 3.7 TRIANGULATE — `token=None` (lo que entrega `oauth2_scheme` con `auto_error=False` cuando no hay header o el esquema no es `Bearer`) también lanza `HTTPException(401)`, con el desafío **sin** parámetro de error (D-3). Es la rama que sólo existe por D-1.
- [x] 3.8 TRIANGULATE — la configuración es efectivamente la inyectada (D-7): un token emitido con una `Settings` se rechaza al validarlo con otra de distinta `JWT_SECRET`. Ancla el escenario "Sustituir la configuración cambia qué tokens se aceptan".
- [x] 3.9 TRIANGULATE — sin persistencia (D-5): la dependencia resuelve un token cuyo `sub` es un email que no existe en ninguna tabla, y lo hace sin ninguna base configurada ni alcanzable. Ancla los escenarios "Resolución sin base de datos disponible" y "Un email que no corresponde a ninguna fila igual se resuelve".
- [x] 3.10 REFACTOR — reescribir el docstring de `core/dependencies.py`: qué hace `get_current_user`, por qué `auto_error=False` (D-1), por qué `HTTPException` y no un error de dominio (D-2), por qué no consulta la base y qué implica eso si algún día hay baja de usuarios (D-5, §Risks), y la nota heredada de CHANGE-05 D-4 sobre el botón "Authorize" de `/docs` (D-13). Conservar la parte del docstring que documenta `get_auth_service`.

## 4. Camino feliz sobre HTTP real — ruta sonda (D-11)

- [x] 4.1 RED — agregar al mismo módulo de tests una fixture que construya `create_app()` y le registre **en el test** una ruta sonda `GET /_probe` anotada con `Depends(get_current_user)` que devuelva el email recibido, ejercitada con `httpx.ASGITransport` (que no dispara el `lifespan`). Primer test: la sonda con un `Authorization: Bearer <token válido>` devuelve `200` y el email en el cuerpo.
- [x] 4.2 GREEN — ajustar lo mínimo que haga falta para que la ruta sonda resuelva (típicamente nada de producción: el grupo 3 ya dejó la dependencia funcionando; si algo falla acá es cableado de la fixture).
- [x] 4.3 TRIANGULATE — el `Settings` que usa la ruta sonda es sustituible: `app.dependency_overrides[get_settings]` con una `JWT_SECRET` de prueba hace que la sonda acepte tokens emitidos con esa clave y rechace los de la clave por defecto.
- [x] 4.4 TRIANGULATE — el esquema de autorización se compara sin distinguir mayúsculas (`bearer` en minúscula también funciona), tal como resuelve `get_authorization_scheme_param`. Documenta el comportamiento real del borde en vez de asumirlo.

## 5. La forma del rechazo sobre HTTP (D-2, D-3, D-4)

- [x] 5.1 RED/GREEN — sonda **sin** header `Authorization`: `401`, `Content-Type: application/problem+json`, cuerpo con `type`/`title`/`status`/`detail`/`instance`, `status == 401` e `instance == "/_probe"`. Es la primera condición de aceptación de CHANGE-06.
- [x] 5.2 TRIANGULATE — sonda con `Authorization: Basic <lo que sea>`: mismo `401` que 5.1, byte por byte. Es el caso que sólo `auto_error=False` deja bajo control (D-1); si el usuario eligió `auto_error=True` en el checkpoint, esta tarea no aplica (ver 2.1).
- [x] 5.3 TRIANGULATE — sonda con token malformado, con token firmado con otra clave y con token vencido: los tres devuelven `401` RFC 7807. Son las condiciones de aceptación 2, 3 y 4 de CHANGE-06.
- [x] 5.4 TRIANGULATE — **el test de mayor valor del change**: comparar los cuerpos **completos** de los cuatro rechazos con token presente (malformado, otra clave, vencido, sin `sub`) y exigir igualdad campo por campo, más igualdad del header `WWW-Authenticate`. Ancla el requisito "Los rechazos de un token presente son indistinguibles entre sí" y el escenario "Un rechazo futuro más informativo rompe la suite".
- [x] 5.5 TRIANGULATE — el desafío sigue RFC 6750 (D-3): sin credenciales → `WWW-Authenticate: Bearer` **sin** parámetro de error; con token inválido → con el código `invalid_token`; en ningún caso aparece `error_description`. Verifica además que el header sobrevive a la traducción a problem details y que el `Content-Type` sigue siendo `application/problem+json` (escenario "El desafío sobrevive al formato de problem details").
- [x] 5.6 TRIANGULATE — nada del token presentado aparece en la respuesta: ni el token entero ni ninguno de sus tres segmentos figuran en el cuerpo ni en ningún header. Ídem el nombre de cualquier excepción de `jose` y cualquier traza.
- [x] 5.7 TRIANGULATE — la operación protegida **no se ejecuta** ante un rechazo: la ruta sonda incrementa un contador en su cuerpo; tras los seis casos de rechazo el contador sigue en cero. Ancla el escenario "La operación protegida no llega a ejecutarse".
- [x] 5.8 TRIANGULATE — con `caplog`, ningún registro emitido durante un rechazo contiene el token presentado, y ninguno emitido durante un acceso exitoso contiene el email resuelto (requisito "El rechazo no deja rastro del material sensible").

## 6. Sustituibilidad, alias y documentación OpenAPI (D-6, D-13)

- [x] 6.1 RED — declarar y exportar `CurrentUserEmail = Annotated[str, Depends(get_current_user)]` en `core/dependencies.py` (D-6). Test: una ruta sonda anotada `user_email: CurrentUserEmail` se comporta igual que la anotada con `Depends(get_current_user)` explícito.
- [x] 6.2 TRIANGULATE — `app.dependency_overrides[get_current_user]` devolviendo un email fijo hace que la sonda responda `200` **sin ningún header de autorización**. Es exactamente lo que CHANGE-12 necesita para probar `/scan/start` sin emitir tokens.
- [x] 6.3 TRIANGULATE — `oauth2_scheme` y `get_current_user` son piezas distintas: una sonda anotada con `Depends(oauth2_scheme)` recibe el **token en crudo sin validar** y la anotada con `CurrentUserEmail` recibe el email validado. El test documenta por qué el alias existe (evitar que un router futuro declare el extractor por error).
- [x] 6.4 TRIANGULATE — `oauth2_scheme.model.flows.password.tokenUrl` (o el atributo equivalente de esta versión) es `/api/v1/auth/login`, y esa ruta existe en la app de producción. Ancla el escenario "La URL de obtención de token apunta a una ruta real".
- [x] 6.5 TRIANGULATE — el esquema generado de la app **con** la ruta sonda declara el requisito de seguridad en esa operación y lista el esquema `bearer` en `components.securitySchemes`. Confirma de paso la verificación de 1.4: `auto_error=False` no impide la declaración.

## 7. Anclajes estructurales (D-10, D-12)

- [x] 7.1 RED/GREEN — test AST sobre `core/dependencies.py` en `tests/test_layer_boundaries.py` (reutilizando `get_imported_top_level_modules` y el helper `_parse`): el módulo **no** importa `jose` y **no** contiene ningún `ast.Try`. Es el ancla de D-10 y D-12.
- [x] 7.2 TRIANGULATE — el módulo tampoco importa `sqlalchemy` **dentro de `get_current_user`**: verificar por AST que la función no referencia `AuthUoW`, `get_session_factory` ni `UserRepository` (el módulo sí importa `get_session_factory` para `get_auth_service`, así que el aserto es sobre el cuerpo de la función, no sobre los imports del archivo). Ancla el escenario "Sin sesión, Unit of Work ni repositorio".
- [x] 7.3 TRIANGULATE — el módulo no llama a `logging` ni construye un `logger`, y `get_current_user` no invoca `get_settings()` en su cuerpo (sólo lo declara por `Depends`). Ancla los escenarios "Sin registro del token" y "La configuración es un parámetro inyectado" desde el código, no sólo desde el comportamiento.
- [x] 7.4 TRIANGULATE — los dos `detail` y las dos formas del desafío son constantes de módulo, no literales dentro de la función: test AST que verifica que el cuerpo de `get_current_user` no contiene literales de string más allá de los nombres de headers. Ancla "El detalle del rechazo es una constante".
- [x] 7.5 Documentar en `tests/test_layer_boundaries.py`, con un comentario junto al test nuevo, por qué **no** se agrega `("core", "jose")` a `LAYER_IMPORT_RULES` (aplicaría a todo `core/` y rompería `core/security.py`) — mismo precedente ya documentado ahí para `exceptions/` en CHANGE-07 §8.6.

## 8. Regresión de superficie de API (D-11)

- [x] 8.1 RED/GREEN — test sobre la app **de producción** (`create_app()` sin ruta sonda): las rutas de aplicación registradas siguen siendo exactamente `GET /health`, `POST /api/v1/auth/register` y `POST /api/v1/auth/login`, leídas desde `app.openapi()["paths"]` (no desde `app.routes`, por el `include_router` perezoso de esta versión de FastAPI — ver CHANGE-05 §4.7).
- [x] 8.2 TRIANGULATE — `POST /api/v1/scan/start` sigue devolviendo `404` (escenario "El disparo de escaneos sigue sin montarse"), y `GET /health`, `POST /api/v1/auth/register` y `POST /api/v1/auth/login` siguen respondiendo **sin** header `Authorization`, ninguno con `401` (escenario "Las rutas públicas siguen siendo públicas").
- [x] 8.3 TRIANGULATE — el esquema generado de la app de producción no marca ninguna operación como protegida: ninguna de las tres rutas existentes declara requisito de seguridad. Ancla "Declarar el esquema no protege nada por sí solo".

## 9. Cierre

- [x] 9.1 Correr la suite completa y comparar con el baseline de 1.1: cero regresiones, y sólo tests nuevos agregados (este change no reescribe ningún test existente). Registrar el número final.
- [x] 9.2 REFACTOR — revisar el docstring de `api/v1/scan/router.py`, que ya anuncia `Depends(get_current_user)` como responsabilidad futura: confirmar que la firma que describe coincide con la implementada, y ajustarlo si el checkpoint cambió algo (p. ej. si D-5 quedó con `AuthUoW`).
- [x] 9.3 Verificar manualmente `/docs` sobre la app de producción: ninguna operación muestra candado y el botón "Authorize" no aparece asociado a ninguna ruta, porque todavía ninguna declara la dependencia. Es la confirmación visual de que este change no cambió la superficie.
- [x] 9.4 Correr `openspec validate jwt-dependency --strict` y confirmar que sigue en verde tras cualquier ajuste de specs hecho en el grupo 2.
- [x] 9.5 Marcar `[CHANGE-06] jwt-dependency` como completado en `CHANGES.md`, marcar sus cinco criterios de aceptación y anotar el traspaso a **CHANGE-12** (usar `user_email: CurrentUserEmail`, no `Depends(oauth2_scheme)`; sustituir `get_current_user` con `dependency_overrides` en los tests de `/scan/start`; el `401` sale con `type: about:blank` y desafío `WWW-Authenticate`, salvo que el checkpoint haya elegido la alternativa de D-2) y a **CHANGE-17** (el interceptor de Axios distingue "sin sesión" de "sesión vencida" por el parámetro `invalid_token` del desafío, no por el cuerpo, que es idéntico en todos los rechazos con token presente).
