## REMOVED Requirements

### Requirement: El scaffold no toca la base de datos compartida

**Reason**: El requirement vigente prohíbe que las tablas preexistentes `scans` y `vulnerabilities` sean "declaradas, mapeadas, **leídas**, escritas ni migradas" desde el servicio, y lo ancla con el escenario "Tablas existentes intactas", cuyo THEN afirma que "no existe ninguna sentencia, modelo ni migración que referencie" esas tablas. Este change introduce deliberadamente sentencias de **lectura** sobre ambas: es la única forma de unificar el dashboard dentro del Bridge, que es el objetivo del change. El escenario quedaría desmentido por su propio nombre y su THEN, y el nombre de un escenario no se puede reescribir dentro de un `MODIFIED` sin que mienta (el validador exige conservar los nombres de escenario existentes; mismo caso ya resuelto por CHANGE-12 en esta misma capability). Se retira el bloque completo y se lo reemplaza en `ADDED Requirements`.

**Migration**: Sustituido por "El servicio no escribe ni migra la base de datos compartida" en `ADDED Requirements`. La garantía **no se debilita en lo que importa**: sigue prohibido escribir, migrar, emitir DDL y mapear esas tablas al modelo de datos propio del servicio, y sigue anclado que el único DDL del arranque es el de `users` y que no hay Alembic. Lo único que se permite ahora, explícitamente y con su propia condición acotada, es la **lectura**. El test `tests/test_no_shared_db_impact.py::test_no_reference_to_existing_shared_tables` —que hoy verifica "cero menciones"— se reescribe como "cero escrituras y cero mapeo ORM"; no se borra.

### Requirement: Superficie de API expuesta por el servicio con scan montado

**Reason**: El escenario "Rutas de aplicación registradas" enumera las rutas de aplicación como **exactamente** cuatro (`GET /health`, las dos de auth y `POST /api/v1/scan/start`). Este change monta una quinta, `GET /api/v1/dashboard`, y además el nombre del requirement ("…con scan montado") deja de describir la superficie completa. Se sigue el precedente ya establecido por CHANGE-05 y CHANGE-12 en esta misma capability: retirar el bloque y reemplazarlo por su versión actualizada.

**Migration**: Sustituido por "Superficie de API expuesta por el servicio con el dashboard montado" en `ADDED Requirements`, que conserva todas las garantías anteriores (las rutas de auth y de scan siguen disponibles, scan sigue aplicando su guard, `GET /health` conserva su contrato exacto, y montar un router sigue siendo decisión explícita del change que implementa sus operaciones) y agrega la ruta de consulta de resultados. Ninguna garantía se pierde.

## ADDED Requirements

### Requirement: El servicio no escribe ni migra la base de datos compartida

El FastAPI Bridge SHALL convivir con el sistema WASA existente sobre la instancia PostgreSQL `db_fuzzing` sin alterar lo que no le pertenece. El servicio SHALL emitir DDL **exclusivamente** para su propia tabla `users`. Sobre las tablas preexistentes `scans` y `vulnerabilities` el servicio SHALL limitarse a **consultas de lectura**: NO SHALL insertar, actualizar ni borrar filas, NO SHALL emitir `CREATE`, `ALTER`, `DROP` ni `TRUNCATE`, NO SHALL migrarlas y NO SHALL declararlas como entidades del modelo de datos propio del servicio —el mecanismo de creación de esquema del arranque SHALL seguir sin poder alcanzarlas, ni siquiera por arrastre de un modelo futuro.

La prohibición SHALL estar anclada por pruebas automatizadas que fallen ante una escritura, un DDL o un mapeo sobre esas tablas, y que sigan pasando ante una lectura legítima.

#### Scenario: Sin conexión en el import

- **WHEN** se importan los módulos del servicio
- **THEN** no se construye ningún engine ni se abre ningún pool a nivel de módulo: `create_async_engine` y `create_all` no se invocan en el cuerpo de ningún módulo

#### Scenario: El único DDL del arranque es la tabla propia

- **WHEN** arranca la aplicación contra `db_fuzzing`
- **THEN** el único DDL emitido es el `CREATE TABLE` idempotente de `users`, acotado explícitamente a esa tabla

#### Scenario: Sobre las tablas existentes sólo se lee

- **WHEN** se revisa el código de producción del servicio fuera de los docstrings
- **THEN** toda instrucción que referencia `scans` o `vulnerabilities` es de lectura: no aparece ninguna inserción, actualización, borrado ni instrucción de definición de esquema sobre ellas

#### Scenario: Las tablas existentes no forman parte del modelo de datos del servicio

- **WHEN** se inspecciona el conjunto de tablas registradas en el modelo de datos declarativo del servicio
- **THEN** contiene únicamente `users`: `scans` y `vulnerabilities` no están registradas, de modo que ninguna invocación del mecanismo de creación de esquema puede emitir DDL sobre ellas

#### Scenario: Ninguna transacción de lectura se confirma

- **WHEN** el servicio resuelve una consulta de lectura sobre las tablas existentes
- **THEN** la transacción se cierra sin confirmar cambios: no hay ningún camino por el que una escritura accidental llegue a persistirse

#### Scenario: Sin herramientas de migración sobre la base compartida

- **WHEN** se inspecciona el árbol del proyecto
- **THEN** no hay configuración de Alembic ni ningún otro mecanismo que pueda emitir `ALTER`, `DROP` o `TRUNCATE` sobre `db_fuzzing`

#### Scenario: La prohibición está anclada por tests

- **WHEN** un change futuro agregue al código de producción una escritura, un DDL o un mapeo del modelo de datos sobre `scans` o `vulnerabilities`
- **THEN** la suite de tests falla señalando el archivo infractor

### Requirement: Superficie de API expuesta por el servicio con el dashboard montado

La aplicación SHALL exponer el endpoint de salud, las dos operaciones de autenticación (`POST /api/v1/auth/register` y `POST /api/v1/auth/login`), la operación de disparo de escaneo (`POST /api/v1/scan/start`) y la operación de consulta de resultados (`GET /api/v1/dashboard`), cada una montada desde `create_app()` por el change que implementó sus operaciones (auth por CHANGE-05, scan por CHANGE-12, dashboard por este change). Montar un router SHALL seguir siendo una decisión explícita del change correspondiente, nunca un efecto colateral de otro change.

#### Scenario: Rutas de aplicación registradas

- **WHEN** se inspecciona `app.routes` descartando las rutas internas de FastAPI (`/docs`, `/openapi.json`, `/redoc`)
- **THEN** las rutas de aplicación registradas son exactamente `GET /health`, `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/scan/start` y `GET /api/v1/dashboard`

#### Scenario: Los endpoints de auth están disponibles

- **WHEN** se hace `POST /api/v1/auth/register` o `POST /api/v1/auth/login` con un cuerpo válido
- **THEN** la respuesta no es `404`: ambas rutas están montadas y atendidas por el router de auth

#### Scenario: El endpoint de scan está disponible y protegido

- **WHEN** se hace `POST /api/v1/scan/start`
- **THEN** la respuesta no es `404`: el router de scan atiende la solicitud y aplica su propio guard de autenticación sobre ella

#### Scenario: El endpoint de dashboard está disponible y es público

- **WHEN** se hace `GET /api/v1/dashboard` sin cabecera de autorización
- **THEN** la respuesta no es `404` ni `401`: el router de dashboard, montado por este change, atiende la solicitud sin exigir credencial

#### Scenario: Montar el dashboard no altera el guard de scan

- **WHEN** se hace `POST /api/v1/scan/start` sin credencial, con el router de dashboard montado
- **THEN** la respuesta sigue siendo `401`: que exista una operación pública no relaja la política de las operaciones protegidas

#### Scenario: El endpoint de salud conserva su contrato

- **WHEN** se hace `GET /health` con los routers de auth, scan y dashboard montados
- **THEN** la respuesta sigue siendo `200` con body exactamente `{"status": "ok", "service": "wasa-fastapi-bridge"}`
