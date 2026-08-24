## Purpose

Define el único canal por el que la Landing le habla al FastAPI Bridge: a dónde apunta, cómo obtiene y adjunta la credencial de sesión sin conocer el dominio de autenticación, qué hace cuando el Bridge rechaza la credencial, cómo distingue un rechazo del servidor de un fallo de red, y cuál es la forma única del cuerpo de error RFC 7807 que todo el frontend consume. Es la contraparte cliente de `error-contract` y el punto donde el token que gobierna `auth-session-state` se convierte en una cabecera.

## ADDED Requirements

### Requirement: Existe un único cliente HTTP y su destino viene de la configuración

El frontend SHALL disponer de un único cliente HTTP para hablar con el FastAPI Bridge, y toda petición al Bridge SHALL emitirse a través de él. Su URL base SHALL provenir de la puerta única de configuración de entorno (`runtime-configuration`), y NO SHALL estar escrita en el módulo del cliente ni leerse por su cuenta del entorno del bundler.

Ningún módulo del frontend SHALL construir su propio cliente HTTP ni emitir peticiones al Bridge por fuera de este: un segundo cliente no llevaría la credencial ni reaccionaría al vencimiento de la sesión, y ese es exactamente el tipo de fallo que no se nota hasta que un endpoint protegido responde `401` sin explicación.

#### Scenario: El destino sale de la configuración

- **WHEN** se inspecciona la URL base del cliente HTTP
- **THEN** es exactamente el valor que expone la puerta única de configuración para el FastAPI Bridge

#### Scenario: El cliente no lee el entorno por su cuenta

- **WHEN** se inspecciona el módulo del cliente HTTP
- **THEN** no accede directamente al entorno del bundler: obtiene la configuración del módulo que la valida

#### Scenario: Un solo cliente en todo el frontend

- **WHEN** se buscan en el código las creaciones de clientes HTTP y las llamadas directas a la API de red del navegador hacia el Bridge
- **THEN** existe exactamente una, la del cliente compartido

### Requirement: La credencial y la reacción al rechazo entran por inyección, no por dependencia de capa

El cliente HTTP SHALL obtener la credencial de sesión y la acción de invalidación de sesión desde afuera, mediante un punto de configuración que se le provee al arrancar la aplicación. El cliente SHALL NOT importar el estado de sesión, el almacenamiento del navegador ni ningún módulo de dominio: vive en la capa compartida, y esa capa no conoce dominio ni depende de las capas que la consumen.

El cableado SHALL ocurrir desde un único lugar de la capa de aplicación, y SHALL ser idempotente: configurarlo más de una vez SHALL dejar el mismo comportamiento, sin acumular interceptores ni duplicar efectos — condición necesaria porque el modo estricto de React ejecuta los efectos dos veces en desarrollo.

#### Scenario: El cliente no importa de capas superiores

- **WHEN** se inspeccionan los imports del módulo del cliente HTTP
- **THEN** ninguno resuelve a las capas de aplicación, páginas, widgets, features o entidades

#### Scenario: El cliente no toca el almacenamiento del navegador

- **WHEN** se inspecciona el módulo del cliente HTTP
- **THEN** no lee ni escribe el almacenamiento del navegador: la credencial le llega por el punto de configuración

#### Scenario: Punto único de cableado

- **WHEN** se inspecciona la aplicación
- **THEN** el cliente HTTP queda conectado al estado de sesión desde un único lugar al arrancar, y ningún componente lo reconfigura por su cuenta

#### Scenario: Cablear dos veces no acumula efectos

- **WHEN** el cableado se ejecuta dos veces seguidas y luego se emite una petición
- **THEN** la petición lleva una sola cabecera de autorización y una respuesta de rechazo de credencial produce una sola invalidación de sesión

#### Scenario: Sin cableado, el cliente sigue siendo usable

- **WHEN** se emite una petición con el cliente sin que se haya configurado ningún proveedor de credencial
- **THEN** la petición se emite sin cabecera de autorización y no se propaga ningún error de configuración

### Requirement: Toda petición saliente lleva la credencial de sesión vigente, y solo si la hay

Cuando hay una sesión activa, el cliente HTTP SHALL adjuntar la credencial a cada petición saliente en la cabecera de autorización, con el esquema *bearer* que el Bridge exige (`request-authentication`). El valor SHALL leerse **en el momento de cada petición**, no capturarse una vez al configurar el cliente: una credencial capturada al arrancar sería la de la sesión anterior después de que el usuario vuelva a autenticarse.

Cuando no hay sesión activa, la petición SHALL emitirse **sin** cabecera de autorización, y SHALL NOT enviarse una cabecera con valor vacío ni con el literal de un valor ausente. Ningún llamador SHALL tener que adjuntar la credencial a mano.

#### Scenario: Petición autenticada

- **WHEN** hay una sesión activa y se emite una petición con el cliente
- **THEN** la petición lleva la cabecera de autorización con el esquema *bearer* y el token de esa sesión

#### Scenario: Petición sin sesión

- **WHEN** no hay sesión activa y se emite una petición con el cliente
- **THEN** la petición no lleva cabecera de autorización, y no lleva una cabecera con valor vacío

#### Scenario: La credencial se lee en cada petición

- **WHEN** se emite una petición, luego cambia la sesión activa por otra con un token distinto, y se emite una segunda petición
- **THEN** cada petición lleva el token vigente en su momento, y la segunda no repite el de la primera

#### Scenario: El llamador no adjunta nada

- **WHEN** se inspecciona un módulo que emite una petición al Bridge a través del cliente
- **THEN** no compone la cabecera de autorización ni lee el token: el cliente lo hace por él

### Requirement: Un rechazo de credencial invalida la sesión del cliente y sigue propagándose

Cuando el Bridge responde con el estado de credencial ausente o inválida (`401`), el cliente HTTP SHALL invocar la invalidación de sesión que le inyectaron, de modo que la aplicación vuelva a su estado no autenticado y el muro de autenticación reaparezca (RN-WS-14). La invalidación SHALL ocurrir **una sola vez por respuesta** de ese tipo.

El error SHALL seguir propagándose al llamador después de invalidar: el cliente cierra la sesión, pero no decide qué mensaje ve el usuario ni si hay que reintentar — eso es de quien hizo la llamada.

Ningún otro código de rechazo SHALL invalidar la sesión: un `429`, un `502` o un error de validación dejan la sesión intacta, porque en esos casos la credencial sigue siendo válida y cerrar la sesión obligaría al usuario a volver a autenticarse por un problema que no es suyo.

#### Scenario: Rechazo de credencial

- **WHEN** una petición emitida con el cliente recibe una respuesta `401`
- **THEN** la sesión del cliente queda invalidada y la aplicación pasa a no autenticada

#### Scenario: El error llega igual al llamador

- **WHEN** una petición recibe una respuesta `401`
- **THEN** además de invalidarse la sesión, la llamada falla hacia quien la emitió, y no se resuelve como si hubiera tenido éxito

#### Scenario: Los demás rechazos no cierran la sesión

- **WHEN** una petición recibe una respuesta `400`, `422`, `429`, `502` o `500`
- **THEN** la sesión sigue activa y la aplicación sigue autenticada

#### Scenario: Una sola invalidación por respuesta

- **WHEN** una única respuesta `401` atraviesa el cliente
- **THEN** la invalidación de sesión se ejecuta exactamente una vez

#### Scenario: Una respuesta exitosa no toca la sesión

- **WHEN** una petición recibe una respuesta de éxito
- **THEN** la sesión queda tal como estaba y no se ejecuta ninguna invalidación

### Requirement: El cuerpo de error del Bridge se declara una sola vez para todo el frontend

La forma del cuerpo de error RFC 7807 que emite el Bridge —los cinco miembros `type`, `title`, `status`, `detail` e `instance`, con `detail` admitiendo ausencia de valor— SHALL declararse **una única vez** en la capa compartida del frontend, junto al cliente HTTP que la recibe, y NO SHALL redeclararse dentro de la slice de ningún dominio.

Los dominios que necesiten nombrar ese contrato SHALL hacerlo a través de esa declaración única. Que dos dominios se separen SHALL ser imposible por construcción, y no una divergencia vigilada por un chequeo: el chequeo anterior vivía fuera del alcance de compilación del proyecto y no fallaba ni en el build ni en la suite (ver `design.md`).

#### Scenario: Una sola declaración de la forma

- **WHEN** se buscan en el código del frontend las declaraciones de la forma de cinco miembros del error RFC 7807
- **THEN** existe exactamente una, en la capa compartida

#### Scenario: Los dominios la referencian, no la repiten

- **WHEN** se inspeccionan los contratos de error que exponen las slices de dominio
- **THEN** cada uno resuelve a la declaración compartida, y ninguno enumera los cinco miembros por su cuenta

#### Scenario: La divergencia entre dominios deja de ser expresable

- **WHEN** se intenta hacer que el contrato de error de un dominio difiera del de otro
- **THEN** no existe un lugar donde hacerlo: los dos nombres de dominio resuelven a la misma declaración compartida, y alterarla los altera a ambos a la vez — no quedan dos declaraciones que puedan quedar desincronizadas

### Requirement: El cuerpo de error se reconoce en runtime antes de darse por bueno

El cliente HTTP SHALL ofrecer una forma de decidir, **en runtime**, si el cuerpo de una respuesta de error tiene efectivamente la forma RFC 7807. Un consumidor SHALL NOT asumir esa forma solo porque la respuesta sea un rechazo: un `502` de un proxy intermedio, una página de error HTML o un cuerpo vacío llegan por el mismo camino que un Problem Details del Bridge, y tratarlos como tal produce un mensaje construido sobre valores ausentes.

La verificación SHALL considerar la ausencia del cuerpo, un cuerpo que no sea un objeto y un objeto al que le falten miembros obligatorios o los tenga con el tipo equivocado. NO SHALL lanzar ante ninguna entrada.

#### Scenario: Cuerpo RFC 7807 legítimo

- **WHEN** se verifica un cuerpo con los cinco miembros y sus tipos correctos
- **THEN** se lo reconoce como Problem Details

#### Scenario: `detail` nulo sigue siendo válido

- **WHEN** se verifica un cuerpo cuyos demás miembros son correctos y cuyo `detail` es nulo
- **THEN** se lo reconoce como Problem Details, porque el Bridge lo emite nulo cuando el estado y el título ya alcanzan

#### Scenario: Cuerpos que no son Problem Details

- **WHEN** se verifica un cuerpo ausente, una cadena de texto, un arreglo, un objeto sin `status` o un objeto cuyo `status` no es numérico
- **THEN** ninguno se reconoce como Problem Details, y la verificación no lanza en ningún caso

### Requirement: Un fallo sin respuesta se distingue de un rechazo del servidor

El cliente HTTP SHALL permitir a sus consumidores distinguir tres situaciones: una respuesta de rechazo del Bridge (hay estado HTTP), un fallo en el que nunca hubo respuesta —servidor caído, red ausente, origen bloqueado, tiempo de espera agotado— y un error del propio código del llamador. La distinción SHALL basarse en la presencia de una respuesta, y SHALL NOT deducirse del texto del mensaje de error.

Confundir las dos primeras le muestra al usuario "el sistema de escaneo no está disponible" cuando lo que pasó es que se le cayó el WiFi, y esconde el caso en el que el Bridge no está levantado en absoluto.

#### Scenario: Rechazo con estado

- **WHEN** una petición recibe una respuesta con un código de estado de error
- **THEN** el consumidor puede leer ese código de estado

#### Scenario: Fallo sin respuesta

- **WHEN** una petición falla sin que ninguna respuesta llegue del servidor
- **THEN** el consumidor puede distinguirlo de un rechazo con estado, sin inspeccionar el texto del error

#### Scenario: La distinción no depende del mensaje

- **WHEN** se inspecciona cómo el consumidor decide entre las dos situaciones
- **THEN** lo hace por la presencia de la respuesta y su estado, y no comparando cadenas de texto del error
