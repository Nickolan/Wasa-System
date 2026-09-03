> **Modo TDD estricto activo.** Para cada tarea de implementación: escribir el test que falla, hacerlo pasar con lo mínimo, triangular con un segundo caso, refactorizar. Antes de tocar un archivo existente (grupo 2 y 7), correr su suite y registrar la línea base.
>
> **Governance MEDIO.** Antes de arrancar el grupo 3, confirmar con el usuario las decisiones D-1 (SQL de texto vs. reflexión), D-2 (`SELECT *` + `extra="allow"`) y D-3 (`scan_id` como entero) de `design.md`.

## 1. Verificación previa que condiciona el diseño (R-3)

- [x] 1.1 Escribir un test que construya un modelo Pydantic con `extra="allow"` y un campo no declarado, lo devuelva desde una ruta FastAPI mínima con ese modelo como `response_model`, y verifique que el campo desconocido aparece en el JSON de la respuesta. Verificación: el test define cuál de los dos mecanismos de D-2 se usa en el grupo 5. — `tests/test_response_model_extra_fields_survive.py`; pasó al primer intento: `extra="allow"` sí sobrevive.
- [x] 1.2 Si 1.1 falla, registrar en `design.md` (D-2) que se adopta el fallback... — No aplica: 1.1 pasó, D-2 se implementa tal cual está escrita, sin fallback.

## 2. Red de seguridad: reescribir los tests de aislamiento de la base compartida (D-6)

> Este grupo va **antes** de cualquier código que mencione `scans`/`vulnerabilities`: es la red que debe estar puesta mientras se escribe ese código, no después.

- [x] 2.1 Correr `pytest fastapi_bridge/tests/test_no_shared_db_impact.py` y registrar la línea base de tests en verde. Verificación: cero fallos previos; si hay alguno, detenerse y reportarlo como fallo preexistente. — Línea base: 4/4 verdes.
- [x] 2.2 Agregar `test_shared_tables_are_not_in_the_declarative_metadata`.
- [x] 2.3 Introducir en `test_no_reference_to_existing_shared_tables` una allowlist con comentario que remita a D-6. **Desviación de diseño**: la allowlist terminó con DOS archivos, no uno — ver nota al final de este archivo.
- [x] 2.4 Agregar `test_dashboard_repository_sql_is_read_only`.
- [x] 2.5 Agregar `test_dashboard_repository_sql_is_not_built_by_interpolation`.
- [x] 2.6 Agregar `test_dashboard_uow_never_commits`.
- [x] 2.7 Confirmar que `test_lifespan_cycle_only_opens_connection_to_create_users_table` sigue intacto y en verde.

## 3. Contratos: schemas de filtros y de respuesta (D-2)

- [x] 3.1 Crear `schemas/dashboard_schemas.py` con `ScanRow`.
- [x] 3.2 Agregar `VulnerabilityRow`.
- [x] 3.3 Agregar `DashboardResponse` con `scans: list[ScanRow]` y `vulnerabilities: list[VulnerabilityRow]`.
- [x] 3.4 Agregar `DashboardFilters`.
- [x] 3.5 Verificar que `schemas/dashboard_schemas.py` no importa `fastapi`, `sqlalchemy` ni `httpx`.

## 4. Acceso a datos de solo lectura (D-1, D-4)

- [x] 4.1 Agregar a `tests/conftest.py` las fixtures `shared_tables_session` y `shared_tables_session_factory` (esta última no estaba prevista explícitamente en tasks.md pero es necesaria para `DashboardUoW`, que recibe una factory, no una sesión — mismo patrón que `user_session_factory`/`AuthUoW`).
- [x] 4.2 Crear `repositories/dashboard_repository.py` con `get_scans()`.
- [x] 4.3 Agregar `_VULNERABILITY_FILTERS` y `get_vulnerabilities(filters)`.
- [x] 4.4 Triangular `get_vulnerabilities` con cada filtro por separado.
- [x] 4.5 Triangular la conjunción.
- [x] 4.6 Test de intento de inyección SQL vía `source`.
- [x] 4.7 Verificar que el repositorio no importa nada de `fastapi`.
- [x] 4.8 Crear `uow/dashboard_unit_of_work.py` con `DashboardUoW(session_factory)`.
- [x] 4.9 Agregar la propiedad `.dashboard` que lanza `RuntimeError` fuera del bloque `async with`.

## 5. Lógica de negocio y borde HTTP (D-3, D-5, D-7)

- [x] 5.1 Crear `services/dashboard_service.py` con `get_dashboard(filters)`.
- [x] 5.2 Verificar que el Service no importa `sqlalchemy` ni `fastapi` y que no captura excepciones.
- [x] 5.3 Crear `api/v1/dashboard/__init__.py` y `api/v1/dashboard/router.py`.
- [x] 5.4 Agregar `get_dashboard_service` a `core/dependencies.py`.
- [x] 5.5 Verificar que el router no contiene lógica.

## 6. Montaje y comportamiento de extremo a extremo

- [x] 6.1 Montar el router en `create_app()` con `include_router(dashboard_router)`.
- [x] 6.2 Actualizar los asertos de superficie de rutas en `tests/test_app_wiring.py` **y en `tests/test_auth_router.py`** (este último no estaba previsto en tasks.md: `test_application_route_surface_is_exactly_health_auth_and_scan` también enumeraba la superficie exacta y se descubrió recién al correr la suite completa, no sólo `test_no_shared_db_impact.py`). `test_edge_policy_exclusions.py` no enumera rutas exactas, no requirió cambios.
- [x] 6.3 Tests de que la operación es pública.
- [x] 6.4 Test de que montar el dashboard no relaja el guard de scan.
- [x] 6.5 Tests de método y de parámetros.
- [x] 6.6 Tests de la respuesta de fallo.
- [x] 6.7 Test de que la ruta no consume el cupo de rate limit.
- [x] 6.8 Tests del esquema OpenAPI.

## 7. Cierre y verificación integral

- [x] 7.1 Correr la suite completa `pytest fastapi_bridge/` y confirmar cero regresiones respecto de la línea base del grupo 2. — Baseline pre-change: 632 passed, 1 skipped. Post-change: 688 passed, 1 skipped (56 tests nuevos, cero regresiones).
- [x] 7.2 Confirmar que ningún módulo de producción nuevo lee `os.environ`/`os.getenv` ni contiene credenciales, host, puerto o nombre de base literales. — `test_only_settings_module_reads_os_environ` en verde; grep de `localhost`/`5432`/`db_fuzzing`/`wasa:wasa` en los archivos nuevos: única ocurrencia es el nombre lógico `db_fuzzing` en docstrings (no credencial/host/puerto).
- [ ] 7.3 Smoke manual contra la base real. **No ejecutable en este entorno**: sin acceso a una instancia PostgreSQL `db_fuzzing` real ni a `dashboard/server-fuzzing` corriendo. Queda pendiente de correr antes del `archive` (o documentarse como aceptado sin smoke, por decisión del usuario).
- [ ] 7.4 Repetir el smoke con cada filtro y con los tres combinados. Mismo bloqueo que 7.3.
- [ ] 7.5 Confirmar que las tablas quedan idénticas antes y después del smoke. Mismo bloqueo que 7.3 (la garantía de solo-lectura SÍ está anclada estructuralmente por tests automatizados — grupo 2 — independientemente de este smoke manual).
- [x] 7.6 Marcar `[CHANGE-25]` como completado en `CHANGES.md` y anotar el contrato exacto que CHANGE-26 debe consumir. — Ver `CHANGES.md`, sección CHANGE-25.

---

## Desviaciones respecto de `design.md`/tasks.md descubiertas durante la implementación

1. **Allowlist de `test_no_reference_to_existing_shared_tables` con DOS archivos, no uno** (D-6 dice "un solo archivo"). `schemas/dashboard_schemas.py` tuvo que agregarse también: `DashboardResponse` necesita campos literalmente llamados `scans`/`vulnerabilities` (exigido por el requirement "Respuesta exitosa" de `dashboard-endpoint`, task 3.3), y esos nombres de campo colisionan con el mismo regex de palabra completa que protege las referencias a las TABLAS — sin que el archivo importe `sqlalchemy` ni ejecute una sola sentencia SQL. Para mantener el resto del árbol de producción (incluido `services/dashboard_service.py`) libre de esa mención, `DashboardResponse` expone un classmethod `from_rows(scan_rows, vulnerability_rows)` (parámetros deliberadamente en singular, sin colisión) que es el único lugar que deletrea `scans=`/`vulnerabilities=` como keyword-arguments; `DashboardService` sólo llama a `DashboardResponse.from_rows(...)`. Las garantías más fuertes de D-6 (metadata declarativa, solo-lectura por AST, sin interpolación, sin commit) no dependen de esta allowlist y siguen ancladas por tests independientes.
2. **`tests/test_auth_router.py::test_application_route_surface_is_exactly_health_auth_and_scan`** también enumeraba la superficie exacta de rutas y no estaba mencionado en tasks.md (que sólo preveía `test_app_wiring.py`/`test_edge_policy_exclusions.py`). Se detectó al correr la suite completa (7.1) y se actualizó/renombró siguiendo el mismo criterio que el resto del archivo.
3. **Fixture `shared_tables_session_factory`** agregada a `conftest.py` además de `shared_tables_session` (task 4.1 sólo menciona la segunda): `DashboardUoW` necesita una factory reentrante, no una sesión ya abierta — mismo patrón que `user_session_factory` para `AuthUoW`.
4. **Tasks 7.3–7.5 (smoke manual) no ejecutadas**: requieren una instancia PostgreSQL `db_fuzzing` real y `dashboard/server-fuzzing` corriendo, no disponibles en este entorno de desarrollo. La garantía de solo-lectura está igualmente anclada por tests automatizados (grupo 2); lo que queda sin verificar manualmente es la paridad exacta de datos/formato (`scan_date`, R-4) contra el sistema real.
