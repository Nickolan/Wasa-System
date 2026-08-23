## Context

**Governance: MEDIUM** — override explícito del proyecto para el dominio Auth (CHANGE-01..07), documentado en `CLAUDE.md`. Se implementa en pasos y se surfacean al usuario las decisiones no obvias (política de longitud de contraseña, campos extra, forma del token). No requiere aprobación línea por línea.

> **Checkpoint de governance cerrado.** Las cinco decisiones que se habían marcado para revisión (D-2, D-3, D-4, D-6, D-10) **ya fueron respondidas por el usuario** y están resueltas abajo con la etiqueta **✅ DECIDIDO**. No queda ninguna decisión abierta que bloquee `/opsx:apply`:
> - **D-2 — aceptada**: se agrega el tope de 72 bytes UTF-8 en la contraseña.
> - **D-3 — aceptada tal cual se propuso**: `UserLogin.password` queda con `min_length=1`.
> - **D-4 — aceptada tal cual se propuso**: sin reglas de complejidad.
> - **D-6 — aceptada tal cual se propuso**: `str` + `repr=False`, **no** `SecretStr`.
> - **D-10 — aceptada con cambio**: `ErrorDetail` se muda a un módulo propio `schemas/error_schemas.py`; el usuario aprobó explícitamente la desviación respecto del texto literal del roadmap.

Estado actual del repo:
- `fastapi_bridge/schemas/auth_schemas.py` y `schemas/scan_schemas.py` son docstrings placeholder sin ningún símbolo exportado (CHANGE-00a). Sus docstrings apuntan a números de change desactualizados (CHANGE-04/CHANGE-06/CHANGE-12) — el roadmap vigente los ubica en CHANGE-02.
- `fastapi_bridge/schemas/error_schemas.py` **no existe todavía**: lo crea este change (D-10). El paquete `schemas/` ya tiene su `__init__.py`, así que el módulo nuevo es importable sin tocar nada más.
- `core/settings.py` ya expone `TOKEN_EXPIRE_HOURS: int = 24` y `JWT_SECRET: SecretStr`.
- `db/models.py` define `User` con `email: String(320)` y `hashed_password: String(255)`.
- `tests/test_layer_boundaries.py` tiene una tabla `LAYER_IMPORT_RULES` diseñada en CHANGE-00a para crecer "una línea por regla nueva" (D-12 de aquel change).
- `pydantic[email]>=2.0` ya está en `requirements.txt`; `email-validator` está instalado y funcional (verificado: pydantic 2.13.4).

Restricciones que enmarcan todo lo de abajo:
- Los schemas son la capa más baja y más reutilizable: no importan FastAPI, ni SQLAlchemy, ni httpx, ni `Settings`.
- RN-WS-15: contraseña mínima 8 caracteres, validada en backend (Pydantic) **y** frontend (Zod, CHANGE-14).
- RN-WS-12: la contraseña en claro nunca se persiste ni se retorna.
- RN-WS-09: todo error de la API sale en formato RFC 7807.
- Estos contratos los consumen cuatro changes posteriores y dos changes de frontend. Cambiarlos después es incompatible hacia atrás.

### Hallazgo del entorno que condiciona el diseño

Al verificar las dependencias instaladas se encontraron dos cosas relevantes:

1. **`bcrypt` rechaza contraseñas de más de 72 bytes con `ValueError`** (versión instalada: bcrypt 5.0.0). Las versiones antiguas truncaban en silencio; las actuales fallan. Sin un tope en el schema, una contraseña larga produciría un `ValueError` no capturado dentro del `AuthService` → 500 en lugar de 422. El límite es de **bytes UTF-8, no de caracteres** (una contraseña de 30 emojis son 120 bytes). Esto obliga a una decisión en **este** change (D-2).
2. **`passlib 1.7.4` está roto contra `bcrypt 5.0.0`**: `passlib/handlers/bcrypt.py` lee `bcrypt.__about__.__version__`, atributo eliminado en bcrypt ≥ 4.1, y `CryptContext(schemes=["bcrypt"]).hash(...)` falla. Esto **no bloquea este change** (acá no se hashea nada), pero **sí bloquea CHANGE-04**. Se registra acá porque es donde se descubrió; ver Riesgos R-1.

## Goals / Non-Goals

**Goals:**
- Fijar de una vez la forma de `UserRegister`, `UserLogin`, `TokenResponse`, `TokenData` y `ErrorDetail`, con validación que falle en la frontera (422) y nunca dentro del Service (500).
- Codificar RN-WS-15 en el backend, de forma que la validación de Zod del frontend sea redundante y no la única garantía.
- Dejar los schemas libres de framework, de I/O y de configuración, para que CHANGE-03..07 puedan importarlos sin arrastrar dependencias.
- Documentar en tests cada decisión de validación, para que un cambio futuro de la política sea un test rojo y no un descubrimiento en producción.

**Non-Goals:**
- Hashear, verificar, firmar o decodificar nada (CHANGE-04 / CHANGE-06).
- Escribir los `exception_handler` que producen `ErrorDetail` (CHANGE-07).
- Normalizar el email a lowercase — el roadmap lo asigna a `UserRepository.create` (CHANGE-03); ver D-11.
- Definir `ScanRequest` / `ScanResponse` / `N8nPayload` (CHANGE-08). `schemas/scan_schemas.py` queda como placeholder: con D-10 resuelto, este change ya no lo toca salvo para corregir su docstring obsoleto.
- Montar rutas o tocar `main.py`.

## Decisions

### D-1 — `EmailStr` en los schemas de entrada; `str` en el payload del JWT
`UserRegister.email` y `UserLogin.email` son `EmailStr`: la validación sintáctica de email ocurre en la frontera, antes de tocar la base. `TokenData.email`, en cambio, es `str | None`.

*Por qué la asimetría*: `TokenData` no modela una entrada del usuario sino un JWT **ya decodificado**, cuyo `sub` puede venir de un token hostil o manipulado. Si fuera `EmailStr`, un token con un `sub` inválido lanzaría un `ValidationError` de Pydantic dentro de `get_current_user` (CHANGE-06), y eso saldría como **422 en vez de 401** — el código correcto para "tu token no sirve". Un token con `sub` basura es un fallo de *autenticación*, no de *validación de request*.

*Alternativa descartada*: `EmailStr` en `TokenData` "por consistencia" — cambia el código de estado y filtra al atacante que su token llegó a parsearse.

### D-2 — Tope de 72 bytes en la contraseña, validado por bytes y no por caracteres ✅ DECIDIDO (aceptada)
`UserRegister.password`: mínimo 8 (RN-WS-15) y **máximo 72 bytes UTF-8**. `UserLogin.password` lleva el mismo techo (ver D-3).

*Por qué*: es el límite duro del algoritmo bcrypt, y la versión instalada lo hace explotar con `ValueError` en vez de truncar (ver Contexto). Sin este tope, la contraseña de 100 caracteres de un gestor de contraseñas produce un 500. Con el tope, produce un 422 con un mensaje accionable.

*Por qué por bytes y no `max_length=72`*: `max_length` en Pydantic cuenta **caracteres**. Una contraseña de 40 caracteres con acentos o emojis pasa `max_length=72` y después revienta en bcrypt. Se implementa con un `AfterValidator` que mide `len(value.encode("utf-8"))`, compartido por ambos schemas vía un alias `Annotated`. `min_length=8` sí se expresa como constraint normal de `Field` (RN-WS-15 habla de caracteres, no de bytes).

*Alternativa descartada*: truncar la contraseña a 72 bytes en el Service. Truncar en silencio significa que dos contraseñas distintas dan el mismo login — es una debilidad de seguridad disfrazada de conveniencia.

**✅ Resolución del usuario — ACEPTADA**: se agrega el tope de 72 **bytes** UTF-8 a `UserRegister.password` (y, por el alias compartido, a `UserLogin.password`). Queda explícito que un `max_length` de Pydantic **no sirve** para esto porque cuenta caracteres: hace falta un validador propio que codifique a UTF-8 y compare `len(value.encode("utf-8")) <= 72`. Sin ese tope, bcrypt 5.0 lanza `ValueError` por encima de 72 bytes → 500 no controlado en vez del 422 validado.

*Consecuencia asumida*: el tope no está en la KB, así que **CHANGE-14 (Zod) debe replicarlo** o el frontend dejará escribir una contraseña que el backend rechaza con un 422 sin explicación en el formulario (ver tarea 8.4 y R-2).

### D-3 — `UserLogin.password` tiene `min_length=1`, no 8 ✅ DECIDIDO (aceptada tal cual se propuso)
El login acepta cualquier contraseña no vacía (con el mismo techo de 72 bytes de D-2). No reasserta la política de 8 caracteres.

*Por qué*: (a) si algún día la política sube a 12, los usuarios existentes con contraseñas de 8 quedarían **bloqueados por el schema de login**, sin poder ni siquiera autenticarse para cambiarla; (b) un 422 "password too short" en el login le confirma al atacante la política vigente y, peor, **distingue el fallo del 401 genérico** que RN-WS-12/HU-03-02 exigen precisamente para evitar enumeración. La validación de longitud pertenece al registro, no al login.

*Alternativa descartada*: `min_length=8` en ambos "por simetría" — rompe la garantía de 401 indistinguible.

**✅ Resolución del usuario — ACEPTADA TAL CUAL SE PROPUSO**: `UserLogin.password` se implementa con `min_length=1`. Sin cambios respecto del borrador.

### D-4 — Sin reglas de complejidad de contraseña ✅ DECIDIDO (aceptada tal cual se propuso)
No se exige mayúscula, dígito ni símbolo. La única política es la longitud de D-2/D-3.

*Por qué*: RN-WS-15 define exactamente una regla ("mínima 8 caracteres") y nada más. Agregar reglas no escritas desincroniza silenciosamente el backend del Zod de CHANGE-14 y de la KB, que es la fuente de verdad del dominio.

**✅ Resolución del usuario — ACEPTADA TAL CUAL SE PROPUSO**: no se agregan reglas de complejidad (ni mayúscula, ni dígito, ni símbolo). La única política de contraseña del proyecto es la de longitud (mínimo 8 caracteres de RN-WS-15 + techo de 72 bytes de D-2). Sin cambios respecto del borrador.

### D-5 — `extra="forbid"` en los schemas de entrada; `extra="ignore"` en `TokenData`
`UserRegister` y `UserLogin` rechazan campos desconocidos. `TokenData` los ignora.

*Por qué la asimetría (esta es la parte no obvia)*: un campo extra en un request es un bug del cliente o una sonda de un atacante — falla cerrado, con un 422 explícito, y evita el clásico "mandé `is_admin: true` y el backend lo aceptó". Pero `TokenData` se construye desde el payload de un JWT decodificado, que **siempre** trae claims estándar adicionales (`exp`, `iat`, y el propio `sub`). Con `forbid`, todo token válido fallaría al parsearse. `TokenData` debe quedarse con el comportamiento permisivo.

*Alternativa descartada*: `forbid` uniforme — rompe CHANGE-06 el día que se implemente, con un error difícil de diagnosticar.

### D-6 — `password` como `str` con `repr=False`, no `SecretStr` ✅ DECIDIDO (aceptada tal cual se propuso)
Los campos de contraseña se declaran `str` con `Field(..., repr=False)`.

*Por qué*: `repr=False` saca la contraseña del `repr()`/`str()` del modelo, que es por donde se filtra en la práctica — un `logger.info(payload)` o el `repr` de un objeto dentro de un traceback. Mantener `str` es fiel al roadmap, deja las constraints de longitud expresadas de la forma más simple, y no obliga a un `.get_secret_value()` en cada punto de uso.

*Alternativa considerada seriamente — `SecretStr`*: sería **más consistente** con `core/settings.py` (que ya usa `SecretStr` para `JWT_SECRET` y `N8N_WEBHOOK_TOKEN`) y protege más: `model_dump()` de un `SecretStr` devuelve `**********`, o sea que ni siquiera un log del modelo serializado filtra. El costo es un `.get_secret_value()` en `AuthService` al hashear y al verificar.

**✅ Resolución del usuario — ACEPTADA TAL CUAL SE PROPUSO**: los campos de contraseña se tipan `str` con `Field(..., repr=False)` (o equivalente), **no** `SecretStr`. Se descarta `SecretStr` y con él el `.get_secret_value()` en `AuthService` (CHANGE-04). La garantía de no filtración es la exclusión del `repr()` más el hecho de que **en ningún caso** la contraseña aparece en un schema de salida. Sin cambios respecto del borrador.

### D-7 — `token_type: Literal["bearer"]` con default `"bearer"`
No es un `str` libre.

*Por qué*: el frontend construye `Authorization: Bearer <token>` a partir de un valor que en la práctica es constante. Declararlo `Literal` lo convierte en parte del contrato verificable: si un change futuro lo cambia, es un error de tipo y un test rojo, no un 401 silencioso en el navegador.

### D-8 — `expires_in` en **segundos**, llenado por el Service, no por el schema
`TokenResponse.expires_in: int` con `gt=0`, expresado en segundos (RFC 6749 §5.1). `settings.TOKEN_EXPIRE_HOURS = 24` → `expires_in = 86400`.

*Por qué segundos*: es lo que define el estándar de respuesta de token de OAuth 2.0 y lo que cualquier cliente HTTP asume. Emitir horas produciría un frontend que expira el token 3600 veces antes de tiempo.

*Por qué no lo calcula el schema*: leer `Settings` desde un schema lo acoplaría a la configuración y rompería la regla de que la config solo se lee vía `core/settings.py` + `Depends`. La conversión horas→segundos vive en `AuthService` (CHANGE-04). El schema solo declara la unidad y exige que sea positivo.

### D-9 — `ErrorDetail`: `type` e `instance` son `str`, no `AnyUrl`
`type: str = "about:blank"`, `title: str`, `status: int` (100..599), `detail: str`, `instance: str`.

*Por qué `str`*: RFC 7807 define `type` e `instance` como **URI references**, que incluyen referencias relativas. En la práctica `instance` es el path del endpoint que falló (`/api/v1/auth/login`, según el criterio de aceptación de CHANGE-07) y `AnyUrl` de Pydantic rechaza los paths relativos por falta de esquema. Usar `AnyUrl` obligaría a inventar un host absoluto en cada error.

*Por qué `type` tiene default*: `"about:blank"` es el valor que RFC 7807 prescribe cuando el error no tiene un tipo de problema propio; así los handlers de CHANGE-07 pueden construir un `ErrorDetail` sin inventar URIs.

*Por qué `status` acotado*: un `status` fuera de 100..599 en un cuerpo RFC 7807 es siempre un bug del handler; el rango lo convierte en un fallo visible en tests.

### D-10 — `ErrorDetail` vive en un módulo propio `schemas/error_schemas.py` ✅ DECIDIDO (aceptada con cambio)
`ErrorDetail` **no** va en `schemas/scan_schemas.py`: se crea el módulo nuevo `fastapi_bridge/schemas/error_schemas.py` y el contrato de error vive ahí. `scan_schemas.py` queda como placeholder hasta CHANGE-08, que es cuando llegan `ScanRequest`/`ScanResponse`/`N8nPayload`.

*Por qué*: `ErrorDetail` es un contrato **transversal** — lo importan los handlers globales (`exceptions/handlers.py`, CHANGE-07) y el dominio Auth (401, 409), no solo Scan. Alojarlo en el módulo de un dominio es una dependencia invertida: obligaría a `exceptions/handlers.py` y al router de auth (CHANGE-05) a importar de un módulo de dominio ajeno (`scan_schemas`) para hablar de errores que nada tienen que ver con escaneos. Un módulo dedicado deja el import leyéndose por lo que es (`from fastapi_bridge.schemas.error_schemas import ErrorDetail`) y evita que `scan_schemas.py` se convierta en el cajón de sastre de los contratos compartidos.

*Costo verificado de la desviación*: `tests/test_structure.py` solo afirma que los 18 módulos esperados **existan** y sean importables (`test_expected_module_file_exists` / `test_expected_module_is_importable`, ambos parametrizados sobre una lista, sin assert de conjunto exacto), y `DOMAIN_LAYERS` solo parametriza los dominios `auth` y `scan`. Agregar un módulo adicional no rompe ninguno de esos tests. Las reglas de frontera de `LAYER_IMPORT_RULES` (D-12) se aplican al paquete `schemas/` completo, así que `error_schemas.py` queda cubierto automáticamente sin filas nuevas. El único costo real es re-sincronizar el texto de `CHANGES.md` para CHANGE-02, que se hace en la tarea 8.1.

**✅ Resolución del usuario — ACEPTADA, DESVIACIÓN APROBADA**: el usuario aprobó explícitamente apartarse del texto literal del roadmap (`CHANGES.md` decía `scan_schemas.py`) en favor de la limpieza arquitectónica. El roadmap se re-sincroniza en la nota de implementación de la tarea 8.1; el texto del roadmap no es un contrato, la estructura de capas sí.

*Alternativa descartada*: mantener `ErrorDetail` en `scan_schemas.py` "por fidelidad al roadmap" — barato hoy, pero mover el símbolo después de CHANGE-05 y CHANGE-07 implica tocar tres módulos consumidores en lugar de uno.

### D-11 — El email **no** se normaliza en el schema
`UserRegister.email` se valida pero no se pasa a lowercase acá.

*Por qué*: el roadmap asigna explícitamente esa responsabilidad a `UserRepository.create` (CHANGE-03), cuyo criterio de aceptación la testea (`"USER@TEST.COM"` → `"user@test.com"`). Hacerlo también acá duplicaría la responsabilidad en dos capas.

*Riesgo que esto deja abierto y que no se resuelve en este change*: si `create` normaliza pero `get_by_email` (el lookup del login) **no**, entonces un usuario registrado como `USER@X.COM` (guardado `user@x.com`) no podrá iniciar sesión escribiendo su email tal como lo tipeó. Queda anotado como Open Question para CHANGE-03/04.

### D-12 — Extender `LAYER_IMPORT_RULES` con la frontera de `schemas/`
Se agregan tres filas a la tabla de `tests/test_layer_boundaries.py`: `schemas` no importa `fastapi`, ni `sqlalchemy`, ni `httpx`.

*Por qué*: los schemas son la capa que más se reutiliza hacia arriba; si algún día alguien importa `UploadFile` de FastAPI o un tipo de SQLAlchemy en un schema, la capa deja de ser reutilizable y arrastra el framework a todo lo que la importe. La tabla se diseñó en CHANGE-00a para crecer exactamente así, una línea por regla.

*Nota tras D-10*: las reglas se declaran sobre el paquete `schemas/`, no sobre módulos individuales, así que `error_schemas.py` queda cubierto por las mismas tres filas — no hacen falta filas adicionales por el módulo nuevo.

### D-13 — Tests: unitarios puros, sin `TestClient`
`tests/test_auth_schemas.py` valida los modelos directamente (`UserRegister(**payload)` / `pytest.raises(ValidationError)`), sin levantar la app.

*Por qué*: los schemas no dependen de FastAPI (D-12), así que testearlos a través de HTTP mediría el router — que no existe hasta CHANGE-05 — en vez del contrato. Además el mapeo `ValidationError` → 422 RFC 7807 es responsabilidad de CHANGE-07 y se testea allá.

## Risks / Trade-offs

- **R-1 — `passlib 1.7.4` incompatible con `bcrypt 5.0.0` (bloquea CHANGE-04, no este change)** → El `requirements.txt` declara `passlib[bcrypt]>=1.7` sin techo, y el entorno resolvió bcrypt 5.0.0, con el que `CryptContext(...).hash()` falla. Mitigación: no se toca en este change (acá no se hashea), pero se registra en Open Questions y en Engram para que CHANGE-04 arranque decidiendo entre (a) fijar `bcrypt<4.1` en `requirements.txt`, o (b) usar la librería `bcrypt` directamente y sacar `passlib` — que es hoy la recomendación corriente, dado que passlib no tiene release desde 2020.
- **R-2 — El tope de 72 bytes desincroniza backend y frontend** → Si CHANGE-14 no replica la regla, el usuario escribe una contraseña larga válida para el formulario y recibe un 422 opaco. Mitigación: queda escrito en el spec de `auth-contracts` como requirement, y en `CHANGES.md` CHANGE-14 ya declara paridad con los schemas de backend.
- **R-3 — `extra="forbid"` vuelve el contrato rígido** → Un cliente que mande un campo de más (un `remember_me` del formulario, por ejemplo) recibe 422 en vez de que se lo ignoren. Mitigación: es el comportamiento deseado (falla cerrado) y el frontend es del mismo equipo; el spec lo declara explícitamente para que el fallo sea esperado y no una sorpresa.
- **R-4 — ~~`ErrorDetail` en `scan_schemas.py` crea una dependencia invertida~~ (RESUELTO)** → El usuario aceptó D-10 con cambio: `ErrorDetail` se crea directamente en `schemas/error_schemas.py`, de modo que ni Auth ni los handlers globales importan de un módulo de dominio ajeno. El riesgo residual es únicamente documental: el texto de `CHANGES.md` para CHANGE-02 sigue diciendo `scan_schemas.py` hasta que la tarea 8.1 lo re-sincronice con una nota de implementación.
- **R-5 — Sobre-validar la contraseña degrada la seguridad en el login** → Ya mitigado por D-3, pero es fácil de reintroducir: cualquiera que "unifique" las constraints de `UserRegister` y `UserLogin` rompe la garantía de 401 indistinguible. Mitigación: el spec lo declara como requirement con escenario propio, así que la unificación produce un test rojo.
- **Trade-off aceptado** — este change no produce ningún comportamiento observable por el usuario final: no hay endpoint que ejercite estos schemas hasta CHANGE-05. Se acepta porque el costo de definir el contrato después de tener consumidores es mucho mayor que el de definirlo antes.

## Open Questions

Ninguna de las preguntas abiertas restantes bloquea este change. Las cinco decisiones del checkpoint de governance (D-2, D-3, D-4, D-6, D-10) están **cerradas** — ver §Context y cada decisión.

1. **(bloquea CHANGE-04, no este change)** ¿`passlib` con `bcrypt<4.1` fijado, o `bcrypt` directo sin passlib? Ver R-1.
2. **(D-11, para CHANGE-03/04)** ¿`get_by_email` normaliza el email a lowercase antes de consultar? Si no lo hace, el login por email con mayúsculas falla pese a que el registro lo aceptó.

### Resueltas en el checkpoint de governance

| # | Pregunta | Resolución |
|---|----------|------------|
| D-2 | ¿Se confirma el techo de 72 bytes UTF-8 en la contraseña? | **Sí**, aceptada. Validador por bytes, no `max_length`. |
| D-3 | ¿`UserLogin.password` con `min_length=1` o con 8? | **`min_length=1`**, aceptada tal cual se propuso. |
| D-4 | ¿Se agregan reglas de complejidad de contraseña? | **No**, aceptada tal cual se propuso. |
| D-6 | ¿`str` + `repr=False` o `SecretStr` para las contraseñas? | **`str` + `repr=False`**, aceptada tal cual se propuso. |
| D-10 | ¿`ErrorDetail` en `scan_schemas.py` o en `error_schemas.py`? | **`schemas/error_schemas.py`**, desviación del roadmap aprobada por el usuario. |
