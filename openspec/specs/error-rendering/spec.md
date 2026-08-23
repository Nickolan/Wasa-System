# error-rendering Specification

## Purpose
TBD - created by archiving change rfc7807-exception-handlers. Update Purpose after archive.
## Requirements
### Requirement: Ninguna respuesta de error escapa al formato RFC 7807

Toda respuesta de error del FastAPI Bridge SHALL emitirse en formato RFC 7807 Problem Details, con los miembros `type`, `title`, `status`, `detail` e `instance`, y con `Content-Type: application/problem+json`. Esto SHALL alcanzar también a los errores que genera el propio framework web sin intervención del código de la aplicación —notablemente `404 Not Found` ante una ruta inexistente y `405 Method Not Allowed` ante un método no permitido—, que hoy salen en el formato por defecto del framework. Ningún dominio SHALL definir su propio formato de error: Auth y Scan comparten este. (RN-WS-09, §Dominio: Excepciones globales)

#### Scenario: Ruta inexistente

- **WHEN** se solicita un path que no corresponde a ninguna ruta registrada
- **THEN** la respuesta es `404` con cuerpo RFC 7807 y `Content-Type: application/problem+json`, y NO el cuerpo por defecto del framework

#### Scenario: Método no permitido

- **WHEN** se solicita una ruta existente con un método HTTP que esa ruta no acepta
- **THEN** la respuesta es `405` con cuerpo RFC 7807 y `Content-Type: application/problem+json`

#### Scenario: El registro cubre la jerarquía completa de excepciones HTTP del framework

- **WHEN** se inspecciona sobre qué clase de excepción está registrado el manejador de errores HTTP
- **THEN** es la clase base de excepción HTTP del framework ASGI subyacente, no la subclase que expone la capa de aplicación, de modo que los errores generados por el enrutador —que usan la clase base— también quedan cubiertos

#### Scenario: Los cinco miembros están siempre presentes

- **WHEN** se inspecciona el cuerpo de cualquier respuesta de error del servicio
- **THEN** sus claves son exactamente `type`, `title`, `status`, `detail` e `instance`, sin miembros de extensión adicionales

#### Scenario: El estado del cuerpo coincide con el estado HTTP

- **WHEN** se compara el miembro `status` del cuerpo con el código de estado de la respuesta
- **THEN** son iguales, para cualquier error que el servicio produzca

### Requirement: El miembro `instance` identifica el endpoint que falló

El miembro `instance` de toda respuesta de error SHALL contener el path de la solicitud que produjo el error, sin el origen ni la cadena de consulta. Un error sin `instance` obliga a correlacionar por timestamp; un `instance` que incluya la cadena de consulta puede arrastrar datos de la solicitud al cuerpo del error.

#### Scenario: Path de la solicitud fallida

- **WHEN** una solicitud a un endpoint cualquiera produce un error
- **THEN** el miembro `instance` del cuerpo es el path de esa solicitud

#### Scenario: Endpoints distintos producen instancias distintas

- **WHEN** dos solicitudes a paths diferentes producen el mismo tipo de error
- **THEN** cada cuerpo lleva su propio path en `instance`, y no un valor fijo compartido

#### Scenario: La cadena de consulta no llega al cuerpo del error

- **WHEN** una solicitud con cadena de consulta produce un error
- **THEN** el miembro `instance` contiene solo el path, sin la cadena de consulta

### Requirement: Un cuerpo que viola el schema produce 422 y un cuerpo no parseable produce 400

Cuando la validación de la solicitud falla, el servicio SHALL distinguir dos situaciones. Si el cuerpo recibido no es JSON parseable, la respuesta SHALL ser `400 Bad Request`: la solicitud está mal formada y el servicio no pudo entenderla. Si el cuerpo es JSON válido pero viola el schema declarado —tipo incorrecto, campo faltante, longitud fuera de rango, formato de email inválido—, la respuesta SHALL ser `422 Unprocessable Entity`: el servicio entendió la solicitud y no puede procesar su contenido. Ambas SHALL emitirse en formato RFC 7807.

#### Scenario: Campo obligatorio faltante

- **WHEN** llega una solicitud cuyo cuerpo JSON es válido pero omite un campo obligatorio del schema
- **THEN** la respuesta es `422` con cuerpo RFC 7807

#### Scenario: Restricción de longitud violada

- **WHEN** llega una solicitud cuyo cuerpo JSON es válido pero un campo incumple su longitud mínima declarada
- **THEN** la respuesta es `422` con cuerpo RFC 7807

#### Scenario: Cuerpo que no es JSON

- **WHEN** llega una solicitud cuyo cuerpo no puede parsearse como JSON
- **THEN** la respuesta es `400` con cuerpo RFC 7807, distinguiéndose del caso anterior

#### Scenario: El estado de validación no es fijo

- **WHEN** se comparan la respuesta a un cuerpo no parseable y la respuesta a un cuerpo que viola el schema
- **THEN** sus códigos de estado son distintos: el servicio decide el estado según la naturaleza del fallo y no emite un valor único para toda falla de validación

#### Scenario: El detalle nombra los campos que fallaron

- **WHEN** se inspecciona el `detail` de una respuesta de validación de schema
- **THEN** menciona el nombre del campo que falló y la razón del fallo, en un texto legible

#### Scenario: Varios campos inválidos en la misma solicitud

- **WHEN** una solicitud viola el schema en más de un campo a la vez
- **THEN** el `detail` describe todos los campos que fallaron, no solo el primero

#### Scenario: Un fallo sin campo identificable se describe igual

- **WHEN** el fallo de validación no corresponde a un campo nombrado —como ocurre con un cuerpo no parseable, cuya ubicación es un desplazamiento y no un nombre—
- **THEN** el `detail` describe el problema sin inventar un nombre de campo, y la respuesta se emite igualmente en formato RFC 7807

### Requirement: El valor que el usuario envió nunca aparece en el error de validación

El cuerpo de una respuesta de error de validación NO SHALL contener el valor de entrada que provocó el fallo, ni el contexto interno de la restricción violada. El motor de validación expone ambos junto al mensaje de error, y en el endpoint de registro el valor de entrada de un campo que falla su longitud mínima es **la contraseña en texto plano** que el usuario tipeó. Publicarla en el cuerpo del error la expone en el navegador del usuario, en los registros de cualquier intermediario que capture cuerpos de error y en cualquier sistema de monitoreo de aplicaciones. El manejador SHALL componer el detalle usando exclusivamente una lista explícita de campos permitidos —la ubicación del error y su mensaje— de modo que cualquier campo que el motor de validación agregue en el futuro quede excluido por omisión. (RN-WS-12)

#### Scenario: La contraseña rechazada no aparece en el cuerpo

- **WHEN** una solicitud de registro es rechazada porque la contraseña no alcanza la longitud mínima
- **THEN** el valor de esa contraseña no aparece en ninguna parte del cuerpo de la respuesta

#### Scenario: El valor de entrada no aparece para ningún campo

- **WHEN** cualquier campo de una solicitud es rechazado por validación
- **THEN** el cuerpo de la respuesta no contiene el valor que se envió para ese campo

#### Scenario: El contexto interno de la restricción no se expone

- **WHEN** se inspecciona el cuerpo de una respuesta de validación
- **THEN** no contiene el contexto interno de la restricción violada (patrones, límites configurados, metadatos del motor de validación)

#### Scenario: La composición del detalle es por lista de permitidos

- **WHEN** se inspecciona cómo el manejador construye el detalle a partir de los errores del motor de validación
- **THEN** enumera explícitamente los campos que usa, en lugar de tomar el error completo y quitarle los campos indeseados

### Requirement: Los errores de dominio se traducen a su estado HTTP en la capa web

El servicio SHALL registrar un único manejador sobre la clase base de los errores de dominio, y traducir cada error concreto a su código de estado HTTP mediante una tabla de correspondencia declarada en la capa web. Un error de "email ya registrado" SHALL producir `409 Conflict`; un error de "credenciales inválidas" SHALL producir `401 Unauthorized`. La tabla NO SHALL vivir como atributo de las clases de excepción: el módulo de errores de dominio no conoce HTTP y no SHALL empezar a conocerlo. Un error de dominio que no figure en la tabla SHALL producir `500`, porque un error de negocio que la capa web no sabe traducir es un defecto del servidor y no un error del cliente. (RN-WS-13, §Dominio: Excepciones globales)

#### Scenario: Email ya registrado

- **WHEN** una operación de negocio falla porque el email ya está registrado
- **THEN** la respuesta es `409` con cuerpo RFC 7807

#### Scenario: Credenciales inválidas

- **WHEN** una operación de negocio falla porque las credenciales son inválidas
- **THEN** la respuesta es `401` con cuerpo RFC 7807

#### Scenario: Un solo manejador cubre toda la jerarquía

- **WHEN** se inspecciona sobre qué clase se registró el manejador de errores de dominio
- **THEN** es la clase base común, y no hay un manejador registrado por cada subclase concreta

#### Scenario: El módulo de dominio no conoce HTTP

- **WHEN** se inspecciona el módulo que declara los errores de dominio
- **THEN** ninguna de sus clases declara un código de estado HTTP, un título de problema ni una URI de tipo, y el módulo no importa nada de la capa web

#### Scenario: Toda subclase concreta de error de dominio está mapeada

- **WHEN** se enumeran todas las subclases concretas del error de dominio base presentes en el código
- **THEN** cada una tiene una entrada en la tabla de correspondencia, de modo que agregar un error de dominio sin mapearlo sea un fallo detectable en la suite de pruebas

#### Scenario: Un error de dominio sin mapear no inventa un estado del cliente

- **WHEN** se lanza un error de dominio que no figura en la tabla de correspondencia
- **THEN** la respuesta es `500` con el detalle genérico, y no un `400` que atribuya al cliente un defecto del servidor

### Requirement: El detalle del conflicto por email usa el email ya normalizado, sin reconsultar

Cuando un error de "email ya registrado" se traduce a `409`, el manejador SHALL componer el `detail` a partir del email que la propia excepción transporta —el valor ya normalizado que colisionó en el motor de persistencia— y NO SHALL consultar la base de datos ni parsear el mensaje de la excepción para obtenerlo.

#### Scenario: El detalle refleja el email en conflicto

- **WHEN** un alta falla por email duplicado
- **THEN** el `detail` de la respuesta `409` identifica el email que ya estaba registrado

#### Scenario: El manejador no accede a la persistencia

- **WHEN** se inspecciona el manejador de errores de dominio
- **THEN** no realiza ninguna consulta a la base de datos: el dato que necesita viaja en la excepción

### Requirement: El 401 de credenciales inválidas no permite enumerar usuarios

El cuerpo de la respuesta `401` por credenciales inválidas SHALL ser un mensaje fijo, idéntico para el caso de email inexistente y para el de contraseña incorrecta, y NO SHALL contener el email consultado ni ningún dato derivado de él. El mensaje no SHALL revelar cuál de las dos condiciones falló. (§Dominio: Excepciones globales, HU-03-02)

#### Scenario: El email consultado no aparece en el cuerpo

- **WHEN** un intento de inicio de sesión falla por credenciales inválidas
- **THEN** el email que se intentó autenticar no aparece en ninguna parte del cuerpo de la respuesta

#### Scenario: Email inexistente y contraseña incorrecta son indistinguibles

- **WHEN** se comparan la respuesta a un intento con un email no registrado y la respuesta a un intento con email registrado y contraseña incorrecta
- **THEN** ambas tienen el mismo estado, el mismo `title`, el mismo `type` y el mismo `detail`

#### Scenario: El detalle es un literal, no una composición

- **WHEN** se inspecciona cómo el manejador construye el detalle del `401` de credenciales
- **THEN** usa un texto fijo, sin interpolar ningún dato proveniente de la solicitud o de la excepción

### Requirement: La respuesta ante una excepción no prevista es 500 y no revela nada del servidor

Toda excepción que ningún manejador específico atienda SHALL producir una respuesta `500` en formato RFC 7807 con un `detail` genérico fijo. El cuerpo NO SHALL contener el mensaje de la excepción original, el nombre de su clase, un stack trace, rutas de archivos del servidor, nombres de módulos internos, sentencias SQL ni datos de conexión. El mensaje de una excepción de la capa de persistencia transporta habitualmente la sentencia ejecutada y el nombre de la restricción violada, y el solo nombre de la clase revela qué motor de base de datos hay detrás. El manejador SHALL construir su respuesta exclusivamente a partir de constantes y del path de la solicitud, sin inspeccionar la excepción ni ramificar por su tipo, porque es el último recurso de la cadena: si él mismo falla, no queda nadie a quien delegar.

#### Scenario: Excepción no prevista

- **WHEN** el procesamiento de una solicitud lanza una excepción que ningún manejador específico atiende
- **THEN** la respuesta es `500` con cuerpo RFC 7807

#### Scenario: El mensaje original no se filtra

- **WHEN** la excepción no prevista lleva un mensaje con información interna reconocible
- **THEN** ese mensaje no aparece en ninguna parte del cuerpo de la respuesta

#### Scenario: El tipo de excepción no se filtra

- **WHEN** se inspecciona el cuerpo de una respuesta `500`
- **THEN** no contiene el nombre de la clase de la excepción que la originó

#### Scenario: Sin rastros del servidor en el cuerpo

- **WHEN** se inspecciona el cuerpo de una respuesta `500`
- **THEN** no contiene stack traces, rutas de archivos, nombres de módulos internos ni fragmentos de SQL

#### Scenario: El detalle es idéntico para causas distintas

- **WHEN** dos excepciones no previstas de tipos y mensajes distintos producen sendas respuestas `500`
- **THEN** ambos cuerpos son idénticos salvo por el miembro `instance`

#### Scenario: El manejador de último recurso no ejecuta lógica que pueda fallar

- **WHEN** se inspecciona el manejador de excepciones no previstas
- **THEN** solo lee el path de la solicitud, registra el error y compone la respuesta con constantes: no consulta la base de datos, no lee configuración y no ramifica según la excepción recibida

### Requirement: La causa del 500 se registra íntegra del lado servidor

Al atender una excepción no prevista, el manejador SHALL registrar el error con su stack trace completo en el sistema de registro del proceso, antes de emitir la respuesta. Un `500` opaco hacia el cliente y también hacia el operador convierte cada fallo en una investigación a ciegas. El registro SHALL usar el sistema de logging estándar del lenguaje y NO SHALL imponer una configuración global de formato ni de destinos, para no pisar la configuración del entorno de ejecución.

#### Scenario: El stack trace llega al registro

- **WHEN** una excepción no prevista es atendida por el manejador
- **THEN** el sistema de registro recibe un evento de nivel error que incluye la información de la excepción original

#### Scenario: El registro ocurre aunque el cuerpo sea genérico

- **WHEN** se compara lo que se registra con lo que se responde
- **THEN** el registro contiene la causa concreta y el cuerpo de la respuesta no la contiene

#### Scenario: El registro no incluye material sensible del servicio

- **WHEN** se inspecciona qué datos entrega el manejador al registro
- **THEN** entrega la excepción y el path de la solicitud, y no el secreto de firma, contraseñas ni tokens

### Requirement: Los headers de una excepción HTTP sobreviven a la traducción

Cuando una excepción HTTP declara headers de respuesta, el manejador SHALL trasladarlos a la respuesta RFC 7807 que emite. Un `401` que declara un desafío de autenticación pierde su significado si el header que lo transporta se descarta en la traducción. El traslado NO SHALL permitir que un header de la excepción sobrescriba el `Content-Type` de problem details.

#### Scenario: Header de desafío de autenticación preservado

- **WHEN** se lanza una excepción HTTP `401` que declara un header de desafío de autenticación
- **THEN** la respuesta emitida es `401` en formato RFC 7807 y conserva ese header

#### Scenario: Excepción HTTP sin headers

- **WHEN** se lanza una excepción HTTP que no declara headers
- **THEN** la respuesta se emite normalmente en formato RFC 7807, sin error

#### Scenario: El tipo de contenido de problem details no se sobrescribe

- **WHEN** una excepción HTTP declara un header de tipo de contenido propio
- **THEN** la respuesta conserva `application/problem+json`

#### Scenario: El estado y el detalle de la excepción se conservan

- **WHEN** se lanza una excepción HTTP con un código de estado y un detalle propios
- **THEN** la respuesta emitida usa ese mismo código y ese mismo detalle, envueltos en el formato RFC 7807

### Requirement: Cada clase de error tiene una URI de tipo estable y un título propio

Cada clase de error del servicio SHALL identificarse con una URI de tipo de problema estable y un `title` legible, declarados como constantes en el módulo de manejadores junto a los que ya existen, y NO SHALL construirlos en línea dentro del cuerpo de cada manejador. Una excepción HTTP genérica —que no representa un tipo de problema propio del dominio más allá de su código de estado— SHALL usar el tipo por defecto que RFC 7807 prescribe para ese caso, y derivar su `title` de la frase de estado HTTP correspondiente.

#### Scenario: Tipos distintos para clases de error distintas

- **WHEN** se comparan los miembros `type` de una respuesta de validación, una de conflicto por email, una de credenciales inválidas y una de error interno
- **THEN** los cuatro son distintos entre sí, de modo que un cliente puede ramificar por tipo y no solo por código de estado

#### Scenario: Excepción HTTP genérica usa el tipo por defecto

- **WHEN** se inspecciona el miembro `type` de la respuesta a un `404` de ruta inexistente
- **THEN** es el valor por defecto que RFC 7807 prescribe cuando el error no tiene un tipo de problema propio

#### Scenario: Título derivado de la frase de estado

- **WHEN** se inspecciona el miembro `title` de la respuesta a una excepción HTTP genérica
- **THEN** corresponde a la frase de estado HTTP de su código

#### Scenario: Los tipos y títulos se declaran en un único lugar

- **WHEN** se busca dónde están definidas las URIs de tipo y los títulos de los errores
- **THEN** son constantes del módulo de manejadores, no literales dispersos dentro de las funciones

### Requirement: La política de límite de tasa conserva su manejador propio

El manejador de límite de tasa existente SHALL seguir atendiendo el rechazo por cupo excedido, con precedencia sobre el manejador de excepciones no previstas. Agregar un manejador sobre la clase de excepción más general NO SHALL desviar el rechazo por límite hacia el `500` genérico, lo que le haría perder tanto su código `429` como su header `Retry-After`. (RN-WS-06, RN-WS-09)

#### Scenario: El rechazo por límite sigue siendo 429

- **WHEN** una solicitud es rechazada por exceder el límite de tasa, con los manejadores globales registrados
- **THEN** la respuesta sigue siendo `429` con su cuerpo RFC 7807 y su header `Retry-After`, y no un `500`

#### Scenario: Precedencia sobre el manejador general

- **WHEN** se inspecciona la resolución de manejadores para la excepción de límite excedido
- **THEN** la atiende su manejador específico, no el registrado sobre la clase de excepción más general

### Requirement: Los manejadores se registran al construir la aplicación

Todos los manejadores globales SHALL registrarse dentro de la función que construye la aplicación, junto al manejador de límite de tasa que ya se registra allí, y NO SHALL registrarse a nivel de módulo. La construcción de la aplicación es el único punto donde la configuración inyectada puede alcanzar a la política de borde, y dispersar el registro rompería esa propiedad.

#### Scenario: Las clases atendidas están registradas en la aplicación

- **WHEN** se inspeccionan los manejadores de excepción de una aplicación recién construida
- **THEN** están registradas las clases correspondientes a error de validación, excepción HTTP del framework, error de dominio, límite de tasa excedido y excepción no prevista

#### Scenario: El registro no depende del estado del módulo

- **WHEN** se construyen dos aplicaciones independientes
- **THEN** ambas quedan con el conjunto completo de manejadores registrados

#### Scenario: La superficie de rutas no cambia

- **WHEN** se construye la aplicación con los manejadores registrados
- **THEN** la única ruta expuesta sigue siendo la de salud, con su contrato intacto: registrar manejadores no monta rutas de dominio

### Requirement: La respuesta de error interno no lleva headers de origen cruzado

La respuesta `500` que emite el manejador de excepciones no previstas NO llevará headers de autorización de origen cruzado, porque el componente que la genera envuelve por fuera de la cadena de middlewares y se ejecuta cuando la política de origen cruzado ya no está en el camino. Esta limitación SHALL quedar documentada en el código y fijada por una prueba, de modo que sea una restricción conocida del sistema y no un hallazgo posterior. Las respuestas de error `400`, `401`, `404`, `405`, `409`, `422` y `429` SÍ SHALL llevar esos headers, por generarse dentro de la cadena.

#### Scenario: Los errores atendidos por manejador específico llevan headers de origen cruzado

- **WHEN** una solicitud desde un origen permitido produce un error de validación, de dominio o de excepción HTTP
- **THEN** la respuesta incluye el header de autorización de origen cruzado correspondiente a ese origen

#### Scenario: El error interno no los lleva

- **WHEN** una solicitud desde un origen permitido produce una excepción no prevista
- **THEN** la respuesta `500` no incluye header de autorización de origen cruzado, y el comportamiento está documentado en el módulo de manejadores

#### Scenario: La pérdida de información hacia el cliente es nula

- **WHEN** se considera qué información deja de estar disponible para un navegador ante un `500`
- **THEN** es únicamente el detalle genérico fijo, que no contiene ningún dato accionable sobre la solicitud

### Requirement: Los manejadores se ejercitan sobre rutas que fallan, no solo invocándolos directamente

La cobertura de pruebas de los manejadores SHALL incluir el despacho real: solicitudes HTTP contra rutas que producen cada clase de error, de modo que se verifique que el framework selecciona el manejador correcto para cada tipo de excepción, y no solo que cada manejador produce el cuerpo esperado cuando se lo invoca a mano. Mientras la aplicación de producción no exponga rutas de dominio, esas rutas SHALL provenir de una aplicación de prueba con los mismos manejadores registrados.

#### Scenario: Despacho verificado por clase de error

- **WHEN** se ejercita una ruta que lanza un error de validación, otra que lanza un error de dominio, otra que lanza una excepción HTTP y otra que lanza una excepción no prevista
- **THEN** cada una produce la respuesta RFC 7807 correspondiente a su clase, confirmando que el despacho selecciona el manejador correcto

#### Scenario: La aplicación de producción conserva su superficie durante las pruebas

- **WHEN** se ejercitan los manejadores mediante una aplicación de prueba
- **THEN** la aplicación de producción no gana ninguna ruta: las rutas que fallan existen solo en el ámbito de la prueba

