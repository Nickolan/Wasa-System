# auth-wall Specification

## Purpose
Define la puerta que separa al visitante anónimo del formulario de escaneo: qué ve en su lugar, la garantía de que ningún campo del formulario existe en el documento sin sesión, qué aparece al haberla y qué ocurre al cerrar sesión.

## Requirements

### Requirement: Sin sesión, el formulario de escaneo no existe en el documento

Mientras no haya sesión activa, la sección del formulario de escaneo SHALL renderizar un muro de autenticación en lugar del formulario.

Ningún campo del formulario de escaneo —el objetivo, el identificador de sesión de la aplicación evaluada, los parámetros numéricos, la declaración ética ni el botón de envío— SHALL existir en el documento mientras no haya sesión. La ocultación SHALL ser por ausencia del elemento, no por estilo: SHALL NOT bastar con esconderlo visualmente, deshabilitarlo ni desplazarlo fuera de la vista.

#### Scenario: El muro reemplaza al formulario

- **WHEN** se renderiza la Landing sin sesión activa
- **THEN** la sección del formulario muestra el muro de autenticación y no muestra el formulario

#### Scenario: Ningún campo del formulario está en el documento

- **WHEN** se buscan en el documento los campos del formulario de escaneo sin sesión activa
- **THEN** no existe ninguno de ellos

#### Scenario: El botón de envío tampoco existe

- **WHEN** se busca el control que dispara el escaneo sin sesión activa
- **THEN** no existe en el documento

#### Scenario: No hay campos escondidos por estilo

- **WHEN** se inspecciona la sección del formulario sin sesión activa
- **THEN** no hay campos del formulario presentes en el documento marcados como ocultos, deshabilitados o desplazados fuera de la vista

---

### Requirement: El muro ofrece las dos vías de entrada y explica por qué está ahí

El muro SHALL exponer exactamente dos acciones: iniciar sesión y crear una cuenta, con rótulos que las distingan sin ambigüedad.

El muro SHALL explicar en texto por qué el formulario no está disponible, en lugar de mostrar sólo dos botones sin contexto.

Cada acción SHALL abrir el modal correspondiente y SHALL NOT navegar fuera de la página ni recargar el documento.

#### Scenario: Las dos acciones están presentes

- **WHEN** se renderiza el muro
- **THEN** existen una acción de inicio de sesión y una acción de creación de cuenta

#### Scenario: El muro explica su motivo

- **WHEN** se lee el muro
- **THEN** incluye un texto que explica que el formulario requiere una sesión activa

#### Scenario: Iniciar sesión abre su modal

- **WHEN** el visitante activa la acción de iniciar sesión del muro
- **THEN** se abre el modal de inicio de sesión y no se abre el de registro

#### Scenario: Crear cuenta abre su modal

- **WHEN** el visitante activa la acción de crear cuenta del muro
- **THEN** se abre el modal de registro y no se abre el de inicio de sesión

---

### Requirement: Con sesión, la sección muestra el formulario y la salida de la sesión

Al haber sesión activa, la sección del formulario SHALL renderizar el formulario de escaneo ya existente, sin redefinir sus campos, su validación ni sus mensajes, y SHALL NOT renderizar el muro.

En ese estado SHALL renderizarse también un control visible de cierre de sesión. Ese control SHALL NOT existir mientras no haya sesión.

La sección SHALL exponer su ancla de desplazamiento en **ambos** estados, para que el destino del llamado a la acción de la presentación no dependa de la sesión.

#### Scenario: El formulario aparece al haber sesión

- **WHEN** se renderiza la Landing con sesión activa
- **THEN** los campos del formulario de escaneo están en el documento y el muro no

#### Scenario: El cierre de sesión sólo existe con sesión

- **WHEN** se compara la sección con y sin sesión activa
- **THEN** el control de cierre de sesión existe únicamente en el estado con sesión

#### Scenario: El ancla no depende de la sesión

- **WHEN** se busca el ancla de la sección con sesión y sin ella
- **THEN** existe en los dos casos

---

### Requirement: La transición entre estados es reactiva y no requiere recargar

Al establecerse la sesión, la sección SHALL pasar del muro al formulario sin recarga ni navegación, en la misma vista.

Al cerrarse la sesión, la sección SHALL volver al muro sin recarga ni navegación, y los campos del formulario SHALL desaparecer del documento.

El control de cierre de sesión SHALL invocar el cierre de sesión del estado de sesión del cliente y SHALL NOT emitir petición alguna al servidor.

#### Scenario: Autenticarse revela el formulario

- **WHEN** un visitante sin sesión completa exitosamente un inicio de sesión o un registro
- **THEN** la sección pasa a mostrar el formulario de escaneo, sin recargar el documento

#### Scenario: Cerrar sesión devuelve el muro

- **WHEN** un visitante con sesión activa el control de cierre de sesión
- **THEN** la sección vuelve a mostrar el muro y ningún campo del formulario queda en el documento

#### Scenario: El cierre de sesión no habla con el servidor

- **WHEN** se activa el control de cierre de sesión
- **THEN** no se emite ninguna petición de red

#### Scenario: Una sesión restaurada muestra el formulario desde el arranque

- **WHEN** se carga la Landing con una sesión previa aún vigente
- **THEN** la sección muestra el formulario sin que el visitante tenga que autenticarse de nuevo

---

### Requirement: El muro es una barrera de presentación, no el control de autorización

La ocultación del formulario SHALL entenderse como una medida de interfaz. La autorización real del escaneo SHALL seguir siendo la del servidor, que rechaza toda solicitud sin credencial válida.

El cliente SHALL NOT tratar la presencia del formulario como prueba de autorización: una sesión expirada o inválida SHALL producir el rechazo del servidor y el retorno del visitante al muro por la vía ya definida para ese rechazo.

#### Scenario: El rechazo de credencial devuelve al muro

- **WHEN** una solicitud de escaneo es rechazada por credencial inválida y la sesión del cliente queda cerrada
- **THEN** la sección vuelve a mostrar el muro de autenticación

#### Scenario: El muro no reemplaza al control del servidor

- **WHEN** se inspecciona la lógica del muro
- **THEN** no concede ni asume permiso alguno por sí misma: sólo decide qué se renderiza
