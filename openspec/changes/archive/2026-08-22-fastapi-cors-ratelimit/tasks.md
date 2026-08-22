> **Modo TDD estricto activo.** Cada tarea de implementación se escribe RED → GREEN → TRIANGULATE → REFACTOR. Ninguna línea de código de producción se escribe antes de su test fallando. Las tareas están ordenadas para que eso sea posible: primero la red de seguridad, después cada pieza con su test.
>
> Referencias: requisitos en `specs/api-edge-security/spec.md`; decisiones de implementación en `design.md` (D-1 … D-10).

## 1. Red de seguridad (antes de tocar código existente)

- [x] 1.1 Correr `pytest` completo y registrar el baseline exacto (`N passed`). Verificación: la suite está verde. Si algún test falla, **detenerse** y reportarlo como fallo pre-existente sin arreglarlo dentro de este change. **Baseline: 69 passed.**
- [x] 1.2 Confirmar que `slowapi` es importable en el entorno (`python -c "from slowapi import Limiter"`) y que `starlette.middleware.cors.CORSMiddleware` también. Verificación: ambos imports sin error; no se agrega ninguna dependencia nueva a `requirements.txt`. Confirmado.

## 2. Constructor RFC 7807 en `exceptions/handlers.py` (D-6)

- [x] 2.1 RED: crear `fastapi_bridge/tests/test_problem_details.py` con un test que llame a `problem_detail_response(...)` (aún inexistente) y afirme que devuelve una `JSONResponse` con `status_code` dado, `media_type == "application/problem+json"` y cuerpo con las cinco claves `type`/`title`/`status`/`detail`/`instance`. Verificación: el test falla por `ImportError`.
- [x] 2.2 GREEN: implementar `problem_detail_response(...)` en `fastapi_bridge/exceptions/handlers.py` (type hints obligatorios en toda firma) con lo mínimo para pasar. Verificación: el test de 2.1 pasa.
- [x] 2.3 TRIANGULATE: agregar casos con distinto `status`, distinto `instance` y `detail` ausente, y un caso que afirme que el cuerpo **no** contiene claves de depuración (stack trace, rutas de archivo). Verificación: `Scenario: El error no filtra información interna` cubierto; la implementación se generaliza si estaba hardcodeada.
- [x] 2.4 REFACTOR: extraer a constantes de módulo los literales de `type`/`title` y el `media_type`, y dejar el docstring que declara este helper como **punto único** de RFC 7807 para todo el proyecto, con la nota para CHANGE-07 (D-6). Verificación: tests siguen verdes.

## 3. Limiter configurable en `core/limiter.py` (D-4, D-5, D-9, D-10)

- [x] 3.1 RED: crear `fastapi_bridge/tests/test_limiter.py` con un test que importe `build_limiter` / `scan_limit_string` de `fastapi_bridge.core.limiter` (aún inexistente) y afirme que con `RATE_LIMIT_REQUESTS=10` y `RATE_LIMIT_WINDOW=3600` la limit string es exactamente `"10 per 3600 second"`. Verificación: falla por `ImportError`.
- [x] 3.2 GREEN: crear `fastapi_bridge/core/limiter.py` con `build_limiter()` (devuelve `Limiter(key_func=get_remote_address)`), el singleton de módulo `limiter`, y el callable `scan_limit_string()` que lee `get_settings()` **dentro** de la función (D-5). Verificación: el test de 3.1 pasa.
- [x] 3.3 TRIANGULATE: segundo caso con `RATE_LIMIT_REQUESTS=2` / `RATE_LIMIT_WINDOW=60` sustituyendo `Settings`, afirmando `"2 per 60 second"`. Verificación: cubre `Scenario: El cupo y la ventana son configurables`; si 3.2 quedó hardcodeado, este caso lo rompe y fuerza la generalización.
- [x] 3.4 RED+GREEN: test que afirme que la lectura de configuración es **perezosa** — cambiar `Settings` después de importar el módulo cambia la limit string devuelta, sin reimportar. Verificación: el test pasa y documenta la razón de ser del callable (D-5).
- [x] 3.5 Exportar el decorador reutilizable `scan_rate_limit = limiter.limit(scan_limit_string)` para que CHANGE-12 lo aplique con una sola línea sobre `POST /start`. Verificación: un test importa `scan_rate_limit` y afirma que es callable (contrato de handoff hacia CHANGE-12).
- [x] 3.6 Test de frontera: afirmar que `core/limiter.py` **no** configura `default_limits` ni exporta `SlowAPIMiddleware` (D-4), y que `key_func` es `get_remote_address` sin lectura de `X-Forwarded-For` (D-10). Verificación: cubre `Scenario: El límite se declara por endpoint, no globalmente`.

## 4. Handler de `RateLimitExceeded` (D-6, D-7)

- [x] 4.1 RED: en `test_problem_details.py`, test que invoque `rate_limit_exceeded_handler(request, exc)` (aún inexistente) con un `RateLimitExceeded` simulado y afirme `status_code == 429` y cuerpo RFC 7807 con `status: 429`. Verificación: falla por `ImportError`.
- [x] 4.2 GREEN: implementar `rate_limit_exceeded_handler` en `exceptions/handlers.py` delegando en `problem_detail_response` — **sin** usar el `_rate_limit_exceeded_handler` de slowapi ni `_inject_headers` (API privada, D-7). Verificación: el test de 4.1 pasa.
- [x] 4.3 TRIANGULATE: casos que afirmen (a) header `Retry-After` presente con entero > 0 tomado de `settings.RATE_LIMIT_WINDOW`, (b) `Retry-After` refleja un `RATE_LIMIT_WINDOW` distinto al sustituir `Settings`, (c) `instance` igual al path de la request rechazada. Verificación: cubre `Scenario: Header Retry-After presente` y `Scenario: El campo instance identifica el endpoint`.
- [x] 4.4 REFACTOR: revisar que el handler no lea ningún atributo con guion bajo de slowapi y que todas las firmas tengan type hints. Verificación: tests verdes; `grep` sobre el módulo no encuentra `_inject_headers` ni `_rate_limit_exceeded_handler`.

## 5. `create_app()` + CORS en `main.py` (D-1, D-2, D-3)

- [x] 5.1 RED: crear `fastapi_bridge/tests/test_cors.py` con un test que importe `create_app` de `fastapi_bridge.main` (aún inexistente) y afirme que devuelve una `FastAPI`. Verificación: falla por `ImportError`.
- [x] 5.2 GREEN: refactorizar `main.py` a `def create_app(settings: Settings | None = None) -> FastAPI`, conservando `app = create_app()` a nivel de módulo y el `lifespan` vacío. Verificación: el test de 5.1 pasa **y** los tests de `test_health.py` siguen los 5 verdes (comparar contra el baseline de 1.1).
- [x] 5.3 RED+GREEN: test de origen permitido — request con `Origin` presente en `CORS_ORIGINS` recibe `Access-Control-Allow-Origin` con **ese origen exacto, no `*`**. Implementar el registro de `CORSMiddleware` con `allow_origins=settings.CORS_ORIGINS`. Verificación: cubre `Scenario: Origen permitido recibe headers CORS`.
- [x] 5.4 TRIANGULATE — origen no permitido: test que afirme **ausencia** del header `Access-Control-Allow-Origin` en una solicitud simple, y `400` en el preflight `OPTIONS` (D-3: el servidor no "bloquea", omite el header). Verificación: cubre `Scenario: Origen no permitido no recibe autorización CORS` y `Scenario: Preflight desde origen no permitido es rechazado`.
- [x] 5.5 TRIANGULATE — preflight permitido: test que afirme `200` con `Access-Control-Allow-Methods` incluyendo `POST` y `Access-Control-Allow-Headers` incluyendo `Authorization` y `Content-Type`. Fijar `allow_methods=["GET","POST","OPTIONS"]` y `allow_headers=["Authorization","Content-Type"]` (D-2). Verificación: cubre `Scenario: Preflight desde origen permitido es aceptado` y `Scenario: Cabeceras necesarias para el flujo autenticado`.
- [x] 5.6 TRIANGULATE — configurabilidad: test que construya `create_app()` con una lista `CORS_ORIGINS` distinta y afirme que la política sigue esa lista. Verificación: cubre `Scenario: La lista de orígenes se lee del entorno, no del código`.
- [x] 5.7 Test de política: afirmar que `Access-Control-Allow-Credentials` **no** se emite (`allow_credentials=False`, D-2). Verificación: cubre `Scenario: Sin credenciales de navegador`.

## 6. Cableado del limiter en la app (D-1, D-4)

- [x] 6.1 RED: test que afirme que `create_app().state.limiter` existe y es la instancia de `Limiter`, y que `RateLimitExceeded` está en `app.exception_handlers`. Verificación: falla antes del wiring.
- [x] 6.2 GREEN: en `create_app()`, setear `app.state.limiter` y registrar `app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)`. **No** registrar `SlowAPIMiddleware` (D-4). Verificación: el test de 6.1 pasa.
- [x] 6.3 Test de regresión estructural: afirmar que `test_importing_main_creates_no_module_level_engine_or_client` sigue verde (el `Limiter` no es `Engine`/`AsyncClient`) y que ninguna ruta de la app de producción tiene límite aplicado. Verificación: suite completa verde.

## 7. Comportamiento 429 end-to-end (D-8, D-9)

- [x] 7.1 Crear `fastapi_bridge/tests/test_rate_limit.py` con una fixture que construya una app vía `create_app()` con `Settings` de cupo pequeño y le monte **una ruta desechable del test** decorada con `scan_rate_limit` (D-8: no se monta el router de scan real). La fixture debe aislar el storage del `Limiter` por test (D-9). Verificación: la fixture corre y la ruta responde `200`.
- [x] 7.2 RED+GREEN: test que haga `RATE_LIMIT_REQUESTS` solicitudes desde la misma IP y afirme que **ninguna** recibe `429`. Verificación: cubre `Scenario: Solicitudes dentro del cupo`.
- [x] 7.3 TRIANGULATE: la solicitud `RATE_LIMIT_REQUESTS + 1` desde la misma IP recibe `429`, y el cuerpo del endpoint **no se ejecuta** (usar un contador o flag en la ruta desechable). Verificación: cubre `Scenario: La solicitud siguiente al cupo es rechazada`.
- [x] 7.4 TRIANGULATE: cuerpo del `429` es RFC 7807 con las cinco claves, `Content-Type: application/problem+json`, y header `Retry-After` con entero > 0. Verificación: cubre `Scenario: Cuerpo del error 429`, `Scenario: Content-Type de problem details` y `Scenario: Header Retry-After presente`.
- [x] 7.5 TRIANGULATE — aislamiento por IP: inyectar `client` distintos en el scope ASGI (D-9, nota de IP en tests) y afirmar que una segunda IP es atendida normalmente mientras la primera ya agotó su cupo. Verificación: cubre `Scenario: El cupo es por IP, no global`.
- [x] 7.6 Test de repetición: correr dos tests de límite consecutivos y afirmar que el segundo arranca con el cupo completo. Verificación: el aislamiento de D-9 funciona; no hay dependencia del orden de ejecución.

## 8. Exclusiones del límite y superficie de API intacta (D-8)

- [x] 8.1 Test: `GET /health` solicitado por encima del cupo configurado devuelve siempre `200`, nunca `429`. Verificación: cubre `Scenario: Health check nunca es limitado`.
- [x] 8.2 Test: montar en la app del test una ruta que simule un endpoint de auth **sin** el decorador, agotar el cupo en la ruta de scan desechable, y afirmar que la de auth sigue respondiendo normalmente. Verificación: cubre `Scenario: Auth no consume ni agota el cupo de scan`.
- [x] 8.3 Test: `POST /api/v1/scan/start` y `POST /api/v1/auth/register` sobre la app de producción siguen devolviendo `404`. Verificación: cubre `Scenario: Los routers de dominio siguen sin montarse`; confirma que no se invadió el scope de CHANGE-05/CHANGE-12.
- [x] 8.4 Test: `GET /health` conserva body exactamente `{"status": "ok", "service": "wasa-fastapi-bridge"}` con la política activa. Verificación: cubre `Scenario: Health conserva su contrato exacto`.
- [x] 8.5 Test: construir e importar la app no abre conexiones a PostgreSQL, n8n ni Redis. Verificación: cubre `Scenario: Sin conexiones a infraestructura externa`; reutilizar el patrón de `test_no_shared_db_impact.py`.

## 9. Cierre

- [x] 9.1 Correr `pytest` completo y comparar contra el baseline de 1.1: cero regresiones, sólo tests nuevos sumados. Verificación: `N_baseline + N_nuevos passed`, `0 failed`.
- [x] 9.2 Verificar manualmente que `uvicorn fastapi_bridge.main:app` arranca sin errores y `GET /health` responde `200`. Verificación: arranque limpio, sin warnings de middleware.
- [x] 9.3 Verificar el cumplimiento de las reglas duras: ninguna lectura de `os.environ`/`os.getenv` fuera de `core/settings.py`, ningún valor de política hardcodeado, type hints en toda función nueva, `exceptions/handlers.py` como único formateador de errores. Verificación: `grep` + revisión de los archivos tocados.
- [x] 9.4 Marcar `[x]` los cinco Criterios de Aceptación de `[CHANGE-00d]` en `CHANGES.md`, anotando junto al criterio del `429` que se verificó sobre la política (ruta de test) y que la verificación sobre el path real `/api/v1/scan/start` queda a cargo de CHANGE-12 (D-8). Verificación: `CHANGES.md` actualizado y consistente con lo implementado.
- [x] 9.5 Dejar anotado para el brief de CHANGE-07 que `exceptions/handlers.py` ya existe con `problem_detail_response` y el handler de `RateLimitExceeded`, y que debe **extenderlo**, no reescribirlo (D-6, incluida la nota de MRO de `HTTPException`). Verificación: la nota queda en el resumen del apply y en engram.
