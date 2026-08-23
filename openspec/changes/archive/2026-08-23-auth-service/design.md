## Context

**Estado actual.** Tres módulos placeholder de CHANGE-00a: `core/security.py`, `uow/auth_unit_of_work.py` y `services/auth_service.py`. Todo lo que hay debajo y encima ya está construido:

| Pieza | Origen | Lo que aporta a este change |
|---|---|---|
| `Settings.JWT_SECRET: SecretStr`, `Settings.TOKEN_EXPIRE_HOURS: int = 24` | CHANGE-00b | Configuración de firma y expiración; nunca hardcodear |
| `get_session_factory(settings) -> async_sessionmaker[AsyncSession]` (`expire_on_commit=False`) | CHANGE-01 | La única fuente de sesiones para `AuthUoW` |
| `UserRepository(session)` con `create(email, hashed_password)` y `get_by_email(email)` | CHANGE-03 | La superficie de persistencia; normaliza el email a minúsculas en ambos métodos |
| `DomainError` / `EmailAlreadyExistsError(email)` en `exceptions/domain.py` | CHANGE-03 | La base de la que cuelga `InvalidCredentialsError` |
| `UserRegister`, `UserLogin`, `TokenResponse(access_token, token_type, expires_in)`, `TokenData(email: str \| None)` | CHANGE-02 | Los contratos de entrada y salida; `expires_in` en **segundos** |
| Fixture `user_session` (SQLite async en memoria, solo `User.__table__`) | CHANGE-03 | Permite testear `AuthUoW`/`AuthService` contra SQL real, sin PostgreSQL |
| `LAYER_IMPORT_RULES` + helper AST | CHANGE-00a/03 | El mecanismo con el que las fronteras de capa se verifican, no solo se declaran |

**Restricciones que condicionan el diseño:**

1. **Reglas duras de capas** (`CLAUDE.md`, `knowledge-base/08_arquitectura_propuesta.md`): `Router → Service → UoW → Repository`. El Service NUNCA instancia SQLAlchemy ni httpx; el acceso a datos pasa siempre por la UoW. Ya anclado por las filas `("services", "sqlalchemy")` y `("services", "httpx")` de `LAYER_IMPORT_RULES`.
2. **RN-WS-12**: contraseñas exclusivamente como hash bcrypt; el texto plano nunca se persiste ni se retorna. **§Excepciones globales**: "el mensaje 401 de login NO distingue si falló el email o la contraseña (evita enumeración de usuarios)".
3. **RN-WS-14**: JWT con expiración configurable, default 24h.
4. **`knowledge-base/08_arquitectura_propuesta.md` §Seguridad**: "JWT HS256 (python-jose), expiración configurable (default 24h)"; "Password hashing: bcrypt vía passlib, rounds=12. Nunca se compara ni almacena texto plano"; "`JWT_SECRET` (…) vive exclusivamente en variables de entorno; nunca se loguea".
5. **`knowledge-base/03_actores_y_roles.md`**: un único rol autenticado, sin RBAC. El JWT no lleva roles ni permisos: solo identidad.
6. **Traspaso D-5/R-4/R-7 de CHANGE-03**: `AuthUoW` confirma en el camino feliz y deshace ante excepción; **no** se reemplaza la captura de `IntegrityError` del repositorio por un chequeo previo con `get_by_email`.
7. **Governance MEDIUM** (override del proyecto para CHANGE-01..07; `CHANGES.md` marca este change como CRÍTICO, el `CLAUDE.md` lo baja a MEDIO): se implementa en pasos, surfaceando las decisiones no obvias antes de escribir código.

### Hallazgo del entorno verificado en este repo (R-1, ya no una sospecha)

Ejecutado contra `fastapi_bridge/.venv`:

```
bcrypt 5.0.0 · passlib 1.7.4
(trapped) error reading bcrypt version → AttributeError: module 'bcrypt' has no attribute '__about__'
CryptContext(schemes=['bcrypt']).hash('secret') → ValueError
```

`passlib/handlers/bcrypt.py` lee `bcrypt.__about__.__version__`, atributo eliminado en bcrypt ≥ 4.1. Passlib no puede determinar la versión del backend, degrada a una ruta de código incorrecta y **falla al hashear**. `passlib` no publica release desde octubre de 2020. Esto bloquea la primera línea de `hash_password` y por eso abre el checkpoint de governance (D-1).

Dato relevante para el spec: `bcrypt` ≥ 4.1 **lanza `ValueError`** ante contraseñas de más de 72 bytes en vez de truncarlas en silencio. CHANGE-02 ya cerró ese flanco con el techo de 72 bytes UTF-8 en `UserRegister`/`UserLogin` (D-2 de aquel change), así que la contraseña que llega a `hash_password` ya viene acotada — pero `hash_password` no debe *depender* de eso, porque también se lo puede invocar desde un test o un script.

## Goals / Non-Goals

**Goals:**
- Implementar RN-WS-12 y RN-WS-14 de punta a punta, con `core/security.py` como única superficie de criptografía del servicio.
- Dejar `login` indistinguible entre "email inexistente" y "contraseña incorrecta", en **mensaje** y en **tiempo de respuesta**.
- Cerrar el límite transaccional que CHANGE-03 dejó abierto a propósito: `AuthUoW` confirma o deshace, siempre.
- Resolver R-1 y dejar el manifiesto de dependencias en un estado que instale y funcione.
- Que el coste de CPU de bcrypt no bloquee el event loop.
- Dejar cada decisión de seguridad anclada por un test, de modo que revertirla sea un test rojo y no un hallazgo en producción.

**Non-Goals:**
- Exponer endpoints HTTP o montarlos en `main.py` (CHANGE-05).
- Traducir las excepciones de dominio a RFC 7807 (CHANGE-07).
- `get_current_user` y la protección de rutas (CHANGE-06 / CHANGE-12).
- Refresh tokens, revocación, blacklist, logout del lado servidor, recuperación de contraseña, verificación de email, MFA: ninguna historia de usuario de v1.2 los pide.
- Rate limiting sobre auth (la política de CHANGE-00d cubre solo `/scan/start`; extenderla es decisión de otro change).
- Rehash automático de contraseñas al subir el coste de bcrypt (no hay usuarios en producción todavía).

## Decisions

> Las decisiones marcadas **⚠ REVISIÓN** se presentan al usuario en el checkpoint de governance (tarea 1.3 de `tasks.md`) **antes** de escribir código. Las demás se aplican tal cual.

### D-1 — Sacar `passlib` y usar la librería `bcrypt` directamente ⚠ REVISIÓN

`requirements.txt` cambia `passlib[bcrypt]>=1.7` por `bcrypt>=4.1`. `core/security.py` llama `bcrypt.hashpw`, `bcrypt.gensalt(rounds=…)` y `bcrypt.checkpw`.

*Por qué*: es la única de las dos opciones que no fija el proyecto a una dependencia abandonada. `passlib` no tiene release desde 2020; la alternativa (a) obliga a fijar `bcrypt<4.1`, es decir a quedarse en una versión de 2023 de la librería que hace el trabajo criptográfico real, y a que cualquier `pip install -U` futuro vuelva a romper el servicio. La API de `bcrypt` que se necesita son tres funciones; `passlib` aportaba abstracción sobre múltiples esquemas de hash que este proyecto nunca va a usar (RN-WS-12 dice "exclusivamente bcrypt").

*Alternativa (a) — conservar `passlib` fijando `bcrypt<4.1`*: menos líneas de diff hoy, y `CryptContext` traería gratis el `needs_update()` para un rehash futuro. Se descarta por la razón de arriba, pero es una opción legítima si el usuario prefiere no desviarse del texto de la KB (§Seguridad dice "bcrypt vía passlib").

*Consecuencias si se acepta*: (i) el escenario "Dependencias de runtime declaradas" de `bridge-bootstrap` cambia — por eso este change tiene una capability modificada; (ii) la fila `("repositories", "passlib")` de `LAYER_IMPORT_RULES` queda sin objeto, así que se le agrega `("repositories", "bcrypt")` para que la garantía siga siendo real; (iii) `knowledge-base/08_arquitectura_propuesta.md` §Seguridad queda desactualizado en una frase — se anota como nota de implementación, no se reescribe la KB dentro de este change.

### D-2 — Coste de bcrypt fijo en 12, como constante de módulo ⚠ REVISIÓN

`_BCRYPT_ROUNDS = 12` en `core/security.py`, no una variable de entorno.

*Por qué 12*: es lo que fija la KB (§Seguridad) y coincide con la recomendación corriente de OWASP. *Por qué constante y no configuración*: el coste no es un parámetro de despliegue sino una propiedad del formato del hash — queda embebido en el propio string `$2b$12$…`, y bajarlo en un `.env` degradaría silenciosamente la seguridad de todos los usuarios nuevos sin dejar rastro en el repositorio. La regla dura "nunca hardcodear configuración" apunta a secretos, URLs y credenciales, no a constantes de algoritmo; el mismo criterio aplica a `HS256` (ver D-6).

*Costo medido a considerar en el checkpoint*: coste 12 son del orden de 250–400 ms de CPU por hash en hardware de escritorio. Eso es el piso de latencia de `POST /register` y de `POST /login`, por diseño (es lo que hace caro el ataque de fuerza bruta). Si el usuario considera ese piso inaceptable para la demo, la alternativa es coste 10 (~60–100 ms), que sigue siendo aceptable en 2026 pero se desvía de la KB.

### D-3 — Las primitivas de hashing son síncronas; el Service las ejecuta en un thread pool ⚠ REVISIÓN

`hash_password` y `verify_password` se declaran `def`, no `async def`. `AuthService.register` y `AuthService.login`, que sí son `async`, las invocan vía `anyio.to_thread.run_sync(...)`.

*Por qué*: bcrypt es trabajo de CPU, no de I/O — declararlo `async def` sería mentir sobre su naturaleza y no lo haría menos bloqueante (la skill `fastapi-async-patterns` es explícita: `async def` solo para I/O; nunca llamar APIs bloqueantes dentro de una corrutina). Con 400 ms de CPU en el event loop, dos registros concurrentes serializan **todas** las peticiones del servicio, incluido `/health`. `anyio` ya es dependencia transitiva de FastAPI/Starlette y está declarado en `requirements-dev.txt`; el offload cuesta una línea.

*Dónde va el offload*: en el Service, no dentro de `core/security.py`. Así las primitivas quedan puras y testeables sin event loop, y el módulo que decide sobre concurrencia es el que conoce el contexto de la petición.

*Alternativa descartada*: dejarlo síncrono y "ya lo optimizamos si hace falta". Se descarta porque el síntoma (latencia global bajo carga concurrente) no aparece en una demo de un solo usuario y sí en la defensa de la tesis con varios evaluadores probando a la vez.

### D-4 — Un único access token de 24h, sin refresh token ⚠ REVISIÓN

`create_access_token` emite un JWT cuya expiración sale de `settings.TOKEN_EXPIRE_HOURS` (default 24). No se implementa el par access corto + refresh.

*Por qué*: RN-WS-14 y la KB §Seguridad especifican exactamente esto, y `TokenResponse` (CHANGE-02) tiene un único campo `access_token`, sin `refresh_token`. Ninguna historia de usuario de v1.2 pide renovación silenciosa de sesión.

*Tensión que se surfacea*: la práctica de seguridad recomendada es access token corto (~15 min) + refresh token, precisamente para acotar la ventana de un token robado. Con 24h y sin revocación, un token filtrado sirve durante un día entero. Se acepta conscientemente porque (i) el alcance de v1.2 es una landing que dispara escaneos, no un sistema con datos de terceros; (ii) agregar refresh tokens cambia `TokenResponse`, obliga a persistir estado de sesión y arrastra a CHANGE-05, 06 y 14 — es un change propio, no un detalle de este. *Si el usuario prefiere acortar la ventana sin agregar refresh*, la palanca es `TOKEN_EXPIRE_HOURS` en `.env`: no requiere tocar código.

### D-5 — `create_access_token` y `decode_access_token` reciben `Settings` como parámetro explícito ⚠ REVISIÓN

Firmas: `create_access_token(data: dict[str, Any], expires_delta: timedelta, settings: Settings) -> str` y `decode_access_token(token: str, settings: Settings) -> TokenData`.

*Por qué*: `core/security.py` no es un módulo de FastAPI y no puede usar `Depends`; las dos únicas formas de que vea `JWT_SECRET` son recibirlo o llamar a `get_settings()` por dentro. Recibirlo mantiene las funciones puras y testeables (un test puede pasar `Settings(JWT_SECRET=...)` sin tocar el cache `lru_cache` global ni `dependency_overrides`) y respeta la regla de que la configuración se inyecta, no se busca. Es la misma forma que ya tienen `get_engine(settings)` y `get_session_factory(settings)` de CHANGE-01, así que no introduce un patrón nuevo.

*Desviación respecto del roadmap*: `CHANGES.md` escribe `create_access_token(data, expires_delta) -> str`, sin `settings`. Es una firma abreviada de un documento de planificación, no un contrato; la alternativa (llamar `get_settings()` dentro) haría que cada test de JWT tuviera que limpiar el cache de `lru_cache` para no arrastrar el secreto de otro test.

*Alternativa descartada*: pasar solo `secret: str`. Filtra menos, pero obliga al llamador a hacer `settings.JWT_SECRET.get_secret_value()` en la capa de servicio — es decir, a desenvolver el `SecretStr` fuera del módulo de seguridad, que es justo donde no se quiere que un secreto en claro circule.

### D-6 — `HS256` como constante de módulo, y **lista explícita de algoritmos** al decodificar

`_JWT_ALGORITHM = "HS256"`. `jwt.decode(token, key, algorithms=[_JWT_ALGORITHM])` — nunca sin el parámetro `algorithms`, nunca con una lista tomada del header del token.

*Por qué es un requirement y no un detalle*: es la vulnerabilidad clásica de JWT. Si el verificador acepta el algoritmo que declara el propio token, un atacante manda `alg: none` (token sin firma) o `alg: RS256` usando la clave HMAC pública como clave RSA, y se autentica como cualquier email que escriba en `sub`. `python-jose` exige `algorithms` en `decode`, pero un refactor futuro podría pasarle una lista derivada del header "para ser flexible". Queda como escenario de spec con test propio.

### D-7 — `decode_access_token` nunca lanza: devuelve `TokenData(email=None)`

Cualquier `JWTError` (firma inválida, token expirado, malformado, `sub` ausente, algoritmo no permitido) se traduce a `TokenData(email=None)`.

*Por qué*: lo fija el roadmap y lo justifica D-1 de CHANGE-02 — un token inválido es un fallo de **autenticación** (401), no de **validación de request** (422). Si la función lanzara, `get_current_user` (CHANGE-06) tendría que envolver cada llamada en un `try/except` y el riesgo de que una excepción se escape como 500 quedaría abierto. Devolviendo un valor centinela, el 401 es el camino normal.

*Riesgo aceptado y su mitigación*: tragarse la excepción borra el motivo del rechazo. Se acepta porque el motivo **no debe llegar al cliente** (decirle "tu token expiró" vs "tu firma es inválida" es información para un atacante). Para diagnóstico queda el `logging` en `debug`, sin incluir jamás el token ni el secreto.

### D-8 — `login` verifica un hash señuelo cuando el email no existe ⚠ REVISIÓN

Si `get_by_email` devuelve `None`, `login` **igualmente** ejecuta `verify_password(data.password, _DUMMY_HASH)` —descartando el resultado— antes de lanzar `InvalidCredentialsError`.

*Por qué*: sin eso, el 401 genérico es indistinguible en el **texto** pero no en el **tiempo**. El camino "email inexistente" retorna en microsegundos (una consulta y nada más); el camino "contraseña incorrecta" tarda los ~300 ms de bcrypt. Un atacante que mide latencias enumera la base de usuarios igual de bien que si el mensaje se lo dijera, y RN-WS-12 §Excepciones globales quedaría cumplida solo en apariencia. El señuelo es un hash bcrypt constante de módulo, calculado una vez sobre una cadena fija; verificar contra él cuesta lo mismo que verificar contra un hash real.

*Extensión respecto del roadmap*: `CHANGES.md` pide "401 genérico sin distinguir cuál falló"; esta decisión es la lectura fuerte de esa regla. Se surfacea porque agrega código que a primera vista parece inútil y que un refactor futuro borraría "por muerto" — por eso también queda con escenario de spec propio.

*Alternativa descartada*: no hacer nada y aceptar el canal temporal. Barato, pero deja RN-WS-12 §Excepciones globales cumplida a medias en el único requisito de seguridad que la KB enuncia de forma explícita para el login.

### D-9 — `AuthUoW` es un context manager asíncrono reentrante que expone `.users`

```
class AuthUoW:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None: ...
    async def __aenter__(self) -> "AuthUoW"      # abre sesión, construye UserRepository
    async def __aexit__(self, exc_type, exc, tb) # commit si no hubo excepción, rollback si la hubo; close siempre
    users: UserRepository                        # disponible solo dentro del bloque
```

*Constructor recibe la factory, no la sesión ni `Settings`*: así el ciclo de vida de la sesión pertenece por completo a la UoW (es su razón de existir) y `AuthService` no necesita saber que existen las sesiones. `AuthService(uow)` recibe la instancia y hace `async with self._uow as uow:` en cada operación; por eso `__aenter__` abre una sesión **nueva** cada vez en vez de reutilizar una guardada — un `AuthService` de vida larga (inyectado por `Depends` en CHANGE-05) queda así reutilizable entre peticiones.

*`commit` en `__aexit__`, no al final de cada método del Service*: es la definición de Unit of Work — un límite transaccional que abarca la operación de negocio completa. Hoy `register` hace una sola escritura, pero el punto es que si mañana hiciera dos, ninguna quedaría a medias. `rollback` ante **cualquier** excepción, incluidas las de dominio: si `create` lanzó `EmailAlreadyExistsError`, la sesión quedó con un `INSERT` fallido pendiente y la única salida limpia es deshacer.

*Acceder a `.users` fuera del bloque es un error*: se lanza excepción explícita en vez de devolver `None` y producir un `AttributeError` opaco tres capas más arriba.

### D-10 — `register` no chequea el email previamente: deja que la constraint hable

`register` va directo a `uow.users.create(...)` y propaga `EmailAlreadyExistsError`. No llama `get_by_email` antes.

*Por qué*: es el traspaso R-7 de CHANGE-03. Un pre-chequeo es una optimización de UX (evita el viaje redondo de un `INSERT` que va a fallar), no la garantía de RN-WS-13: entre el `SELECT` y el `INSERT` hay una ventana en la que otra petición concurrente puede insertar el mismo email, y el único que cierra esa ventana es el motor. Agregar el pre-chequeo *además* de la captura sería código extra que se ejercita casi nunca y que invita a alguien a "simplificar" borrando la captura. Se propaga la excepción tal cual: CHANGE-07 la mapea a 409.

### D-11 — `InvalidCredentialsError` no lleva el email

`class InvalidCredentialsError(DomainError)` sin argumentos, con mensaje fijo ("email o contraseña incorrectos"), a diferencia de `EmailAlreadyExistsError(email)`.

*Por qué la asimetría*: en un 409 por email duplicado, el cliente **ya sabe** qué email mandó y el dato le sirve para el mensaje. En un 401 de login, el email es exactamente el dato que un atacante quiere ver confirmado; que viaje dentro de la excepción es una invitación a que CHANGE-07 lo interpole en el `detail` del RFC 7807 sin pensarlo. Se elimina la tentación en el origen.

### D-12 — `expires_in` de `TokenResponse` lo calcula el Service, en segundos

`expires_in = settings.TOKEN_EXPIRE_HOURS * 3600`, calculado en `AuthService`, a partir del mismo `timedelta` que se le pasa a `create_access_token`.

*Por qué acá*: lo fija el docstring de `TokenResponse` (CHANGE-02, D-8) — el schema no importa `Settings`. Y la fuente debe ser **una sola**: el `timedelta` que expira el token y el número que se le informa al cliente tienen que salir del mismo valor, o el frontend limpiará el `authStore` antes o después de que el token realmente caduque (RN-WS-14).

### D-13 — El `sub` del JWT es el email normalizado, y el token lleva `exp` e `iat`

`data = {"sub": user.email}` — el email tal como quedó en la base, es decir ya normalizado a minúsculas por `UserRepository` (D-4 de CHANGE-03), no el que escribió el usuario en el formulario.

*Por qué*: el `sub` es lo que `get_current_user` (CHANGE-06) va a usar para volver a buscar al usuario. Si el token llevara `USER@TEST.COM` y la búsqueda posterior no normalizara, el usuario quedaría autenticado con un token que no resuelve a ninguna fila. Tomarlo de la entidad devuelta por el repositorio elimina la clase entera de bug. `iat` se incluye para que un debug futuro pueda datar el token; no se agrega `jti` porque no hay revocación (D-4) y un identificador que nadie consulta es ruido.

### D-14 — Tests: unitarios puros para `core/security.py`, integración real para `AuthService`

`tests/test_security.py` no toca base de datos ni event loop: las cuatro primitivas son funciones puras (`Settings` construido a mano en cada test). `tests/test_auth_service.py` corre contra la fixture `user_session` (SQLite async en memoria de CHANGE-03), con una `AuthUoW` construida sobre una factory ligada a ese motor.

*Por qué integración y no dobles para el Service*: lo que este change tiene que demostrar de `register` es que el alta **queda confirmada** y que ante excepción **no queda nada** — eso es comportamiento del límite transaccional, y contra un doble de sesión se estaría testeando que se llamó a `commit()`, no que el usuario se persistió. El motor en memoria ya está disponible y no agrega dependencias.

*Coste asumido*: los tests que hashean de verdad con coste 12 tardan ~300 ms cada uno. Para no inflar la suite, los tests de `AuthService` que no ejercitan la fortaleza del hash usan un coste reducido vía monkeypatch de la constante, y hay tests dedicados —pocos— que verifican el coste real de producción.

## Risks / Trade-offs

- **R-1 — La decisión D-1 cambia el manifiesto de dependencias y puede romper entornos ya instalados** → Quien tenga el venv armado necesita `pip install -r requirements.txt` de nuevo (entra `bcrypt`, sale `passlib`). Mitigación: `bcrypt 5.0.0` ya está instalado en el venv de este repo como dependencia transitiva de `passlib[bcrypt]`, así que en la práctica el cambio no instala nada nuevo: solo deja de instalar `passlib`. Queda como tarea explícita verificar el manifiesto en un entorno virgen.
- **R-2 — Un token de 24h sin revocación es una ventana larga** → Aceptado conscientemente en D-4. Mitigación: `TOKEN_EXPIRE_HOURS` es configurable sin tocar código; el spec de `access-token` exige que la expiración salga de la configuración y no de una constante, de modo que acortarla sea un cambio de `.env`.
- **R-3 — El señuelo de D-8 se ve como código muerto y alguien lo borra** → Un refactor "de limpieza" que elimine la verificación cuyo resultado se descarta reabre el canal temporal sin que nada falle a simple vista. Mitigación: escenario de spec propio en `auth-session` + test que compara los dos caminos del 401, con un comentario en el código que explique por qué el resultado se descarta a propósito.
- **R-4 — El offload a thread pool (D-3) se pierde en un refactor** → Si alguien "simplifica" `await anyio.to_thread.run_sync(hash_password, ...)` a `hash_password(...)`, el servicio sigue funcionando y pasando los tests funcionales, pero vuelve a bloquear el event loop. Mitigación: test AST sobre `services/auth_service.py` que exige que las llamadas a las primitivas de hashing pasen por el offload, en la misma línea que el test de "sin `commit`/`rollback`" que CHANGE-03 puso sobre el repositorio.
- **R-5 — La lista de algoritmos (D-6) es un one-liner fácil de aflojar** → Mitigación: escenario de spec + test que construye un token con `alg: none` y otro firmado con otra clave, y exige `TokenData(email=None)` en ambos casos. Es el test que más valor tiene de todo el change.
- **R-6 — SQLite no reproduce la concurrencia de PostgreSQL** → Los tests de `AuthUoW` corren sobre SQLite en memoria, así que la carrera de dos `INSERT` concurrentes con el mismo email (el escenario que justifica D-10) **no** se ejercita de verdad; solo se ejercita la traducción del `IntegrityError`, que ya cubrió CHANGE-03. Mitigación: aceptado y anotado. La garantía real la da la constraint del motor, verificada contra el dialecto PostgreSQL en `tests/test_user_model.py` desde CHANGE-01.
- **R-7 — El coste 12 hace lenta la suite** → Mitigación en D-14 (coste reducido por monkeypatch salvo en los tests que verifican el coste). Si aun así la suite se degrada, el siguiente escalón es marcar esos tests como `slow`; no se hace ahora para no agregar configuración de pytest sin necesidad demostrada.
- **Trade-off aceptado** — igual que CHANGE-02 y CHANGE-03, este change no produce comportamiento observable por el usuario final: no hay endpoint que lo ejercite hasta CHANGE-05. Se acepta porque es la última pieza antes de que exista uno, y porque las decisiones de seguridad son mucho más caras de revisar una vez que hay un endpoint público apuntándoles.

## Migration Plan

No hay migración de datos ni de esquema: la tabla `users` no cambia y no hay usuarios en producción. El único paso de despliegue es reinstalar dependencias (`pip install -r fastapi_bridge/requirements.txt`) tras el cambio de manifiesto de D-1. Rollback: revertir el commit; ningún módulo fuera de este change importa todavía `AuthService`, `AuthUoW` ni las funciones de `core/security.py`, así que revertir no deja consumidores rotos.

## Open Questions

**Cerradas por el usuario (2026-08-22)**: las seis decisiones **⚠ REVISIÓN** (D-1, D-2, D-3, D-4, D-5, D-8) quedaron confirmadas tal como recomendadas — D-1 sacar `passlib` y usar `bcrypt` directo, D-2 coste 12, D-3 hashing en `anyio.to_thread.run_sync`, D-4 access token único de 24h sin refresh, D-5 `Settings` como parámetro explícito, D-8 hash señuelo en login. Ninguna otra pregunta bloquea este change.

Quedan anotadas, sin bloquear, para changes posteriores:

1. **(CHANGE-07)** ¿El `detail` del 401 RFC 7807 se compone con un texto fijo? D-11 deja `InvalidCredentialsError` sin email precisamente para que la respuesta no pueda filtrarlo por accidente, pero la redacción final del mensaje es decisión de CHANGE-07.
2. **(CHANGE-05 o posterior)** ¿Se extiende el rate limiting de CHANGE-00d a `/auth/login`? Sin él, D-2 y D-8 encarecen el ataque de fuerza bruta pero no lo cierran. Hoy la política cubre solo `/scan/start` (`api-edge-security`, requirement "El límite de escaneos no alcanza a los demás endpoints"), así que extenderla es un cambio de spec, no un detalle.
3. **(hardening, sin change asignado)** `Settings.JWT_SECRET` tiene default `"dev-only-insecure-change-me"`. Nada impide hoy arrancar en `APP_ENV=production` con ese valor y firmar tokens que cualquiera puede falsificar. La validación pertenece a `runtime-configuration`, no a este change, pero conviene que exista antes de la defensa.
4. **(documental)** Si se acepta D-1, `knowledge-base/08_arquitectura_propuesta.md` §Seguridad ("bcrypt vía passlib") queda desactualizado. Se anota como nota de implementación en `CHANGES.md` al archivar, siguiendo el precedente de la tarea 8.1 de CHANGE-02.
