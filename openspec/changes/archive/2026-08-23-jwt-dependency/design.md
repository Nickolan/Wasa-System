## Context

**Estado actual.** Todo lo que este change necesita ya existe y está probado:

- `core/security.py::decode_access_token(token, settings) -> TokenData` (CHANGE-04) valida firma, algoritmo (lista explícita `["HS256"]`, defensa contra `alg: none`) y vencimiento. **Nunca lanza** (D-7 de CHANGE-04): cualquier token inválido, vencido, manipulado, firmado con otra clave o sin `sub` devuelve `TokenData(email=None)`. Esa garantía —anclada por seis escenarios de la capability `access-token`— es la base sobre la que esta dependencia responde 401 sin un `try/except` propio.
- `core/dependencies.py` ya existe con `get_auth_service` (CHANGE-05, D-1), y su docstring ya reserva explícitamente el lugar para `get_current_user`.
- `exceptions/handlers.py::http_exception_handler` (CHANGE-07, D-3) está registrado en `create_app()` sobre `starlette.exceptions.HTTPException` —la clase **base**, de la que `fastapi.HTTPException` es subclase—, traduce cualquier `HTTPException` a RFC 7807 y **traslada sus headers** a la respuesta (salvo `Content-Type`). Un 401 con `WWW-Authenticate` sale entonces como problem details **conservando el desafío**, sin que este change agregue un handler.
- `POST /api/v1/auth/login` (CHANGE-05) existe y emite los tokens, así que el `tokenUrl` del esquema apunta a una ruta real.

**Lo que falta es exclusivamente la pieza de transporte**: nadie consume un token. `api/v1/scan/router.py` no tiene operaciones y no está montado.

**Restricciones que enmarcan el diseño:**

1. **RN-WS-11**: `POST /api/v1/scan/start` requiere JWT válido en `Authorization`; sin él, 401. **RN-WS-14**: los tokens expiran (default 24h) y al expirar el frontend limpia el `authStore`.
2. **RBAC binario** (`03_actores_y_roles.md`): no hay roles dentro de "usuario registrado". La única pregunta que esta dependencia responde es *"¿quién es?"*, nunca *"¿qué puede hacer?"*. No hay scopes, ni claims de rol, ni matriz de permisos que consultar.
3. **Regla dura**: ningún error de la API sale fuera de RFC 7807 — todos pasan por `exceptions/handlers.py`.
4. **Regla dura**: nada de configuración hardcodeada; todo por `core/settings.py`.
5. **`bridge-bootstrap` §Fronteras de import entre capas**: la criptografía del servicio está concentrada en `core/security.py`. `core/dependencies.py` vive en el mismo directorio que `security.py`, así que **no** puede anclarse con una fila de `LAYER_IMPORT_RULES` (que aplica por directorio completo y rompería `security.py`) — mismo caso ya resuelto para `exceptions/` en CHANGE-07 §8.6.
6. **`bridge-bootstrap` §Superficie de API expuesta**: montar un router es una decisión explícita del change que implementa sus operaciones, **nunca un efecto colateral de otro change**. Este change no puede montar scan para poder probarse.
7. **Governance: MEDIUM.** `CHANGES.md` marca CHANGE-06 como CRÍTICO; el `CLAUDE.md` del proyecto baja explícitamente todo el dominio Auth (CHANGE-01..07) a MEDIO por decisión del usuario. Se implementa en pasos, surfaceando las decisiones no obvias antes de codear (checkpoint en la tarea 1.5).
8. **Strict TDD** activo: cada pieza arranca por un test que falla.

## Goals / Non-Goals

**Goals:**

- Convertir un header `Authorization: Bearer <jwt>` válido en el email del usuario autenticado, disponible para cualquier ruta por una sola anotación.
- Que **todo** rechazo salga como `401` RFC 7807 con desafío `WWW-Authenticate`, sin una línea de manejo de errores propia y sin que el motivo del rechazo llegue al cliente.
- Que las cinco condiciones de aceptación de CHANGE-06 queden ancladas por tests contra HTTP real (ASGI in-process), no por inspección de código.
- Dejar la dependencia sustituible por `dependency_overrides`, para que CHANGE-12 pruebe `/scan/start` sin emitir tokens reales.
- Dejar la superficie de API exactamente como estaba: `/scan/start` sigue en 404.

**Non-Goals:**

- Montar `POST /api/v1/scan/start` ni protegerla — es CHANGE-12. Este change entrega la herramienta, no su primer uso en producción.
- Roles, scopes o permisos por recurso — el RBAC del proyecto es binario (restricción 2).
- Refresh tokens, logout del lado servidor, revocación, lista negra de tokens — fuera del alcance v1.2 (`01_vision_y_objetivos.md`).
- Rate limiting sobre rutas protegidas — ya especificado en `api-edge-security` y aplicado por CHANGE-12.
- Cualquier cambio en `core/security.py`. Si una tarea parece necesitar tocarlo, es señal de que la dependencia se está quedando con criptografía que no le toca.

## Decisions

### D-1 — `oauth2_scheme` se declara con `auto_error=False` ⚠ REVISIÓN

**Decisión.** `oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)`. La firma queda `get_current_user(token: Annotated[str | None, Depends(oauth2_scheme)], settings: ...)`, y `get_current_user` es quien lanza el 401 también cuando no llegó ningún token.

**Por qué.** Con el default `auto_error=True`, la clase lanza **su propia** `HTTPException(401, detail="Not authenticated", headers={"WWW-Authenticate": "Bearer"})` antes de que nuestro código corra (verificado en `fastapi/security/oauth2.py` de la versión instalada). Eso deja el proyecto con **dos** respuestas 401 de forma distinta y de origen distinto: una con un `detail` en inglés fijado por la librería, otra con el nuestro. La regla dura de RFC 7807 se cumple igual (el handler global las envuelve a las dos), pero el `detail` de una de ellas queda fuera del proyecto: no es una constante de `handlers.py` como exige `error-rendering` §"Los tipos y títulos se declaran en un único lugar", no está en castellano como el resto (`"email o contraseña incorrectos"`, `"Ocurrió un error inesperado..."`), y cambiar de versión de FastAPI podría cambiarlo sin que ningún test del proyecto lo note.

Hay además un caso que sólo `auto_error=False` deja bajo control: `Authorization: Basic dXNlcjpwYXNz` (esquema equivocado). El `__call__` de la clase trata "sin header" y "esquema que no es bearer" por la misma rama, así que con `auto_error=False` los dos llegan a nuestro código como `token is None` y se resuelven con la misma respuesta que redactamos nosotros.

**Alternativa considerada.** `auto_error=True`, que es lo que sugiere el snippet de `CHANGES.md` y el tutorial oficial de FastAPI. Es menos código (`token: str`, sin rama de `None`), pero cede la redacción de una de las dos respuestas 401 del sistema a una librería.

**Coste verificado.** `auto_error` **no** afecta la declaración del esquema en OpenAPI: FastAPI colecta el requisito de seguridad por `isinstance(..., SecurityBase)` (`fastapi/dependencies/models.py`), no por esa bandera. `/docs` seguirá mostrando el candado en las rutas protegidas.

**Riesgo que introduce.** Un descuido de tipado —anotar `token: str` en vez de `str | None` y olvidar la rama— haría que un request sin header llegara con `token=None` a `decode_access_token`, que lo rechazaría igual (devuelve `TokenData(email=None)` ante cualquier basura) pero por accidente. Se ancla con un test explícito del caso `Authorization: Basic ...`, que con `auto_error=True` ni siquiera existiría.

### D-2 — El rechazo es `HTTPException(401)`, no un `DomainError` nuevo ⚠ REVISIÓN

**Decisión.** `get_current_user` lanza `fastapi.HTTPException(status_code=401, detail=..., headers={...})`. **No** se agrega una `InvalidTokenError(DomainError)` ni una fila en `_DOMAIN_ERROR_MAP`.

**Por qué.** Un token que no valida no es una regla de negocio violada: es un fallo de la capa de transporte, del mismo orden que un header mal formado. `exceptions/domain.py` documenta explícitamente que un error de dominio "representa una regla de negocio violada, no un detalle de infraestructura". Además, `get_current_user` **es** capa web (vive junto a `get_auth_service`, importa `Depends`), así que lanzar una `HTTPException` acá no rompe ninguna frontera: no la está lanzando un Service ni un Repository. `http_exception_handler` (CHANGE-07) ya la envuelve en RFC 7807 y ya traslada sus headers, así que la regla dura se cumple sin código nuevo de manejo de errores.

**Consecuencia que se acepta.** El `type` del problem details será `about:blank` y el `title` será `"Unauthorized"` (frase de estado HTTP), no una URI propia como `https://wasa.dev/errors/invalid-token`. `error-rendering` §"Cada clase de error tiene una URI de tipo estable" ya prevé exactamente este caso: *"Una excepción HTTP genérica —que no representa un tipo de problema propio del dominio más allá de su código de estado— SHALL usar el tipo por defecto que RFC 7807 prescribe"*. El cliente ramifica por `status` (401) y, si necesita más, por el header `WWW-Authenticate` (D-3), que es el mecanismo que el estándar de Bearer define para esto.

**Alternativa considerada.** `InvalidTokenError(DomainError)` + fila en `_DOMAIN_ERROR_MAP` con `type = https://wasa.dev/errors/invalid-token`. Da un `type` propio y ramificable, y mantiene toda la traducción error→estado en una sola tabla. Se descarta por dos motivos: (a) mete un fallo de transporte en la jerarquía de errores de **negocio**, contradiciendo el docstring de `exceptions/domain.py`; y (b) el `domain_error_handler` no traslada headers de la excepción —la `ProblemSpec` no tiene campo para ellos—, así que el `WWW-Authenticate` de RFC 6750 se perdería o habría que extender la tabla sólo para este caso. **Es la decisión más discutible del change y la que más conviene confirmar con el usuario**: es reversible sin costo mientras nadie consuma el 401 (CHANGE-12 y CHANGE-17 son los primeros consumidores).

### D-3 — El desafío `WWW-Authenticate` sigue RFC 6750, y sólo distingue "sin credenciales" de "token inválido"

**Decisión.** Dos formas, y sólo dos:

- Token ausente (o esquema distinto de `Bearer`) → `WWW-Authenticate: Bearer`.
- Token presente pero inválido por cualquier motivo → `WWW-Authenticate: Bearer error="invalid_token"`.

Nunca se emite el parámetro `error_description`, ni ningún dato del token recibido.

**Por qué.** RFC 6750 §3 define el desafío del esquema Bearer y §3.1 fija `invalid_token` como el código de error del token expirado, revocado, malformado o inválido por cualquier otra razón — el estándar **agrupa deliberadamente** todos esos motivos bajo un único código, que es exactamente la indistinguibilidad que CHANGE-04 D-7 ya garantiza aguas arriba y que `access-token` ancla con el escenario "Todos los rechazos son indistinguibles entre sí". Distinguir "sin credenciales" de "credenciales inválidas" **no** es una fuga: el atacante ya sabe si mandó un token o no, y el frontend lo necesita para separar "nunca inicié sesión" de "mi sesión caducó" (RN-WS-14). Distinguir *por qué* el token es inválido sí lo sería, y por construcción es imposible: `decode_access_token` devuelve el mismo `TokenData(email=None)` para los cinco motivos, sin ningún dato adicional.

**Alternativa considerada.** Un único `WWW-Authenticate: Bearer` para los dos casos, con `detail` idéntico. Más uniforme, pero le quita al frontend la única señal legítima que separa "anónimo" de "sesión vencida" y se aparta del estándar sin ganar nada: la información que protege ya está protegida en `core/security.py`.

**Anclaje.** Un test compara los cuerpos completos de los cuatro rechazos con token presente (malformado, otra clave, vencido, sin `sub`) y exige **igualdad campo por campo**, incluido el header. Es el test de mayor valor del change: es el que se rompe si alguien "mejora" el mensaje agregando el motivo.

### D-4 — El `detail` es una constante, en castellano, y no interpola nada de la solicitud

**Decisión.** Dos literales de módulo (uno por caso de D-3), declarados junto al resto de las constantes de error del proyecto. No son f-strings.

**Por qué.** Mismo razonamiento que `INTERNAL_ERROR_PROBLEM_DETAIL` (CHANGE-07 D-5) y que `INVALID_CREDENTIALS_PROBLEM_DETAIL` (CHANGE-07 D-4): si el mensaje es un literal, **no hay dónde interpolar** el token recibido, el email del `sub`, el motivo del rechazo ni el nombre de la excepción de `jose`. Una f-string convierte cada refactor futuro en una oportunidad de filtrar. El registro en logs tampoco existe: la dependencia no llama a `logging` (mismo criterio que el router de auth, CHANGE-05 D-11), porque lo único que podría registrar es el token recibido.

### D-5 — La dependencia no consulta la base de datos ⚠ REVISIÓN

**Decisión.** `get_current_user` devuelve el `sub` del token sin verificar que la fila de `users` siga existiendo. Sin sesión, sin `UserRepository`, sin `AuthUoW`, sin I/O.

**Por qué.** El token está firmado por el propio servicio con `JWT_SECRET` y su vencimiento ya fue validado: es prueba suficiente de identidad. Consultar la base agregaría un viaje a `db_fuzzing` en **cada** request protegido, una `AuthUoW` que la dependencia hoy no necesita, y un modo de fallo nuevo (la base caída convertiría un 401/200 en un 500). El alcance v1.2 **no tiene baja de usuarios, ni suspensión, ni cambio de email**: no existe hoy ninguna transición que pueda invalidar una identidad antes de que su token venza, así que la consulta no protegería de nada real.

**Trade-off que se acepta explícitamente.** Si en el futuro se agrega baja de usuarios, el token de un usuario dado de baja seguirá siendo aceptado hasta su vencimiento — hasta 24h (`TOKEN_EXPIRE_HOURS`). Es el trade-off inherente a un JWT sin estado, y la mitigación estándar (lista de revocación, o consulta de existencia) es un change propio, no un agregado silencioso a éste. **Se surfacea al usuario** porque es una decisión de seguridad con consecuencia diferida: si prefiere pagar el viaje a la base desde ya, la firma cambia (`async def get_current_user(..., uow: AuthUoW)`), el alcance crece y `request-authentication` gana un requisito.

### D-6 — Devuelve `str` (el email), no `TokenData` ni una entidad `User`, y expone el alias `CurrentUserEmail`

**Decisión.** `-> str`. Además se exporta `CurrentUserEmail = Annotated[str, Depends(get_current_user)]`, para que CHANGE-12 escriba `user_email: CurrentUserEmail` y nada más.

**Por qué.** El email es lo único que `TokenData` lleva (`auth-contracts` §Contrato del payload del JWT decodificado) y lo único que el flujo de scan necesita: `07_flujos_principales.md` §Flujo 3 lo usa para el payload del webhook de n8n. Devolver `TokenData` obligaría a cada consumidor a desempaquetar `.email` y a volver a considerar el caso `None` que esta dependencia ya cerró — el tipo de retorno `str` es la afirmación de que ese caso ya no existe aguas abajo. Devolver una entidad `User` exigiría consultar la base (D-5). El alias es azúcar con valor real: fija en un solo lugar qué dependencia protege una ruta, y hace imposible que un router futuro anote `Depends(oauth2_scheme)` por error (que devolvería el token crudo, **sin validar**).

### D-7 — La `Settings` llega por `Depends(get_settings)`, no por `get_settings()` dentro del cuerpo

**Decisión.** `settings: Annotated[Settings, Depends(get_settings)]`, igual que `get_auth_service` (CHANGE-05).

**Por qué.** `decode_access_token` exige la `Settings` por parámetro (CHANGE-04, D-5) precisamente para no tocar el `lru_cache` global. Recibirla por `Depends` mantiene esa cadena: un test puede sustituir `get_settings` con `dependency_overrides` y ejercitar la dependencia con un `JWT_SECRET` propio sin ensuciar el proceso, y sin que este módulo lea configuración por su cuenta (regla dura 4).

### D-8 — `async def`, aunque no haga I/O

**Decisión.** `async def get_current_user(...)`.

**Por qué.** FastAPI ejecuta las dependencias declaradas con `def` en un threadpool, y las `async def` directamente en el event loop. Esta dependencia no hace I/O: su trabajo es un HMAC sobre un string corto, del orden de microsegundos. Declararla síncrona pagaría un salto de thread por **cada request protegido** para no esperar nada. (`get_auth_service` es `def` y ese salto también le aplica; corregirlo está fuera del alcance de este change, pero queda anotado.)

### D-9 — Vive en `core/dependencies.py`, junto a `get_auth_service`

**Decisión.** Confirmada, no reabierta: es D-1 de CHANGE-05, y el docstring del módulo ya la reserva. El módulo pasa a tener las dos dependencias compartidas del proyecto.

**Por qué.** Es el único lugar que ambos dominios (`auth` y `scan`) pueden importar sin que la capa de transporte conozca el cableado de persistencia, y `LAYER_IMPORT_RULES` prohíbe `sqlalchemy` en todo el árbol `api/`. Tener `get_auth_service` acá y `get_current_user` bajo `api/` sería la peor combinación posible: dos convenciones para dos dependencias del mismo router.

### D-10 — Sin `try/except`: la única condición es `token_data.email is None`

**Decisión.** El cuerpo de la dependencia no tiene ningún `try`. La rama de rechazo se decide por un `is None`.

**Por qué.** `decode_access_token` **no lanza** (CHANGE-04 D-7, anclado por seis escenarios de `access-token`). Un `try/except JWTError` acá sería código muerto que sugiere lo contrario, e invitaría a alguien a "mejorarlo" ramificando por tipo de excepción — que es exactamente la fuga que D-3 evita. Es también la forma que toma acá la regla dura "el Router nunca contiene lógica de negocio": esta dependencia no valida el token, sólo traduce a HTTP el veredicto de `core/security.py`.

**Anclaje.** Test AST sobre `core/dependencies.py`: el módulo no contiene ningún `ast.Try` y no importa `jose`. Mismo patrón que `test_auth_router_module_contains_no_try_and_builds_no_http_exception` (CHANGE-05 §8.1), con el signo invertido en cuanto a `HTTPException`: acá **sí** se construye una, y es correcto (D-2).

### D-11 — Los tests HTTP usan una ruta sonda sobre una app descartable, no montan scan

**Decisión.** Para ejercitar el borde HTTP, los tests construyen `create_app()` y le agregan **en el propio test** una ruta trivial protegida (`GET /_probe`, que devuelve el email recibido). No se agrega ninguna ruta al código de producción, y `POST /api/v1/scan/start` sigue devolviendo 404 al terminar el change.

**Por qué.** La restricción 6 dice que montar un router es una decisión explícita del change que implementa sus operaciones. Adelantar `/scan/start` para poder probar esta dependencia sería exactamente el efecto colateral que `bridge-bootstrap` prohíbe, y dejaría la ruta montada sin su servicio, su schema ni su rate limit. La ruta sonda vive y muere dentro del test, ejercita el camino real completo (middleware → `Depends` → handler global de errores) y no le agrega superficie al servicio. Un test de regresión afirma que la superficie de la app de producción no cambió.

**Alternativa considerada.** Probar sólo invocando `get_current_user(...)` como función Python (como hacen hoy los tests de `get_auth_service`). Necesario pero insuficiente: tres de las cinco condiciones de aceptación de CHANGE-06 hablan del **cuerpo RFC 7807 de la respuesta**, que sólo existe si el `HTTPException` atraviesa el handler global. Se hacen las dos cosas: invocación directa para el camino feliz y la lógica pura, ruta sonda para la forma de la respuesta.

### D-12 — El anclaje de "sin criptografía propia" es a nivel de módulo, no una fila de `LAYER_IMPORT_RULES`

**Decisión.** Un test que verifica puntualmente que `core/dependencies.py` no importa `jose`. **No** se agrega `("core", "jose")` a `LAYER_IMPORT_RULES`.

**Por qué.** `LAYER_IMPORT_RULES` aplica por **directorio completo y de forma recursiva**, y `core/security.py` —en ese mismo directorio— **debe** importar `jose`: es la superficie criptográfica del servicio. Una regla de directorio rompería `security.py`, que es precisamente lo que no queremos. Es el mismo caso ya razonado y documentado en CHANGE-07 §8.6 para `exceptions/handlers.py` frente a `exceptions/domain.py`; se sigue el precedente en vez de reabrirlo.

### D-13 — `tokenUrl` es la ruta relativa `/api/v1/auth/login`

**Decisión.** Tal cual lo fija `CHANGES.md`.

**Por qué / consecuencia heredada.** `tokenUrl` sólo alimenta el botón "Authorize" de `/docs`; no participa de ninguna validación en tiempo de ejecución. CHANGE-05 D-4 ya dejó anotado que ese botón **no va a funcionar**, porque `/login` recibe JSON (`UserLogin`) y no `application/x-www-form-urlencoded` con campos `username`/`password`. No es un bug y no se "arregla" acá: cambiar el contrato de `/login` para que un botón de la documentación funcione le impondría al cliente real la forma de una herramienta de desarrollo. Se documenta en el docstring del módulo para que CHANGE-12 no lo redescubra. Las rutas protegidas siguen siendo probables desde `/docs` con "Try it out" pegando el token a mano.

## Risks / Trade-offs

- **[Un token sigue siendo válido tras la baja de su usuario, hasta 24h]** → Ver D-5. Hoy es teórico: el alcance v1.2 no tiene baja de usuarios. Mitigación real si eso cambia: consulta de existencia en la dependencia, o lista de revocación — change propio. Se anota en el docstring del módulo para que quien agregue la baja sepa que este es el archivo que también hay que tocar.
- **[Ninguna ruta usa `get_current_user` al terminar el change]** → Código sin consumidor en producción es código que se puede romper sin que nadie lo note. Mitigación: la ruta sonda de D-11 ejercita el camino real de punta a punta, y el alias `CurrentUserEmail` (D-6) deja el uso previsto declarado en el propio módulo. El consumidor real llega en CHANGE-12, que está en el camino crítico inmediato.
- **[El 401 sale con `type: about:blank`, indistinguible por `type` de un 401 de credenciales... ]** → No lo es: el 401 de `/login` (credenciales inválidas) **sí** tiene su URI propia (`.../invalid-credentials`, CHANGE-07), así que los dos 401 del sistema son distinguibles por `type` a pesar de D-2. El que no distingue es el genérico, y para él está el header `WWW-Authenticate` (D-3). Si el usuario prefiere la alternativa de D-2, este riesgo desaparece a cambio de meter un fallo de transporte en la jerarquía de errores de negocio.
- **[Con `auto_error=False` un descuido de tipado dejaría pasar el caso "sin header" sin rama propia]** → Ver D-1. Mitigación: test explícito con `Authorization: Basic ...` y test sin header, ambos exigiendo el 401 con `WWW-Authenticate: Bearer` **sin** `error="invalid_token"` — que es lo que sólo se cumple si la rama de `None` existe de verdad.
- **[El vencimiento depende del reloj del proceso]** → `jose` valida `exp` contra el reloj del servidor. Un desfase de reloj entre el Bridge y el cliente hace que un token parezca vencido antes de tiempo, o al revés. Fuera del control de este change (la validación vive en `core/security.py`); se menciona porque el síntoma —401 "inexplicables"— va a reportarse contra esta dependencia. El test de token vencido usa un `exp` en el pasado explícito, no un `sleep`, para no depender del reloj.
- **[El botón "Authorize" de `/docs` no funciona]** → Ver D-13. Heredado de CHANGE-05 D-4, documentado, sin acción.
- **[Sin límite de intentos sobre rutas protegidas]** → Fuera de alcance: el cupo de `api-edge-security` lo aplica CHANGE-12 sobre `/scan/start`. Un atacante que fuerce tokens al azar paga sólo un HMAC por intento (mucho más barato que bcrypt), pero forjar una firma HS256 válida sin `JWT_SECRET` no es un problema de fuerza bruta de red. La deuda real sigue siendo la de CHANGE-05 D-6 (auth sin rate limit), ya registrada.

## Migration Plan

No hay migración de datos, de esquema ni de configuración: el change no toca la base, no agrega variables de entorno y no cambia ninguna respuesta existente.

- **Adelante**: agregar los tres símbolos a `core/dependencies.py`. Ningún comportamiento observable del servicio cambia — mismas rutas, mismas respuestas, misma superficie de OpenAPI (el esquema de seguridad se declara pero no queda asociado a ninguna operación hasta que una ruta lo use).
- **Atrás**: borrar los tres símbolos. No hay estado persistido, ningún cliente los consume y ninguna ruta depende de ellos.
- **Orden dentro del change**: primero la dependencia como función pura (camino feliz e `is None`), invocándola directamente sin HTTP; después la forma HTTP del rechazo sobre la ruta sonda; al final los anclajes estructurales (AST) y la regresión de superficie de API. El `oauth2_scheme` se declara en el primer paso GREEN porque es el parámetro de la firma.

## Open Questions

1. **D-1 (`auto_error=False` vs el default `True`)** — recomendación: `auto_error=False`, para que las dos respuestas 401 del sistema las redacte el proyecto y no la librería, y para cubrir el caso del esquema `Basic`. Alternativa: seguir literalmente el snippet de `CHANGES.md` (`auto_error` por defecto) y aceptar un `detail` en inglés fijado por FastAPI. Reversible con un parámetro.
2. **D-2 (`HTTPException` vs `InvalidTokenError(DomainError)`)** — recomendación: `HTTPException`, por coherencia con la definición de error de dominio del proyecto y porque `domain_error_handler` no traslada headers (perdería el `WWW-Authenticate`). Alternativa: la excepción de dominio, que da un `type` propio ramificable a cambio de extender `ProblemSpec` con headers. **Es la decisión menos obvia del change**; conviene cerrarla antes de codear, aunque siga siendo reversible hasta que CHANGE-12/CHANGE-17 consuman el 401.
3. **D-5 (sin consulta a la base)** — recomendación: sin consulta, por ausencia de baja de usuarios en el alcance v1.2 y para no agregar I/O ni un modo de fallo por request protegido. Alternativa si el usuario quiere cerrarlo ya: inyectar la `AuthUoW` y verificar existencia — crece el alcance del change y `request-authentication` gana un requisito.
4. **Nota documental (no bloquea)**: `knowledge-base/08_arquitectura_propuesta.md` §Seguridad describe la autorización como *"Bearer token en `Authorization` header, validado por `get_current_user` (Depends de FastAPI)"* — exacto y vigente. La misma sección sigue diciendo *"Password hashing: bcrypt vía passlib"*, ya desactualizado desde CHANGE-04 (nota 6 de su traspaso en `CHANGES.md`). No se reescribe la KB dentro de este change (precedente de CHANGE-02 §8.1, CHANGE-04 §6 y CHANGE-05); queda anotado para quien la actualice.
