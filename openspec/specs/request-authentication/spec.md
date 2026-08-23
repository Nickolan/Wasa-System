# request-authentication Specification

## Purpose
TBD - created by archiving change jwt-dependency. Update Purpose after archive.
## Requirements
### Requirement: La identidad del solicitante se resuelve desde el token Bearer de la solicitud
El servicio SHALL exponer en `fastapi_bridge/core/dependencies.py` una dependencia de FastAPI que resuelve la identidad del usuario autenticado a partir del token que la solicitud trae en el header `Authorization` con el esquema `Bearer`. La dependencia SHALL delegar la validación del token en la operación de decodificación del módulo de seguridad del proyecto, y ante un token válido SHALL devolver el email del sujeto del token como texto plano. NO SHALL devolver el payload decodificado completo ni una entidad de persistencia: su tipo de retorno SHALL ser el email, de modo que ningún consumidor tenga que volver a considerar el caso de identidad ausente que la dependencia ya cerró (RN-WS-11, HU-03-03).

#### Scenario: Token válido resuelve el email
- **WHEN** una solicitud llega con un token vigente emitido por el servicio, cuyo sujeto es un email determinado
- **THEN** la dependencia devuelve ese mismo email

#### Scenario: El email devuelto es exactamente el sujeto del token
- **WHEN** se comparan el email devuelto por la dependencia y el sujeto que lleva el token presentado
- **THEN** son el mismo valor, sin transformación intermedia

#### Scenario: El email devuelto es el normalizado que persiste el sistema
- **WHEN** un usuario registrado como `user@test.com` inicia sesión escribiendo `USER@TEST.COM` y presenta el token recibido
- **THEN** la dependencia devuelve `user@test.com`, el valor con el que quedó persistido el usuario, de modo que una búsqueda posterior por él encuentre la fila

#### Scenario: El valor devuelto es texto, no el payload decodificado
- **WHEN** se inspecciona lo que la dependencia devuelve ante un token válido
- **THEN** es el email como texto plano, no el contrato de payload de JWT ni un objeto de usuario

### Requirement: Toda solicitud sin un token válido se rechaza con 401 en formato RFC 7807
Cuando la solicitud no traiga token, lo traiga bajo un esquema de autorización distinto de `Bearer`, o traiga un token que la operación de decodificación no acepte —malformado, firmado con otra clave, vencido, o sin sujeto—, la dependencia SHALL provocar una respuesta `401 Unauthorized` cuyo cuerpo SHALL estar en formato RFC 7807, con el media type de problem details y con el miembro `instance` apuntando al endpoint solicitado. La operación protegida NO SHALL ejecutarse en ninguno de esos casos.

#### Scenario: Solicitud sin header de autorización
- **WHEN** se solicita un endpoint protegido sin header `Authorization`
- **THEN** la respuesta es `401`, su media type es el de problem details y su cuerpo trae `type`, `title`, `status`, `detail` e `instance`

#### Scenario: Solicitud con un esquema de autorización distinto de Bearer
- **WHEN** se solicita un endpoint protegido con un header `Authorization` que declara un esquema distinto de `Bearer`
- **THEN** la respuesta es `401` en formato RFC 7807, igual que si no hubiera llegado ningún header

#### Scenario: Token malformado
- **WHEN** se solicita un endpoint protegido presentando como token un texto que no tiene forma de JWT
- **THEN** la respuesta es `401` en formato RFC 7807

#### Scenario: Token firmado con otra clave
- **WHEN** se solicita un endpoint protegido presentando un token bien formado y vigente pero firmado con una clave distinta de la del servicio
- **THEN** la respuesta es `401` en formato RFC 7807

#### Scenario: Token vencido
- **WHEN** se solicita un endpoint protegido presentando un token emitido con la clave correcta cuya marca de vencimiento ya pasó
- **THEN** la respuesta es `401` en formato RFC 7807

#### Scenario: Token sin sujeto
- **WHEN** se solicita un endpoint protegido presentando un token válidamente firmado y vigente que no incluye el claim de sujeto
- **THEN** la respuesta es `401` en formato RFC 7807

#### Scenario: El campo instance identifica el endpoint solicitado
- **WHEN** se inspecciona el cuerpo de cualquiera de estos `401`
- **THEN** su miembro `instance` es la ruta del endpoint protegido que se solicitó y su miembro `status` es `401`, coherente con el estado de la respuesta

#### Scenario: La operación protegida no llega a ejecutarse
- **WHEN** una solicitud a un endpoint protegido es rechazada por token ausente o inválido
- **THEN** el cuerpo del endpoint no se ejecuta: ningún efecto suyo es observable

### Requirement: Los rechazos de un token presente son indistinguibles entre sí
Cuando la solicitud traiga un token que no sirve, la respuesta SHALL ser idéntica cualquiera sea el motivo: malformado, firmado con otra clave, vencido o sin sujeto. Ni el cuerpo ni los headers SHALL contener dato alguno que permita determinar por cuál de esos motivos se rechazó. Distinguir "el token venció" de "la firma es incorrecta" le confirma a un atacante que su token fue emitido alguna vez por este servicio, o que su intento de falsificación fue detectado como tal.

#### Scenario: Los cuatro rechazos con token presente son la misma respuesta
- **WHEN** se comparan las respuestas a un token malformado, uno firmado con otra clave, uno vencido y uno sin sujeto
- **THEN** las cuatro son iguales campo por campo —mismo estado, mismo cuerpo completo y mismo desafío de autenticación—, sin ningún dato que las distinga

#### Scenario: El motivo del rechazo no viaja en el cuerpo
- **WHEN** se inspecciona el cuerpo de un `401` por token inválido
- **THEN** no nombra la causa concreta, no incluye el nombre de ninguna excepción de la librería de JWT ni ninguna traza

#### Scenario: El token presentado no se refleja en la respuesta
- **WHEN** se inspeccionan el cuerpo y los headers de un `401` por token inválido
- **THEN** el token que se presentó no aparece, ni entero ni en fragmentos

#### Scenario: Un rechazo futuro más informativo rompe la suite
- **WHEN** un change futuro agregue al mensaje del rechazo el motivo concreto por parecer más útil para depurar
- **THEN** la suite de tests falla, dejando explícito que esa uniformidad es deliberada

### Requirement: El rechazo lleva el desafío de autenticación del esquema Bearer
La respuesta `401` SHALL incluir el header `WWW-Authenticate` con el esquema `Bearer`, y ese header SHALL sobrevivir a la traducción del error al formato RFC 7807. El desafío SHALL distinguir únicamente dos situaciones: la solicitud que no presentó credenciales y la que presentó un token que no sirve. NO SHALL incluir una descripción del error ni ningún otro parámetro que revele por qué el token concreto fue rechazado.

#### Scenario: Desafío ante ausencia de credenciales
- **WHEN** se solicita un endpoint protegido sin header `Authorization`
- **THEN** la respuesta `401` incluye el desafío del esquema `Bearer` sin parámetro de error

#### Scenario: Desafío ante un token que no sirve
- **WHEN** se solicita un endpoint protegido con un token que la validación rechaza
- **THEN** la respuesta `401` incluye el desafío del esquema `Bearer` con el código de error de token inválido que define el estándar de tokens Bearer

#### Scenario: El mismo desafío para todos los tokens inválidos
- **WHEN** se comparan los desafíos de los rechazos por token malformado, vencido y firmado con otra clave
- **THEN** los tres son idénticos: el código de error agrupa todos los motivos, sin distinguirlos

#### Scenario: Sin descripción del error en el desafío
- **WHEN** se inspecciona el desafío de cualquier `401`
- **THEN** no incluye una descripción legible del motivo ni ningún parámetro derivado del token recibido

#### Scenario: El desafío sobrevive al formato de problem details
- **WHEN** se inspecciona una respuesta `401` completa
- **THEN** conserva a la vez el desafío de autenticación y el media type de problem details: la traducción del error no descarta ninguno de los dos

### Requirement: La dependencia no implementa criptografía propia
La dependencia SHALL apoyarse enteramente en la operación de decodificación del módulo de seguridad del proyecto. El módulo que la declara NO SHALL importar la librería de JWT, NO SHALL verificar firmas ni vencimientos por su cuenta, y NO SHALL envolver la decodificación en un bloque de captura de excepciones: la operación de decodificación no lanza, y su contrato es devolver la identidad vacía ante cualquier token inválido. Un bloque de captura acá sería código muerto que sugiere lo contrario e invitaría a ramificar por tipo de excepción, que es exactamente lo que la indistinguibilidad de los rechazos prohíbe.

#### Scenario: Sin la librería de JWT en el módulo de dependencias
- **WHEN** se inspeccionan los imports del módulo de dependencias
- **THEN** no aparece la librería de JWT: el acceso pasa por el módulo de seguridad del proyecto

#### Scenario: Sin captura de excepciones
- **WHEN** se inspecciona el código de la dependencia
- **THEN** no contiene ningún bloque de captura de excepciones: la única condición de rechazo es que la identidad recuperada esté vacía

#### Scenario: La decisión de rechazo se toma sobre la identidad, no sobre el token
- **WHEN** se inspecciona la implementación de la dependencia
- **THEN** decide rechazar por la identidad vacía que devuelve la decodificación, sin inspeccionar el texto del token, su cabecera ni sus segmentos

### Requirement: La dependencia no consulta la persistencia
La dependencia SHALL resolver la identidad exclusivamente del token, sin abrir sesiones de base de datos, sin construir una Unit of Work y sin consultar el repositorio de usuarios. El módulo que la declara NO SHALL requerir la base para responder: un token válido SHALL resolverse aunque la base no esté disponible, y un token inválido SHALL rechazarse en las mismas condiciones. La consecuencia aceptada es que un token permanece válido hasta su vencimiento con independencia de la fila del usuario; el alcance actual no contempla baja ni suspensión de usuarios.

#### Scenario: Resolución sin base de datos disponible
- **WHEN** se resuelve la identidad de un token válido sin ninguna base de datos alcanzable
- **THEN** la dependencia devuelve el email igualmente, sin error de conexión

#### Scenario: Rechazo sin base de datos disponible
- **WHEN** se rechaza un token inválido sin ninguna base de datos alcanzable
- **THEN** la respuesta es `401`, no un error interno del servicio

#### Scenario: Sin sesión, Unit of Work ni repositorio
- **WHEN** se inspecciona la implementación de la dependencia
- **THEN** no construye ni recibe una sesión, una Unit of Work ni un repositorio: no tiene por dónde consultar la persistencia

#### Scenario: Un email que no corresponde a ninguna fila igual se resuelve
- **WHEN** se presenta un token válido cuyo sujeto es un email que no existe en la tabla de usuarios
- **THEN** la dependencia devuelve ese email: la validez del token es la prueba de identidad, y la existencia de la fila no se verifica

### Requirement: La clave de firma llega por inyección, no por lectura de configuración global
La dependencia SHALL recibir la configuración del servicio por el mecanismo de inyección del framework y SHALL pasarla a la operación de decodificación, en lugar de leer la configuración global desde su cuerpo. Esto mantiene la cadena que ya establece el módulo de seguridad —la clave llega siempre por parámetro— y permite ejercitar la dependencia con una clave de prueba propia sin alterar la configuración cacheada del proceso. La dependencia NO SHALL contener ningún literal de configuración.

#### Scenario: La configuración es un parámetro inyectado
- **WHEN** se inspecciona la firma de la dependencia
- **THEN** recibe la configuración del servicio como parámetro declarado por inyección, y su cuerpo no invoca el lector de configuración global

#### Scenario: Sustituir la configuración cambia qué tokens se aceptan
- **WHEN** se sustituye la configuración por una con otra clave de firma y se presenta un token emitido con la clave original
- **THEN** la solicitud se rechaza con `401`, demostrando que la clave efectivamente usada es la inyectada

#### Scenario: Sin literales de configuración
- **WHEN** se inspecciona el código de la dependencia
- **THEN** no contiene ninguna clave, duración ni URL escrita a mano: todo proviene de la configuración

### Requirement: El rechazo no deja rastro del material sensible
La dependencia NO SHALL escribir en logs el token recibido, la clave de firma ni el email resuelto. El detalle del problema que emite SHALL ser un literal fijo por cada una de las dos situaciones de rechazo, declarado como constante, y NO SHALL componerse interpolando datos de la solicitud: un mensaje sin lugar donde interpolar es un mensaje que ningún refactor futuro puede convertir en una filtración.

#### Scenario: Sin registro del token
- **WHEN** se solicita un endpoint protegido con un token inválido, con los logs capturados
- **THEN** ningún registro emitido contiene el token presentado

#### Scenario: Sin registro de la identidad resuelta
- **WHEN** se solicita un endpoint protegido con un token válido, con los logs capturados
- **THEN** ningún registro emitido contiene el email resuelto

#### Scenario: El detalle del rechazo es una constante
- **WHEN** se inspecciona cómo se construye el detalle del `401`
- **THEN** es un literal declarado como constante, no una cadena compuesta con valores de la solicitud

### Requirement: La dependencia es sustituible en pruebas por el mecanismo del framework
La dependencia SHALL declararse de modo que una prueba pueda sustituirla por el mecanismo de sustitución de dependencias del framework y hacer que un endpoint protegido reciba una identidad fija, sin necesidad de emitir un token real. SHALL exponerse además una anotación única que los routers usen para declarar una operación protegida, de modo que el cableado se escriba una sola vez y ningún consumidor pueda declarar por error el extractor del token en crudo —que devuelve el token **sin validar**— en lugar de la dependencia que lo valida.

#### Scenario: Sustitución efectiva de la dependencia
- **WHEN** una prueba sustituye la dependencia por una que devuelve una identidad fija y solicita un endpoint protegido sin ningún header de autorización
- **THEN** el endpoint se ejecuta y recibe esa identidad fija

#### Scenario: La anotación única cablea la dependencia validadora
- **WHEN** un endpoint declara su parámetro de identidad con la anotación expuesta por el módulo
- **THEN** recibe el email ya validado, y no el texto del token en crudo

#### Scenario: El extractor del token no es la dependencia de identidad
- **WHEN** se comparan lo que devuelven el extractor del token y la dependencia de identidad ante la misma solicitud válida
- **THEN** el primero devuelve el token sin validar y la segunda el email validado: son piezas distintas y solo la segunda decide sobre la autenticación

### Requirement: El esquema de seguridad queda declarado para la documentación
El extractor del token SHALL declararse como un esquema de seguridad de tipo `bearer` cuya URL de obtención de token es la ruta de inicio de sesión existente del servicio, de modo que la documentación generada muestre qué operaciones requieren autenticación y ofrezca dónde obtener un token. Declararlo NO SHALL asociar el esquema a ninguna operación por sí solo: el requisito de seguridad aparece en el esquema generado únicamente para las operaciones que declaren la dependencia.

#### Scenario: La URL de obtención de token apunta a una ruta real
- **WHEN** se inspecciona la URL de obtención de token declarada por el esquema de seguridad
- **THEN** es la ruta de inicio de sesión que el servicio expone efectivamente

#### Scenario: Una operación protegida declara su requisito de seguridad
- **WHEN** se inspecciona el esquema generado de una aplicación con una operación que declara la dependencia
- **THEN** esa operación aparece con un requisito de seguridad, y el esquema de tipo `bearer` figura entre los componentes de seguridad

#### Scenario: Declarar el esquema no protege nada por sí solo
- **WHEN** se inspecciona el esquema generado de la aplicación del servicio, donde ninguna operación declara todavía la dependencia
- **THEN** ninguna operación existente queda marcada como protegida: las operaciones de autenticación y la de salud siguen siendo públicas

### Requirement: Declarar la dependencia no altera la superficie de API
Agregar la dependencia NO SHALL montar rutas, NO SHALL modificar el contrato de las rutas existentes y NO SHALL exigir autenticación en ninguna operación que hoy sea pública. Proteger una ruta SHALL ser una decisión explícita del change que implementa esa ruta, nunca un efecto colateral de que la dependencia exista.

#### Scenario: La superficie de rutas no cambia
- **WHEN** se inspeccionan las rutas de aplicación registradas, descartando las rutas internas del framework
- **THEN** siguen siendo exactamente el endpoint de salud y las dos operaciones de autenticación

#### Scenario: El disparo de escaneos sigue sin montarse
- **WHEN** se solicita el endpoint de disparo de escaneos
- **THEN** la respuesta sigue siendo `404`, porque ese router se monta en su propio change

#### Scenario: Las rutas públicas siguen siendo públicas
- **WHEN** se solicitan el endpoint de salud, el de registro y el de inicio de sesión sin ningún header de autorización
- **THEN** ninguno responde `401`: siguen atendiéndose como antes de existir la dependencia

