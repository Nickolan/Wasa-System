## MODIFIED Requirements

### Requirement: Durante el envío el formulario está en curso y no admite un segundo disparo

Mientras una solicitud está en vuelo, el formulario SHALL exhibir su estado de carga en el control de envío y SHALL impedir un segundo envío, de modo que un doble clic produzca **una sola** solicitud (HU-05-02). El impedimento SHALL estar en el estado del control —deshabilitado mientras dura el envío—, y no confiado a que el usuario no haga clic dos veces.

Al terminar el envío con un rechazo, el estado de carga SHALL levantarse y el formulario SHALL volver a ser enviable, con los valores que el usuario ya había cargado intactos.

Tras una aceptación, el escaneo SHALL NOT poder volver a dispararse. El impedimento SHALL ser doble y en ese orden: el formulario deja de estar presente en la interfaz, porque la pantalla de espera lo reemplaza (`scan-pending-screen`), y el propio envío SHALL rechazar cualquier disparo posterior aunque se lo invoque, de modo que la garantía no dependa de qué se esté renderizando.

#### Scenario: Un doble clic produce una sola solicitud

- **WHEN** se dispara el envío dos veces seguidas antes de que la primera solicitud responda
- **THEN** se emite exactamente una solicitud al Bridge

#### Scenario: Estado de carga visible

- **WHEN** hay una solicitud en vuelo
- **THEN** el control de envío exhibe su estado de carga y está deshabilitado

#### Scenario: El rechazo devuelve el formulario a estado enviable

- **WHEN** el envío es rechazado y el usuario corrige lo que corresponda
- **THEN** el control de envío vuelve a estar habilitado y los valores previamente cargados siguen en los campos

#### Scenario: Tras la aceptación no hay segundo disparo

- **WHEN** el escaneo fue aceptado y se vuelve a invocar el envío
- **THEN** no se emite ninguna solicitud nueva al Bridge

## REMOVED Requirements

### Requirement: Un escaneo encolado lleva al Dashboard

**Reason**: El escaneo tarda del orden de diez minutos y, desde CHANGE-23, el reporte de resultados llega por correo electrónico a la casilla del usuario autenticado. Expulsar el navegador a un Dashboard standalone en el que, durante esos minutos, no hay nada que ver —y sin decirle al usuario cuánto falta ni por dónde va a llegar el resultado— dejó de describir el sistema real: la redirección resuelve un problema que ya no existe y crea otro (el usuario pierde el contexto de la aplicación que estaba usando).

**Migration**: El comportamiento posterior a la aceptación queda definido por la capability `scan-pending-screen`: el formulario es reemplazado, dentro de la misma página, por una pantalla de espera persistente que informa que el escaneo está en curso, su duración estimada y que el reporte llega por email, y que ofrece al usuario un camino de vuelta al resto de la aplicación. La garantía de que ningún rechazo ni fallo de red navega se conserva bajo la forma más fuerte de que **ninguna** respuesta —aceptación incluida— navega: ver el requirement "La pantalla de espera es persistente y no expulsa al usuario" de `scan-pending-screen`.

El Dashboard sigue siendo alcanzable por la entrada correspondiente de la barra de navegación, y la variable de entorno que lo configura sigue vigente y sigue siendo obligatoria: este change no la da de baja.
