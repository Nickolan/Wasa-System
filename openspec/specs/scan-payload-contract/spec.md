## Purpose

Define el contrato de datos del escaneo en el FastAPI Bridge: qué constituye una solicitud de escaneo válida (esquema de URL, sesión obligatoria, rangos y valores por defecto de los parámetros SQLMap), qué forma tiene la respuesta de aceptación que recibe el cliente, y qué forma tiene el mensaje que el Bridge reenvía al orquestador n8n. Es la autoridad de validación del sistema: ninguna solicitud que no satisfaga este contrato puede llegar a la infraestructura de escaneo.

## Requirements

### Requirement: La URL objetivo debe ser una URL HTTP o HTTPS válida

El contrato de solicitud de escaneo SHALL aceptar como URL objetivo únicamente valores que sean URLs absolutas y bien formadas cuyo esquema sea `http` o `https`. Cualquier otro valor —cadena vacía, texto arbitrario, URL sin esquema, o URL con un esquema distinto— SHALL rechazarse como error de validación, y la solicitud SHALL considerarse inválida en su totalidad. (RN-WS-02, HU-02-02, HU-03-04)

#### Scenario: URL con esquema https es aceptada

- **WHEN** se construye una solicitud de escaneo cuya URL objetivo es `https://example.com/login.php`
- **THEN** la validación tiene éxito y la URL objetivo queda disponible en la solicitud validada

#### Scenario: URL con esquema http es aceptada

- **WHEN** se construye una solicitud de escaneo cuya URL objetivo es `http://testphp.vulnweb.com/artists.php?artist=1`
- **THEN** la validación tiene éxito, incluyendo la preservación de la query string

#### Scenario: URL sin esquema es rechazada

- **WHEN** se construye una solicitud de escaneo cuya URL objetivo es `example.com/login.php` (sin `http://` ni `https://`)
- **THEN** la validación falla y el error identifica la URL objetivo como el campo responsable

#### Scenario: URL con esquema no HTTP es rechazada

- **WHEN** se construye una solicitud de escaneo cuya URL objetivo usa un esquema distinto de http/https (por ejemplo `ftp://example.com` o `file:///etc/passwd`)
- **THEN** la validación falla y el error identifica la URL objetivo como el campo responsable

#### Scenario: URL vacía o no parseable es rechazada

- **WHEN** se construye una solicitud de escaneo cuya URL objetivo es la cadena vacía o un texto arbitrario que no es una URL
- **THEN** la validación falla y el error identifica la URL objetivo como el campo responsable

#### Scenario: La URL objetivo se normaliza de forma determinística

- **WHEN** dos solicitudes se construyen con URLs objetivo equivalentes que difieren solo en normalización (por ejemplo `https://example.com` y `https://example.com/`)
- **THEN** ambas validan con éxito y producen la misma representación textual de la URL objetivo, de modo que lo que se reenvía al orquestador es estable y predecible

### Requirement: La sesión PHPSESSID es obligatoria y no puede estar vacía

El contrato de solicitud de escaneo SHALL exigir un identificador de sesión PHPSESSID no vacío. Una cadena vacía SHALL rechazarse. Una cadena compuesta exclusivamente por espacios en blanco SHALL rechazarse igualmente: el espacio en blanco de los extremos SHALL eliminarse antes de evaluar si el valor está vacío, de modo que un valor que solo contiene espacios no puede pasar la validación. La ausencia del campo SHALL rechazarse (no tiene valor por defecto). (RN-WS-03, HU-02-03, HU-03-04)

#### Scenario: PHPSESSID con contenido es aceptado

- **WHEN** se construye una solicitud de escaneo cuyo PHPSESSID es `a1b2c3d4e5f6g7h8`
- **THEN** la validación tiene éxito y el valor queda disponible tal cual

#### Scenario: PHPSESSID vacío es rechazado

- **WHEN** se construye una solicitud de escaneo cuyo PHPSESSID es la cadena vacía
- **THEN** la validación falla y el error identifica el PHPSESSID como el campo responsable

#### Scenario: PHPSESSID de solo espacios es rechazado

- **WHEN** se construye una solicitud de escaneo cuyo PHPSESSID es `"   "` (solo espacios en blanco)
- **THEN** la validación falla y el error identifica el PHPSESSID como el campo responsable

#### Scenario: PHPSESSID ausente es rechazado

- **WHEN** se construye una solicitud de escaneo que no incluye el campo PHPSESSID
- **THEN** la validación falla indicando que el campo es requerido

#### Scenario: El espacio en blanco de los extremos se elimina

- **WHEN** se construye una solicitud de escaneo cuyo PHPSESSID es `"  a1b2c3  "`
- **THEN** la validación tiene éxito y el valor resultante es `a1b2c3`, sin espacios en los extremos

### Requirement: El nivel de SQLMap está acotado a 1..5 con valor por defecto 1

El contrato de solicitud de escaneo SHALL aceptar como nivel de SQLMap únicamente enteros entre 1 y 5 inclusive. Valores fuera de ese rango SHALL rechazarse como error de validación —el contrato NO recorta ni ajusta el valor al rango, lo rechaza. Cuando el campo se omite, el contrato SHALL asumir el valor 1. (RN-WS-04, HU-02-04, HU-03-04)

#### Scenario: Nivel dentro del rango es aceptado

- **WHEN** se construye una solicitud de escaneo con nivel de SQLMap `3`
- **THEN** la validación tiene éxito y el nivel resultante es `3`

#### Scenario: Los extremos del rango son aceptados

- **WHEN** se construye una solicitud de escaneo con nivel de SQLMap `1`, y otra con nivel `5`
- **THEN** ambas validan con éxito

#### Scenario: Nivel por encima del rango es rechazado

- **WHEN** se construye una solicitud de escaneo con nivel de SQLMap `6`
- **THEN** la validación falla, el error identifica el nivel como el campo responsable, y el valor NO se recorta a `5`

#### Scenario: Nivel por debajo del rango es rechazado

- **WHEN** se construye una solicitud de escaneo con nivel de SQLMap `0` o un valor negativo
- **THEN** la validación falla y el error identifica el nivel como el campo responsable

#### Scenario: Nivel omitido toma el valor por defecto

- **WHEN** se construye una solicitud de escaneo que no incluye el nivel de SQLMap
- **THEN** la validación tiene éxito y el nivel resultante es `1`

#### Scenario: Nivel no entero es rechazado

- **WHEN** se construye una solicitud de escaneo cuyo nivel de SQLMap es un valor no entero (por ejemplo `"alto"` o `2.5`)
- **THEN** la validación falla y el error identifica el nivel como el campo responsable

### Requirement: El riesgo de SQLMap está acotado a 1..3 con valor por defecto 1

El contrato de solicitud de escaneo SHALL aceptar como riesgo de SQLMap únicamente enteros entre 1 y 3 inclusive. Valores fuera de ese rango SHALL rechazarse como error de validación, sin recorte al rango. Cuando el campo se omite, el contrato SHALL asumir el valor 1. (RN-WS-05, HU-02-04, HU-03-04)

#### Scenario: Riesgo dentro del rango es aceptado

- **WHEN** se construye una solicitud de escaneo con riesgo de SQLMap `2`
- **THEN** la validación tiene éxito y el riesgo resultante es `2`

#### Scenario: Los extremos del rango son aceptados

- **WHEN** se construye una solicitud de escaneo con riesgo de SQLMap `1`, y otra con riesgo `3`
- **THEN** ambas validan con éxito

#### Scenario: Riesgo por encima del rango es rechazado

- **WHEN** se construye una solicitud de escaneo con riesgo de SQLMap `4`
- **THEN** la validación falla, el error identifica el riesgo como el campo responsable, y el valor NO se recorta a `3`

#### Scenario: Riesgo por debajo del rango es rechazado

- **WHEN** se construye una solicitud de escaneo con riesgo de SQLMap `0` o un valor negativo
- **THEN** la validación falla y el error identifica el riesgo como el campo responsable

#### Scenario: Riesgo omitido toma el valor por defecto

- **WHEN** se construye una solicitud de escaneo que no incluye el riesgo de SQLMap
- **THEN** la validación tiene éxito y el riesgo resultante es `1`

### Requirement: La solicitud se valida como un todo y reporta cada campo inválido

La validación de la solicitud de escaneo SHALL evaluarse sobre la solicitud completa: cuando más de un campo es inválido, el resultado de la validación SHALL incluir una entrada de error por cada campo inválido, no solo por el primero. Cada entrada SHALL identificar el campo responsable, de modo que el manejador global de errores pueda componer una respuesta RFC 7807 con detalle por campo. (HU-03-04, RN-WS-09)

#### Scenario: Múltiples campos inválidos producen múltiples errores

- **WHEN** se construye una solicitud de escaneo con URL objetivo sin esquema, PHPSESSID vacío y nivel de SQLMap `9` simultáneamente
- **THEN** la validación falla y el resultado contiene al menos un error por cada uno de los tres campos, cada uno identificando su campo responsable

#### Scenario: Una solicitud mínima válida solo requiere URL y sesión

- **WHEN** se construye una solicitud de escaneo indicando únicamente una URL objetivo válida y un PHPSESSID no vacío
- **THEN** la validación tiene éxito y los parámetros de SQLMap quedan en `1` (nivel) y `1` (riesgo)

### Requirement: Los campos desconocidos no se propagan al orquestador

El contrato de solicitud de escaneo SHALL descartar cualquier campo que no forme parte del contrato en lugar de propagarlo. Un campo desconocido presente en la entrada SHALL NOT provocar el rechazo de una solicitud por lo demás válida, y SHALL NOT aparecer en el mensaje que el Bridge reenvía al orquestador. Ningún parámetro adicional puede llegar a la infraestructura de escaneo por la vía de campos no declarados.

#### Scenario: Campo desconocido es descartado sin romper la solicitud

- **WHEN** se construye una solicitud de escaneo válida que además incluye un campo no declarado en el contrato (por ejemplo el checkbox de aceptación ética del formulario)
- **THEN** la validación tiene éxito y el campo desconocido no forma parte de la solicitud validada

### Requirement: El contrato de solicitud no admite destinatario del reporte

El contrato de solicitud de escaneo SHALL NOT declarar ningún campo que designe la dirección
de correo, la casilla o cualquier otro destinatario al que se envía el reporte del escaneo. Un
cliente SHALL NOT poder elegir, sugerir ni sobrescribir ese destinatario por ninguna vía de la
solicitud: ni por un campo declarado, ni por un campo desconocido, ni por un valor extra
adjunto a otro campo. El destinatario del reporte SHALL determinarse exclusivamente a partir
de la identidad autenticada del solicitante, resuelta por el sistema, y SHALL NOT ser un dato
de entrada. (RN-WS-16, HU-04-03)

#### Scenario: La solicitud validada no expone ningún campo de destinatario

- **WHEN** se inspeccionan los campos que declara el contrato de solicitud de escaneo
- **THEN** ninguno de ellos designa un destinatario de correo: el contrato declara únicamente
  la URL objetivo, la sesión, el nivel y el riesgo

#### Scenario: Un campo de destinatario enviado por el cliente es descartado

- **WHEN** se construye una solicitud de escaneo válida que además incluye un campo con
  apariencia de destinatario (por ejemplo un campo de email)
- **THEN** la validación tiene éxito y ese campo no forma parte de la solicitud validada: es
  descartado como cualquier otro campo desconocido

#### Scenario: Un destinatario enviado por el cliente no llega al orquestador

- **WHEN** se inicia un escaneo a partir de una solicitud que incluyó un campo con apariencia
  de destinatario con un valor arbitrario
- **THEN** ese valor no aparece en ninguna parte del mensaje entregado al orquestador: el
  destinatario del mensaje sigue siendo el de la identidad autenticada

### Requirement: La respuesta de aceptación declara el escaneo como encolado

El contrato de respuesta del disparo de escaneo SHALL exponer tres datos: el identificador del escaneo, el estado, y un mensaje legible para el usuario. El estado SHALL ser exactamente `queued` y SHALL NOT admitir ningún otro valor: la respuesta de este endpoint solo puede significar "aceptado y encolado", nunca un resultado de escaneo. Los tres campos SHALL ser obligatorios. (HU-03-05)

#### Scenario: Respuesta válida con estado queued

- **WHEN** se construye una respuesta de escaneo con un identificador, estado `queued` y un mensaje
- **THEN** la validación tiene éxito y los tres campos quedan disponibles

#### Scenario: Un estado distinto de queued es rechazado

- **WHEN** se construye una respuesta de escaneo con un estado distinto de `queued` (por ejemplo `running`, `done` o `failed`)
- **THEN** la validación falla, porque el contrato admite un único estado

#### Scenario: Faltar cualquiera de los tres campos es un error

- **WHEN** se construye una respuesta de escaneo omitiendo el identificador, o el estado, o el mensaje
- **THEN** la validación falla indicando el campo requerido ausente

### Requirement: El mensaje al orquestador n8n transporta los parámetros validados más el identificador del escaneo

El contrato del mensaje dirigido al orquestador n8n SHALL contener exactamente seis datos: la
URL objetivo, el PHPSESSID, el nivel de SQLMap, el riesgo de SQLMap, el identificador del
escaneo y el correo electrónico del usuario autenticado que lo inició. Los cuatro primeros
SHALL provenir de una solicitud ya validada —el mensaje nunca se construye a partir de entrada
cruda—, el identificador SHALL ser generado por el Bridge, y el correo electrónico SHALL
provenir de la identidad autenticada del solicitante, no de la solicitud. Todos los campos
SHALL ser obligatorios: un mensaje sin correo electrónico SHALL ser inválido, del mismo modo
que uno sin identificador. La URL objetivo SHALL viajar como texto plano serializable, no como
un objeto de URL, y el correo electrónico SHALL viajar igualmente como texto plano, de modo
que el mensaje pueda serializarse a JSON sin transformación adicional en el momento del envío.
(RN-WS-07, RN-WS-16, HU-03-05, HU-04-03)

#### Scenario: Mensaje completo es válido

- **WHEN** se construye un mensaje para el orquestador con URL objetivo, PHPSESSID, nivel,
  riesgo, identificador de escaneo y correo electrónico del usuario
- **THEN** la validación tiene éxito

#### Scenario: El mensaje se serializa a JSON sin transformación adicional

- **WHEN** un mensaje para el orquestador válido se serializa a JSON
- **THEN** el resultado contiene exactamente las seis claves del contrato, con la URL objetivo
  y el correo electrónico como cadenas de texto, listo para enviarse como cuerpo de la
  solicitud al webhook

#### Scenario: Falta el identificador del escaneo

- **WHEN** se construye un mensaje para el orquestador sin identificador de escaneo
- **THEN** la validación falla indicando que el campo es requerido

#### Scenario: Falta el correo electrónico del usuario

- **WHEN** se construye un mensaje para el orquestador sin el correo electrónico del usuario
- **THEN** la validación falla indicando que el campo es requerido

#### Scenario: El mensaje se deriva de una solicitud validada

- **WHEN** se construye un mensaje para el orquestador a partir de una solicitud de escaneo ya
  validada, de un identificador generado y de la identidad autenticada del solicitante
- **THEN** los cuatro parámetros del mensaje coinciden con los valores validados de la
  solicitud, incluidos los valores por defecto aplicados y el PHPSESSID ya sin espacios en los
  extremos, y el correo electrónico coincide con el de la identidad autenticada
