## Context

Ver `proposal.md` §Why para la motivación. Lo relevante para el diseño es el **estado actual del código** y las restricciones que impone:

- `fastapi_bridge/main.py` construye `app = FastAPI(...)` a nivel de módulo, con `lifespan` vacío y una sola ruta (`GET /health`). No hay middleware de ningún tipo.
- `fastapi_bridge/core/settings.py` ya expone `CORS_ORIGINS: list[str]`, `RATE_LIMIT_REQUESTS: int` y `RATE_LIMIT_WINDOW: int`, accesibles vía `get_settings()` (cacheada con `@lru_cache`).
- `fastapi_bridge/exceptions/handlers.py` es hoy **sólo un docstring**: no hay ni una función.
- `fastapi_bridge/api/v1/scan/router.py` existe con `prefix="/api/v1/scan"` pero **sin ninguna operación** y **sin montarse** en `main.py`. El spec `bridge-bootstrap` lo fija como contrato explícito y el test `test_domain_routers_are_not_mounted_yet` afirma que `POST /api/v1/scan/start` devuelve `404`. Montarlo acá rompería ese contrato y pisaría el scope de CHANGE-12.
- `slowapi` ya está en `requirements.txt`. La versión instalada expone `Limiter(key_func=...)`, `RateLimitExceeded(HTTPException)` con `status_code=429`, y `Limiter.limit()` que acepta **un string o un callable que devuelve un string**.
- `pytest.ini` corre con `asyncio_mode = auto`; los tests existentes usan `httpx.ASGITransport` contra la app importada.

La tensión central del change: **los criterios de aceptación hablan de `/api/v1/scan/start`, pero ese endpoint no existe todavía y no debe existir después de este change.**

## Goals / Non-Goals

**Goals:**

- Dejar la política de borde (CORS + rate limiting + respuesta 429 RFC 7807) **construida, cableada y probada** sin agregar ninguna ruta de aplicación.
- Entregarle a CHANGE-12 un artefacto listo para usar: un decorador de límite importable que se aplica sobre `POST /start` con una línea, sin que CHANGE-12 tenga que saber nada de slowapi ni de `Settings`.
- Establecer el constructor de "problem details" RFC 7807 que CHANGE-07 va a reutilizar para el resto de los handlers, para que no existan dos formatos de error distintos en el proyecto.
- Que todo el comportamiento sea gobernado por `Settings` — cero valores de política hardcodeados.

**Non-Goals:**

- **No** se monta `api/v1/scan/router.py` ni `api/v1/auth/router.py` en `main.py` (CHANGE-05 y CHANGE-12).
- **No** se implementan los handlers de `RequestValidationError`, `HTTPException` genérica ni `Exception` → 500 (CHANGE-07).
- **No** se define `ErrorDetail` en `schemas/scan_schemas.py` (CHANGE-08); acá el cuerpo del problem details se arma con un helper interno, no con un modelo Pydantic público.
- **No** se introduce Redis ni ningún backend distribuido para el contador de tasa.
- **No** se implementan `X-RateLimit-*` informativos (fuera del spec; sólo `Retry-After` es requisito).

## Decisions

### D-1 — `create_app()` factory, conservando `app` a nivel de módulo

`CORSMiddleware` recibe su lista de orígenes **en tiempo de construcción** de la app, no por request: no existe forma de inyectarlo con `Depends(get_settings)`. Eso obliga a leer `Settings` durante el armado de la aplicación.

**Decisión**: extraer el armado a `def create_app(settings: Settings | None = None) -> FastAPI` en `main.py`, y mantener `app = create_app()` a nivel de módulo.

- **Por qué**: es el único punto donde `Settings` puede entrar al middleware, y a la vez hace la política **testeable con distintas configuraciones** sin tocar variables de entorno del proceso ni invalidar el `lru_cache` de `get_settings()`. `app.dependency_overrides` no sirve acá porque el middleware no pasa por el sistema de `Depends`.
- **Compatibilidad**: `uvicorn fastapi_bridge.main:app`, `from fastapi_bridge.main import app` y los cinco tests de `test_health.py` siguen funcionando sin cambios, incluido `test_importing_main_creates_no_module_level_engine_or_client` (el `Limiter` no es `Engine` ni `AsyncClient`).
- **Alternativa descartada**: leer `get_settings()` directo dentro de `main.py` sin factory. Más corto, pero congela la política en el import: un test que quiera probar "origen no permitido" tendría que manipular el entorno del proceso y limpiar el cache global, con contaminación entre tests.
- **Alternativa descartada**: middleware CORS propio que lea `Settings` por request. Reimplementa mal una pieza de Starlette que ya está bien resuelta y auditada; en un proyecto de ciberseguridad, escribir CORS a mano es exactamente el tipo de decisión que no se justifica.

### D-2 — CORS restrictivo y explícito, sin comodines ni credenciales

Configuración exacta:

| Parámetro | Valor | Razón |
|---|---|---|
| `allow_origins` | `settings.CORS_ORIGINS` | Regla dura: cero config hardcodeada. |
| `allow_credentials` | `False` | La auth del sistema es **Bearer token en `Authorization`** (RN-WS-11), no cookies. Habilitar credenciales sin necesitarlas amplía la superficie (CSRF cross-origin) a cambio de nada. |
| `allow_methods` | `["GET", "POST", "OPTIONS"]` | Los únicos verbos que el sistema usa: `GET /health`, `POST` de auth y de scan. Mínimo privilegio en vez de `["*"]`. |
| `allow_headers` | `["Authorization", "Content-Type"]` | Lo que el frontend efectivamente manda: el JWT y el `Content-Type: application/json`. |
| `max_age` | default de Starlette (600s) | Sin razón para tocarlo. |

- **Por qué no `allow_origins=["*"]` ni regex**: `CORS_ORIGINS` es una lista corta y conocida (la URL de la Landing). Un comodín anula el propósito del requisito.
- **Trampa conocida que esta decisión evita**: `allow_credentials=True` combinado con `allow_origins=["*"]` es una configuración que los navegadores rechazan y que suele "arreglarse" reflejando el `Origin` entrante — es decir, aceptando todo. Al fijar `allow_credentials=False` desde el inicio, esa presión no aparece.

### D-3 — Semántica real de "bloqueo CORS": qué se puede afirmar en un test

El criterio de aceptación dice *"request desde origen no en `CORS_ORIGINS` recibe bloqueo CORS"*. Esto es **una imprecisión del roadmap que hay que traducir**, porque CORS no es una defensa del servidor:

- Para una **solicitud simple** (no preflight), `CORSMiddleware` **igual ejecuta el endpoint** y responde normalmente; lo único que hace ante un origen no permitido es **omitir el header `Access-Control-Allow-Origin`**. Quien bloquea es el navegador, no el servidor. Un cliente que no sea un navegador (curl, Postman, otro backend) no se ve afectado en absoluto.
- Para un **preflight `OPTIONS`** con origen no permitido, Starlette sí responde `400` con cuerpo `Disallowed CORS origin`.

**Decisión**: el spec y los tests afirman lo verificable — *ausencia de `Access-Control-Allow-Origin`* para el origen no permitido, y `400` en el preflight — en vez de afirmar un "403 del servidor" que no existe. Consecuencia práctica que conviene tener presente: **CORS no es control de acceso**; el control de acceso real de `/scan/start` es el JWT de CHANGE-06 más el rate limit de este change.

### D-4 — Límite por decorador, nunca `default_limits` + `SlowAPIMiddleware`

slowapi ofrece dos modos: `SlowAPIMiddleware` con `default_limits` (aplica a **todas** las rutas) o el decorador `@limiter.limit(...)` por endpoint.

**Decisión**: sólo el decorador. **No** se registra `SlowAPIMiddleware` ni se configuran `default_limits`.

- **Por qué**: el requisito es explícito en que auth y `/health` **no** están sujetos al límite del scan (`08_arquitectura_propuesta.md` §Seguridad). Con `default_limits` el comportamiento por defecto sería el inverso — todo limitado — y auth quedaría protegido sólo por una exención que alguien puede olvidar de agregar en CHANGE-05. El default seguro acá es *no limitar*, y limitar explícitamente el único endpoint caro.
- **Consecuencia**: un `Limiter` sin middleware sigue necesitando `app.state.limiter = limiter` (slowapi lo busca ahí) y el handler de `RateLimitExceeded` registrado. Ambas cosas las hace `create_app()`.

### D-5 — La limit string se resuelve perezosamente desde `Settings`

`slowapi.Limiter.limit()` acepta `limit_value` como **string o callable que devuelve string**, y el callable se evalúa **en cada request**.

**Decisión**: `core/limiter.py` expone el decorador con un callable:

```
scan_rate_limit = limiter.limit(lambda: f"{s.RATE_LIMIT_REQUESTS} per {s.RATE_LIMIT_WINDOW} second")
```

donde `s` se obtiene de `get_settings()` **dentro** del callable.

- **Por qué**: el decorador se aplica en tiempo de import del router (CHANGE-12). Si la limit string fuera un literal evaluado ahí, la política quedaría congelada en el primer import y un test que quiera probar "cupo de 2" tendría que reimportar módulos. Con el callable, el valor se lee por request y el test sólo necesita sustituir `Settings`.
- **Formato**: `"{N} per {W} second"` es sintaxis válida de la librería `limits`. Se prefiere sobre `"10/hour"` porque `RATE_LIMIT_WINDOW` está en **segundos** en el `.env` y traducirlo a "hour"/"minute" requeriría lógica de conversión que puede no ser exacta.
- **Costo**: `get_settings()` está `@lru_cache`-ada, así que la lectura por request es un lookup de diccionario. Irrelevante.

### D-6 — Este change es dueño del handler de `RateLimitExceeded`; CHANGE-07 hereda el helper

El roadmap lista el handler de `RateLimitExceeded` en el scope de **CHANGE-00d y de CHANGE-07** — una duplicación real en `CHANGES.md`.

**Decisión**: CHANGE-00d lo implementa. CHANGE-07 lo encuentra hecho y agrega los restantes (`RequestValidationError`, `HTTPException`, `Exception` → 500) **reutilizando** el constructor de problem details que se establece acá.

- **Por qué**: es criterio de aceptación de HU-03-06 y de este change, y CHANGE-12 lo necesita antes de que CHANGE-07 esté necesariamente listo (00d y 07 pueden correr en paralelo, con agentes distintos, según el plan multi-agente).
- **Forma concreta**: `exceptions/handlers.py` expone (a) `problem_detail_response(...) -> JSONResponse` — el constructor único de RFC 7807, y (b) `rate_limit_exceeded_handler(request, exc)` que lo usa. CHANGE-07 amplía el módulo; no lo reescribe.
- **Gotcha que hay que dejar anotado para CHANGE-07**: `RateLimitExceeded` **hereda de `starlette.exceptions.HTTPException`**. Cuando CHANGE-07 registre un handler para `HTTPException`, Starlette resuelve por MRO y el handler más específico gana — el de `RateLimitExceeded` sigue teniendo prioridad. Pero si alguien registrara el de `HTTPException` **en lugar** del específico, los 429 perderían silenciosamente su `Retry-After`. El test de este change es la red que detecta esa regresión.

### D-7 — `Retry-After` se calcula desde `RATE_LIMIT_WINDOW`, no desde la API privada de slowapi

El handler por defecto de slowapi (`_rate_limit_exceeded_handler`) devuelve `{"error": "Rate limit exceeded: ..."}` — **no es RFC 7807** — y obtiene los headers llamando a `limiter._inject_headers(...)`, una **API privada** que además sólo emite `Retry-After` si el `Limiter` se construyó con `headers_enabled=True`, y que depende de que `request.state.view_rate_limit` esté seteado.

**Decisión**: handler propio que **no** usa el default ni `_inject_headers`. El valor de `Retry-After` se toma de `settings.RATE_LIMIT_WINDOW` (segundos, entero).

- **Por qué**: no atar el proyecto a un atributo con guion bajo de una dependencia de terceros, y garantizar que `Retry-After` esté **siempre** presente en el 429 (es requisito del spec), no condicionado a un flag de configuración de la librería.
- **Trade-off aceptado**: el valor es el **peor caso** (la ventana completa), no los segundos exactos que restan hasta el reset. Para una ventana de 3600s, un cliente que agotó el cupo en el minuto 59 recibirá `Retry-After: 3600` en vez de `60`. Es conservador y correcto por RFC (el cliente espera de más, nunca de menos); el precio es reintentos más tardíos de lo estrictamente necesario. Si más adelante se quiere precisión, se refina consultando `limiter.limiter.get_window_stats(...)` sin cambiar el contrato del spec.

### D-8 — El límite se prueba sobre una ruta de test, no montando `/scan/start`

Los criterios de aceptación dicen *"la solicitud 11 a `/scan/start` recibe 429"*, pero `POST /api/v1/scan/start` **no existe** y `bridge-bootstrap` exige que siga devolviendo `404`.

**Decisión**: los tests de este change construyen una app vía `create_app()` y le montan **en el propio test** una ruta desechable decorada con `scan_rate_limit` — el mismo decorador exportado que CHANGE-12 va a aplicar sobre el endpoint real. La app de producción no gana ninguna ruta.

- **Por qué**: lo que este change puede y debe garantizar es que **la política existe, está bien construida y produce el 429 correcto**. Que esa política efectivamente cubra el path `/api/v1/scan/start` es, literalmente, una línea de decorador en CHANGE-12 — y CHANGE-12 ya tiene el criterio de aceptación *"POST desde IP con rate limit excedido: 429 RFC 7807"* para verificarlo end-to-end sobre el path real.
- **Lo que se agrega para que la frontera no se pierda**: un test que afirma que `POST /api/v1/scan/start` sigue devolviendo `404` (el contrato sigue intacto), y otro que afirma que ninguna ruta de la app de producción tiene el límite aplicado. Además, un test de contrato sobre `core/limiter.py` verifica que la limit string derivada de `Settings` sea exactamente la esperada — de modo que si alguien cambia el formato, falla acá y no en producción.
- **Alternativa descartada**: montar el router de scan con un `POST /start` placeholder. Rompe `bridge-bootstrap`, rompe `test_domain_routers_are_not_mounted_yet`, invade el scope de CHANGE-12 y deja un endpoint sin JWT expuesto entre este change y CHANGE-06 — inaceptable en un sistema que dispara escaneos activos.

### D-9 — Aislamiento del contador entre tests

El backend por defecto de slowapi es un contador en memoria **compartido a nivel de `Limiter`**. Si dos tests usan el mismo objeto `Limiter`, el segundo arranca con el cupo ya consumido por el primero — un falso positivo/negativo dependiente del orden de ejecución.

**Decisión**: `core/limiter.py` expone una función `build_limiter()` además del singleton de módulo, y los tests de rate limit construyen su propio `Limiter` por test (o resetean su storage) mediante una fixture. Ningún test de límite depende del estado dejado por otro.

- **Por qué**: es la causa más común de tests de rate limiting intermitentes. Vale la línea extra de diseño.
- **Nota sobre la IP en tests**: con `httpx.ASGITransport` el cliente no tiene una IP real y `get_remote_address` puede resolver a `None`/`"testclient"` para todas las requests. Para el escenario *"el cupo es por IP, no global"* hay que **inyectar `client` distintos en el scope ASGI** (o parametrizar el `key_func` en la fixture) en vez de asumir que dos `AsyncClient` distintos son dos IPs distintas.

### D-10 — `get_remote_address` sin confiar en `X-Forwarded-For`

`key_func=get_remote_address` usa `request.client.host`, es decir la IP de la conexión TCP.

**Decisión**: se usa tal cual, **sin** leer `X-Forwarded-For` ni `X-Real-IP`.

- **Por qué**: `X-Forwarded-For` es un header que el cliente puede escribir libremente. Confiar en él sin un proxy de confianza que lo reescriba convierte el rate limit en decorativo: cualquiera rota el header y obtiene cupo infinito. El despliegue de este proyecto es directo sobre Uvicorn, sin reverse proxy declarado.
- **Consecuencia documentada**: si mañana el Bridge se pone detrás de nginx/Traefik, `request.client.host` pasará a ser la IP del proxy y **todos los usuarios compartirán un solo cupo**. Ver Riesgos.

## Risks / Trade-offs

- **[El contador vive en la memoria del proceso]** → Con más de un worker de Uvicorn, cada worker lleva su propio conteo y el límite efectivo se multiplica por el número de workers (10 req se vuelven 10×N). El despliegue de este proyecto es single-worker; queda documentado en el `proposal.md` §Impact. Migrar a un backend compartido es cambiar `storage_uri` del `Limiter` a la instancia de Redis/Memurai que el sistema WASA **ya tiene desplegada** — sin tocar el spec ni el resto del código.
- **[Reiniciar el proceso vacía los contadores]** → Un atacante que pueda provocar reinicios recupera cupo. Riesgo residual aceptado para el alcance v1.2; el mismo cambio a storage compartido lo resuelve.
- **[Poner el Bridge detrás de un reverse proxy colapsa todos los usuarios en un solo cupo]** (D-10) → Mitigación: no se habilita `X-Forwarded-For` ahora. Si se agrega un proxy, la corrección correcta es `ProxyHeadersMiddleware`/`forwarded_allow_ips` de Uvicorn con la IP del proxy declarada como confiable — nunca leer el header a ciegas.
- **[El límite es por IP, no por usuario autenticado]** → Varios usuarios detrás de un mismo NAT corporativo comparten cupo; y un atacante con IPs rotativas lo evade. Es lo que pide RN-WS-06 explícitamente. Cuando exista `get_current_user` (CHANGE-06), se puede evaluar un `key_func` compuesto (IP + subject del JWT) sin cambiar este spec.
- **[CORS no protege nada frente a clientes no-navegador]** (D-3) → Mitigación: el control de acceso real de `/scan/start` es el JWT (CHANGE-06) más este rate limit. No debe presentarse CORS como medida de seguridad del endpoint en la documentación del proyecto.
- **[Divergencia con CHANGE-07 sobre el formato RFC 7807]** (D-6) → Mitigación: el constructor `problem_detail_response(...)` se establece acá como punto único; CHANGE-07 debe extender ese módulo, y su brief tiene que decirlo explícitamente.
- **[Tests de rate limit intermitentes por estado compartido]** (D-9) → Mitigación: fixture que aísla el `Limiter` por test; ningún test de límite se apoya en el singleton de módulo.
- **[`create_app()` es un cambio estructural en `main.py`]** → El TDD estricto exige correr la suite existente como red de seguridad **antes** de tocar `main.py` (los 5 tests de `test_health.py` más `test_structure.py` / `test_layer_boundaries.py`) y volver a correrla después. Cualquier fallo previo se reporta como pre-existente, no se arregla dentro de este change.

## Migration Plan

No hay migración de datos ni de esquema: el change no toca PostgreSQL `db_fuzzing`.

- **Despliegue**: reiniciar el proceso de Uvicorn. La política entra en vigor al construir la app.
- **Verificación post-deploy**: `GET /health` sigue `200`; un preflight `OPTIONS` desde el origen de la Landing devuelve `Access-Control-Allow-Origin`; `POST /api/v1/scan/start` sigue `404` (correcto — el router se monta en CHANGE-12).
- **Rollback**: revertir el commit. No queda estado persistido de este change en ningún lado (el contador de tasa es volátil por diseño).
- **Nota de configuración**: si `CORS_ORIGINS` en el `.env` de producción no incluye la URL real de la Landing, el frontend deja de funcionar en el navegador **sin ningún error del lado del servidor** (el síntoma aparece sólo en la consola del navegador). Es la falla más probable de este change en producción y conviene verificarla explícitamente.

## Open Questions

Ninguna de estas bloquea el apply: ninguna cambia el spec, el enfoque ni el desglose de tareas.

- **¿`CORS_ORIGINS` de producción?** Hoy el `.env` tiene `http://localhost:5173`, que es correcto para desarrollo. El valor de producción (dominio real de la Landing) es una decisión de despliegue, no de código: se resuelve editando el `.env` sin tocar nada de lo que este change escribe.
- **Colisión de puerto 5173** entre `wasa-landing` y el Dashboard existente, ya registrada en `env-config/design.md` (D-4). Si el Dashboard termina sirviéndose desde 5173 y la Landing se mueve a otro puerto, `CORS_ORIGINS` debe seguir a la Landing. Es configuración, no código.
- **¿Se refina `Retry-After` a los segundos exactos restantes?** (D-7). El spec exige "entero de segundos mayor que cero"; la aproximación conservadora lo cumple. Refinarlo es una mejora posterior que no cambia el contrato.
- **¿Se migra el contador a la Redis/Memurai existente?** Depende de si el despliegue final usa más de un worker. Es un cambio de `storage_uri` y no altera ningún requisito del spec.
