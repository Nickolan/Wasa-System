## Context

Ver `proposal.md` §Why para la motivación. Lo que sigue es sólo el estado actual que condiciona el enfoque.

**El contrato a replicar** (`dashboard/server-fuzzing/index.js`, 65 líneas):

```js
const scansResult = await pool.query('SELECT * FROM scans ORDER BY scan_date ASC');
let vulnQuery = 'SELECT * FROM vulnerabilities';
if (scan_id)  { vulnParams.push(scan_id);              conditions.push(`scan_id = $n`); }
if (severity) { vulnParams.push(severity.toLowerCase()); conditions.push(`severity = $n`); }
if (source)   { vulnParams.push(source);               conditions.push(`source = $n`); }
if (conditions.length) vulnQuery += ' WHERE ' + conditions.join(' AND ');
res.json({ scans: scansResult.rows, vulnerabilities: vulnsResult.rows });
```

Tres asimetrías del original son **deliberadas y load-bearing**, no descuidos: los filtros aplican sólo a `vulnerabilities` (`scans` viene siempre completo); `severity` se pasa a minúsculas y `source` no; y `scans` se ordena por `scan_date ASC` mientras que `vulnerabilities` no se ordena en absoluto. `dashboard-fuzzing/src/App.jsx` depende de las tres: el `<select>` de escaneos se puebla con `data.scans` aunque haya un filtro activo, envía `severity` capitalizado (`Critical`, `High`, `Medium`, `Low`) contra una base que almacena minúsculas (confirmado en `Herramientas/worker_sqlmap.py`, que inserta `'high'`), y envía `source` con su capitalización exacta (`OWASP ZAP`, `SQLMap (Worker)`, `ffuf`).

**Restricciones del Bridge que condicionan el diseño:**

1. La regla dura del proyecto (CLAUDE.md, DD-02) prohíbe que el Bridge escriba o migre `scans`/`vulnerabilities`. Hoy está anclada por `tests/test_no_shared_db_impact.py::test_no_reference_to_existing_shared_tables`, que verifica algo **más fuerte** que la regla: que ningún archivo de producción *mencione* esas tablas en código. Este change la vuelve falsa a propósito y obliga a reescribir ese test (D-6).
2. Las reglas de capa (Router sin lógica, Service sin SQLAlchemy directo, Repository sin FastAPI) están ancladas por `tests/test_layer_boundaries.py::LAYER_IMPORT_RULES` — filas `("api", "sqlalchemy")` y `("services", "sqlalchemy")` ya existentes aplican a este change sin agregar nada.
3. `db/session.py::get_session_factory(settings)` ya está cacheada por `DB_URL` y ligada al engine de `db/base.py`. Reutilizarla es lo que hace cumplir "una sola configuración de conexión para todo el servicio".
4. `exceptions/handlers.py::unhandled_exception_handler` ya devuelve un 500 RFC 7807 con `detail` literal, explícitamente para no filtrar el SQL ni el host de un `OperationalError` de asyncpg. Cubre el escenario de fallo de este change sin código nuevo.
5. `main.py::_ALLOWED_METHODS` ya incluye `GET`; la política CORS no necesita cambios.

**Hallazgo relevante sobre el esquema compartido**: la documentación del esquema de `scans` en `knowledge-base/04_modelo_de_datos.md` está **desactualizada**. La KB lista `zap_count`, `nuclei_count`, `ffuf_count`, `sqlmap_count`; el flujo real (`Herramientas/Flujo_Fuzzing_N8N.json`, nodo de `update` sobre `scans`) escribe `total_vulnerabilities`, `critical_count`, `high_count`, `medium_count`, `low_count`, `report_path`, `target_url`, `scan_date`. Ninguna de las cuatro columnas de la KB aparece en el flujo. El Bridge **no es dueño** de este esquema y no tiene forma de mantenerse sincronizado con él; eso condiciona D-1 y D-2.

## Goals / Non-Goals

**Goals:**

- Paridad de comportamiento observable con `server-fuzzing` para los tres filtros y el shape de respuesta, incluidas sus asimetrías.
- Que la garantía de solo-lectura sobre las tablas compartidas sea **estructural** (imposible de violar por accidente), no sólo documental.
- Resiliencia al drift del esquema compartido: agregar una columna a `scans` desde n8n no debe requerir tocar el Bridge ni romper la consulta.
- Una sola configuración de conexión en todo el sistema unificado.

**Non-Goals:**

- Autenticar, autorizar o filtrar por dueño (decisión de producto ya tomada; ver Risks R-1).
- Paginar, limitar o cachear. El original no lo hace y el volumen actual es de tesis, no de producción (ver R-4).
- Ordenar `vulnerabilities`. El original no lo hace y el frontend reordena por su cuenta; imponer un orden sería un cambio de contrato silencioso.
- Corregir la KB del esquema de `scans`. Se registra como Open Question, no se resuelve acá.
- Migrar el frontend ni retirar `dashboard/` — es CHANGE-26.

## Decisions

### D-1: SQL de texto con parámetros ligados, sin `Table`, sin `MetaData`, sin reflexión

**Decisión.** El repositorio ejecuta dos `sqlalchemy.text()` sobre la `AsyncSession` existente, con `SELECT *` y parámetros ligados por nombre (`:scan_id`, `:severity`, `:source`). No se declara ningún `Table`, ninguna `MetaData` y no se refleja nada.

**Por qué.** Es la única opción con **cero superficie de metadata**: si no existe objeto `Table` para `scans` ni `vulnerabilities` en ninguna parte del proceso, ningún `create_all` —presente ni futuro, ni por arrastre de un modelo nuevo sobre `Base`— puede alcanzarlas. La garantía deja de depender de que alguien recuerde la regla y pasa a ser una propiedad del código. Además `SELECT *` es la respuesta correcta al drift del esquema documentado arriba: el Bridge proyecta lo que haya, sin una segunda copia del esquema que mantener sincronizada.

**Alternativas consideradas:**

- **`Table("scans", MetaData(), autoload_with=...)` (reflexión).** Da tipos reales y filtros componibles. Se descarta por tres motivos: (a) la reflexión con engine async exige `conn.run_sync(...)`, lo que agrega un viaje a la base en el arranque o en la primera petición, y convierte un fallo de esquema en un fallo de arranque; (b) produce un objeto `Table` vivo que un change futuro puede colgar de `Base.metadata` por descuido —exactamente el accidente que este change debe hacer imposible—; (c) no aporta nada que este caso de uso necesite: no hay joins, no hay expresiones compuestas, sólo tres igualdades.
- **`Table` declarada a mano sobre una `MetaData` privada.** Filtros componibles sin viaje a la base, pero exige enumerar columnas: duplica un esquema que el Bridge no controla, y —dado que la documentación de ese esquema ya está desactualizada— *descartaría silenciosamente* columnas reales. Falla el requirement "una columna no documentada llega igual al consumidor".
- **ORM sobre `Base`.** Descartada de plano: es literalmente lo que la regla dura prohíbe.

**Cómo se arma el `WHERE` sin concatenar entrada del usuario.** Los fragmentos son constantes de módulo, nunca texto derivado de la petición:

```python
_VULNERABILITY_FILTERS: dict[str, str] = {
    "scan_id": "scan_id = :scan_id",
    "severity": "severity = :severity",
    "source": "source = :source",
}
```

El repositorio recibe un `dict[str, object]` de filtros ya normalizados, toma sólo las claves presentes en ese mapa constante y une sus fragmentos con `" AND "`. Los **valores** viajan siempre como parámetros ligados. No hay f-string, `%`, `.format()` ni `+` sobre el texto SQL en ninguna parte — anclado por test (D-6).

### D-2: `SELECT *` + schemas Pydantic permisivos (`extra="allow"`)

**Decisión.** `schemas/dashboard_schemas.py` declara `ScanRow` y `VulnerabilityRow` con las columnas conocidas como opcionales y `model_config = ConfigDict(extra="allow")`, y `DashboardResponse(scans: list[ScanRow], vulnerabilities: list[VulnerabilityRow])` como `response_model` de la ruta.

**Por qué.** Es el único punto entre las dos fuerzas en tensión: OpenAPI necesita un esquema declarado (requirement de `dashboard-endpoint`) y el consumidor necesita recibir columnas que el Bridge no conoce (requirement de `dashboard-projection`). Campos declarados → `/docs` documenta el contrato real y el frontend de CHANGE-26 puede tipar contra él; `extra="allow"` → una columna nueva en `scans` llega igual en vez de desaparecer.

**Campos declarados** (unión de la KB y de lo que el flujo n8n realmente escribe, todos `| None`):

- `ScanRow`: `id`, `target_url`, `scan_date`, `total_vulnerabilities`, `critical_count`, `high_count`, `medium_count`, `low_count`, `report_path`.
- `VulnerabilityRow`: `id`, `scan_id`, `source`, `type`, `severity`, `url`, `description`, `solution`, `cweid`, `evidence`.

Todos opcionales porque el Bridge no controla el esquema: una columna ausente debe dar `None`, nunca un `500` por error de validación.

**Alternativas consideradas:**

- **`list[dict[str, Any]]` sin schemas.** Paridad perfecta y cero riesgo de drop, pero deja `/docs` sin contrato y contradice la convención del proyecto de fijar cada contrato por tipos (`HealthResponse`, `ScanResponse`).
- **Columnas explícitas en el `SELECT` + schemas estrictos.** Determinista, pero congela en el Bridge una copia de un esquema ajeno que ya se demostró que se mueve. Cada columna nueva en n8n sería un bug silencioso.

**Riesgo de implementación a verificar primero (ver R-3).** Que FastAPI serialice los campos `extra` a través de un `response_model` debe confirmarse con un test RED antes de escribir el resto: un `ScanRow` construido con una clave desconocida debe aparecer en el JSON de la respuesta. Si no sobrevive, el fallback es `response_model=None` en el decorador, devolver `JSONResponse` con las filas crudas y documentar el shape con `responses={200: {...}}`. La decisión de shape no cambia; sólo el mecanismo de serialización.

### D-3: `scan_id` se declara `int | None` en el borde HTTP

**Decisión.** El query param se declara `scan_id: int | None = None`; `severity` y `source` se declaran `str | None = None`.

**Por qué.** `scans.id` es un entero autoincremental — confirmado en `Herramientas/Flujo_Fuzzing_N8N.json`, donde el nodo que crea el escaneo declara `id` con `"type": "number"` y `"removed": true` (lo genera la base), y en `App.jsx`, que compara `v.scan_id === scan.id` con igualdad estricta de JS. `server-fuzzing` pasa el valor como *string* y funciona sólo porque `node-pg` manda el parámetro sin tipo y PostgreSQL infiere `int4` del contexto. **asyncpg no hace eso**: ligar un `str` de Python contra una columna `integer` levanta un error de tipo. Declararlo `int` en FastAPI resuelve la coerción en el borde y de paso convierte un `scan_id=abc` en un `422` legible en lugar del `500` que daría `server-fuzzing`.

Es la **única divergencia de comportamiento deliberada** respecto del original, es una mejora estricta, y está declarada en `dashboard-endpoint` §Contrato de los parámetros de filtrado.

**Ojo con la homonimia** (ver Open Questions): en este sistema conviven dos nociones de "scan_id". El `scan_id` que `ScanService` genera (`str(uuid.uuid4())`) y manda a n8n es un identificador de correlación del Bridge; el `scans.id` que este endpoint filtra es el entero que n8n crea al insertar la fila. No son el mismo dato y no se relacionan por igualdad.

### D-4: Cadena completa Router → Service → UoW → Repository, con una UoW que nunca confirma

**Decisión.** Se implementan las cuatro capas, y `DashboardUoW.__aexit__` hace **siempre `rollback()`** antes de cerrar la sesión, en toda salida (normal o por excepción). Nunca hay una rama que llame a `commit()`.

**Por qué las cuatro capas.** La regla dura del proyecto ("el Service nunca instancia SQLAlchemy directamente, siempre a través del UoW") no tiene excepción para lecturas, y saltearla acá dejaría al dominio dashboard como el único asimétrico del servicio.

**Por qué el rollback incondicional.** Convierte la garantía de solo-lectura en una propiedad estructural y no sólo en una convención sobre el texto de las consultas: aunque un change futuro colara una escritura en el repositorio, no existiría ningún camino por el que se persistiera. Es el mismo razonamiento de D-1 aplicado a la transacción en vez de a la metadata. `AuthUoW` sí ramifica commit/rollback porque su dominio escribe; el contraste es intencional y se documenta en el docstring.

`DashboardUoW` recibe la `session_factory` por constructor (idéntico a `AuthUoW`), no `Settings`: el ciclo de vida de la sesión es su única razón de ser.

### D-5: La normalización de `severity` vive en el Service

**Decisión.** `DashboardService` pasa `severity` a minúsculas antes de construir el diccionario de filtros; el repositorio recibe valores ya normalizados y no transforma nada.

**Por qué.** "Las severidades se almacenan en minúsculas y el consumidor las envía capitalizadas" es una regla de dominio sobre los datos, no una preocupación de transporte ni de acceso a datos. El Router no puede aplicarla (no contiene lógica) y el Repository no debería (es un accesor tonto, y la asimetría con `source` —que no se normaliza— es precisamente una decisión de dominio que hay que poder leer en un solo lugar).

**Sobre el precedente aparentemente contrario.** `UserRepository` sí normaliza el email dentro del repositorio (CHANGE-03, D-4). No es el mismo caso: ahí la normalización debe ser **simétrica entre escritura y lectura** dentro del propio repositorio, y ponerla afuera abriría la puerta a que un call site la olvidara y dejara usuarios inalcanzables. Acá no hay escritura, no hay simetría que preservar y la regla es específica de un filtro entre tres.

### D-6: Cómo se reescriben los tests de aislamiento de la base compartida

`test_no_shared_db_impact.py::test_no_reference_to_existing_shared_tables` afirma hoy que **ningún** archivo de producción menciona `scans`/`vulnerabilities` en código. Este change lo vuelve falso. No se borra: se descompone en garantías más precisas y más fuertes.

1. **`test_no_reference_to_existing_shared_tables` con una allowlist de un solo archivo.** Se mantiene tal cual para todo el árbol de producción, salvo `repositories/dashboard_repository.py`. Conserva el 95% de su valor: sigue impidiendo que las tablas compartidas se filtren a services, schemas, models, main o cualquier otro repositorio.
2. **`test_shared_tables_are_not_in_the_declarative_metadata` (nuevo, en runtime).** `assert set(Base.metadata.tables) == {"users"}` tras importar todo el paquete. Es un aserto sobre el estado real del proceso, más fuerte que cualquier análisis AST, y ancla D-1 y el requirement "Las tablas existentes no forman parte del modelo de datos del servicio".
3. **`test_dashboard_repository_sql_is_read_only` (nuevo, AST).** Extrae los literales de string del módulo y verifica que cada uno que contenga SQL empieza por `SELECT` y no contiene `insert`, `update`, `delete`, `drop`, `alter`, `truncate` ni `create`.
4. **`test_dashboard_repository_sql_is_not_built_by_interpolation` (nuevo, AST).** El módulo no contiene `JoinedStr` (f-strings), ni `%`/`+` sobre los literales SQL, ni `.format(`. Ancla la seguridad frente a inyección estructuralmente, no por revisión.
5. **`test_dashboard_uow_never_commits` (nuevo, AST).** No existe ninguna llamada a un atributo `commit` en `uow/dashboard_unit_of_work.py`. Ancla D-4.
6. **`test_lifespan_cycle_only_opens_connection_to_create_users_table` queda intacto.** Sigue verificando que el `create_all` del arranque está acotado a `User.__table__`.

### D-7: Sin `try/except` en ninguna de las capas nuevas

El fallo de base de datos se deja propagar hasta `unhandled_exception_handler`, que ya devuelve un 500 RFC 7807 con `detail` literal — escrito explícitamente para no filtrar el SQL ni el host que un `OperationalError` de asyncpg trae en su `str()`. Capturar acá para devolver `{"error": "Error interno del servidor"}` como hace `server-fuzzing` violaría la regla dura de RFC 7807 y además reintroduciría el riesgo de filtrado que el handler ya resuelve. Es una divergencia de *forma del cuerpo de error* respecto del original, no de comportamiento: en ambos casos el cliente recibe un 5xx opaco.

### D-8: Sin decorador de rate limit y sin cambios en la política de borde

La ruta no lleva `@scan_rate_limit`. El limiter del proyecto se aplica exclusivamente por decorador (CHANGE-00d, D-4: no hay `SlowAPIMiddleware` ni `default_limits`), así que no aplicarlo es suficiente y no requiere ninguna exclusión explícita. `_ALLOWED_METHODS` ya contiene `GET`, de modo que CORS tampoco cambia. Sí hay que revisar `tests/test_app_wiring.py` y `tests/test_edge_policy_exclusions.py` por si enumeran la superficie exacta de rutas.

### D-9: Se reutiliza la `session_factory` existente, sin engine propio

`get_dashboard_service` compone `DashboardService(DashboardUoW(get_session_factory(settings)))` en `core/dependencies.py`, exactamente como `get_auth_service`. No se construye un engine ni un pool nuevos: el mismo pool atiende a `users` y a la consulta del dashboard. Es lo que hace verdadero el requirement "una sola configuración de conexión que no puede divergir", que es la mitad del problema que la unificación viene a resolver.

## Risks / Trade-offs

**R-1 — El endpoint es público y expone vulnerabilidades de todos los objetivos escaneados.** Cualquiera que alcance el servicio obtiene el inventario completo de hallazgos: URLs vulnerables, evidencia y payloads incluidos. Es un riesgo **real y consciente**, heredado de `server-fuzzing`, que hoy corre exactamente igual de abierto en el puerto 5000. → *Mitigación*: ninguna en este change, por decisión explícita del propietario del producto (paridad exacta con el sistema actual). Lo que sí cambia el riesgo es la **exposición**: hasta ahora el dashboard vivía en un backend local que nadie publicaba; a partir de CHANGE-26 la ruta cuelga del mismo servicio que la landing. Si el Bridge alguna vez se despliega fuera de `localhost`, cerrar esta operación deja de ser opcional. Queda documentado en el spec (`dashboard-endpoint` §La consulta de resultados es pública) para que sea una decisión visible y no un olvido, y es candidato natural a un change propio.

**R-2 — `SELECT *` sin `LIMIT` sobre una tabla que sólo crece.** Cada petición trae todas las vulnerabilidades históricas; el frontend reinvoca ante cada cambio de filtro. → *Mitigación*: es el comportamiento actual, con volúmenes de tesis (decenas de escaneos). No se pagina para no divergir del contrato que CHANGE-26 espera. Si el volumen crece, paginar es un change acotado que sólo toca esta capability.

**R-3 — Que `extra="allow"` no sobreviva al `response_model` de FastAPI.** Si la serialización filtrara los campos no declarados, el requirement "una columna no documentada llega igual al consumidor" quedaría incumplido en silencio. → *Mitigación*: es la **primera** tarea de implementación (test RED con una columna inventada, antes de escribir el repositorio); el fallback (`response_model=None` + `JSONResponse` + `responses=`) está definido en D-2 y no cambia el shape observable.

**R-4 — Diferencias de serialización de `scan_date` entre `node-pg` y Pydantic.** `node-pg` devuelve un `Date` que `JSON.stringify` emite en UTC con `Z`; Pydantic emite ISO-8601 con el offset que traiga la columna (o sin offset si es `TIMESTAMP WITHOUT TIME ZONE`). `new Date(...)` en el frontend interpreta una cadena sin offset como hora **local**, lo que puede correr las etiquetas de los gráficos algunas horas respecto del dashboard actual. → *Mitigación*: verificarlo en el smoke manual contra la base real (tarea del grupo 6) y, si aparece, resolverlo en CHANGE-26 en el formateo del frontend — nunca transformando el dato en el backend, que rompería la paridad del contrato.

**R-5 — El esquema compartido puede cambiar bajo nuestros pies.** Si n8n renombra o elimina una columna que el frontend usa, el endpoint sigue respondiendo `200` y el fallo aparece recién en la UI como un valor vacío. → *Mitigación*: es el precio explícito de `SELECT *` + campos opcionales, y es preferible a un `500` por validación estricta ante un esquema que el Bridge no controla. Los campos declarados en `ScanRow`/`VulnerabilityRow` documentan qué se espera; el smoke manual contra la base real cierra el resto.

**R-6 — La allowlist de un archivo en el test de aislamiento puede ensancharse sin revisión.** Un change futuro podría agregar su módulo a la lista en vez de respetar la regla. → *Mitigación*: la allowlist es un literal de un solo elemento con un comentario que remite a este design; y las garantías 2 a 5 de D-6 (metadata, solo-lectura, sin interpolación, sin commit) no dependen de ella.

## Migration Plan

No hay migración de datos ni de esquema: el change es aditivo y de solo lectura.

**Despliegue.** Basta con desplegar el Bridge; no hay variable de entorno nueva (`DB_URL` ya existe y ya apunta a `db_fuzzing`). `dashboard/server-fuzzing` puede seguir corriendo en paralelo sin conflicto —ambos leen— hasta que CHANGE-26 lo retire.

**Rollback.** Quitar `include_router(dashboard_router)` de `create_app()` desmonta la ruta sin efectos residuales: no hay estado persistido, ni schema creado, ni configuración nueva que revertir.

**Orden de implementación.** El test RED de R-3 va primero, porque su resultado decide el mecanismo de serialización de toda la ruta. Los tests de aislamiento reescritos (D-6) van antes que el repositorio: son la red de seguridad que debe estar puesta *mientras* se escribe el primer código que menciona las tablas compartidas, no después.

## Open Questions

- **La KB del esquema de `scans` está desactualizada** (`knowledge-base/04_modelo_de_datos.md` §scans lista `zap_count`/`nuclei_count`/`ffuf_count`/`sqlmap_count`, que no aparecen en el flujo n8n real, y omite `total_vulnerabilities`/`*_count`/`report_path`, que sí se escriben). No bloquea este change —`SELECT *` es indiferente a la documentación— pero conviene corregir la KB en algún momento. No se toca acá para no mezclar una corrección de documentación con un change de código.
- **Homonimia de `scan_id`** (ver D-3): el UUID de correlación del Bridge y el entero `scans.id` comparten nombre en distintas partes del sistema. Este change no las relaciona ni necesita hacerlo, pero es el tipo de cosa que confunde en CHANGE-26. Vale la pena nombrarlas distinto en el frontend nuevo.
