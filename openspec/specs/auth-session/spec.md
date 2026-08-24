## Purpose

Capa de servicio y Unit of Work del dominio auth: registro con hash y emisión de token, login con verificación de credenciales indistinguible en mensaje y en tiempo, y el único límite transaccional (`AuthUoW`) sobre la persistencia de usuarios.

## Requirements

### Requirement: Un único límite transaccional para las operaciones de auth
El acceso a la persistencia desde la capa de servicio de auth SHALL pasar por una Unit of Work, `AuthUoW`, declarada en `fastapi_bridge/uow/auth_unit_of_work.py`, que es un context manager asíncrono. Al entrar SHALL abrir una sesión asíncrona obtenida de la factory de sesiones del proyecto y SHALL exponer el repositorio de usuarios ya construido sobre ella. Al salir SHALL confirmar la transacción si el bloque terminó sin excepción, SHALL deshacerla si hubo cualquier excepción, y SHALL cerrar la sesión en ambos casos. El constructor SHALL recibir la factory de sesiones y NO SHALL recibir una sesión ya abierta ni construir un engine propio.

#### Scenario: Confirmación en el camino feliz
- **WHEN** se da de alta un usuario dentro del bloque de la Unit of Work y el bloque termina sin excepción
- **THEN** el usuario queda persistido y es recuperable desde una sesión nueva

#### Scenario: Deshacer ante excepción
- **WHEN** se da de alta un usuario dentro del bloque y luego se lanza una excepción antes de salir
- **THEN** la excepción se propaga al llamador y el usuario no queda persistido

#### Scenario: Deshacer también ante una excepción de dominio
- **WHEN** dentro del bloque se intenta dar de alta un email ya registrado y el repositorio lanza la excepción de email duplicado
- **THEN** la transacción se deshace, la excepción se propaga y la sesión no queda con sentencias pendientes

#### Scenario: La sesión se cierra siempre
- **WHEN** el bloque termina, con o sin excepción
- **THEN** la sesión queda cerrada, sin depender de que el llamador la cierre

#### Scenario: La Unit of Work es reutilizable entre operaciones
- **WHEN** se usa la misma instancia de la Unit of Work en dos bloques consecutivos
- **THEN** cada bloque abre y cierra su propia sesión, y el resultado del segundo no depende del estado del primero

#### Scenario: Acceder al repositorio fuera del bloque es un error explícito
- **WHEN** se intenta acceder al repositorio de usuarios sin haber entrado al bloque
- **THEN** se lanza un error explícito que dice que la Unit of Work no está activa, en lugar de devolver un valor nulo que fallaría de forma opaca más adelante

### Requirement: La capa de servicio de auth no conoce la persistencia
`AuthService`, declarado en `fastapi_bridge/services/auth_service.py`, SHALL recibir la Unit of Work por constructor y SHALL acceder a los usuarios exclusivamente a través de ella. NO SHALL importar SQLAlchemy, NO SHALL construir sesiones ni engines, NO SHALL confirmar ni deshacer transacciones por su cuenta, y NO SHALL importar nada de FastAPI. Todas sus operaciones de negocio SHALL ser asíncronas y SHALL declarar type hints completos.

#### Scenario: La Unit of Work llega por el constructor
- **WHEN** se construye el servicio de auth pasándole una Unit of Work
- **THEN** el servicio queda utilizable, y su construcción no crea sesiones, engines ni lee la configuración de base de datos

#### Scenario: Sin dependencia del ORM
- **WHEN** se inspeccionan los imports de todos los módulos de `services/`
- **THEN** ninguno importa SQLAlchemy, y por lo tanto el servicio nunca instancia una sesión por su cuenta

#### Scenario: Sin dependencia del framework web
- **WHEN** se inspeccionan los imports de `services/auth_service.py`
- **THEN** no importa FastAPI: el servicio se puede ejercitar sin levantar la aplicación web

#### Scenario: La transacción no se maneja en el servicio
- **WHEN** se inspecciona el código del servicio de auth
- **THEN** no aparece ninguna invocación de confirmación ni de deshacer: ese límite pertenece a la Unit of Work

### Requirement: El registro deja al usuario autenticado
El servicio SHALL exponer una operación asíncrona de registro que recibe el contrato de registro de usuario y devuelve el contrato de respuesta de token. La operación SHALL derivar el hash de la contraseña, SHALL dar de alta el usuario con ese hash a través de la Unit of Work, y SHALL emitir un token para la identidad recién creada. La contraseña en texto plano NO SHALL persistirse, registrarse ni aparecer en la respuesta (RN-WS-12): la respuesta es un token, nunca un eco del usuario creado.

#### Scenario: Registro exitoso
- **WHEN** se registra un email que no existía con una contraseña válida
- **THEN** se devuelve una respuesta de token con un token decodificable cuyo sujeto es ese email, y el usuario queda persistido

#### Scenario: Lo persistido es el hash, no la contraseña
- **WHEN** se registra un usuario y se lee la fila persistida
- **THEN** el valor almacenado es un hash bcrypt, distinto de la contraseña en texto plano, y verifica correctamente contra ella

#### Scenario: La respuesta no contiene la contraseña ni el hash
- **WHEN** se inspecciona la respuesta de un registro exitoso
- **THEN** contiene únicamente el token, su tipo y su duración: ni la contraseña ni el hash aparecen en ninguna forma

#### Scenario: El sujeto del token es el email normalizado
- **WHEN** se registra el email `USER@TEST.COM`
- **THEN** el sujeto del token emitido es `user@test.com`, el mismo valor con el que quedó persistido el usuario, de modo que una búsqueda posterior por ese sujeto encuentre la fila

#### Scenario: La duración informada corresponde a la configuración
- **WHEN** se inspecciona la duración informada en la respuesta de un registro
- **THEN** está expresada en segundos y corresponde a la expiración configurada del token

### Requirement: El email duplicado se reporta como error de dominio, sin pre-consulta
Cuando el email ya esté registrado, la operación de registro SHALL propagar la excepción de dominio de email ya existente que produce el repositorio, y NO SHALL crear un segundo usuario. El servicio NO SHALL anteponer una consulta de existencia como forma de garantizar la unicidad: la garantía de RN-WS-13 la da la restricción del motor, que es lo único capaz de rechazar dos altas concurrentes del mismo email; una consulta previa solo evitaría un viaje de ida y vuelta e invitaría a eliminar la captura que sí garantiza la regla.

#### Scenario: Alta con email ya registrado
- **WHEN** se registra un email que ya existe
- **THEN** se lanza la excepción de dominio de email ya existente y no queda un segundo usuario en la tabla

#### Scenario: Alta con otra capitalización del mismo email
- **WHEN** existe `user@test.com` y se registra `USER@TEST.COM`
- **THEN** se lanza la excepción de dominio de email ya existente

#### Scenario: El error del ORM no escapa del servicio
- **WHEN** un registro falla por email duplicado
- **THEN** lo que ve el llamador es la excepción de dominio, no un error de integridad del ORM ni del driver

#### Scenario: Sin consulta previa de existencia
- **WHEN** se inspecciona la implementación de la operación de registro
- **THEN** no consulta la existencia del email antes de dar de alta: va directo al alta y traduce el conflicto

### Requirement: El inicio de sesión verifica credenciales y emite token
El servicio SHALL exponer una operación asíncrona de inicio de sesión que recibe el contrato de inicio de sesión y devuelve el contrato de respuesta de token. La operación SHALL buscar el usuario por su email, SHALL verificar la contraseña recibida contra el hash almacenado, y SHALL emitir un token solo si la verificación tiene éxito. La contraseña en texto plano NO SHALL compararse contra ningún valor almacenado ni registrarse en ninguna parte.

#### Scenario: Inicio de sesión exitoso
- **WHEN** un usuario registrado inicia sesión con su contraseña correcta
- **THEN** se devuelve una respuesta de token cuyo token decodifica al email de ese usuario

#### Scenario: El email se acepta con cualquier capitalización
- **WHEN** un usuario registrado como `user@test.com` inicia sesión escribiendo `USER@TEST.COM` con su contraseña correcta
- **THEN** el inicio de sesión tiene éxito

#### Scenario: La contraseña sí distingue capitalización
- **WHEN** un usuario registrado inicia sesión con su contraseña escrita con otra capitalización
- **THEN** el inicio de sesión falla: el email se normaliza, la contraseña no

#### Scenario: El inicio de sesión no escribe en la base
- **WHEN** un usuario inicia sesión con éxito
- **THEN** la fila del usuario queda igual que antes: el inicio de sesión no actualiza el hash, ni marcas temporales, ni ningún otro campo

### Requirement: Las credenciales inválidas son indistinguibles en el mensaje
Cuando el email no corresponda a ningún usuario **o** la contraseña no coincida, la operación de inicio de sesión SHALL lanzar la misma excepción de dominio de credenciales inválidas, con el mismo mensaje, sin ningún dato que permita distinguir cuál de las dos condiciones se dio (RN-WS-12 §Excepciones globales, HU-03-02). La excepción SHALL declararse en el módulo de errores de dominio del proyecto, como subclase de la base común de errores de dominio, y NO SHALL llevar consigo el email consultado: ese es exactamente el dato que un atacante busca confirmar.

#### Scenario: Email inexistente
- **WHEN** se intenta iniciar sesión con un email que no está registrado
- **THEN** se lanza la excepción de credenciales inválidas

#### Scenario: Contraseña incorrecta
- **WHEN** un usuario registrado intenta iniciar sesión con una contraseña equivocada
- **THEN** se lanza la excepción de credenciales inválidas

#### Scenario: Los dos fallos son indistinguibles
- **WHEN** se comparan la excepción por email inexistente y la excepción por contraseña incorrecta
- **THEN** son del mismo tipo y su mensaje es idéntico: nada en ellas permite saber si el email estaba registrado

#### Scenario: La excepción no lleva el email
- **WHEN** se inspecciona la excepción de credenciales inválidas
- **THEN** no expone el email consultado como atributo ni lo incluye en su mensaje, de modo que el manejador HTTP no pueda filtrarlo por descuido

#### Scenario: La excepción es capturable como error de dominio
- **WHEN** se captura la excepción de credenciales inválidas por la base común de errores de dominio
- **THEN** queda atrapada, de modo que un único manejador global pueda cubrir todos los errores de dominio del proyecto

### Requirement: Las credenciales inválidas son indistinguibles también en el tiempo
Cuando el email no corresponda a ningún usuario, la operación de inicio de sesión SHALL ejecutar igualmente una verificación de contraseña contra un hash señuelo constante, descartando su resultado, antes de lanzar la excepción de credenciales inválidas. Sin esa verificación, el camino "email inexistente" retorna en microsegundos y el camino "contraseña incorrecta" tarda el coste completo de bcrypt: la diferencia de latencia permite enumerar qué emails están registrados con la misma eficacia que si el mensaje lo dijera, y la garantía de indistinguibilidad quedaría cumplida solo en apariencia.

#### Scenario: El camino sin usuario también paga el coste del hashing
- **WHEN** se intenta iniciar sesión con un email inexistente
- **THEN** se ejecuta una verificación de contraseña contra un hash señuelo, cuyo resultado se descarta, antes de lanzar la excepción

#### Scenario: Los dos caminos del rechazo son comparables en tiempo
- **WHEN** se comparan el tiempo del rechazo por email inexistente y el del rechazo por contraseña incorrecta
- **THEN** son del mismo orden de magnitud: ninguno retorna sin haber pagado el coste de una verificación

#### Scenario: El señuelo es un hash constante, no uno calculado en cada intento
- **WHEN** se inspecciona la implementación del inicio de sesión
- **THEN** el hash señuelo es una constante del módulo derivada una sola vez, y no se vuelve a derivar en cada intento fallido

#### Scenario: La verificación señuelo está anclada por un test
- **WHEN** un change futuro elimine la verificación cuyo resultado se descarta, por parecer código muerto
- **THEN** la suite de tests falla, dejando explícito que esa llamada existe para cerrar un canal temporal

### Requirement: Las operaciones de auth no registran material sensible
Ninguna operación del servicio de auth SHALL escribir en logs la contraseña en texto plano, el hash almacenado, el token emitido ni la clave de firma. El email SHALL poder registrarse únicamente en el contexto de un registro exitoso; NO SHALL registrarse en el contexto de un inicio de sesión fallido, porque eso convertiría el log en la lista de emails probados.

#### Scenario: Sin registro de contraseñas ni hashes
- **WHEN** se inspecciona el código del servicio de auth
- **THEN** ninguna sentencia de registro incluye la contraseña ni el hash

#### Scenario: Sin registro de tokens
- **WHEN** se inspecciona el código del servicio de auth
- **THEN** ninguna sentencia de registro incluye el token emitido

#### Scenario: Sin registro del email en un rechazo
- **WHEN** se inspecciona el camino de rechazo por credenciales inválidas
- **THEN** no registra el email que se intentó
