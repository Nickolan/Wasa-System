## ADDED Requirements

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

## MODIFIED Requirements

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
