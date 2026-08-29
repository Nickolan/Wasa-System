## ADDED Requirements

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

## MODIFIED Requirements

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
