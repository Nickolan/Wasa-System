## Context

**Estado actual.** `fastapi_bridge/repositories/user_repository.py` es un docstring placeholder de CHANGE-00a. Por encima de él, `uow/auth_unit_of_work.py` y `services/auth_service.py` también son placeholders. Por debajo, todo está listo desde CHANGE-01: el modelo `User` (`id`, `email` con `unique=True`, `hashed_password`, `created_at` con `server_default=func.now()`), el engine async perezoso (`get_engine(settings)`) y la factory de sesiones (`get_session_factory(settings)`, con `expire_on_commit=False`). CHANGE-02 dejó los contratos Pydantic, que este change **no** toca: el repositorio trabaja con primitivos y con el modelo ORM, nunca con schemas.

**Restricciones que condicionan el diseño:**

1. **Regla dura de capas** (`knowledge-base/08_arquitectura_propuesta.md`): `Router → Service → UoW → Repository → (SQLAlchemy, Settings)`. El Repository nunca importa FastAPI. Ya está anclado con un test AST (`tests/test_layer_boundaries.py`, fila `("repositories", "fastapi")`).
2. **RN-WS-13**: email único; un registro duplicado retorna 409 Conflict. La constraint vive en el motor desde CHANGE-01; lo que falta es traducir su violación a algo que la capa web pueda mapear a 409.
3. **RN-WS-12**: la contraseña en claro nunca se persiste. El repositorio recibe el hash ya calculado y lo trata como texto opaco.
4. **`knowledge-base/04_modelo_de_datos.md` §users**: "`email`: TEXT, UNIQUE, NOT NULL — **normalizado a lowercase antes de guardar**".
5. **DD-02**: nada de migraciones ni de DDL sobre `db_fuzzing` fuera de la creación idempotente de `users`. Este change no emite DDL en producción.
6. **Sin PostgreSQL disponible en la suite**: la suite actual (142 tests) corre sin base de datos — CHANGE-01 la diseñó entera con dobles (`FakeAsyncEngine` en `conftest.py`). Este es el primer change cuyo objeto de prueba *es* el SQL.

**Governance: MEDIUM.** CHANGE-03 pertenece al dominio Auth (CHANGE-01..07), que el `CLAUDE.md` del proyecto baja explícitamente de CRITICAL a MEDIUM por decisión del usuario: se implementa en pasos, surfaceando las decisiones no obvias, sin aprobación línea por línea. Las decisiones marcadas **[REVISAR]** más abajo son el checkpoint de este change; la tarea 1.3 de `tasks.md` no debe cerrarse sin respuesta del usuario.

**Strict TDD.** Está activo globalmente. `tasks.md` secuencia cada grupo como RED → GREEN → TRIANGULATE → REFACTOR, y el grupo 2 monta la infraestructura de test **antes** de escribir una línea del repositorio, porque sin base ejecutable no hay RED posible para D-3 ni para D-5.

## Goals / Non-Goals

**Goals:**

- Una superficie mínima y completa para CHANGE-04: dos métodos (`get_by_email`, `create`) y una excepción (`EmailAlreadyExistsError`).
- Que `AuthService` pueda dar de alta y buscar usuarios sin importar **nada** de SQLAlchemy, ni siquiera el modelo `User` para construirlo.
- Convertir la garantía de unicidad del motor en un error de dominio nombrado, que CHANGE-07 pueda mapear a 409 sin conocer el ORM.
- Que la normalización del email sea un invariante real: simétrica entre escritura y lectura, definida una sola vez.
- Dejar el límite transaccional libre para que la `AuthUoW` de CHANGE-04 lo ocupe sin pelearse con el repositorio.
- Tests que ejerciten SQL de verdad, incluida una violación de unicidad real.

**Non-Goals:**

- El hashing bcrypt (`core/security.py`) y la verificación de credenciales — CHANGE-04.
- La `AuthUoW` misma, el `commit`/`rollback` y su cableado por `Depends` — CHANGE-04/CHANGE-06.
- El handler que traduce `EmailAlreadyExistsError` a un 409 RFC 7807 — CHANGE-07.
- Los endpoints `/register` y `/login` — CHANGE-05.
- `update`, `delete`, `get_by_id`, paginación o listados: ninguna historia de usuario los pide. Agregar métodos "por si acaso" es superficie muerta que después hay que mantener y testear.
- Índices adicionales: `email` ya está respaldado por el índice único de CHANGE-01 (requirement "La unicidad soporta la búsqueda por email" en `specs/user-persistence/spec.md`).
- Caché de usuarios, *soft delete*, auditoría de accesos.

## Decisions

### D-1 — `EmailAlreadyExistsError` vive en un módulo nuevo `exceptions/domain.py`, con una base `DomainError` **[REVISAR]**

`exceptions/` hoy contiene un único módulo, `handlers.py`, que importa `starlette` y `slowapi`. El repositorio **no puede** importar de ahí sin arrastrar el framework web a una capa que por regla dura debe ser reutilizable fuera de él.

Alternativas consideradas:

- **(a) Declarar la excepción dentro de `repositories/user_repository.py`.** Cero módulos nuevos. Pero obliga a `AuthService` y a `exceptions/handlers.py` (CHANGE-07) a importar desde el módulo del repositorio para atrapar un error de *dominio* — una dependencia invertida: la capa web terminaría importando de la capa de persistencia. Es exactamente el problema que D-10 de CHANGE-02 ya resolvió al mudar `ErrorDetail` fuera de `scan_schemas.py`.
- **(b) Declararla en `exceptions/__init__.py`.** Hoy es solo un docstring, así que técnicamente funciona. Pero un `__init__.py` con lógica invita a que cualquier import del paquete `exceptions` (incluido `exceptions.handlers`) arrastre símbolos, y mezcla el vocabulario de dominio con el paquete que aloja la maquinaria HTTP.
- **(c) Módulo nuevo `fastapi_bridge/exceptions/domain.py`** — **elegida**. Un solo lugar, libre de framework, importable desde cualquier capa. Se declara además una base `class DomainError(Exception)` de la que `EmailAlreadyExistsError` hereda: CHANGE-07 podrá registrar un handler por la base en vez de uno por excepción concreta, y CHANGE-04 (`InvalidCredentialsError`) y CHANGE-11 tendrán dónde poner las suyas sin volver a discutir la ubicación.

Precedente directo: `error_schemas.py` en CHANGE-02, por el mismo razonamiento (contrato transversal → módulo propio, no el módulo de un dominio).

**A revisar por el usuario:** ¿se acepta el módulo nuevo `exceptions/domain.py` con jerarquía `DomainError → EmailAlreadyExistsError`, o se prefiere una excepción suelta sin base? El costo de la base es una línea; el beneficio se cobra en CHANGE-07.

### D-2 — La excepción lleva el email en conflicto como atributo

`EmailAlreadyExistsError(email)` guarda `self.email` (el email **ya normalizado**) y arma su mensaje a partir de él. Sin el atributo, CHANGE-07 tendría que parsear el mensaje de la excepción para componer el `detail` del RFC 7807, o volver a consultar la base. Es un dato que el repositorio ya tiene en la mano y que cuesta cero propagar.

Se propaga el email normalizado, no el original: es el valor que realmente colisionó en el motor, y es el que hace verificable el escenario "Un alta con otra capitalización choca con el usuario existente".

Nota de seguridad para CHANGE-05/CHANGE-07: que la excepción lleve el email no obliga a devolverlo en la respuesta HTTP. Para `/register`, un 409 explícito es aceptable (RN-WS-13 lo pide) y no constituye enumeración adicional, porque el atacante ya conocía el email que envió. En `/login` el mensaje **debe** seguir siendo genérico (HU-03-02); esa excepción no es esta.

### D-3 — `create` captura `IntegrityError` de forma amplia, y el test ancla el porqué **[REVISAR]**

`create` envuelve el `flush` en `try/except IntegrityError` y traduce a `EmailAlreadyExistsError`, encadenando la causa (`raise ... from exc`).

La pregunta fina es **cuán específica** debe ser la captura:

- **(a) Inspeccionar `exc.orig` para confirmar que es una violación de unicidad** (SQLSTATE `23505` en PostgreSQL, o `asyncpg.exceptions.UniqueViolationError`). Máxima precisión, pero acopla el repositorio al driver: el código pasaría a depender de detalles de `asyncpg`, y en la suite (que corre sobre SQLite, ver D-6) esa rama nunca se ejercitaría — quedaría código de producción sin cobertura, que es peor que no tenerlo.
- **(b) Capturar `IntegrityError` sin discriminar** — **elegida**. Hoy es correcto por construcción y el argumento es verificable: la tabla `users` tiene exactamente **una** constraint que un `INSERT` puede violar (la unicidad de `email`); `id` lo genera la base, `created_at` tiene `server_default`, y `hashed_password` es `NOT NULL` pero la firma tipada de `create` garantiza que llega un `str`. No hay claves foráneas (`knowledge-base/04_modelo_de_datos.md`: "Relaciones: ninguna"). Por lo tanto, cualquier `IntegrityError` que produzca este `INSERT` **es** el email duplicado.
- **(c) Chequear primero con `get_by_email` y no capturar nada.** Descartada: es una condición de carrera clásica. Entre el `SELECT` y el `INSERT`, otra petición concurrente puede insertar el mismo email — el motor es la única autoridad. El requirement de CHANGE-01 ya lo dice: la constraint garantiza RN-WS-13 "incluso ante inserciones concurrentes que la validación previa en el Service no puede detectar". El chequeo previo en `AuthService` (CHANGE-04) es una optimización de UX, no la garantía.

El riesgo de (b) es futuro, no presente: si un change posterior le agrega a `users` una segunda constraint (otra unicidad, un `CHECK`, una FK), la captura amplia empezaría a reportar "email duplicado" ante violaciones que no lo son. La mitigación no es código defensivo hoy, sino un **test que ancle el supuesto**: un test estructural que afirma que `User.__table__` tiene exactamente una constraint de unicidad y ninguna FK. Si alguien agrega otra, ese test se pone rojo y obliga a revisar esta decisión.

**A revisar por el usuario:** ¿captura amplia con test-ancla (recomendado), o inspección de SQLSTATE aceptando la rama sin cobertura?

### D-4 — La normalización del email es simétrica: `create` **y** `get_by_email` **[REVISAR — extensión del roadmap]**

`CHANGES.md` para CHANGE-03 solo dice que `create` "normaliza email a lowercase antes de guardar". Aplicarlo literalmente produce un bug silencioso:

- Alguien se registra con `Nicolas@UTN.edu.ar` → se guarda `nicolas@utn.edu.ar`.
- Intenta loguearse escribiendo `Nicolas@UTN.edu.ar` → `get_by_email` sin normalizar consulta por el literal con mayúsculas → `None` → 401. **El usuario queda fuera de su propia cuenta**, y el mensaje genérico de login (HU-03-02) hace que el síntoma sea indistinguible de una contraseña mal escrita.
- Peor: el chequeo previo de duplicados de `AuthService` (CHANGE-04) tampoco lo encontraría, así que el usuario vería un 409 recién al chocar contra la constraint, o —si el chequeo previo decidiera el flujo— un comportamiento inconsistente.

`email` en PostgreSQL es `String(320)` con unicidad **case-sensitive**: `USER@TEST.COM` y `user@test.com` son dos valores distintos para el motor. La normalización es lo único que hace que la constraint signifique lo que RN-WS-13 quiere que signifique.

Por eso la normalización se implementa como una función de módulo (`_normalize_email(email: str) -> str`) invocada por ambos métodos, y el spec declara la simetría como normativa.

Alternativa considerada y descartada: **una columna generada o un índice funcional `LOWER(email)` en el motor.** Sería más robusto (imposible de saltear desde ningún código), pero requiere DDL adicional sobre `db_fuzzing`, y DD-02 restringe el DDL de este servicio a la creación idempotente de `users` tal como está. Descartada por restricción de proyecto, no por mérito técnico.

**Sobre la capa:** se podría argumentar que normalizar es una regla de dominio y pertenece al Service. Pero la KB la enuncia como propiedad de la persistencia ("normalizado a lowercase antes de guardar", en `04_modelo_de_datos.md`) y ubicarla en el repositorio la vuelve **inviolable**: ningún llamador futuro puede saltearla. Si CHANGE-04 normaliza además por su cuenta, es idempotente y no molesta.

**A revisar por el usuario:** ¿se acepta extender la normalización a `get_by_email`? Es una desviación del texto literal del roadmap y, si se aprueba, `CHANGES.md` debe reflejarla como nota de implementación (tarea 8.1).

### D-5 — `create` hace `flush`, no `commit`: el límite transaccional es de la UoW **[REVISAR]**

- **(a) `create` hace `commit`.** Cumple el criterio de aceptación de forma trivial y funciona hoy. Pero rompe el patrón Unit of Work antes de que exista: si CHANGE-04 necesita que el alta y otra escritura sean atómicas, el repositorio ya confirmó por su cuenta y no hay vuelta atrás. Además vuelve el repositorio intesteable en transacciones que se deshacen al final de cada test.
- **(b) `create` hace `flush`, la UoW confirma** — **elegida**. `flush` envía el `INSERT` sin cerrar la transacción, lo que produce las dos cosas que el criterio de aceptación pide: el `id` generado por la base queda poblado en el objeto, y la violación de unicidad **se dispara acá dentro**, donde el repositorio puede atraparla y traducirla (D-3). Si el repositorio no hiciera `flush`, el `IntegrityError` aparecería recién en el `commit` de la UoW, es decir, fuera del `try/except` — y `EmailAlreadyExistsError` nunca se lanzaría.

`created_at` es un caso aparte: lo genera la base vía `server_default`, y después de un `flush` el atributo puede quedar sin cargar. Con `expire_on_commit=False` (D-7 de CHANGE-01) el objeto no se expira al confirmar, así que la forma explícita de garantizar el escenario "La marca temporal la pone la base" es un `await session.refresh(user)` tras el `flush`. Es un round-trip extra por alta — irrelevante frente al costo de bcrypt que lo precede en el mismo request.

**Quién hace `rollback` tras el conflicto:** el repositorio **no**. Un `IntegrityError` deja la transacción en estado inutilizable, pero deshacerla es una decisión de alcance que solo la UoW puede tomar. El repositorio lanza `EmailAlreadyExistsError` y el `__aexit__` de la `AuthUoW` (CHANGE-04) hace `rollback` ante cualquier excepción. La alternativa —envolver el `INSERT` en un `SAVEPOINT` (`session.begin_nested()`) para que el repositorio se recupere sin ensuciar la transacción externa— es más sofisticada y permitiría seguir usando la sesión tras el conflicto, pero hoy no hay ningún caso de uso que lo necesite: el flujo de registro aborta ante un duplicado. Queda documentada como la salida si CHANGE-04 la termina necesitando.

**A revisar por el usuario:** ¿se acepta `flush` + `refresh` sin `commit` ni `rollback` en el repositorio, con `tasks.md` de CHANGE-04 asumiendo explícitamente el `rollback` en la UoW?

### D-6 — Los tests corren contra SQLite async en memoria; `aiosqlite` entra a `requirements-dev.txt` **[REVISAR — dependencia nueva]**

Este es el primer change cuyo objeto de prueba es el SQL. Los criterios de aceptación "INSERT exitoso, retorna User con id poblado", "lanza `EmailAlreadyExistsError`" y "el email se guarda en lowercase" no son verificables sin ejecutar sentencias contra un motor.

- **(a) Dobles de `AsyncSession`.** Sin dependencias nuevas y rápido, siguiendo el precedente de `FakeAsyncEngine`. Pero para probar el duplicado habría que **programar el doble para que lance `IntegrityError`** — es decir, el test afirmaría "si SQLAlchemy lanzara `IntegrityError`, lo traduzco", que es una tautología sobre el propio doble. No verifica que la constraint exista, ni que el `flush` sea el momento en que se dispara, ni que el `id` se pueble. El criterio de aceptación más importante quedaría probado contra una ficción.
- **(b) PostgreSQL real en la suite.** Máxima fidelidad: mismo motor, mismo driver, mismo SQLSTATE. Pero exige una base viva en cada corrida, y `10_preguntas_abiertas.md` marca las credenciales de `db_fuzzing` como pregunta abierta de prioridad Alta. Volvería la suite no ejecutable en CI y en la máquina de cualquiera que no tenga la base. Inaceptable hoy.
- **(c) SQLite async en memoria (`sqlite+aiosqlite:///:memory:`)** — **elegida**. Un motor real, asíncrono, sin proceso externo, creado y destruido por fixture. Crea **únicamente** `User.__table__` (mismo alcance explícito que el `lifespan` de CHANGE-01, por el requirement "El alcance del create_all es explícito"). Verifica de verdad: que la constraint `UNIQUE` existe en el DDL emitido, que su violación produce un `IntegrityError` de SQLAlchemy en el `flush`, que el `id` autoincremental lo pone la base, que `func.now()` puebla `created_at`, y que lo almacenado está en minúsculas.

Fidelidad conocida y sus límites: SQLAlchemy normaliza el error del driver a `sqlalchemy.exc.IntegrityError` en ambos motores, que es exactamente lo que `create` captura (D-3) — el `except` probado es el mismo que corre en producción. Lo que SQLite **no** reproduce fielmente: `String(320)` no trunca ni valida longitud, `DateTime(timezone=True)` devuelve un naive, y el SQLSTATE de PostgreSQL no existe. Ninguna de las tres cosas es objeto de prueba de este change: la longitud la cubre `test_user_model.py` compilando el DDL contra el dialecto PostgreSQL (CHANGE-01), no se afirma nada sobre la zona horaria de `created_at`, y el SQLSTATE es justamente lo que D-3 decidió no mirar. La coherencia entre ambos mundos ya está anclada aguas arriba por los tests de DDL de CHANGE-01.

`aiosqlite` va **solo** a `requirements-dev.txt` (junto a `pytest`, `pytest-asyncio`, `anyio`). `requirements.txt` no se toca: producción habla únicamente `asyncpg`. La fixture no toca `get_engine`/`get_session_factory` (que leen `Settings.DB_URL`): construye su propio engine SQLite, de modo que ningún test pueda accidentalmente apuntar a `db_fuzzing`.

**A revisar por el usuario:** ¿se aprueba agregar `aiosqlite` como dependencia de desarrollo? Es la primera dependencia nueva desde CHANGE-00a. La alternativa es aceptar (a) y probar el criterio de aceptación clave contra un doble.

### D-7 — `get_by_email` usa `select(...)` + `scalar_one_or_none()`

`await session.execute(select(User).where(User.email == normalized))` seguido de `.scalar_one_or_none()`.

`session.get()` no aplica: busca por clave primaria, y acá la clave es el email. Entre las formas de consumir el resultado, `scalar_one_or_none()` es la que expresa la firma `User | None` con precisión: devuelve `None` con cero filas, la entidad con una, y **lanza** con más de una. Ese "lanza con más de una" es deseable: si alguna vez hubiera dos usuarios con el mismo email, la constraint estaría rota y fallar ruidosamente es mejor que devolver uno arbitrario. `first()` en cambio taparía esa corrupción.

La comparación `User.email == normalized` genera un parámetro ligado, no concatenación de texto: el escenario "La consulta no se arma concatenando texto" del spec queda cubierto por construcción, y el test lo ejercita con un email que contiene comillas y un fragmento de SQL.

### D-8 — `create` recibe primitivos, no una entidad ORM

El docstring placeholder actual de `user_repository.py` anuncia `create(user)`; el roadmap especifica `create(email, hashed_password)`. Se sigue el roadmap y se corrige el docstring.

La razón es la regla de capas: si `create` recibiera un `User`, `AuthService` tendría que construirlo, y para eso tendría que importar `fastapi_bridge.db.models` — es decir, la capa de servicio pasaría a conocer el ORM. Recibiendo primitivos, el único módulo que sabe que existe una clase `User` es el repositorio. Es la misma lógica por la que el repositorio devuelve el `User` y no un dict: hacia arriba la entidad es un objeto opaco del que CHANGE-04 solo leerá `id`, `email` y `hashed_password`.

El mismo docstring desactualizado está en `uow/auth_unit_of_work.py` (dice "CHANGE-02/CHANGE-04" y `create(user)`); se corrige de paso, sin implementar nada de la UoW.

### D-9 — Una fila más en `LAYER_IMPORT_RULES`: `("repositories", "passlib")`

El criterio de aceptación del roadmap dice "el repository no conoce nada de FastAPI **ni de passlib**". La primera mitad ya está anclada desde CHANGE-00a; la segunda no. Agregar la fila cuesta una línea, gracias a la tabla parametrizada que CHANGE-00a dejó preparada (D-12 de aquel change: "agregar una regla nueva en un change futuro es una línea acá"), y el test negativo `test_helper_detects_a_forbidden_import` ya garantiza que la regla no pase "por no detectar nada".

Deliberadamente **no** se agrega `("repositories", "pydantic")`: los schemas no están prohibidos por ninguna regla del proyecto en esa capa, y `n8n_repository.py` (CHANGE-09) va a necesitar `httpx` y posiblemente tipos Pydantic. Prohibir de más rompería un change futuro sin que ninguna regla lo respalde.

### D-10 — Sin métodos de conveniencia extra

No se agrega `exists(email) -> bool` (es `get_by_email(...) is not None`, y tenerlo duplicado invita a que CHANGE-04 haga dos viajes a la base donde alcanza uno), ni `get_by_id`, ni `update`, ni `delete`. Ninguna historia de usuario los pide y no hay `PATCH`/`DELETE` de usuario en el alcance v1.2. Cada método público es superficie que hay que testear, documentar y mantener sincronizada.

## Risks / Trade-offs

- **[R-1] Normalización asimétrica reintroducida por un change futuro** → Un `get_by_email` que deje de normalizar produce usuarios inalcanzables, y el 401 genérico de login (HU-03-02) hace el síntoma indistinguible de una contraseña equivocada: es el bug más caro de diagnosticar de este change. **Mitigación**: la simetría es un requirement normativo del spec, la normalización está en una única función compartida, y hay un test explícito que busca con capitalización distinta a la del alta.

- **[R-2] La captura amplia de `IntegrityError` envejece mal** → Si `users` gana una segunda constraint, un `INSERT` que la viole se reportaría como "email duplicado" (D-3). **Mitigación**: test estructural que afirma que `User.__table__` tiene exactamente una constraint de unicidad y ninguna FK; agregar otra pone el test en rojo y fuerza a revisitar D-3. El comentario del código apunta a este párrafo.

- **[R-3] Divergencia SQLite ↔ PostgreSQL** → La suite pasa en verde y el comportamiento real contra `db_fuzzing` difiere (D-6). **Mitigación**: la superficie ejercitada es la que ambos motores comparten (`IntegrityError` normalizado por SQLAlchemy, `UNIQUE`, autoincremento, `func.now()`); los detalles específicos de PostgreSQL ya están cubiertos por los tests de DDL contra el dialecto real de CHANGE-01; el diseño evita a propósito mirar el SQLSTATE. Residual: la primera corrida contra `db_fuzzing` real (CHANGE-22, smoke E2E) sigue siendo la validación definitiva del alta duplicada.

- **[R-4] El `flush` sin `commit` es un contrato implícito hacia CHANGE-04** → Si la `AuthUoW` no confirma, el alta se pierde en silencio: nada falla, simplemente el usuario no queda registrado. **Mitigación**: el spec lo declara normativo con escenario ("El alta no confirma la transacción"), y `tasks.md` deja anotado el traspaso explícito a CHANGE-04 (`commit` en el camino feliz, `rollback` ante excepción).

- **[R-5] `refresh` tras `flush` es un round-trip extra** → Un `SELECT` adicional por cada alta, solo para poblar `created_at`. **Trade-off aceptado**: el registro no es un camino caliente y en el mismo request corre un hash bcrypt con `rounds=12`, que domina el costo por dos órdenes de magnitud. La alternativa (`server_default` + `eager_defaults` en el mapper) optimizaría un caso que no lo necesita a cambio de acoplar el modelo a un detalle del ORM.

- **[R-6] Dependencia de desarrollo nueva** → `aiosqlite` es superficie adicional que mantener (D-6). **Mitigación**: solo en `requirements-dev.txt`, nunca importada por código de producción, y `test_layer_boundaries.py` no la permite en ninguna capa de producción porque los tests quedan fuera de su barrido.

- **[R-7] Carrera de registro concurrente** → Dos peticiones simultáneas con el mismo email: ambas pasan el chequeo previo de CHANGE-04 y una choca contra la constraint. **No es un riesgo, es el diseño**: el motor decide y el perdedor recibe `EmailAlreadyExistsError` → 409, exactamente lo que RN-WS-13 pide. Se registra acá para que nadie "arregle" la carrera reemplazando la captura por un chequeo previo (alternativa (c) de D-3).

## Migration Plan

No hay migración. No se emite DDL, no se toca el esquema, no se leen ni escriben datos existentes: la tabla `users` ya existe desde CHANGE-01 y arranca vacía (`04_modelo_de_datos.md` §Seed data: "Ninguna"). Rollback = revertir el commit; el repositorio no tiene consumidores en producción hasta CHANGE-04.

Único paso operativo: `pip install -r fastapi_bridge/requirements-dev.txt` para incorporar `aiosqlite` antes de correr la suite (D-6). Sin impacto en el despliegue de runtime.

## Open Questions

Ninguna bloqueante para implementar. Las cinco decisiones marcadas **[REVISAR]** — D-1 (módulo y jerarquía de la excepción), D-3 (amplitud de la captura de `IntegrityError`), D-4 (normalización simétrica, extensión del roadmap), D-5 (`flush` sin `commit` y quién hace `rollback`), D-6 (`aiosqlite` como dependencia de desarrollo) — son el checkpoint de governance MEDIUM de este change y se presentan al usuario en la tarea 1.3 de `tasks.md`. Cada una tiene una recomendación explícita; ninguna deja el diseño bloqueado si el usuario acepta las recomendaciones.

Traspasos anotados, no preguntas abiertas:

- **CHANGE-04** debe hacer `commit` en el camino feliz y `rollback` ante cualquier excepción dentro de la `AuthUoW` (D-5), y no debe reemplazar la captura de `IntegrityError` por un chequeo previo (R-7).
- **CHANGE-07** debe mapear `EmailAlreadyExistsError` a `409 Conflict` en formato RFC 7807 vía `problem_detail_response(...)`, usando `exc.email` para el `detail` (D-2). Conviene registrar el handler sobre `DomainError` si D-1 se acepta con jerarquía.
- **CHANGE-14** (Zod, frontend) no necesita replicar la normalización, pero enviar el email en minúsculas desde el formulario evita que el usuario perciba diferencias de capitalización entre lo que escribió y lo que el sistema almacenó.
