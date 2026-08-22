## Why

CHANGE-00a dejó el FastAPI Bridge arrancando y CHANGE-00c le dio valores reales de configuración, pero hoy `fastapi_bridge/main.py` es una app **sin ninguna política de borde**: no hay `CORSMiddleware` (el navegador de `wasa-landing` en `http://localhost:5173` no puede hablarle a `http://localhost:8000` — origen distinto), y no hay rate limiting (nada impide que una IP dispare escaneos ZAP/Nuclei/ffuf/SQLMap en bucle sobre la infraestructura WASA existente). Las variables `CORS_ORIGINS`, `RATE_LIMIT_REQUESTS` y `RATE_LIMIT_WINDOW` ya existen en `Settings` con valores reales en el `.env`, pero **nadie las lee**: son configuración muerta.

Este change cierra la FASE 0 conectando esa configuración a middleware real. Sin él, RN-WS-06 (10 req/IP/60min sobre `/scan/start`) queda sin implementación y CHANGE-12 (`scan-router-protected`) no tiene un `limiter` que decorar ni un handler de 429 al que delegar — por eso CHANGE-12 lo declara como dependencia explícita.

## What Changes

- **`fastapi_bridge/core/limiter.py` (nuevo)** — módulo dueño del singleton `Limiter` de slowapi (`key_func=get_remote_address`) y de la *limit string* del dominio scan, resuelta **de forma perezosa** desde `Settings` (`RATE_LIMIT_REQUESTS` / `RATE_LIMIT_WINDOW`) para que el valor no quede congelado en tiempo de import y los tests puedan variarlo. Exporta el decorador reutilizable que CHANGE-12 aplicará sobre `POST /api/v1/scan/start`.
- **`fastapi_bridge/exceptions/handlers.py` (se implementa su primer handler)** — hoy es un docstring placeholder. Este change le agrega la función que transforma `RateLimitExceeded` en una respuesta **RFC 7807** (`application/problem+json` con `type`/`title`/`status`/`detail`/`instance`) más el header **`Retry-After`**, junto con el constructor interno de "problem details" que CHANGE-07 reutilizará para el resto de los handlers (validación, `HTTPException`, 500 genérico). Este change **no** implementa esos otros handlers.
- **`fastapi_bridge/main.py` (modificado)** — se introduce una función factory `create_app()` que arma la aplicación: registra `CORSMiddleware` con `allow_origins=settings.CORS_ORIGINS` (política restrictiva y explícita: sin comodines, sin `allow_credentials`), publica el `Limiter` en `app.state.limiter` como exige slowapi, y registra el handler de `RateLimitExceeded`. `main.py` sigue exponiendo `app` a nivel de módulo (`app = create_app()`), por lo que `uvicorn fastapi_bridge.main:app` y todos los tests existentes siguen funcionando sin cambios.
- **Rate limit acotado al dominio scan** — el límite se aplica **por endpoint vía decorador**, no como middleware global. Los endpoints de auth (CHANGE-05) y `GET /health` quedan explícitamente fuera del límite, tal como manda `knowledge-base/08_arquitectura_propuesta.md` §Seguridad.
- **Tests nuevos** (`fastapi_bridge/tests/test_cors.py`, `fastapi_bridge/tests/test_rate_limit.py`) que verifican la política de borde: headers CORS presentes para un origen permitido, ausentes (y preflight rechazado) para uno no permitido, la solicitud N+1 desde la misma IP recibiendo 429 con `Retry-After` y cuerpo RFC 7807, y la ausencia de límite sobre rutas que no son de scan.

**No hay BREAKING**: no se monta ningún router de dominio, no se agrega ninguna ruta de aplicación, no se toca la base compartida `db_fuzzing` y `GET /health` conserva su contrato exacto. La superficie de API sigue siendo la que fija `bridge-bootstrap`.

## Capabilities

### New Capabilities
- `api-edge-security`: la política de borde HTTP del FastAPI Bridge — qué orígenes de navegador pueden consumir la API y con qué métodos/headers, cuántas solicitudes por IP y por ventana admite el endpoint de disparo de escaneos, qué endpoints quedan explícitamente fuera de ese límite, y qué forma exacta (RFC 7807 + `Retry-After`) tiene la respuesta cuando el límite se excede. Cubre RN-WS-06 y la mitad "429" de RN-WS-09.

### Modified Capabilities
<!-- Ninguna. -->

`bridge-bootstrap` **no** se modifica: sus requisitos "Superficie de API acotada al scaffold" (la única ruta de aplicación sigue siendo `GET /health`; `POST /api/v1/scan/start` sigue devolviendo 404 porque el router sigue sin montarse), "Endpoint de salud", "Import de la app como objeto" y "El scaffold no toca la base de datos compartida" siguen siendo verdaderos después de este change. `runtime-configuration` tampoco se modifica: este change **consume** `CORS_ORIGINS` / `RATE_LIMIT_*`, no altera el contrato de `Settings`.

## Impact

- **Código nuevo**: `fastapi_bridge/core/limiter.py`, `fastapi_bridge/tests/test_cors.py`, `fastapi_bridge/tests/test_rate_limit.py`.
- **Código modificado**: `fastapi_bridge/main.py` (factory `create_app()`, middleware CORS, wiring del limiter y del handler), `fastapi_bridge/exceptions/handlers.py` (deja de ser placeholder).
- **Dependencias**: ninguna nueva — `slowapi` ya está declarada en `fastapi_bridge/requirements.txt` desde CHANGE-00a y `CORSMiddleware` viene con Starlette/FastAPI.
- **Configuración**: se empiezan a consumir `CORS_ORIGINS`, `RATE_LIMIT_REQUESTS` y `RATE_LIMIT_WINDOW`, ya presentes en `.env` y `.env.example` desde CHANGE-00c. No se agregan variables nuevas.
- **Sin impacto en la base compartida**: no se abre conexión ni se ejecuta DDL. Las tablas `scans` / `vulnerabilities` del sistema WASA existente quedan intactas.
- **Almacenamiento del contador de rate limit**: en memoria del proceso (backend por defecto de slowapi). Suficiente para el despliegue single-worker de este proyecto; ver `design.md` para la implicancia si mañana se corre con múltiples workers.
- **Frontera con CHANGE-07**: el roadmap lista el handler de `RateLimitExceeded` en el scope de **ambos** changes. Este change lo implementa (es criterio de aceptación de HU-03-06 y CHANGE-12 lo necesita antes); CHANGE-07 hereda el helper RFC 7807 que acá se establece y agrega los handlers restantes. Ver `design.md`, D-6.
- **Desbloquea**: CHANGE-12 (`scan-router-protected`, que decora `POST /start` con el limiter de este change) y CHANGE-16/18 (el frontend puede finalmente hacer requests cross-origin contra el Bridge).
