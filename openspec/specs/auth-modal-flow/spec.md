# auth-modal-flow Specification

## Purpose
Define cómo se orquestan los dos modales de autenticación de la Landing: cuántos pueden estar abiertos a la vez, cómo se alternan entre sí, qué los cierra y en qué estado queda un formulario que se vuelve a abrir.

## Requirements

### Requirement: Como máximo hay un modal de autenticación abierto

El estado de los modales de autenticación SHALL admitir exactamente tres situaciones: ninguno abierto, el de inicio de sesión abierto, o el de registro abierto. La situación "los dos abiertos" SHALL ser irrepresentable, no meramente evitada por convención.

El estado SHALL vivir en un único lugar, compartido por todos los disparadores de la Landing: abrir un modal desde la presentación y abrirlo desde el muro de autenticación SHALL actuar sobre el mismo estado, no sobre dos copias.

Al arrancar la página SHALL NO haber ningún modal abierto.

#### Scenario: Al cargar no hay modal abierto

- **WHEN** se renderiza la Landing
- **THEN** no hay ningún diálogo de autenticación en el documento

#### Scenario: Abrir uno no deja abierto al otro

- **WHEN** se abre el modal de registro estando abierto el de inicio de sesión
- **THEN** hay exactamente un diálogo en el documento, el de registro

#### Scenario: Los disparadores comparten el mismo estado

- **WHEN** se abre el modal de inicio de sesión desde el llamado a la acción de la presentación y luego se cierra desde el propio modal
- **THEN** la acción de iniciar sesión del muro vuelve a abrirlo, sin quedar ningún diálogo residual de la apertura anterior

#### Scenario: Sólo un diálogo a la vez, sea cual sea el orden de apertura

- **WHEN** se alternan aperturas de inicio de sesión y de registro en cualquier orden
- **THEN** en todo momento hay a lo sumo un diálogo en el documento

---

### Requirement: Cada modal hospeda el formulario existente sin reimplementarlo

El modal de inicio de sesión SHALL hospedar el formulario de inicio de sesión ya existente, y el de registro el formulario de registro ya existente. Ninguno de los dos SHALL redefinir campos, validación, mensajes de error ni estado de envío: eso pertenece a los formularios.

Cada modal SHALL recibir su visibilidad y su cierre desde afuera y SHALL NOT gestionar su propia visibilidad.

Cada modal SHALL tener un título accesible que lo identifique.

#### Scenario: El modal de inicio de sesión muestra su formulario

- **WHEN** se abre el modal de inicio de sesión
- **THEN** aparecen los campos del formulario de inicio de sesión, tal como los define ese formulario

#### Scenario: El modal de registro muestra su formulario

- **WHEN** se abre el modal de registro
- **THEN** aparecen los campos del formulario de registro, incluida la confirmación de contraseña

#### Scenario: Los modales no redefinen la validación

- **WHEN** se envía un formulario inválido desde dentro de un modal
- **THEN** los mensajes son los del propio formulario y no se emite ninguna petición

#### Scenario: Cada diálogo tiene nombre accesible

- **WHEN** se abre cualquiera de los dos modales
- **THEN** el diálogo tiene un nombre accesible que lo distingue del otro

---

### Requirement: Los enlaces de cada formulario alternan entre los dos modales

El enlace de "no tengo cuenta" del formulario de inicio de sesión SHALL cerrar ese modal y abrir el de registro, en una sola acción del usuario.

El enlace de "ya tengo cuenta" del formulario de registro SHALL cerrar ese modal y abrir el de inicio de sesión, en una sola acción del usuario.

Alternar SHALL NOT devolver al usuario a la página intermedia ni requerir que cierre un modal antes de abrir el otro.

#### Scenario: De inicio de sesión a registro

- **WHEN** el usuario activa el enlace de registro dentro del modal de inicio de sesión
- **THEN** queda abierto el modal de registro y el de inicio de sesión ya no está en el documento

#### Scenario: De registro a inicio de sesión

- **WHEN** el usuario activa el enlace de inicio de sesión dentro del modal de registro
- **THEN** queda abierto el modal de inicio de sesión y el de registro ya no está en el documento

#### Scenario: Alternar de ida y vuelta

- **WHEN** el usuario alterna de inicio de sesión a registro y vuelve a inicio de sesión
- **THEN** hay exactamente un diálogo abierto, el de inicio de sesión

---

### Requirement: La autenticación exitosa cierra el modal

Cuando un formulario alojado en un modal completa exitosamente su flujo, el modal SHALL cerrarse.

El cierre SHALL ocurrir después de que la sesión quede establecida, nunca antes: en el instante en que el modal desaparece, la sesión SHALL figurar ya autenticada.

Tras el cierre, el estado de los modales SHALL quedar en "ninguno abierto", y SHALL NOT abrirse ningún otro modal como consecuencia del éxito.

#### Scenario: El inicio de sesión exitoso cierra el modal

- **WHEN** el formulario de inicio de sesión completa exitosamente
- **THEN** el diálogo desaparece del documento

#### Scenario: El registro exitoso cierra el modal

- **WHEN** el formulario de registro completa exitosamente
- **THEN** el diálogo desaparece del documento y no se abre el de inicio de sesión

#### Scenario: La sesión ya está establecida cuando el modal se cierra

- **WHEN** cualquiera de los dos formularios completa exitosamente
- **THEN** en el momento en que el diálogo desaparece, la sesión ya figura autenticada

#### Scenario: El éxito revela el formulario de escaneo

- **WHEN** el usuario se autentica desde un modal abierto desde el muro
- **THEN** el modal se cierra y la sección del formulario de escaneo pasa a mostrar el formulario

#### Scenario: El éxito desplaza la vista al formulario de escaneo

- **WHEN** cualquiera de los dos formularios completa exitosamente, sin importar desde qué disparador se abrió el modal
- **THEN** además de cerrarse el diálogo, la vista se desplaza hasta la sección del formulario de escaneo recién revelado

---

### Requirement: El usuario puede abandonar el modal sin autenticarse

Cada modal SHALL poder cerrarse sin completar el formulario, por las vías que ya ofrece el contenedor de diálogo compartido: la tecla `Escape` y el clic en el backdrop.

Cerrar sin autenticarse SHALL dejar el estado de sesión intacto y SHALL NOT emitir petición alguna.

Cerrar SHALL devolver el estado de los modales a "ninguno abierto", nunca al otro modal.

#### Scenario: Escape cierra el modal

- **WHEN** el usuario presiona `Escape` con un modal de autenticación abierto
- **THEN** el diálogo desaparece del documento

#### Scenario: El clic en el backdrop cierra el modal

- **WHEN** el usuario hace clic en el backdrop del modal
- **THEN** el diálogo desaparece del documento

#### Scenario: Un clic dentro del formulario no cierra el modal

- **WHEN** el usuario hace clic sobre un campo del formulario dentro del diálogo
- **THEN** el diálogo sigue abierto

#### Scenario: Abandonar no toca la sesión

- **WHEN** el usuario cierra el modal sin completar el formulario
- **THEN** la sesión sigue como estaba y no se emitió ninguna petición

---

### Requirement: Un modal reabierto empieza limpio

Al cerrarse, el contenido del modal SHALL desmontarse, no ocultarse.

En consecuencia, al reabrir un modal el formulario SHALL presentarse en su estado inicial: sin valores previos, sin errores de validación y sin el mensaje de error del servidor de un intento anterior.

Lo mismo SHALL valer al alternar entre modales: el formulario que aparece SHALL estar en su estado inicial.

#### Scenario: Los valores tipeados no sobreviven al cierre

- **WHEN** el usuario escribe en un campo, cierra el modal y lo vuelve a abrir
- **THEN** el campo está vacío

#### Scenario: El error del servidor no sobrevive al cierre

- **WHEN** un intento anterior dejó un mensaje de error del servidor, el usuario cierra el modal y lo vuelve a abrir
- **THEN** no hay ningún mensaje de error visible

#### Scenario: Al alternar, el otro formulario aparece limpio

- **WHEN** el usuario escribe en el formulario de inicio de sesión y alterna al de registro
- **THEN** el formulario de registro aparece con todos sus campos vacíos

#### Scenario: Nada del modal cerrado queda en el documento

- **WHEN** el modal se cierra
- **THEN** ningún campo del formulario que hospedaba permanece en el documento
