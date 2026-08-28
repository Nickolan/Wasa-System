## ADDED Requirements

### Requirement: El disparo de escaneo reenvía a la iniciación la identidad autenticada del solicitante

La operación de disparo de escaneo SHALL trasladar a la iniciación la identidad autenticada
que ya resolvió al validar la credencial del solicitante, en lugar de descartarla. Esa
identidad SHALL provenir exclusivamente del mecanismo de autenticación de la operación y SHALL
NOT leerse del cuerpo de la solicitud, de un parámetro de consulta ni de ninguna cabecera
distinta de la credencial. El borde HTTP SHALL limitarse a trasladarla: SHALL NOT validarla,
normalizarla, completarla ni reemplazarla, y SHALL NOT exponerla en la respuesta de
aceptación. Una solicitud que no supera el guard de credencial SHALL NOT alcanzar la
iniciación, ni con identidad ni sin ella. (RN-WS-11, RN-WS-16, HU-04-03)

#### Scenario: La iniciación recibe la identidad de quien disparó el escaneo

- **WHEN** un usuario autenticado dispara un escaneo válido
- **THEN** la iniciación es invocada con la solicitud validada y con la identidad autenticada
  de ese usuario

#### Scenario: Dos usuarios distintos producen dos iniciaciones con identidades distintas

- **WHEN** dos usuarios autenticados distintos disparan escaneos con cuerpos idénticos
- **THEN** cada invocación de la iniciación recibe la identidad de su propio solicitante

#### Scenario: La identidad no proviene del cuerpo de la solicitud

- **WHEN** un usuario autenticado dispara un escaneo cuyo cuerpo incluye un campo que pretende
  fijar la identidad o el destinatario
- **THEN** la iniciación recibe la identidad resuelta desde la credencial, y el valor propuesto
  en el cuerpo no llega a la iniciación

#### Scenario: Una solicitud sin credencial válida no llega a la iniciación

- **WHEN** se dispara un escaneo sin credencial, con una credencial vencida o con una
  credencial inválida
- **THEN** la respuesta es `401` y la iniciación no es invocada

#### Scenario: La confirmación de aceptación no expone la identidad

- **WHEN** un usuario autenticado dispara un escaneo válido y recibe la confirmación de
  aceptación
- **THEN** el cuerpo de la confirmación contiene únicamente el identificador del escaneo, el
  estado y el mensaje: no incluye el correo ni ningún otro dato de identidad
