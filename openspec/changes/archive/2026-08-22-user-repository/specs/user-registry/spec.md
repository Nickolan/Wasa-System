## ADDED Requirements

### Requirement: Acceso a usuarios mediante un repositorio con sesión inyectada
El acceso a la tabla `users` SHALL concentrarse en una única clase `UserRepository`, declarada en `fastapi_bridge/repositories/user_repository.py`, cuyo constructor recibe una `AsyncSession` ya abierta. El repositorio NO SHALL construir engines ni sesiones, NO SHALL leer la configuración del servicio y NO SHALL decidir cuándo empieza o termina una transacción: esas responsabilidades pertenecen a la Unit of Work que lo instancia. Todos sus métodos de acceso a datos SHALL ser asíncronos y SHALL declarar type hints completos.

#### Scenario: La sesión llega por el constructor
- **WHEN** se construye un `UserRepository` pasándole una sesión asíncrona
- **THEN** el repositorio queda utilizable con esa sesión, y en ningún momento de su construcción se crea un engine, una factory de sesiones ni se lee la configuración del servicio

#### Scenario: Los métodos de acceso a datos son asíncronos
- **WHEN** se inspeccionan los métodos públicos de acceso a datos de `UserRepository`
- **THEN** todos son corrutinas, de modo que ninguna operación de I/O bloquea el event loop

#### Scenario: Toda la persistencia de usuarios pasa por el repositorio
- **WHEN** se inspecciona el código de producción del servicio fuera de `repositories/` y de `db/`
- **THEN** ningún módulo emite consultas sobre la tabla `users` por su cuenta: la única superficie de acceso es `UserRepository`

### Requirement: Búsqueda de usuario por email
`UserRepository` SHALL exponer `get_by_email(email: str) -> User | None`, que devuelve el usuario cuyo email coincide, o `None` cuando no existe ninguno. La ausencia de usuario NO SHALL modelarse como excepción: es un resultado esperado tanto en el registro (email libre) como en el login (credenciales inexistentes), y tratarla como error obligaría al llamador a usar el flujo de excepciones para un camino normal.

#### Scenario: El usuario existe
- **WHEN** se busca por el email de un usuario que ya está en la tabla
- **THEN** se devuelve ese usuario, con sus campos poblados desde la base

#### Scenario: El usuario no existe
- **WHEN** se busca por un email que no corresponde a ningún usuario
- **THEN** se devuelve `None` y no se lanza ninguna excepción

#### Scenario: La búsqueda es exacta, no parcial
- **WHEN** existe el usuario `alguien@test.com` y se busca por un email que lo contiene como fragmento (por ejemplo `alguien@test.com.ar`) o del que él es fragmento (por ejemplo `guien@test.com`)
- **THEN** se devuelve `None`: la coincidencia es por igualdad del email completo, no por prefijo, sufijo ni patrón

#### Scenario: La consulta no se arma concatenando texto
- **WHEN** se inspecciona cómo se construye la consulta de búsqueda
- **THEN** usa el lenguaje de expresiones del ORM con el email como parámetro ligado, de modo que un email con comillas o con fragmentos de SQL se trate como dato y nunca como sentencia

### Requirement: Alta de usuario a partir de primitivos
`UserRepository` SHALL exponer `create(email: str, hashed_password: str) -> User`, que da de alta un usuario y devuelve la entidad resultante con los valores que genera la base ya disponibles: su identificador y su marca temporal de alta. La firma SHALL recibir valores primitivos y NO SHALL exigir que el llamador construya una entidad del ORM, de modo que la capa de servicio pueda dar de alta usuarios sin importar nada del ORM.

#### Scenario: Alta exitosa con email nuevo
- **WHEN** se da de alta un usuario con un email que no existe todavía
- **THEN** la operación tiene éxito y devuelve un usuario cuyo identificador está poblado con el valor generado por la base, no por la aplicación

#### Scenario: La marca temporal la pone la base
- **WHEN** se da de alta un usuario sin pasar ninguna fecha
- **THEN** el usuario devuelto tiene su marca temporal de alta poblada

#### Scenario: El hash se persiste tal cual se recibe
- **WHEN** se da de alta un usuario con un hash de contraseña determinado
- **THEN** el valor almacenado es exactamente ese hash, sin transformarlo, sin recortarlo y sin volver a hashearlo

#### Scenario: El alta no requiere construir una entidad del ORM
- **WHEN** se inspecciona la firma de alta
- **THEN** recibe el email y el hash como valores primitivos, y es el repositorio quien construye la entidad internamente

### Requirement: El email se normaliza a minúsculas en escritura y en lectura
El email SHALL persistirse siempre en minúsculas, y la búsqueda por email SHALL aplicar exactamente la misma normalización antes de consultar. La simetría es normativa: la unicidad de `email` en PostgreSQL distingue mayúsculas de minúsculas, de modo que normalizar solo al escribir dejaría usuarios inalcanzables al iniciar sesión y permitiría que un chequeo previo de duplicados no detecte un email ya registrado con otra capitalización. La normalización SHALL implementarse una sola vez y ser compartida por ambas operaciones.

#### Scenario: El alta guarda el email en minúsculas
- **WHEN** se da de alta un usuario con el email `USER@TEST.COM`
- **THEN** el email almacenado es `user@test.com`

#### Scenario: La búsqueda encuentra al usuario sin importar la capitalización
- **WHEN** existe el usuario `user@test.com` y se busca por `USER@TEST.COM` o por `User@Test.Com`
- **THEN** se devuelve ese usuario

#### Scenario: Un alta con otra capitalización choca con el usuario existente
- **WHEN** existe el usuario `user@test.com` y se intenta dar de alta `USER@TEST.COM`
- **THEN** la operación se rechaza como email ya existente, y no se crea un segundo usuario

#### Scenario: Una única definición de la normalización
- **WHEN** se inspecciona el módulo del repositorio
- **THEN** la transformación del email está definida en un único lugar y tanto la búsqueda como el alta la invocan, en vez de repetir la transformación en cada método

### Requirement: La unicidad de email se reporta como error de dominio
Cuando el alta viole la unicidad de `email`, `UserRepository` SHALL lanzar `EmailAlreadyExistsError` en lugar de dejar escapar el error de integridad del ORM o del driver. La excepción SHALL declararse en un módulo de errores de dominio que NO SHALL importar FastAPI, Starlette ni ninguna librería del framework web, de modo que sea utilizable desde cualquier capa. La excepción SHALL conservar el error original como causa encadenada, para que la traza no pierda el detalle de la base, y SHALL llevar consigo el email en conflicto para que el manejador HTTP pueda componer un mensaje sin volver a consultar. Esta traducción es lo que hace posible RN-WS-13 (409 Conflict ante email duplicado) sin que la capa de servicio ni la capa web conozcan el ORM.

#### Scenario: Alta con email duplicado
- **WHEN** se intenta dar de alta un usuario con un email que ya está registrado
- **THEN** se lanza `EmailAlreadyExistsError` y no se crea un segundo usuario

#### Scenario: El error del ORM no escapa del repositorio
- **WHEN** se intenta dar de alta un usuario con un email duplicado
- **THEN** la excepción que ve el llamador no es un error de integridad del ORM ni del driver, sino la excepción de dominio

#### Scenario: La causa original se preserva
- **WHEN** se inspecciona la excepción de dominio lanzada por un alta duplicada
- **THEN** su causa encadenada es el error de integridad original

#### Scenario: El email en conflicto viaja con la excepción
- **WHEN** se inspecciona la excepción de dominio lanzada por un alta duplicada
- **THEN** expone el email normalizado que produjo el conflicto

#### Scenario: El módulo de errores de dominio es independiente del framework web
- **WHEN** se inspeccionan los imports del módulo que declara `EmailAlreadyExistsError`
- **THEN** no importa FastAPI, Starlette ni ninguna otra pieza del framework web, y por lo tanto puede importarse desde el repositorio sin violar la frontera de capa

### Requirement: El repositorio no es dueño de la transacción
`UserRepository` NO SHALL confirmar ni deshacer la transacción: no SHALL invocar `commit` ni `rollback`. Para que el alta devuelva la entidad con el identificador generado por la base y para que la violación de unicidad se detecte dentro del propio método, el repositorio SHALL forzar el envío de las sentencias pendientes (`flush`) sin cerrar la transacción. La confirmación y el deshacer pertenecen a la Unit of Work que abre la sesión, que es la única que conoce el alcance completo de la operación de negocio.

#### Scenario: El alta no confirma la transacción
- **WHEN** se da de alta un usuario y luego se deshace la transacción sin confirmarla
- **THEN** el usuario no queda persistido: el repositorio no había confirmado nada por su cuenta

#### Scenario: El identificador está disponible antes de confirmar
- **WHEN** se da de alta un usuario y se inspecciona la entidad devuelta antes de confirmar la transacción
- **THEN** su identificador ya está poblado, porque el repositorio forzó el envío de la sentencia pendiente

#### Scenario: Sin commit ni rollback en el código del repositorio
- **WHEN** se inspecciona el código del repositorio
- **THEN** no aparece ninguna invocación de confirmación ni de deshacer sobre la sesión

#### Scenario: La sesión queda en manos del llamador tras el conflicto
- **WHEN** el alta falla por email duplicado
- **THEN** el repositorio lanza la excepción de dominio sin deshacer la transacción por su cuenta, dejando esa decisión a quien abrió la sesión

### Requirement: El repositorio es independiente del framework web y del hashing
`fastapi_bridge/repositories/` NO SHALL importar FastAPI ni la librería de hashing de contraseñas. El repositorio SHALL recibir el hash ya calculado y NO SHALL ver nunca una contraseña en texto plano (RN-WS-12), ni calcularla, ni verificarla. Esta independencia SHALL estar verificada por un test automático sobre los imports del paquete, no solamente documentada.

#### Scenario: Sin dependencia del framework web
- **WHEN** se inspeccionan los imports de todos los módulos de `repositories/`
- **THEN** ninguno importa FastAPI

#### Scenario: Sin dependencia del hashing de contraseñas
- **WHEN** se inspeccionan los imports de todos los módulos de `repositories/`
- **THEN** ninguno importa la librería de hashing de contraseñas: el repositorio trata el hash como un texto opaco

#### Scenario: La restricción está anclada por un test
- **WHEN** un change futuro agregue a `repositories/` un import del framework web o de la librería de hashing
- **THEN** la suite de tests falla, señalando el archivo y el paquete prohibido

#### Scenario: El repositorio se usa sin levantar la aplicación web
- **WHEN** se ejercita `UserRepository` pasándole una sesión obtenida fuera de una petición HTTP
- **THEN** funciona igual: no depende de ningún objeto de petición, de respuesta ni del sistema de inyección de dependencias del framework
