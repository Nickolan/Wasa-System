## Context

Ver `proposal.md` §Why para la motivación. Acá sólo el estado del árbol que condiciona el enfoque, verificado leyendo los archivos (no supuesto):

| Pieza | Estado real en `lauti/c-12-scan-router-protected` | Consecuencia para este change |
|---|---|---|
| `api/v1/scan/router.py` | `APIRouter(prefix="/api/v1/scan", tags=["scan"])`, cero operaciones | se le agrega `POST /start` |
| `main.py` | no importa ningún router de dominio; `create_app()` registra CORS + `app.state.limiter` + handler de `RateLimitExceeded` | hay que agregar `include_router` y un handler más |
| `services/scan_service.py` | `ScanService.__init__(uow_factory=ScanUoW)`; `async start_scan(request: ScanRequest) -> ScanResponse`; **no captura** `N8nUnavailableError` | el Router llama `await service.start_scan(req)` y no envuelve nada |
| `core/limiter.py` | expone `scan_rate_limit = limiter.limit(scan_limit_string)`, atado al **singleton de módulo** `limiter` | ver D-5 |
| `exceptions/handlers.py` | `problem_detail_response(...)` + `rate_limit_exceeded_handler` únicamente | falta el handler de `N8nUnavailableError`; los de `HTTPException`/`RequestValidationError` son de CHANGE-07 y **no están** |
| `core/dependencies.py` | **docstring placeholder**, vacío | `get_current_user` NO EXISTE |
| `core/security.py` | **docstring placeholder**, vacío | `decode_access_token` NO EXISTE |

Restricciones estructurales vigentes que este change debe respetar (`tests/test_layer_boundaries.py`): `api/` no puede importar `sqlalchemy` ni `httpx` (chequeo AST, no transitivo); `services/` y `uow/` sin `fastapi`. Regla dura del proyecto: el Router no contiene lógica de negocio y ningún error sale fuera de RFC 7807, construido siempre por `problem_detail_response(...)`.

Hallazgo verificado en el código de `slowapi 0.1.x` (`extension.py`, `Limiter.__limit_decorator`), relevante para tres decisiones de abajo:
1. El decorador **exige** que la función decorada tenga un parámetro llamado literalmente `request`; si no, lanza `Exception` en tiempo de decoración (no de request).
2. El chequeo de cupo lo hace `self._check_request_limit(...)` sobre la instancia capturada en el import, **no** sobre `request.app.state.limiter`.
3. El wrapper del decorador envuelve a la función del endpoint, así que corre **después** de que FastAPI resolvió las `Depends` y validó el body.

## Goals / Non-Goals

**Goals:**
- Que el borde HTTP sea una capa de **cableado puro**: `Depends` + una llamada al Service + un `JSONResponse`. Cero `if`, cero `try`, cero conocimiento de `httpx`, `Settings` o `ScanUoW`.
- Que la protección, el cupo y el mapeo de errores sean **verificables sin red y sin n8n levantado**.
- Dejar el mapeo `N8nUnavailableError → 502` en el mismo punto único de construcción RFC 7807 que ya usa el 429, sin abrir un segundo formato de error.

**Non-Goals:**
- Implementar `get_current_user`, `oauth2_scheme` o `decode_access_token` (CHANGE-06) ni los handlers de `HTTPException`/`RequestValidationError` (CHANGE-07). Ver D-1.
- Montar el router de auth (CHANGE-05).
- Persistir el escaneo, consultar su estado o cancelarlo. El Bridge es fire-and-forward (RN-WS-07).
- Rediseñar la política de tasa: el cupo, la ventana y la clave por IP son de CHANGE-00d y se consumen tal cual.

## Decisions

### D-1 — Dependencia CHANGE-06 no satisfecha: el apply queda condicionado a una decisión del usuario (governance ALTO)

**Hecho**: `get_current_user` no existe en este árbol ni en ninguna rama del repositorio. `origin/niko/*` tiene `c-01..c-05` y `c-07`, pero **no** `c-06`. Sin él, `POST /start` no puede quedar protegido, y sin los handlers de CHANGE-07 un `401` o un `422` saldrían en el formato por defecto de FastAPI (`{"detail": ...}`), violando la regla dura de RFC 7807 y tres criterios de aceptación del change.

Opciones, con su costo:

- **A — Esperar (recomendada).** El apply de CHANGE-12 se ejecuta recién cuando CHANGE-01..05 + 07 estén mergeados a `main` y CHANGE-06 esté implementado, y este branch rebaseado sobre eso. Es lo que dice el gate de paralelismo de `CHANGES.md` (`CHANGE-12 [Agente B — si 11 ✓, 06 ✓, 00d ✓]`). Costo: bloqueo temporal, dependiente del Agente A. Beneficio: cero duplicación de propiedad, cero conflicto de merge sobre `core/security.py` y `core/dependencies.py`, y los siete criterios de aceptación se verifican de verdad.
- **B — Implementar `get_current_user` acá.** Costo alto y asimétrico: `get_current_user` depende de `decode_access_token` (CHANGE-04) y de `TokenData` (`schemas/auth_schemas.py`, CHANGE-02), ninguno de los cuales existe en este árbol; implementarlos arrastraría media Fase 1 dentro de un change de "1 hora" y garantizaría un conflicto de merge en el dominio más crítico del proyecto. **Descartada** salvo instrucción explícita del usuario.
- **C — Montar el endpoint sin guard ahora y protegerlo después.** Deja `POST /api/v1/scan/start` abierto en `main` durante el intervalo. Es exactamente lo que RN-WS-11 prohíbe y lo que la matriz RBAC (`03_actores_y_roles.md`) marca como "Anónimo → Denegado (401)". **Descartada.**

**Decisión propuesta: A.** Esta propuesta se escribe completa contra el contrato que CHANGE-06 declara en `CHANGES.md` (`get_current_user(token: str = Depends(oauth2_scheme)) -> str`, devuelve el email del `sub`, lanza `HTTPException(401)` si no hay email), de modo que el apply sea mecánico el día que la dependencia aterrice. **Requiere confirmación del usuario antes de correr `/opsx:apply`** — es la única decisión de governance ALTO de este change.

### D-2 — `N8nUnavailableError → 502` por `exception_handler` global, no por `try/except` en el Router

`ScanService` deja propagar `N8nUnavailableError` intacta (CHANGE-11 D-6) precisamente para que el borde tenga **un** caso que reconocer. Capturarla dentro del handler del endpoint sería lógica de decisión dentro del Router —regla dura violada— y además duplicaría la construcción del cuerpo RFC 7807 fuera de `problem_detail_response(...)`, que CHANGE-00d D-6 fijó como punto único.

Se agrega entonces `n8n_unavailable_handler(request, exc) -> JSONResponse` en `exceptions/handlers.py`, construido con `problem_detail_response(...)`, con sus literales (`type`, `title`, `detail`) como constantes de módulo al lado de las del 429, y se registra en `create_app()` con `add_exception_handler(N8nUnavailableError, ...)`.

**Alternativa descartada**: `try/except` en el Router (viola la regla dura y el punto único de formato). **Alternativa descartada**: capturarla en el Service y devolver un resultado (revertiría D-6 de un change ya archivado).

*Advertencia de secuencia*: `Exception` como handler genérico llega en CHANGE-07. Starlette despacha por el tipo más específico registrado, no por orden, así que registrar `N8nUnavailableError` acá y `Exception` allá no se pisan. Nada de este change se apoya en el handler genérico.

### D-3 — El `ScanService` entra por `Depends(get_scan_service)`, no se instancia dentro del handler

`CHANGES.md` describe el call site como `ScanService().start_scan(request)`. Instanciarlo literalmente dentro del cuerpo del handler haría **imposible** sustituirlo en los tests: la nota heredada de CHANGE-10 D-2 dice que `app.dependency_overrides[get_settings]` **no alcanza** a `ScanUoW`, porque `ScanUoW.__init__` resuelve su propia `Settings` con `get_settings()` directo. Es decir: si el Service se construye en el cuerpo, cualquier test del endpoint abriría un `httpx.AsyncClient` real contra la `N8N_WEBHOOK_URL` configurada.

Se introduce entonces un proveedor trivial `def get_scan_service() -> ScanService: return ScanService()` y el handler recibe `service: ScanService = Depends(get_scan_service)`. El call site de producción sigue siendo `ScanService()` sin argumentos (CHANGE-11 D-2 intacto) y los tests sustituyen **el Service entero** con `app.dependency_overrides[get_scan_service]`.

**Ubicación**: `core/dependencies.py`, siguiendo el precedente que CHANGE-05 ya estableció ahí para `get_auth_service` (la composición de servicios vive fuera de `api/`, para que `api/` no conozca el cableado). Trade-off: es el mismo archivo que CHANGE-06 va a escribir, así que hay riesgo de conflicto de merge — pero es un *append* de una función nueva, no una edición de código ajeno. **Alternativa considerada**: declararlo en `api/v1/scan/router.py`. Evitaría el conflicto por completo y no rompería `test_layer_boundaries.py` (el chequeo AST no es transitivo, y `ScanService` no importa `httpx` de forma directa), pero le daría a la capa de transporte conocimiento de cómo se construye su servicio, rompiendo la simetría con auth. Se elige `core/dependencies.py`; si el usuario prefiere minimizar el conflicto, la alternativa es un cambio de una línea.

### D-4 — El orden efectivo de rechazos es 401 → 422 → 429, y es una consecuencia del framework, no una elección

El wrapper de `slowapi` envuelve la función del endpoint, así que FastAPI resuelve primero las `Depends` (guard JWT) y valida el body, y sólo después corre el chequeo de cupo. El orden resultante coincide con el `Flujo 3` de la KB (pasos 3 → 4 → 5), así que no se fuerza nada para cambiarlo.

Consecuencia que **no** es obvia y se surfacea (ver Risks R-1): una solicitud sin credencial válida recibe `401` **sin consumir cupo** y sin poder ser limitada por tasa. El cupo protege al orquestador del abuso de un usuario autenticado; no protege al endpoint de una inundación anónima.

### D-5 — El cupo se cuenta en el singleton de módulo `limiter`, no en `app.state.limiter`

`scan_rate_limit` quedó atado en tiempo de import a `core.limiter.limiter`; `create_app()` publica en `app.state.limiter` una instancia **distinta** (`build_limiter()`). El chequeo de cupo lo hace la instancia capturada. Tres consecuencias operativas:

1. Los tests de tasa de este change deben aislar el contador con `limiter.reset()` (patrón ya establecido en `tests/test_rate_limit.py`), no construyendo un `Limiter` nuevo.
2. El registro del límite entra en `limiter._dynamic_route_limits`, no en el del `app.state`. Por eso `tests/test_app_wiring.py::test_no_production_route_has_a_rate_limit_applied`, que assertea `app.state.limiter._dynamic_route_limits == {}`, **seguirá pasando** después de este change — pero pasará por mirar el objeto equivocado, y su docstring ("la app de producción no tiene ninguna ruta marcada para limitación") pasará a ser falso. Se reescribe para afirmar lo que ahora corresponde: que la **única** ruta de producción marcada en el singleton es el disparo de escaneo. Un test que pasa por vacuidad es peor que no tener test.
3. No se cambia este cableado en CHANGE-12. Unificar ambas instancias es una mejora legítima pero es un cambio de `core/limiter.py` + `main.py`, propiedad de CHANGE-00d, y no hace falta para ningún criterio de aceptación de acá. Se registra como Open Question.

### D-6 — Firma del handler: `request: Request` obligatorio, y el body **no** puede llamarse `request`

`slowapi` exige un parámetro llamado literalmente `request` en la función decorada y falla en tiempo de decoración —es decir, al importar el módulo, no al primer request— si no está. Como el body también querría llamarse "request", el contrato de nombres queda fijado así:

```
async def start_scan(
    request: Request,                                   # exigido por slowapi
    scan_request: ScanRequest,                          # body (CHANGE-08)
    current_user: str = Depends(get_current_user),      # guard (CHANGE-06)
    service: ScanService = Depends(get_scan_service),   # D-3
) -> JSONResponse
```

`current_user` no se usa en el cuerpo: su único efecto es que FastAPI ejecute el guard. Se declara igual (y no como `dependencies=[Depends(...)]` a nivel de ruta) porque hacerlo visible en la firma documenta que la operación tiene identidad autenticada y deja el valor disponible para cuando haga falta (auditoría, atribución del escaneo).

### D-7 — `JSONResponse(202)` explícito, con `response_model` declarado sólo para la documentación

`CHANGES.md` fija el retorno como `JSONResponse(..., status_code=202)`. Devolver un `Response` explícito **saltea** la serialización por `response_model` de FastAPI, así que el cuerpo se arma con `scan_response.model_dump(mode="json")` — sin tocar ni renombrar un solo campo (la spec exige traslado sin transformar). Se declara igualmente `status_code=202` y `response_model=ScanResponse` en el decorador de la ruta: no cambian el comportamiento (el `JSONResponse` gana), pero son lo que hace que `/docs` muestre el código y el esquema correctos.

**Alternativa considerada**: devolver la `ScanResponse` directamente y dejar que FastAPI la serialice con `status_code=202` en el decorador. Es más corto y hace `response_model` efectivo, pero se aparta de lo que el roadmap fijó y quita el punto explícito donde se ve que el cuerpo no se transforma. Se mantiene `JSONResponse`.

### D-8 — El candado de `/docs` lo produce el esquema de seguridad de CHANGE-06, no una declaración de este change

`OAuth2PasswordBearer` (CHANGE-06) es lo que hace que FastAPI emita `securitySchemes` en el OpenAPI y que Swagger UI dibuje el candado sobre la operación. CHANGE-12 no declara `security` a mano ni agrega `openapi_extra`: el criterio de aceptación del candado se satisface **por consecuencia** de usar el guard. El test correspondiente se escribe contra el documento OpenAPI (`app.openapi()`), no contra el HTML de Swagger, que es de terceros.

### D-9 — Estrategia de dobles: sustituir dependencias, nunca parchear infraestructura

Ningún test de este change instancia `httpx.AsyncClient`, abre red o necesita n8n levantado, y ninguno assertea valores reales de `N8N_WEBHOOK_URL`/`N8N_WEBHOOK_TOKEN`. Reglas:

- **202 / 502**: se sustituye `get_scan_service` por un doble escrito a mano (`FakeScanService`) que registra la `ScanRequest` recibida y devuelve una `ScanResponse` fija o levanta `N8nUnavailableError`. Nunca se parchea `ScanUoW` ni `N8nRepository`: son contratos archivados.
- **401**: **no** se sustituye el guard. El valor entero de esos tests está en ejercitar el guard real con tokens reales (ausente, malformado, firmado con otro secreto, expirado). Sustituirlo los volvería tautológicos.
- **429**: se sustituyen ambas dependencias (guard y Service) y se reduce el cupo con el mismo `monkeypatch` de `limiter_module.get_settings` que usa `test_rate_limit.py`, más `limiter.reset()` alrededor.
- **422**: credencial válida real + cuerpo inválido. No se sustituye nada del lado de validación: el contrato lo define CHANGE-08 y se verifica que el borde no lo duplique ni lo relaje.

### D-10 — Los dos tests archivados que este change invalida se declaran por adelantado

`test_edge_policy_exclusions.py::test_domain_routers_still_return_404_on_production_app` afirma hoy que `POST /api/v1/scan/start` responde `404`. Montar el router lo rompe, por diseño. Se actualiza en este change para afirmar lo que ahora corresponde: el `404` sigue valiendo para `POST /api/v1/auth/register` (auth no está montado) y el disparo de escaneo ya no responde `404`. Junto con el ajuste de `test_app_wiring.py` (D-5), son las **dos únicas** modificaciones de tests de changes archivados, declaradas acá y no descubiertas durante el apply.

## Risks / Trade-offs

- **R-1 — Una inundación anónima no consume cupo y no puede recibir `429` (D-4).** Cada solicitud sin credencial paga una verificación de firma JWT y nada más, pero el endpoint no tiene defensa de tasa contra clientes no autenticados. → Mitigación: es el orden que la KB especifica y el que protege el recurso caro (n8n). Defender el borde contra tráfico anónimo es trabajo de la capa de despliegue (proxy/WAF), no del Bridge. Se documenta explícitamente en vez de dejarlo implícito.
- **R-2 — Un test que pasa por vacuidad (D-5).** `test_no_production_route_has_a_rate_limit_applied` seguiría verde aunque el decorador de tasa se olvidara sobre el endpoint, porque inspecciona la instancia equivocada. → Mitigación: se reescribe para inspeccionar el singleton de módulo y afirmar que la ruta de escaneo **está** marcada, convirtiendo un test que no protegía nada en el que protege el criterio RN-WS-06.
- **R-3 — `slowapi` falla en tiempo de import si falta el parámetro `request` (D-6).** El síntoma es que el paquete entero deja de importarse, con un mensaje que no menciona la ruta. → Mitigación: la primera task del ciclo de tasa es un test que simplemente importa el módulo del router, para que el fallo aparezca aislado y no como un derrumbe de toda la suite.
- **R-4 — Conflicto de merge con la rama de Auth (Agente A).** CHANGE-05 edita `create_app()` en `main.py` y el delta de `bridge-bootstrap`; CHANGE-12 edita las mismas líneas y el mismo requirement. → Mitigación: ambos deltas son aditivos y compatibles (uno monta auth, otro monta scan); el segundo en archivarse **reconcilia**, no sobrescribe. Se deja anotado en `proposal.md §Impact`.
- **R-5 — El escaneo se acepta con `202` aunque el `scan_id` no quede persistido en ninguna parte del Bridge.** Si n8n acepta la entrega pero su workflow falla después, el cliente tiene un identificador que el Bridge no puede resolver. → Mitigación: es el contrato fire-and-forward de RN-WS-07/RN-WS-08 (el Dashboard existente es el que muestra resultados), no una regresión introducida acá. Fuera de alcance.
- **R-6 — `phpsessid` en registros.** El borde HTTP es el punto donde sería más natural loguear la solicitud entrante, y esa solicitud contiene una credencial de sesión de la aplicación objetivo. → Mitigación: este change **no agrega logging** de la solicitud ni del cuerpo, misma política que CHANGE-11. La spec lo fija como escenario verificable.

## Migration Plan

No hay migración de datos ni de esquema: este change no toca PostgreSQL. El despliegue es el reinicio normal del proceso `uvicorn`.

Precondición operativa (D-1): el apply no arranca hasta que `get_current_user` exista en el árbol. Rollback: revertir el commit devuelve `POST /api/v1/scan/start` a `404`; ningún cliente del sistema WASA existente depende de esa ruta todavía (el frontend que la consume es CHANGE-18/20, aún no implementado), así que el rollback no rompe a nadie.

## Open Questions

Ninguna de estas condiciona las specs, el enfoque ni el desglose de tasks; se dejan deferidas a propósito.

1. **¿Unificar `core.limiter.limiter` con `app.state.limiter`?** Hoy conviven dos instancias (D-5). Funciona, pero es una trampa para quien lea el código después. Es un cambio de `core/limiter.py` + `main.py`, propiedad de CHANGE-00d; se propone tratarlo como un change de limpieza aparte, no acá.
2. **¿Agregar `("api", "slowapi")` o `("api", "jose")` a `LAYER_IMPORT_RULES`?** El Router importa `scan_rate_limit` de `core/limiter.py` sin tocar `slowapi` directamente, así que la regla se cumple de hecho. Formalizarla afectaría también a los routers de auth (CHANGE-05), así que la decisión no es de este change.
3. **¿El `202` debería llevar cabecera `Location` apuntando al escaneo?** Semánticamente es lo correcto para un `202`, pero el Bridge no expone consulta de estado (el Dashboard existente sí, fuera de este proyecto). Requiere decidir a qué URL apuntaría; se difiere a CHANGE-21/22.
