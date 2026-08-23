## Context

**Estado actual.** Las cuatro capas de auth ya existen y están probadas de forma aislada: `UserRepository` (CHANGE-03), `AuthUoW` (CHANGE-04), `AuthService.register`/`login` (CHANGE-04) y los cinco handlers RFC 7807 (CHANGE-07). Lo único que falta es la capa de transporte: `api/v1/auth/router.py` declara un `APIRouter(prefix="/api/v1/auth", tags=["auth"])` **sin ninguna operación**, y `main.py` no lo monta. El contrato vigente —anclado por dos tests— es que `POST /api/v1/auth/register` responde 404.

**Lo que este change agrega es cableado, no lógica.** Todas las decisiones de negocio (hashing, indistinguibilidad del 401, señuelo temporal, límite transaccional, mapeo de errores a estados HTTP) ya están tomadas y ancladas por tests en changes anteriores. Este change decide únicamente: qué rutas existen, con qué códigos de estado, cómo llega el `AuthService` al handler de la ruta, y qué ve el consumidor en `/docs`.

**Restricciones que enmarcan el diseño:**

1. **Regla dura del proyecto**: el Router NUNCA contiene lógica de negocio; sólo orquesta `Depends` y llama al Service. En la práctica esto significa: sin `try/except`, sin `HTTPException` construida a mano, sin validaciones propias, sin ramas.
2. **Regla dura del proyecto**: ningún error de la API sale fuera de RFC 7807. Los handlers globales ya lo garantizan **si** el router deja propagar las excepciones en vez de traducirlas por su cuenta.
3. **Regla dura del proyecto**: nada de configuración hardcodeada; todo por `core/settings.py`.
4. **`LAYER_IMPORT_RULES`** (`tests/test_layer_boundaries.py`) prohíbe `sqlalchemy` y `httpx` en **todo** el árbol `api/`, de forma recursiva. Cualquier módulo nuevo bajo `api/` hereda esa prohibición.
5. **`api-edge-security` (CHANGE-00d)** ya especifica —y `test_edge_policy_exclusions.py` ya ancla con un stub— que el cupo de rate limit alcanza sólo al disparo de escaneos, y que auth queda excluido. Este change materializa esa exclusión con endpoints reales.
6. **`bridge-bootstrap` (CHANGE-00a)** especifica que la superficie es sólo `/health`. Este change es el que rompe ese requisito, deliberadamente.
7. **Governance: MEDIUM.** `CHANGES.md` marca CHANGE-05 como CRÍTICO; el `CLAUDE.md` del proyecto baja explícitamente todo el dominio Auth (CHANGE-01..07) a MEDIO por decisión del usuario. Se implementa en pasos, surfaceando las decisiones no obvias antes de codear (checkpoint en la tarea 1.4).
8. **Strict TDD** activo: cada operación arranca por un test que falla.

## Goals / Non-Goals

**Goals:**

- Exponer `POST /api/v1/auth/register` (201) y `POST /api/v1/auth/login` (200), ambas devolviendo `TokenResponse`.
- Cablear `AuthService` al router por `Depends`, sin que el router conozca `AuthUoW`, la factory de sesiones ni `Settings`.
- Que los seis criterios de aceptación de CHANGE-05 queden anclados por tests de extremo a extremo del proceso (ASGI in-process), no por inspección de código.
- Que las respuestas de error de ambas rutas salgan en RFC 7807 **sin una sola línea de manejo de errores en el router**.
- Que `/docs` documente el contrato real, incluidos los errores.
- Dejar el contrato de superficie de API actualizado en los specs (`bridge-bootstrap`, `api-edge-security`) en vez de dejar dos requisitos mintiendo.

**Non-Goals:**

- `get_current_user` y la protección de rutas por JWT — es CHANGE-06.
- Montar el router de scan — es CHANGE-12; sigue respondiendo 404 al terminar este change.
- Refresh tokens, logout, recuperación de contraseña, verificación de email — fuera del alcance v1.2 (`01_vision_y_objetivos.md`).
- Rate limiting sobre auth (ver D-6), CAPTCHA, bloqueo por intentos fallidos.
- Cualquier cambio en `AuthService`, `AuthUoW`, `UserRepository`, los schemas o los handlers. Si una tarea parece necesitar tocar esas capas, es señal de que el router se está quedando con lógica que no le toca.

## Decisions

### D-1 — `get_auth_service` vive en `core/dependencies.py`, no bajo `api/` ⚠ REVISIÓN

**Decisión.** El proveedor que compone `AuthService(AuthUoW(get_session_factory(settings)))` se declara en `fastapi_bridge/core/dependencies.py`, junto a donde CHANGE-06 pondrá `get_current_user`. El router importa un solo nombre (`get_auth_service`) y nada más.

**Por qué.** La restricción 4 prohíbe `sqlalchemy` en todo `api/`. La composición necesita `get_session_factory`, que es la puerta a SQLAlchemy: aunque el import concreto sea `from fastapi_bridge.db.session import get_session_factory` —y por lo tanto el test AST (que mira el módulo de nivel superior, `fastapi_bridge`) no lo detecte—, poner la composición bajo `api/` haría que la capa de transporte conociera el cableado de persistencia. Que el test no lo atrape no lo vuelve correcto. En `core/dependencies.py` el router queda con exactamente cero conocimiento de cómo se construye su servicio.

**Alternativa considerada.** `api/v1/auth/dependencies.py` (convención habitual de FastAPI: `api/deps.py`). Se descarta por lo anterior, y porque `get_current_user` —que CHANGE-06 pondrá en `core/dependencies.py` y CHANGE-12 usará desde el router de **scan**— ya establece que ese módulo es el sitio de las dependencias compartidas entre dominios. Tener dos convenciones distintas para dos dependencias del mismo router es peor que la ligera impureza de que `core/` importe de `services/`.

**Consecuencia.** El docstring actual de `core/dependencies.py` (que dice que el módulo es sólo para `get_current_user` y que se implementa en CHANGE-06) queda desactualizado y se reescribe en este change.

### D-2 — El router no captura errores de dominio

**Decisión.** Ninguna de las dos operaciones lleva `try/except`. `EmailAlreadyExistsError` e `InvalidCredentialsError` se propagan desde el `AuthService` hasta `domain_error_handler`, registrado en `create_app()` sobre la base `DomainError`.

**Por qué.** Es la forma concreta que toma la regla dura "el Router nunca contiene lógica de negocio" para el caso de los errores. `_DOMAIN_ERROR_MAP` (CHANGE-07) ya es el único lugar del proyecto donde vive la traducción error de dominio → estado HTTP; capturar en el router y relanzar una `HTTPException(409)` duplicaría esa tabla en cada ruta y garantizaría que las dos copias se desincronicen. Además, un `try/except` en el router volvería opcional lo que hoy es estructural: el 409 y el 401 salen en RFC 7807 porque **nadie** los intercepta antes del handler.

**Alternativa considerada.** Capturar y relanzar `HTTPException` con el estado correcto (patrón muy común en tutoriales de FastAPI). Se descarta: reintroduce la lógica de mapeo en la capa equivocada y hace que el `detail` del problema se componga en dos lugares.

**Anclaje.** Un test AST sobre `api/v1/auth/router.py` afirma que el módulo no contiene `try`/`except` ni construye `HTTPException`. Sin ese test, un change futuro "arregla" el router agregando un `except` y nadie se entera hasta que un 409 sale como `{"detail": "..."}`.

### D-3 — 201 en registro, 200 en login

**Decisión.** `POST /register` declara `status_code=status.HTTP_201_CREATED`; `POST /login` usa el 200 por defecto. Ambas devuelven el mismo `TokenResponse`.

**Por qué.** El registro **crea** un recurso (la fila de `users`); el login no crea nada — es una verificación de credenciales que emite un token. Es además lo que fija `CHANGES.md` y lo que la HU-03-01 declara como criterio de aceptación. No se emite header `Location`: el recurso creado (`/users/{id}`) no tiene representación expuesta por esta API, y RFC 9110 no obliga a `Location` en un 201.

**Alternativa considerada.** 200 en ambas, por simetría de la respuesta. Se descarta: la simetría del cuerpo no es simetría de la semántica, y el 201 es el criterio de aceptación explícito del roadmap.

### D-4 — Cuerpo JSON (`UserRegister`/`UserLogin`), no `OAuth2PasswordRequestForm` ⚠ REVISIÓN

**Decisión.** Ambas rutas reciben un cuerpo JSON validado por los schemas Pydantic de CHANGE-02. No se usa `OAuth2PasswordRequestForm` (`application/x-www-form-urlencoded` con campos `username`/`password`).

**Por qué.** El flujo 2 de `07_flujos_principales.md` y el contrato del frontend (Axios + Zod, CHANGE-14/16) son JSON con campo `email`. `OAuth2PasswordRequestForm` obligaría a renombrar `email` a `username` en el borde y a que el frontend mande un form-encoded, y desactivaría toda la validación que `UserRegister` ya codifica (RN-WS-15, techo de 72 bytes de bcrypt).

**Consecuencia para CHANGE-06.** `OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")` seguirá siendo válido —`tokenUrl` sólo alimenta el botón "Authorize" de `/docs`—, pero ese botón **no** funcionará contra un endpoint que espera JSON. Es un detalle de la UI de la documentación, no del contrato de la API; se anota acá para que CHANGE-06 no lo descubra como un bug. La alternativa (adoptar el form estándar sólo para que ese botón funcione) le impondría al cliente real la forma de una herramienta de desarrollo.

### D-5 — El token viaja en el cuerpo como Bearer, no en una cookie ⚠ REVISIÓN

**Decisión.** La respuesta es `TokenResponse` en el cuerpo (`access_token`, `token_type: "bearer"`, `expires_in`). No se emite `Set-Cookie`, ni `HttpOnly`, ni `SameSite`.

**Por qué.** Ya está decidido aguas arriba y este change sólo lo materializa: `api-edge-security` especifica `allow_credentials=False` "porque la autenticación del sistema viaja como token Bearer en el header `Authorization` y no como cookie"; el flujo 1 termina en `authStore.login(token)` guardando en localStorage; y `TokenResponse` (CHANGE-02) es el contrato de salida de ambas operaciones. Cambiarlo acá obligaría a revisar CORS, el interceptor de Axios y el `authStore`.

**Trade-off que se acepta explícitamente.** Un token en localStorage es legible por cualquier XSS en la landing; una cookie `HttpOnly` no lo sería (a cambio de exigir protección CSRF y `allow_credentials=True`). Para el alcance de este proyecto —una landing sin contenido de terceros ni HTML generado por usuarios, y un token de 24h sin refresh— el vector XSS es acotado, pero **la decisión merece una confirmación explícita del usuario**, porque es la única de este change que no se puede revertir sin tocar frontend, CORS y specs a la vez.

### D-6 — Sin rate limiting sobre `/register` ni `/login` ⚠ REVISIÓN

**Decisión.** Ninguna de las dos rutas lleva el decorador `scan_rate_limit`. Se mantiene tal cual el requisito "El límite de escaneos no alcanza a los demás endpoints" de `api-edge-security`.

**Por qué.** Es la decisión ya especificada por CHANGE-00d, y su motivo sigue vigente: un usuario que agotó su cupo de escaneos debe poder seguir autenticándose. `scan_rate_limit` está calibrado con `RATE_LIMIT_REQUESTS`/`RATE_LIMIT_WINDOW` (10 por hora, pensados para escaneos, no para logins) y comparte contador: aplicarlo a login haría que dos intentos de contraseña equivocada consumieran cupo de escaneo.

**Riesgo que esto deja abierto.** `POST /login` queda como un oráculo de contraseñas sin límite de intentos, y `POST /register` permite crear usuarios en volumen. Lo que mitiga el primero es el coste de bcrypt (12 rondas ≈ cientos de ms por intento) y la indistinguibilidad de CHANGE-04; ninguna de las dos cosas es un límite de tasa. Un cupo propio para auth (p. ej. `AUTH_RATE_LIMIT_REQUESTS` sobre un contador separado) es la mitigación correcta, pero implica configuración nueva, un delta sobre `api-edge-security` y un `Limiter` con dos políticas — es un change propio, no un agregado silencioso a éste. **Se surfacea al usuario**: si prefiere incluirlo, entra acá y el alcance del change crece; si no, queda registrado como deuda consciente.

### D-7 — Las respuestas de error se declaran en OpenAPI con `ErrorDetail`

**Decisión.** Cada ruta declara `responses={...}` con el modelo `ErrorDetail` (`schemas/error_schemas.py`) y el media type `application/problem+json`: `409` y `422` en registro, `401` y `422` en login.

**Por qué.** Sin esto, FastAPI documenta un `422` con su `HTTPValidationError` propio —una forma que este proyecto **no** emite, porque `request_validation_exception_handler` la reemplaza por RFC 7807— y no documenta el 409 ni el 401 en absoluto. El criterio de aceptación "los endpoints aparecen en `/docs` con sus schemas correctos" no se cumple con el default. Es declaración pura (metadatos del decorador), no lógica: no agrega ramas al handler.

**Alternativa considerada.** Un `responses` global en `include_router` o en la app. Se descarta: el 409 aplica a registro y el 401 a login, no a ambos; declararlos globalmente documentaría respuestas que una de las rutas nunca emite.

### D-8 — Una instancia de `AuthService` por petición

**Decisión.** `get_auth_service` construye `AuthUoW` y `AuthService` nuevos en cada petición. No se guarda un singleton en `app.state` ni se usa `lru_cache`.

**Por qué.** El coste es nulo: `get_session_factory` está cacheada por `DB_URL` (`lru_cache` en `db/session.py`), así que no se crea un engine ni se abre una conexión al construir — la conexión ocurre recién cuando la UoW ejecuta su primera sentencia. Y una instancia por petición hace estructuralmente imposible que el estado de una petición se filtre a otra, sin depender de que `AuthUoW.__aenter__` siga abriendo sesión nueva cada vez (que hoy lo hace, y que además está anclado por un test de CHANGE-04, pero no hace falta apoyarse en eso).

### D-9 — Los tests del router sustituyen `get_auth_service`, no la base de datos

**Decisión.** Los tests construyen la app con `create_app()` y hacen `app.dependency_overrides[get_auth_service] = ...` devolviendo un `AuthService` sobre la fixture `user_session_factory` (SQLite en memoria, sólo `User.__table__`). Se ejercita con `httpx.ASGITransport`, que **no** dispara el `lifespan`.

**Por qué.** Es el mismo criterio que CHANGE-03/04: ningún test puede apuntar por accidente a `db_fuzzing`. Sustituir la dependencia —en vez de parchear `get_session_factory` o `Settings`— ejercita el camino real completo (router → service → uow → repository → base) contra un motor descartable, y de paso deja probado que el `Depends` es sustituible, que es exactamente lo que necesitan CHANGE-06 y CHANGE-12.

**Consecuencia.** Los tests de este change no requieren PostgreSQL levantado. El único camino que no cubren es el `lifespan` real, que ya tiene sus propios tests (`test_main_lifespan.py`).

### D-10 — `response_model` explícito además del type hint de retorno

**Decisión.** Cada operación declara `response_model=TokenResponse` en el decorador **y** anota `-> TokenResponse` en la firma.

**Por qué.** El type hint cumple la regla dura de tipado del proyecto; `response_model` es lo que hace que FastAPI filtre la salida contra el schema declarado. Con ambos, si un refactor futuro hiciera que el servicio devolviera un objeto con campos de más (por ejemplo, algo que lleve el hash), FastAPI lo recorta antes de serializar: es una segunda red sobre RN-WS-12, barata y declarativa.

### D-11 — El router no registra nada en logs

**Decisión.** Ninguna de las dos operaciones llama a `logging`. El único registro del camino de error es el que ya hace `unhandled_exception_handler` para los 500.

**Por qué.** Un log en el router de auth sólo puede registrar lo que recibió: el email y —si alguien no tiene cuidado— el cuerpo entero, que contiene la contraseña en texto plano. `auth-session` (CHANGE-04) ya prohíbe registrar el email en el camino de rechazo del login, porque eso convierte el log en la lista de emails probados; la misma prohibición aplica una capa más arriba, donde además está la contraseña. Anclado con el mismo tipo de test AST que usa CHANGE-04.

### D-12 — El prefijo se declara una sola vez, en el `APIRouter`

**Decisión.** `include_router(auth_router)` sin argumento `prefix`. El prefijo `/api/v1/auth` sigue viviendo donde ya está: en la construcción del `APIRouter` (CHANGE-00a).

**Por qué.** Pasar `prefix` en ambos lados produce `/api/v1/auth/api/v1/auth/register`, un fallo que se manifiesta como un 404 confuso. Una sola declaración, anclada por un test que afirma las rutas exactas presentes en `app.routes`.

## Risks / Trade-offs

- **[Los dos tests que anclan el 404 de auth van a fallar]** → No es un daño colateral: es el contrato viejo. Se reescriben dentro de este change, junto con los deltas de `bridge-bootstrap` y `api-edge-security`, en la misma tarea. El aserto de scan (404) se **conserva** en ambos: sigue siendo cierto hasta CHANGE-12, y es lo que impide que este change monte de más.
- **[`UserRegister` declara `extra="forbid"`; el formulario del frontend tiene `confirmPassword`]** → Si CHANGE-16 manda el objeto del formulario tal cual, el backend responde 422 por un campo que la UI necesita y la API no. No se relaja `extra="forbid"` (es una defensa deliberada de CHANGE-02): se agrega un test que documenta explícitamente el 422 ante un campo extra, y se anota el requisito para CHANGE-16 — el cliente manda `{email, password}`, no el formulario completo. Descubrirlo acá, con un test que lo dice, cuesta mucho menos que descubrirlo integrando.
- **[Un `DomainError` futuro sin fila en `_DOMAIN_ERROR_MAP` sale como 500 desde estas rutas]** → Es el comportamiento diseñado en CHANGE-07 (un error de negocio que la capa web no sabe traducir es un defecto del servidor). Las dos excepciones que estas rutas pueden producir hoy están mapeadas; se agrega un test que lo verifica desde el borde HTTP, no sólo desde el handler.
- **[Montar el router hace que el arranque real dependa de `db_fuzzing`]** → Ya era así desde CHANGE-01 (el `lifespan` crea `users`). Lo que cambia es la visibilidad: antes un fallo de base se veía sólo en el arranque; ahora también en un 500 de `/register`. `GET /health` sigue sin consultar la base, así que el liveness del proceso no se degrada.
- **[Sin límite de intentos, `/login` es un oráculo de contraseñas]** → Ver D-6. Mitigación parcial vigente: coste de bcrypt y respuesta indistinguible. Mitigación real: cupo propio para auth, pendiente de la decisión del usuario en el checkpoint.
- **[El botón "Authorize" de `/docs` no va a funcionar tras CHANGE-06]** → Ver D-4. Se documenta en el docstring del router para que no se lea como un bug. Los endpoints en sí quedan probables desde `/docs` con "Try it out", que sí manda JSON.

## Migration Plan

No hay migración de datos ni de esquema: el change no toca la base. El despliegue es el propio arranque del servicio con el router montado.

- **Adelante**: `include_router` en `create_app()`. Desde el primer arranque, `/api/v1/auth/register` y `/api/v1/auth/login` pasan de 404 a operativos. No hay estado previo que convertir; ningún cliente dependía del 404.
- **Atrás**: quitar la línea de `include_router` restituye exactamente el comportamiento anterior (404 en ambas). Nada persistido queda inconsistente — los usuarios creados durante la ventana siguen siendo válidos, porque la tabla `users` y el formato del hash no cambian.
- **Orden dentro del change**: la dependencia `get_auth_service` se implementa y prueba primero, a nivel unitario, sin HTTP de por medio. Recién después entra la primera operación, y el `include_router` es parte de su paso GREEN: una ruta declarada en un router sin montar es indistinguible de una ruta inexistente (404 en ambos casos), así que no hay forma de probar la operación antes de montar. En esa misma tarea se actualizan los dos tests que anclaban el 404 de auth, para que la suite nunca quede afirmando dos contratos incompatibles a la vez.

## Open Questions

1. **D-5 (token en cuerpo vs cookie `HttpOnly`)** — recomendación: mantener Bearer en el cuerpo, por coherencia con CORS, `authStore` y `TokenResponse` ya especificados. Requiere confirmación explícita del usuario por ser la decisión de seguridad menos reversible del change.
2. **D-6 (rate limiting sobre auth)** — recomendación: **no** incluirlo en este change; registrarlo como deuda consciente y, si el usuario lo quiere, abrirlo como change propio con su propia configuración y su delta sobre `api-edge-security`. Alternativa si el usuario prefiere cerrarlo ya: agregar `AUTH_RATE_LIMIT_REQUESTS`/`AUTH_RATE_LIMIT_WINDOW` a `Settings` y un decorador `auth_rate_limit` con contador separado — crece el alcance de CHANGE-05.
3. **D-1 (ubicación de `get_auth_service`)** — recomendación: `core/dependencies.py`. Es reversible sin costo (mover una función y un import) mientras nadie más la consuma; la decisión se toma ahora sólo para que CHANGE-06 y CHANGE-12 encuentren un único lugar donde buscar.
4. **D-4 (JSON vs `OAuth2PasswordRequestForm`)** — recomendación: JSON. Nota documental para CHANGE-06: el `tokenUrl` seguirá apuntando a `/api/v1/auth/login` y sólo alimenta el botón "Authorize" de la documentación, que no funcionará contra un endpoint JSON.
5. **Nota documental (no bloquea)**: `knowledge-base/07_flujos_principales.md` §Flujo 1 describe el paso 4 como "`AuthService` verifica email no duplicado (`UserRepository.get_by_email`)" y el caso de error de contraseña corta como "400 (Pydantic)". Ambas cosas quedaron superadas: CHANGE-04 D-10 eliminó la pre-consulta de existencia (la unicidad la garantiza la constraint del motor) y CHANGE-07 D-2 fijó 422 para un cuerpo JSON válido que viola el schema. No se reescribe la KB dentro de este change (mismo precedente que CHANGE-02 §8.1 y CHANGE-04 §6); queda anotado para quien la actualice.
