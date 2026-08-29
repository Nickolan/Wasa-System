## ADDED Requirements

### Requirement: La iniciación recibe la identidad autenticada del solicitante y la traslada al orquestador

La iniciación de un escaneo SHALL recibir de su llamador el correo electrónico del usuario
autenticado que pidió el escaneo, como dato separado de la solicitud validada, y SHALL
trasladarlo sin alterar al mensaje que compone para el orquestador. Ese dato SHALL ser
obligatorio: la iniciación SHALL NOT poder ejecutarse sin él, ni SHALL sustituirlo por un
valor por defecto, una cadena vacía ni un destinatario fijo cuando el llamador no lo provee.
La iniciación SHALL NOT tomar ese correo de ningún campo de la solicitud, ni validarlo,
normalizarlo o reinterpretarlo: la solicitud no es su fuente y la iniciación no es la autoridad
que lo establece. (RN-WS-16, HU-04-03, DD-05)

#### Scenario: El correo del solicitante llega intacto al orquestador

- **WHEN** se inicia un escaneo con una solicitud válida y el correo del usuario autenticado
- **THEN** el mensaje entregado al orquestador lleva exactamente ese correo

#### Scenario: Dos usuarios distintos con la misma solicitud producen mensajes con destinatarios distintos

- **WHEN** dos usuarios autenticados distintos inician escaneos con datos de solicitud
  idénticos
- **THEN** cada mensaje entregado al orquestador lleva el correo de su propio solicitante, y
  ninguno lleva el del otro

#### Scenario: Iniciar sin la identidad autenticada no es posible

- **WHEN** se intenta iniciar un escaneo aportando únicamente la solicitud validada, sin el
  correo del usuario autenticado
- **THEN** la iniciación falla en lugar de continuar con un destinatario vacío, inventado o
  fijo

#### Scenario: El correo no se deriva de la solicitud

- **WHEN** se inicia un escaneo cuya solicitud incluyó un campo con apariencia de destinatario
  distinto del correo autenticado
- **THEN** el mensaje entregado al orquestador lleva el correo de la identidad autenticada, y
  el valor propuesto en la solicitud no aparece en ninguna parte del mensaje

## MODIFIED Requirements

### Requirement: El mensaje al orquestador se compone de la solicitud ya validada más el identificador generado

La iniciación de un escaneo SHALL componer el mensaje dirigido al orquestador tomando los
parámetros de la solicitud **ya validada** —URL objetivo, sesión, nivel y riesgo— y
agregándoles el identificador generado y el correo electrónico del usuario autenticado que
recibió de su llamador. Los valores SHALL trasladarse fielmente, incluidos los valores por
defecto que la validación haya aplicado y las normalizaciones que haya realizado sobre ellos;
la iniciación SHALL NOT alterarlos, reinterpretarlos ni sustituirlos. La URL objetivo SHALL
trasladarse como texto plano serializable, según lo exige el contrato del mensaje. La
iniciación SHALL NOT agregar al mensaje ningún dato que no pertenezca al contrato, ni propagar
campos desconocidos recibidos en la solicitud. (RN-WS-07, RN-WS-16, HU-03-04, HU-04-03)

#### Scenario: Los cuatro parámetros de la solicitud llegan intactos al orquestador

- **WHEN** se inicia un escaneo con una solicitud válida
- **THEN** el mensaje entregado al orquestador lleva la URL objetivo, la sesión, el nivel y el
  riesgo con exactamente los valores validados de esa solicitud

#### Scenario: Los valores por defecto aplicados por la validación viajan al orquestador

- **WHEN** se inicia un escaneo con una solicitud que omitió el nivel y el riesgo, y la
  validación aplicó sus valores por defecto
- **THEN** el mensaje entregado al orquestador lleva esos valores por defecto, y no campos
  ausentes ni nulos

#### Scenario: Las normalizaciones de la validación se preservan

- **WHEN** se inicia un escaneo cuya solicitud validada normalizó alguno de sus campos —una
  sesión a la que se le quitaron los espacios de los extremos, una URL objetivo a la que se le
  normalizó la forma—
- **THEN** el mensaje entregado al orquestador lleva la forma normalizada, no la forma cruda
  original

#### Scenario: La URL objetivo viaja como texto

- **WHEN** se inicia un escaneo y el mensaje resultante se serializa para su entrega
- **THEN** la URL objetivo aparece como una cadena de texto, sin requerir ninguna
  transformación adicional en el momento del envío

#### Scenario: El mensaje lleva exactamente los campos del contrato

- **WHEN** se inicia un escaneo a partir de una solicitud que incluye campos desconocidos
- **THEN** el mensaje entregado al orquestador contiene exactamente los seis campos de su
  contrato —los cuatro parámetros, el identificador y el correo del solicitante—, sin ninguno
  de los campos desconocidos y sin agregados propios de la iniciación
