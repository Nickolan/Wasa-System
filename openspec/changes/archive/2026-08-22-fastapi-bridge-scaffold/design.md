## Context

El repositorio contiene hoy el sistema WASA ya desplegado (`dashboard/`, el workflow n8n `Flujo_Fuzzing_N8N.json`, la instancia PostgreSQL `db_fuzzing` con las tablas `scans` y `vulnerabilities`) y la documentación del proyecto (`knowledge-base/`, `CHANGES.md`). No existe todavía ningún código del FastAPI Bridge.

`CHANGE-00a` es el primer change del roadmap y no tiene dependencias. Su output no es funcionalidad: es el **contrato estructural** sobre el que se van a escribir los 20+ changes siguientes. Las decisiones que se tomen acá (dónde vive cada capa, cómo se resuelve la configuración, cómo se inyectan dependencias, cómo se testea) se heredan sin discusión en todos los changes posteriores, así que conviene tomarlas explícitamente ahora.

Restricciones que condicionan el diseño:

- **Arquitectura fijada por la KB**: `knowledge-base/08_arquitectura_propuesta.md` define el árbol de directorios y la regla estricta Router → Service → UoW → Repository. No es negociable; este design la implementa, no la rediscute.
- **Base de datos compartida**: `db_fuzzing` es de un sistema en producción. El Bridge no puede correr migraciones ni tocar `scans`/`vulnerabilities` (DD-02 en `09_decisiones_y_supuestos.md`).
- **Credenciales reales desconocidas**: los valores de `DB_URL`, `N8N_WEBHOOK_URL` y `N8N_WEBHOOK_TOKEN` son preguntas abiertas de prioridad Alta (`10_preguntas_abiertas.md`). El scaffold debe arrancar **sin** ellos.
- **TDD estricto activo** en el proyecto: el ciclo RED → GREEN → TRIANGULATE aplica desde este change, lo que obliga a que exista un runner de tests ya en el scaffold.
- **Governance BAJO**: scaffolding sin lógica de negocio ni superficie de seguridad; se implementa con autonomía y se reportan las decisiones no obvias.

## Goals / Non-Goals

**Goals:**

- Dejar `fastapi_bridge/` como paquete Python importable con la topología de capas completa de la KB, un módulo por responsabilidad y por dominio.
- Que `uvicorn fastapi_bridge.main:app --reload` arranque en una máquina limpia, sin PostgreSQL, sin n8n y sin `.env`.
- Exponer `GET /health` con el contrato exacto `{"status": "ok", "service": "wasa-fastapi-bridge"}`.
- Definir `core/settings.py` como **único** punto de lectura de configuración, con los campos del contrato de entorno tipados.
- Dejar el andamiaje de tests operativo (runner, configuración, fixtures async) para que CHANGE-01 pueda empezar directo en RED.
- Convertir las reglas duras de capas en tests ejecutables, no en comentarios: la frontera "Repository no importa FastAPI" se verifica automáticamente.

**Non-Goals:**

- Ninguna lógica de negocio: sin hashing, sin JWT, sin validación de payloads, sin forwarding a n8n.
- Sin modelo ORM `User`, sin engine SQLAlchemy activo, sin `create_all`, sin conexión a `db_fuzzing`.
- Sin CORS con orígenes reales, sin rate limiting con slowapi, sin handlers RFC 7807 poblados (CHANGE-11).
- Sin archivos `.env` reales ni `.env.example` (CHANGE-00c).
- Sin montar los routers de dominio en la app (cada change monta el suyo).
- Sin Docker, CI, linters ni pre-commit (fuera del scope declarado del change).

## Decisions

### D-1. El árbol de la KB manda sobre el layout por defecto de la skill `fastapi-templates`

La skill `fastapi-templates` propone `app/api/v1/endpoints/`, `app/core/{config,security,database}.py`, `app/models/`. La KB del proyecto define `fastapi_bridge/` con `core/settings.py`, `db/{base,session,models}.py`, `api/v1/<dominio>/router.py`, más las capas `uow/` y `repositories/` explícitas.

**Decisión**: se sigue el árbol de la KB al pie de la letra. De la skill se toman los *principios* (DI vía `Depends`, async end-to-end, tests con `httpx.AsyncClient` + `dependency_overrides`), no su nomenclatura.

**Alternativa descartada**: adoptar el layout de la skill y adaptar la KB — habría desalineado el código de `CHANGES.md` y de los 25 changes restantes que ya referencian rutas concretas.

### D-2. `pydantic-settings` como dependencia adicional al manifiesto del roadmap

`CHANGES.md` lista las dependencias de runtime sin `pydantic-settings`. En Pydantic v2, `BaseSettings` **ya no vive en `pydantic`**: se movió al paquete separado `pydantic-settings`. Sin él, `core/settings.py` no puede existir tal como lo exige la KB.

**Decisión**: agregar `pydantic-settings` a `requirements.txt`. Es una corrección de completitud del manifiesto, no un cambio de stack. `python-dotenv` se mantiene porque `pydantic-settings` lo usa para el soporte de `.env`.

**Alternativa descartada**: `pydantic.v1.BaseSettings` vía la capa de compatibilidad — arrastra la API vieja a un proyecto nuevo en Pydantic v2.

### D-3. Dependencias de test en `requirements-dev.txt` separado

El modo TDD estricto exige un runner desde el primer change, pero meter `pytest` en el manifiesto de runtime infla la imagen de producción y contradice el scope literal del roadmap.

**Decisión**: `fastapi_bridge/requirements.txt` queda exactamente con el runtime del roadmap (+ D-2), y se crea `fastapi_bridge/requirements-dev.txt` con `pytest`, `pytest-asyncio` y `anyio`. `httpx` ya está en runtime, así que `httpx.AsyncClient` como cliente de test no agrega dependencia.

**Alternativa descartada**: un único `requirements.txt` con marcadores de extras — más difícil de instalar selectivamente en despliegue.

### D-4. `Settings` se consume vía `Depends(get_settings)` cacheado, no como singleton importado

Un `settings = Settings()` a nivel de módulo se evalúa en tiempo de import y es imposible de sustituir en tests sin monkeypatching.

**Decisión**: `core/settings.py` expone `class Settings(BaseSettings)` y `@lru_cache def get_settings() -> Settings`. Los routers reciben la config por `Depends(get_settings)`; los tests la sustituyen con `app.dependency_overrides[get_settings]`. El `@lru_cache` garantiza una sola instancia por proceso.

**Alternativa descartada**: singleton a nivel de módulo — más corto, pero rompe el aislamiento de los tests desde el primer change que necesite variar `TOKEN_EXPIRE_HOURS` o `JWT_SECRET`.

### D-5. Defaults de desarrollo para que el scaffold arranque sin `.env`

Los valores reales de `DB_URL`, `N8N_WEBHOOK_URL` y `N8N_WEBHOOK_TOKEN` no están documentados, y el criterio de aceptación exige que `uvicorn` arranque.

**Decisión**: todos los campos de `Settings` tienen default de desarrollo explícito y no-productivo (`APP_ENV="development"`, `JWT_SECRET` con un valor obviamente marcado como inseguro, `DB_URL` apuntando a localhost, `N8N_WEBHOOK_URL` a un host local). CHANGE-00c reemplaza esto con `.env` real y `.env.example`. **La validación fail-fast de secretos en `APP_ENV=production` NO se implementa acá**: pertenece a CHANGE-00c, que es quien introduce el concepto de entorno real.

**Riesgo asumido y su contención**: un default de `JWT_SECRET` es una bomba de relojería si llega a producción. Se contiene con (a) un valor auto-descriptivo del tipo `dev-only-insecure-change-me`, y (b) una tarea explícita en CHANGE-00c de agregar el guard de arranque en producción. Se marca como Open Question para que el usuario lo confirme.

### D-6. Secretos tipados como `SecretStr`

`JWT_SECRET` y `N8N_WEBHOOK_TOKEN` se declaran `SecretStr` (Pydantic). Su `repr`/serialización imprime `**********`, lo que hace estructuralmente improbable filtrarlos en un log o en un traceback — cumpliendo "los secrets nunca se loguean" de `08_arquitectura_propuesta.md` sin depender de la disciplina de cada desarrollador. El acceso al valor real requiere `.get_secret_value()` explícito.

### D-7. `CORS_ORIGINS` como `list[str]` parseado desde string separado por comas

Las variables de entorno son strings; `CORSMiddleware` (CHANGE-11) espera una lista. **Decisión**: el campo se declara `list[str]` con un `@field_validator(mode="before")` que hace split por coma cuando recibe un string. Se resuelve en la capa de config, no en el consumidor.

*Nota*: es una de las pocas excepciones justificadas a la regla de la skill `pydantic` de preferir `mode="after"` — acá se necesita transformar el input crudo (string) antes de la coerción al tipo destino (lista).

### D-8. Los routers de dominio existen pero NO se montan

`api/v1/auth/router.py` y `api/v1/scan/router.py` definen su `APIRouter(prefix=..., tags=[...])` sin operaciones. `main.py` **no** hace `include_router`.

**Decisión y rationale**: montar routers vacíos no aporta nada y ensucia `/docs` con endpoints inexistentes; peor, expondría rutas que devuelven comportamiento indefinido. Cada change de dominio (CHANGE-06 para auth, CHANGE-12 para scan) monta su propio router como parte de su definition of done. El módulo existe para que el import y el prefijo ya estén decididos.

**Consecuencia verificable**: la spec exige que `POST /api/v1/auth/register` responda `404` en este estadio. Es intencional, no un bug.

### D-9. Módulos placeholder = sólo docstring, sin código muerto

Los módulos de `services/`, `uow/`, `repositories/`, `schemas/`, `db/`, `core/security.py`, `core/dependencies.py` y `exceptions/handlers.py` se crean con **únicamente** un docstring que declara: su responsabilidad, la regla de capa que lo gobierna y el change que lo va a implementar.

**Rationale**: bajo TDD estricto, escribir stubs que lancen `NotImplementedError` sería producción sin test que la exija — y además crea código muerto que el próximo change tiene que borrar antes de escribir el suyo. Un docstring es documentación, no producción: no viola las Tres Leyes y sirve de briefing para el agente que llegue después.

**Alternativa descartada**: archivos vacíos de cero bytes — pierden la trazabilidad módulo → change → regla de capa.

### D-10. `lifespan` async vacío desde el día uno

`main.py` usa el patrón `@asynccontextmanager async def lifespan(app)` pasado a `FastAPI(lifespan=...)`, con cuerpo vacío (sólo `yield`).

**Rationale**: la skill `fastapi-async-patterns` es explícita en que los pools (engine SQLAlchemy async, `httpx.AsyncClient`) se abren y cierran en el lifespan, no por request. Dejar el hook ya cableado evita que CHANGE-02/CHANGE-05 tengan que refactorizar `main.py` para introducirlo, y descarta de entrada los `@app.on_event("startup")` deprecados.

### D-11. `HealthResponse` vive en `main.py`, no en `schemas/`

El endpoint de salud no pertenece a los dominios `auth` ni `scan`. Crear `schemas/health_schemas.py` rompería la simetría de dos dominios que la spec verifica.

**Decisión**: se define un modelo Pydantic `HealthResponse` (con campos `Literal` para que el contrato quede fijado por tipos, no por un dict suelto) dentro de `main.py`, y se declara como `response_model` del endpoint. Queda documentado en OpenAPI y el contrato exacto del body es imposible de romper accidentalmente.

### D-12. Las fronteras de capa se testean con `ast`, no con convenciones

La regla "el Repository nunca importa FastAPI" es la que más fácilmente se erosiona a lo largo de 20 changes.

**Decisión**: `tests/test_layer_boundaries.py` parsea cada módulo con el módulo `ast` de la stdlib y falla si detecta imports prohibidos (`fastapi` en `repositories/`, `sqlalchemy`/`httpx` en `api/`). Es determinístico, no requiere importar el módulo y corre en milisegundos.

**Alternativa descartada**: `import-linter` — otra dependencia y otro archivo de config para una regla que son 30 líneas de stdlib.

### D-13. `pytest.ini` en la raíz del repo, tests dentro de `fastapi_bridge/tests/`

Los tests importan `fastapi_bridge.main`, así que el rootdir de pytest debe ser la raíz del repo. `pytest.ini` en la raíz con `testpaths = fastapi_bridge/tests` y `asyncio_mode = auto` (evita decorar cada test async). Los tests viven junto al paquete que prueban para que el change se mantenga autocontenido.

### D-14. Sin `from __future__ import annotations`

Regla de la skill `pydantic`: ese import rompe la resolución de anotaciones de los modelos. Python 3.11+ ya soporta `list[str]`, `str | None` y demás genéricos nativos sin él.

## Risks / Trade-offs

- **`JWT_SECRET` con default de desarrollo llega a producción** → Contención en tres capas: valor auto-delator (`dev-only-insecure-change-me`), tarea explícita en CHANGE-00c para el guard fail-fast cuando `APP_ENV=production`, y `SecretStr` para que nunca aparezca en logs. Se eleva como Open Question.
- **El scaffold "miente" sobre su completitud**: existen 18 módulos y sólo uno tiene código real. Un agente futuro podría asumir que una capa ya está implementada → Contención en D-9: cada docstring nombra el change que lo implementa.
- **Divergencia entre el árbol de la KB y el layout de la skill `fastapi-templates`** → Se documenta en D-1; el árbol de la KB es la referencia única y la spec lo verifica con un test de estructura.
- **`asyncio_mode = auto` es cómodo pero implícito**: un test sync se ejecuta igual sin aviso → Aceptado; el trade-off contra decorar cada test async en 20+ changes es favorable.
- **`404` en los endpoints de dominio puede leerse como fallo del scaffold** → Está declarado como comportamiento esperado en la spec y en D-8; queda como contrato, no como sorpresa.
- **Sin lockfile (`requirements.txt` sin pins exactos)**: dos instalaciones en fechas distintas pueden traer versiones distintas → Aceptado en este change; se usan restricciones de versión mínima compatibles con la tabla de stack (`fastapi>=0.111`, Python 3.11+). Un lockfile o `uv`/`poetry` es una decisión de tooling que excede el scope.

## Migration Plan

No aplica migración de datos ni de esquema: el change sólo agrega archivos nuevos bajo `fastapi_bridge/`, no modifica nada existente.

- **Despliegue**: no hay despliegue en este change; el criterio de aceptación es local (`uvicorn ... --reload` + suite verde).
- **Rollback**: eliminar el directorio `fastapi_bridge/` y `pytest.ini`. Cero efectos colaterales sobre `dashboard/`, n8n o `db_fuzzing`.
- **Verificación posterior**: confirmar que la conexión a `db_fuzzing` del sistema WASA existente sigue intacta — trivialmente cierta, porque el scaffold no abre ninguna.

## Open Questions

1. **Default de `JWT_SECRET` (D-5)** — se propone un placeholder de desarrollo auto-delator, con el guard de producción diferido a CHANGE-00c. ¿Se confirma, o se prefiere que `Settings` falle en el arranque desde ya si `JWT_SECRET` no está definido? (Lo segundo rompería el criterio de aceptación "arranca sin errores" hasta que exista `.env`).
2. **`pydantic-settings` (D-2)** — se agrega al `requirements.txt` respecto de lo que lista `CHANGES.md`. Corresponde reflejarlo en `CHANGES.md` para mantener el roadmap como fuente fiel.
3. **`requirements-dev.txt` (D-3)** — adición sobre el scope literal de CHANGE-00a, motivada por el modo TDD estricto. Mismo comentario: conviene reflejarlo en el roadmap.
4. **Versionado de dependencias** — este change usa restricciones de mínimo (`>=`). Si el proyecto quiere reproducibilidad estricta (pins exactos o lockfile), es una decisión de tooling que habría que abrir como change propio.
5. **Credenciales reales de `db_fuzzing` y n8n** — siguen sin resolverse (`10_preguntas_abiertas.md`, prioridad Alta). No bloquean CHANGE-00a, pero **sí bloquean CHANGE-00c y CHANGE-02**.
