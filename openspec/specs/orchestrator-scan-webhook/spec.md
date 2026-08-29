## ADDED Requirements

### Requirement: El orquestador expone una puerta de entrada de escaneo por webhook

El orquestador n8n SHALL exponer una operación de disparo de escaneo alcanzable por red en la ruta `POST /webhook/wasa-scan`. La operación SHALL aceptar el cuerpo del escaneo definido por `scan-payload-contract` y serializado como JSON por `scan-forwarding`. Esta entrada por webhook SHALL ser el disparador activo del workflow WASA: el disparo por evento reemplaza al disparo periódico previo. La ruta y el verbo SHALL coincidir exactamente con el destino que el Bridge tiene configurado en `N8N_WEBHOOK_URL`, de modo que la entrega del Bridge llegue sin reescritura de ruta. (HU-04-01, RN-WS-07)

#### Scenario: La ruta del webhook existe y acepta POST

- **WHEN** se envía un `POST` a `/webhook/wasa-scan` con credencial válida y un cuerpo de escaneo válido
- **THEN** el orquestador acepta la solicitud y dispara el workflow, en lugar de responder "no encontrado"

#### Scenario: Sólo el verbo POST dispara el escaneo

- **WHEN** se invoca la ruta del webhook con un método distinto de `POST` (por ejemplo `GET`)
- **THEN** la solicitud no dispara el workflow de escaneo

#### Scenario: La ruta configurada en el Bridge coincide con la ruta del webhook

- **WHEN** se compara el destino declarado en `N8N_WEBHOOK_URL` del Bridge con la ruta que expone el Webhook Trigger
- **THEN** son la misma ruta y verbo, de modo que la entrega llega sin necesidad de redirección ni reescritura

### Requirement: La puerta de entrada está cerrada a quien no presenta el token de webhook

La operación de webhook SHALL exigir la credencial `X-WASA-TOKEN` en la cabecera de la solicitud, con el valor secreto que comparte con el Bridge. Una solicitud sin ese header, o con un valor distinto del esperado, SHALL rechazarse con status `403` y SHALL NOT disparar el workflow ni ejecutar ningún nodo downstream. El secreto de la credencial SHALL gestionarse mediante el credential manager del orquestador y SHALL NOT estar embebido en los parámetros del nodo ni en el cuerpo de ninguna solicitud. (HU-04-01, RN-WS-07)

#### Scenario: Sin el header de credencial

- **WHEN** se envía un `POST` a `/webhook/wasa-scan` con un cuerpo válido pero sin el header `X-WASA-TOKEN`
- **THEN** la respuesta es `403` y el workflow no se dispara

#### Scenario: Con un token incorrecto

- **WHEN** se envía un `POST` a `/webhook/wasa-scan` con el header `X-WASA-TOKEN` presente pero con un valor distinto del configurado
- **THEN** la respuesta es `403` y el workflow no se dispara

#### Scenario: Con el token correcto

- **WHEN** se envía un `POST` a `/webhook/wasa-scan` con el header `X-WASA-TOKEN` cuyo valor coincide con el secreto configurado, y un cuerpo válido
- **THEN** la solicitud es aceptada y el workflow se dispara

#### Scenario: El secreto no está embebido en la configuración del nodo

- **WHEN** se inspecciona la definición del nodo Webhook Trigger
- **THEN** el valor del token se resuelve desde el credential manager del orquestador y no aparece en claro en los parámetros del nodo

### Requirement: La solicitud aceptada recibe confirmación inmediata, no el resultado del escaneo

Cuando la solicitud presenta la credencial válida, la operación de webhook SHALL responder de inmediato con status `200 OK` (modo *Respond Immediately*), antes de que el workflow termine de ejecutarse. El escaneo SHALL ejecutarse en background: la respuesta confirma que el disparo fue aceptado y encolado, no que el escaneo haya terminado ni que haya encontrado algo. La respuesta inmediata SHALL producirse dentro de la ventana de espera de 10 segundos que el Bridge impone a la entrega, de modo que una aceptación válida nunca sea interpretada por el Bridge como indisponibilidad del orquestador. (HU-04-01, RN-WS-07, RN-WS-08)

#### Scenario: Respuesta 200 antes de completar el workflow

- **WHEN** se dispara un escaneo válido y autenticado sobre el webhook
- **THEN** el orquestador responde `200` de inmediato, sin esperar a que ZAP, Nuclei, ffuf ni el worker de SQLMap terminen

#### Scenario: El escaneo continúa en background tras la respuesta

- **WHEN** el orquestador ya respondió `200` al Bridge
- **THEN** el workflow sigue ejecutando sus nodos downstream de forma independiente de esa respuesta

#### Scenario: La aceptación llega dentro de la ventana de espera del Bridge

- **WHEN** el Bridge entrega un escaneo válido y espera hasta 10 segundos por la respuesta
- **THEN** el `200` inmediato del webhook llega dentro de esa ventana, y el Bridge lo interpreta como aceptación (`202`), no como indisponibilidad (`502`)

### Requirement: Los campos del escaneo quedan disponibles para los nodos downstream

Los seis campos del cuerpo del escaneo —`target_url`, `phpsessid`, `sqlmap_level`,
`sqlmap_risk`, `scan_id`, `email`— SHALL quedar disponibles como variables del webhook para los
nodos downstream que los consumen. La fuente de estos valores en los nodos downstream SHALL ser
el cuerpo del webhook, reemplazando la fuente que antes proveía el disparador periódico. Cada
campo SHALL llegar sin transformación al nodo que lo consume. La propagación de estos valores
hacia los nodos downstream SHALL ocurrir en un único punto de normalización del flujo, de modo
que agregar un campo nuevo no requiera tocar cada nodo consumidor. (HU-04-02, HU-04-03,
RN-WS-07, RN-WS-16)

#### Scenario: Los nodos de escaneo reciben la URL objetivo y la sesión

- **WHEN** el workflow se dispara con un cuerpo de escaneo válido
- **THEN** la URL objetivo y la sesión están disponibles en los nodos que ejecutan ZAP, Nuclei
  y ffuf

#### Scenario: El encolado de SQLMap recibe nivel y riesgo

- **WHEN** el workflow se dispara con un cuerpo de escaneo válido
- **THEN** el nivel y el riesgo de SQLMap están disponibles en el nodo que hace el LPUSH a
  Redis

#### Scenario: El registro del escaneo recibe su identificador

- **WHEN** el workflow se dispara con un cuerpo de escaneo válido
- **THEN** el identificador del escaneo está disponible en el nodo que registra el escaneo en
  la tabla `scans`

#### Scenario: El envío del reporte recibe el correo del solicitante

- **WHEN** el workflow se dispara con un cuerpo de escaneo válido
- **THEN** el correo del usuario que inició el escaneo está disponible en el nodo que envía el
  reporte, aun cuando ese nodo esté varios pasos downstream del punto de normalización

#### Scenario: La fuente de datos downstream es el webhook, no el disparador periódico

- **WHEN** se inspecciona de dónde toman los nodos downstream sus valores de entrada
- **THEN** los leen del cuerpo del Webhook Trigger, y no de la fuente que proveía el Schedule
  Trigger

#### Scenario: Un cuerpo sin correo no rompe la ejecución del workflow

- **WHEN** el workflow se dispara con un cuerpo de escaneo que no trae el campo de correo (por
  ejemplo, un cliente antiguo o una corrida de prueba)
- **THEN** el flujo continúa con el destinatario de respaldo configurado en el entorno, en vez
  de abortar la ejecución

### Requirement: El reporte del escaneo se envía al correo del usuario que lo inició

Al terminar un escaneo disparado por webhook, el orquestador SHALL enviar el reporte de
vulnerabilidades al correo electrónico que llegó en el cuerpo de ese escaneo. El destinatario
SHALL resolverse por expresión a partir del valor propagado por la normalización del flujo, y
SHALL NOT ser un literal fijo embebido en la configuración del nodo de envío: dos escaneos
disparados por usuarios distintos SHALL producir reportes enviados a casillas distintas. El
contenido del reporte SHALL ser el mismo que hoy se envía; lo único que cambia es a quién se
le envía. (RN-WS-16, HU-04-03, DD-05)

#### Scenario: El reporte llega a la casilla del usuario que disparó el escaneo

- **WHEN** un usuario autenticado dispara un escaneo por webhook y el workflow termina de
  generar el reporte
- **THEN** el reporte se envía a la dirección de correo que ese usuario tiene registrada, la
  misma que viajó en el cuerpo del escaneo

#### Scenario: El destinatario ya no es un literal fijo

- **WHEN** se inspecciona la configuración del nodo que envía el reporte
- **THEN** el destinatario es una expresión que resuelve el correo propagado por el flujo, y no
  una dirección escrita a mano

#### Scenario: Dos usuarios distintos reciben cada uno su propio reporte

- **WHEN** dos usuarios autenticados distintos disparan escaneos sobre el mismo objetivo
- **THEN** cada reporte se envía únicamente a la casilla de su propio solicitante

#### Scenario: Una corrida sin webhook usa el destinatario de respaldo configurado

- **WHEN** el workflow se ejecuta por disparo manual o periódico, sin cuerpo de webhook (las
  corridas de prueba documentadas)
- **THEN** el reporte se envía al destinatario de respaldo tomado de la configuración del
  entorno del orquestador, y la ejecución no falla por falta de destinatario

### Requirement: El disparo periódico queda desactivado en favor del disparo por evento

El nodo Schedule Trigger que disparaba el workflow WASA de forma periódica SHALL quedar desactivado, de modo que el workflow tenga un único disparador activo: el Webhook Trigger. El Schedule Trigger SHALL desactivarse, no eliminarse, para que el cambio sea reversible. Tras el cambio, el workflow SHALL NOT ejecutarse por transcurso de tiempo, sino únicamente al recibir un disparo válido en el webhook. (HU-04-01)

#### Scenario: El Schedule Trigger está inactivo

- **WHEN** se inspecciona el estado del nodo Schedule Trigger del workflow WASA
- **THEN** figura como desactivado, y no dispara ejecuciones por transcurso de tiempo

#### Scenario: El workflow sólo se dispara por webhook

- **WHEN** transcurre el intervalo con el que antes disparaba el Schedule Trigger, sin que llegue ningún webhook
- **THEN** el workflow no se ejecuta: no hay disparo periódico activo

#### Scenario: La desactivación es reversible

- **WHEN** se inspecciona el workflow tras el cambio
- **THEN** el nodo Schedule Trigger sigue presente en el workflow (desactivado), no fue eliminado
