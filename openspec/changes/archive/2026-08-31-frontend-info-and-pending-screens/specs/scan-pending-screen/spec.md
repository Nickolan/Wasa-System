## Purpose

Define qué ve y qué puede hacer el usuario en el intervalo que va desde que el Bridge acepta su escaneo hasta que el reporte le llega por email: la confirmación de que el trabajo está en curso, la expectativa temporal, el aviso de por dónde va a llegar el resultado, y la salida que la pantalla le ofrece. Es el destino que reemplaza a la antigua redirección al Dashboard y el último tramo visible del Flujo 3 de la KB para el usuario que dispara un escaneo.

## ADDED Requirements

### Requirement: La aceptación reemplaza el formulario por una pantalla de espera

Cuando el envío del escaneo es aceptado (`202`), la interfaz SHALL dejar de presentar el formulario de escaneo y SHALL presentar en su lugar una pantalla de espera. El reemplazo SHALL ser por ausencia del formulario en la interfaz —no por deshabilitarlo dejándolo a la vista—: una vez aceptado el escaneo, sus campos y su control de envío dejan de ser parte de lo que el usuario ve.

La transición SHALL ocurrir dentro de la misma página, sin navegar el navegador a otra dirección y sin recargar la aplicación.

#### Scenario: El escaneo aceptado muestra la pantalla de espera

- **WHEN** el Bridge acepta el escaneo con `202`
- **THEN** la pantalla de espera es visible

#### Scenario: El formulario desaparece de la interfaz

- **WHEN** el Bridge acepta el escaneo con `202`
- **THEN** los campos del formulario de escaneo y su control de envío ya no están presentes en la interfaz

#### Scenario: Ningún rechazo entra en espera

- **WHEN** el envío es rechazado con `401`, `400`, `422`, `429` o `502`, o falla sin obtener respuesta
- **THEN** la pantalla de espera no aparece y el formulario sigue presente con los valores que el usuario había cargado

### Requirement: La pantalla de espera es persistente y no expulsa al usuario

La pantalla de espera SHALL permanecer visible mientras el usuario no la abandone por su propia acción. SHALL NOT disolverse por el paso del tiempo, SHALL NOT navegar el navegador a otra dirección por su cuenta, y SHALL NOT depender de ningún temporizador para decidir qué se ve.

En particular, ninguna parte del flujo de escaneo SHALL asignar una dirección de navegación al navegador como consecuencia de la aceptación. La dirección del Dashboard configurada en el entorno SHALL NOT ser destino de ninguna navegación automática disparada por un escaneo aceptado.

#### Scenario: El paso del tiempo no cambia la pantalla

- **WHEN** el escaneo fue aceptado y transcurre un tiempo arbitrario sin que el usuario interactúe
- **THEN** la pantalla de espera sigue visible y el navegador no navegó a ninguna dirección

#### Scenario: La aceptación no dispara ninguna navegación automática

- **WHEN** se inspecciona el comportamiento de la aplicación tras una aceptación
- **THEN** no se asigna ninguna dirección de navegación al navegador, ni la del Dashboard configurado ni ninguna otra

### Requirement: La pantalla de espera informa estado, duración estimada y canal de entrega del reporte

La pantalla de espera SHALL comunicar, en español y en texto legible sin abrir la consola del navegador, tres hechos:

1. Que el escaneo **está en curso** y fue aceptado por el sistema —no que terminó, no que falló.
2. Que su duración esperada es de **aproximadamente diez minutos**, expresada como estimación y no como garantía.
3. Que el **reporte de resultados va a llegar por correo electrónico** a la casilla de la cuenta con la que el usuario inició sesión (HU-04-03, RN-WS-16).

El aviso de entrega por email SHALL describir el canal sin prometer un plazo distinto del ya declarado para el escaneo, y SHALL NOT pedirle al usuario que permanezca en la página para recibirlo: el envío no depende de que la pantalla siga abierta.

El identificador del escaneo devuelto por el Bridge MAY mostrarse como referencia. Ningún otro campo crudo de la respuesta —en particular su `message`, que es un registro del orquestador y no texto de interfaz— SHALL presentarse como texto para el usuario.

#### Scenario: Los tres hechos están presentes

- **WHEN** la pantalla de espera es visible
- **THEN** su texto informa que el escaneo está en curso, que tarda aproximadamente diez minutos y que el reporte llega por email a la casilla de la cuenta del usuario

#### Scenario: El texto está en español y no expone el mensaje del orquestador

- **WHEN** se inspecciona el texto de la pantalla de espera
- **THEN** está íntegramente en español y no contiene el `message` crudo de la respuesta del Bridge, ni su `type`, ni su `instance`, ni ninguna traza

#### Scenario: La entrega del reporte no depende de la pantalla

- **WHEN** se inspecciona el texto de la pantalla de espera
- **THEN** no le pide al usuario mantener la página abierta ni esperar sin cerrarla para recibir el reporte

### Requirement: La pantalla de espera es una región de estado accesible

La pantalla de espera SHALL exponerse a las tecnologías asistivas como una región de estado —no como una alerta de error—, de modo que su contenido sea anunciado cuando aparece sin interrumpir al usuario. SHALL tener un nombre accesible propio y un encabezado que la identifique.

Cualquier indicador visual de progreso que acompañe al texto SHALL ser decorativo a efectos de accesibilidad: el estado SHALL ser comprensible por el texto solo, sin depender de la animación.

#### Scenario: La región se anuncia como estado

- **WHEN** la pantalla de espera aparece tras la aceptación
- **THEN** es una región de estado con nombre accesible, y no una alerta

#### Scenario: El estado se entiende sin el indicador visual

- **WHEN** se ignora todo elemento puramente visual de la pantalla de espera
- **THEN** el texto restante sigue comunicando los tres hechos requeridos

### Requirement: La pantalla de espera ofrece al usuario un camino de salida

La pantalla de espera SHALL ofrecer al menos una acción explícita que devuelva al usuario al resto de la aplicación sin obligarlo a usar el botón de retroceso del navegador ni a editar la barra de direcciones. El usuario SHALL NOT quedar en un estado sin salida.

Ninguna de esas acciones SHALL reenviar el escaneo ni disparar una segunda solicitud al Bridge.

#### Scenario: Hay una salida activable

- **WHEN** la pantalla de espera es visible
- **THEN** ofrece al menos una acción de navegación que devuelve al usuario al resto de la aplicación

#### Scenario: Salir no reenvía el escaneo

- **WHEN** el usuario activa la salida ofrecida por la pantalla de espera
- **THEN** no se emite ninguna solicitud nueva al Bridge
