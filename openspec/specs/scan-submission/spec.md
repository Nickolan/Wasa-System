## Purpose

Define el envío de un escaneo desde la Landing: cómo se compone y despacha la solicitud al FastAPI Bridge, qué significa cada respuesta para quien está mirando la pantalla, qué mensaje ve ante cada rechazo, qué pasa cuando el escaneo queda encolado (la redirección al Dashboard de RN-WS-08), y cómo se renderiza y se habilita el formulario. Es el consumidor del contrato de `scan-form-contracts` y del canal de `http-client`, y el último tramo del Flujo 3 de la KB.

## ADDED Requirements

### Requirement: La solicitud lleva exactamente el cuerpo del contrato, y la credencial no se adjunta a mano

El envío del escaneo SHALL dirigirse a la operación de disparo de escaneo del Bridge con el método que esa operación declara, y su cuerpo SHALL ser exactamente el cuerpo del contrato de escaneo —URL objetivo, sesión, nivel y riesgo—, tomado de la **salida ya validada** del schema del formulario. La aceptación de la declaración ética SHALL NOT viajar en el cuerpo: es una condición de la interfaz (RN-WS-01) y el contrato de datos la excluye.

La credencial de sesión SHALL adjuntarla el cliente HTTP compartido. El módulo de envío SHALL NOT leer el token, componer la cabecera de autorización ni acceder al estado de sesión para obtenerla.

#### Scenario: El cuerpo despachado tiene los cuatro campos del contrato

- **WHEN** se envía un formulario válido
- **THEN** el cuerpo de la solicitud contiene exactamente `target_url`, `phpsessid`, `sqlmap_level` y `sqlmap_risk`, y no la aceptación ética

#### Scenario: Los valores despachados son los validados, no los tipeados

- **WHEN** se envía un formulario cuya URL objetivo se escribió con espacios alrededor y que omitió los parámetros de SQLMap
- **THEN** el cuerpo lleva la URL sin esos espacios y los parámetros con su valor por defecto, tal como los produce el schema

#### Scenario: La credencial la pone el cliente HTTP

- **WHEN** se inspecciona el módulo que despacha el envío
- **THEN** no lee el token de sesión ni compone la cabecera de autorización, y la solicitud emitida igualmente la lleva

### Requirement: La aceptación devuelve la confirmación y cualquier otra respuesta es un rechazo tipado

Cuando el Bridge responde con el estado de aceptación (`202`), el envío SHALL resolverse devolviendo la confirmación de iniciación tal como llegó —identificador del escaneo, estado de encolado y mensaje—, sin transformarla.

Ante cualquier otra respuesta, el envío SHALL fallar con un error que transporte el código de estado y, cuando el cuerpo recibido efectivamente tenga la forma RFC 7807, el cuerpo de Problem Details. Un cuerpo de error que no tenga esa forma SHALL NOT presentarse como si la tuviera: el error SHALL seguir transportando el estado, y el detalle SHALL quedar ausente.

Un fallo en el que nunca hubo respuesta SHALL producir un error distinguible de un rechazo con estado.

#### Scenario: Aceptación

- **WHEN** el Bridge responde `202` con la confirmación de iniciación
- **THEN** el envío devuelve esa confirmación con su identificador, su estado de encolado y su mensaje

#### Scenario: Rechazo con Problem Details

- **WHEN** el Bridge responde con un código de rechazo y un cuerpo RFC 7807
- **THEN** el envío falla con un error que transporta ese código de estado y ese cuerpo

#### Scenario: Rechazo con un cuerpo que no es Problem Details

- **WHEN** una respuesta de rechazo llega con un cuerpo vacío, con texto plano o con una página HTML de un intermediario
- **THEN** el envío falla con un error que transporta el código de estado y sin detalle inventado

#### Scenario: Fallo de red

- **WHEN** la solicitud no obtiene ninguna respuesta
- **THEN** el envío falla con un error reconocible como fallo de conexión, distinto de un rechazo con estado

### Requirement: Cada resultado del Bridge tiene su mensaje en español para el usuario

El formulario SHALL traducir el resultado del envío a un mensaje en español, elegido por el código de estado y no por el texto que venga del servidor:

| Situación | Qué ve el usuario |
|---|---|
| Credencial rechazada (`401`) | que su sesión expiró y tiene que volver a iniciarla |
| Cuerpo rechazado por validación (`400` / `422`) | que los datos enviados no fueron aceptados |
| Cupo excedido (`429`) | que alcanzó el límite de escaneos y tiene que esperar |
| Orquestador indisponible (`502`) | que el sistema de escaneo no está disponible y reintente más tarde |
| Cualquier otro rechazo | un mensaje genérico de error del servidor |
| Sin respuesta del servidor | que no se pudo conectar, sugiriendo revisar la conexión |

El mensaje SHALL mostrarse a nivel del formulario y SHALL ser legible sin abrir la consola del navegador. El cuerpo crudo del error, su `type`, su `instance` y cualquier traza SHALL NOT mostrarse en la interfaz.

Todo mensaje SHALL estar en español. Ningún texto por defecto del cliente HTTP, del validador o del navegador SHALL llegar a la pantalla.

#### Scenario: Sesión expirada

- **WHEN** el envío es rechazado con `401`
- **THEN** el formulario muestra un mensaje en español que informa que la sesión expiró

#### Scenario: Validación rechazada por el Bridge

- **WHEN** el envío es rechazado con `400` o con `422`
- **THEN** el formulario muestra un mensaje en español indicando que los datos no fueron aceptados

#### Scenario: Límite de escaneos alcanzado

- **WHEN** el envío es rechazado con `429`
- **THEN** el formulario muestra un mensaje en español indicando que se alcanzó el límite de escaneos y que hay que esperar

#### Scenario: Sistema de escaneo indisponible

- **WHEN** el envío es rechazado con `502`
- **THEN** el formulario muestra un mensaje en español indicando que el sistema de escaneo no está disponible

#### Scenario: Fallo de conexión

- **WHEN** el envío falla sin obtener respuesta del servidor
- **THEN** el formulario muestra un mensaje en español de fallo de conexión, distinto del mensaje de sistema no disponible

#### Scenario: Ningún mensaje del servidor se muestra crudo

- **WHEN** se inspecciona lo que la interfaz muestra ante cualquiera de los rechazos anteriores
- **THEN** no aparecen el `type`, el `instance`, el cuerpo crudo del error ni ningún texto en inglés

### Requirement: El rechazo de credencial cierra la sesión y devuelve al usuario al muro de autenticación

Cuando el envío es rechazado con `401`, la sesión del cliente SHALL quedar invalidada, de modo que la aplicación vuelva a su estado no autenticado y el muro de autenticación reaparezca (RN-WS-10, RN-WS-14). El usuario SHALL ver el mensaje de sesión expirada y SHALL NOT ser redirigido al Dashboard.

Ningún otro rechazo SHALL cerrar la sesión.

#### Scenario: El 401 deja la aplicación no autenticada

- **WHEN** el envío es rechazado con `401`
- **THEN** la aplicación queda no autenticada

#### Scenario: El 429 y el 502 no cierran la sesión

- **WHEN** el envío es rechazado con `429` o con `502`
- **THEN** la aplicación sigue autenticada y el formulario sigue disponible con los datos que el usuario ya había cargado

### Requirement: Un escaneo encolado lleva al Dashboard

Cuando el Bridge acepta el escaneo (`202`), el formulario SHALL mostrar una confirmación de éxito y a continuación SHALL navegar el navegador al Dashboard existente, cuya URL proviene de la puerta única de configuración de entorno (RN-WS-08, HU-05-01). La confirmación SHALL ser visible antes de la navegación, para que el usuario entienda por qué cambió de pantalla.

La navegación SHALL ocurrir **únicamente** ante la aceptación: ningún rechazo ni fallo de red SHALL navegar. Si el componente deja de estar montado antes de que la navegación se dispare, esta SHALL NOT ejecutarse.

El destino SHALL ser el Dashboard y NO la URL base del Bridge: son dos destinos distintos.

#### Scenario: Aceptación y redirección

- **WHEN** el Bridge acepta el escaneo con `202`
- **THEN** el usuario ve la confirmación de éxito y el navegador termina navegando a la URL del Dashboard

#### Scenario: Ningún rechazo redirige

- **WHEN** el envío es rechazado con `401`, `400`, `422`, `429`, `502` o falla sin respuesta
- **THEN** el navegador no navega a ninguna parte y el usuario permanece en la Landing

#### Scenario: El destino es el Dashboard, no el Bridge

- **WHEN** se compara el destino de la navegación con la URL base del cliente HTTP
- **THEN** son distintos: la navegación va al Dashboard configurado

#### Scenario: Desmontaje antes de la navegación

- **WHEN** el escaneo es aceptado y el formulario deja de estar montado antes de que la navegación se dispare
- **THEN** la navegación no se ejecuta y no se propaga ningún error

### Requirement: Durante el envío el formulario está en curso y no admite un segundo disparo

Mientras una solicitud está en vuelo, el formulario SHALL exhibir su estado de carga en el control de envío y SHALL impedir un segundo envío, de modo que un doble clic produzca **una sola** solicitud (HU-05-02). El impedimento SHALL estar en el estado del control —deshabilitado mientras dura el envío—, y no confiado a que el usuario no haga clic dos veces.

Al terminar el envío con un rechazo, el estado de carga SHALL levantarse y el formulario SHALL volver a ser enviable, con los valores que el usuario ya había cargado intactos. Tras una aceptación, el formulario SHALL permanecer no enviable, porque el navegador está por irse al Dashboard.

#### Scenario: Un doble clic produce una sola solicitud

- **WHEN** se dispara el envío dos veces seguidas antes de que la primera solicitud responda
- **THEN** se emite exactamente una solicitud al Bridge

#### Scenario: Estado de carga visible

- **WHEN** hay una solicitud en vuelo
- **THEN** el control de envío exhibe su estado de carga y está deshabilitado

#### Scenario: El rechazo devuelve el formulario a estado enviable

- **WHEN** el envío es rechazado y el usuario corrige lo que corresponda
- **THEN** el control de envío vuelve a estar habilitado y los valores previamente cargados siguen en los campos

### Requirement: El escaneo no se puede disparar sin la declaración ética

El control de envío SHALL estar deshabilitado mientras la aceptación de la declaración ética no esté marcada (RN-WS-01, HU-02-05). Esto SHALL sumarse —no reemplazar— a la validación del schema, que rechaza igualmente un formulario sin la aceptación: el control deshabilitado explica la condición antes del intento, y el schema es la red que la garantiza.

#### Scenario: Sin aceptación ética no se puede enviar

- **WHEN** el formulario está completo y correcto pero la aceptación ética está sin marcar
- **THEN** el control de envío está deshabilitado

#### Scenario: Marcar la aceptación habilita el envío

- **WHEN** se marca la aceptación ética sobre un formulario por lo demás completo
- **THEN** el control de envío queda habilitado

#### Scenario: Desmarcarla vuelve a deshabilitarlo

- **WHEN** se marca y luego se desmarca la aceptación ética
- **THEN** el control de envío vuelve a estar deshabilitado

### Requirement: Los parámetros numéricos llegan al contrato como números

Los controles de nivel y de riesgo de SQLMap SHALL entregar al validador **números**, no cadenas de texto: el contrato de validación no coacciona tipos a propósito, y una cadena numérica lo hace fallar con un mensaje que no describe lo que pasó (`scan-form-contracts`).

Un control numérico vacío SHALL tratarse como campo omitido, de modo que tome el valor por defecto del contrato, y NO SHALL producir un valor no numérico ni el mensaje por defecto del validador.

Los límites del control SHALL provenir de las constantes de rango que el contrato exporta, y NO SHALL estar escritos como literales en la interfaz: un control cuyo rango se aparta del contrato le muestra al usuario un valor que después es rechazado.

#### Scenario: Lo tipeado llega como número

- **WHEN** se completa el nivel de SQLMap con `3` a través del control del formulario y se envía
- **THEN** la validación tiene éxito y el cuerpo despachado lleva el número `3`, no la cadena `"3"`

#### Scenario: Campo numérico vaciado

- **WHEN** se borra por completo el contenido del control de nivel y se envía un formulario por lo demás válido
- **THEN** la validación tiene éxito, el cuerpo lleva el valor por defecto del contrato, y no se muestra ningún mensaje de tipo inválido

#### Scenario: Los límites del control salen del contrato

- **WHEN** se inspeccionan los límites declarados por los controles de nivel y de riesgo
- **THEN** coinciden con las constantes de rango que exporta el contrato de escaneo, tomadas de ellas y no reescritas

### Requirement: Los errores de validación del cliente se muestran bajo su campo

Cuando la validación del formulario rechaza uno o más campos, cada mensaje SHALL mostrarse asociado a su campo —no como un error global—, usando el texto en español que el contrato de validación define, sin reescribirlo en la interfaz. Cuando varios campos son inválidos a la vez, SHALL mostrarse el mensaje de cada uno en la misma pasada.

Un formulario rechazado por la validación del cliente SHALL NOT emitir ninguna solicitud al Bridge.

#### Scenario: Mensaje bajo el campo responsable

- **WHEN** se envía el formulario con una URL objetivo sin esquema
- **THEN** el mensaje aparece asociado al campo de URL objetivo y es el texto que define el contrato de validación

#### Scenario: Varios campos inválidos a la vez

- **WHEN** se envía el formulario con la URL objetivo inválida y el PHPSESSID vacío
- **THEN** ambos campos muestran su mensaje simultáneamente

#### Scenario: La validación del cliente evita la ida al servidor

- **WHEN** se intenta enviar un formulario que la validación del cliente rechaza
- **THEN** no se emite ninguna solicitud al Bridge

### Requirement: El formulario se construye con los primitivos compartidos y respeta la dirección de las capas

Los campos y el control de envío del formulario SHALL renderizarse con los primitivos de interfaz compartidos (`shared-ui-kit`), sin reimplementar el manejo de etiqueta, mensaje de error e indicador de carga que esos primitivos ya resuelven de forma accesible.

El feature SHALL importar únicamente de las capas de entidades y compartida, y SHALL NOT importar de las capas de aplicación, páginas o widgets. SHALL NOT leer el entorno del bundler ni el almacenamiento del navegador por su cuenta: la configuración viene de la puerta única y la sesión, del estado de sesión.

#### Scenario: Los campos usan los primitivos compartidos

- **WHEN** se inspecciona el formulario renderizado
- **THEN** cada campo de texto y numérico tiene su etiqueta asociada y su mensaje de error accesible, provistos por los primitivos compartidos

#### Scenario: El feature respeta la dirección de las capas

- **WHEN** se inspeccionan los imports de los módulos del feature
- **THEN** ninguno resuelve a las capas de aplicación, páginas o widgets

#### Scenario: El feature no accede al entorno ni al almacenamiento

- **WHEN** se inspeccionan los módulos del feature
- **THEN** ninguno accede directamente al entorno del bundler ni al almacenamiento del navegador
