# auth-form-flows Specification

## Purpose
TBD - created by archiving change feature-auth. Update Purpose after archive.
## Requirements
### Requirement: La validación local es la puerta previa a la red

Ambos formularios SHALL validar sus campos con los schemas de la entidad usuario ya existentes —el de inicio de sesión y el de registro— antes de emitir petición alguna. Los schemas SHALL reutilizarse tal como están: ningún formulario SHALL redefinir el formato de email, el mínimo de contraseña, el techo de bytes ni la comparación de confirmación.

Mientras algún campo sea inválido, SHALL NOT emitirse ninguna petición al Bridge.

El mensaje de cada campo inválido SHALL mostrarse asociado a ese campo, no como error global.

#### Scenario: Contraseña demasiado corta en el registro

- **WHEN** el usuario envía el formulario de registro con una contraseña de menos de 8 caracteres
- **THEN** aparece el mensaje de error asociado al campo de contraseña y no se emite ninguna petición al Bridge

#### Scenario: Confirmación de contraseña distinta

- **WHEN** el usuario envía el formulario de registro con una confirmación que no coincide con la contraseña
- **THEN** aparece el mensaje de error asociado al campo de confirmación y no se emite ninguna petición al Bridge

#### Scenario: Email malformado

- **WHEN** el usuario envía cualquiera de los dos formularios con un email que no tiene forma de email
- **THEN** aparece el mensaje de error asociado al campo de email y no se emite ninguna petición al Bridge

#### Scenario: Un formulario válido sí llega a la red

- **WHEN** el usuario envía un formulario cuyos campos satisfacen su schema
- **THEN** se emite la petición correspondiente al Bridge

---

### Requirement: El inicio de sesión exitoso establece la sesión y avisa a su contenedor

Ante una respuesta exitosa del Bridge, ambos flujos SHALL establecer la sesión invocando la acción de inicio de sesión del store de sesión con el token recibido y el email del usuario, y SHALL invocar a continuación la devolución de llamada de éxito que recibieron de su contenedor.

El orden SHALL ser ese y no el inverso: la sesión SHALL quedar establecida antes de avisar al contenedor, porque ese aviso es lo que cierra el contenedor y desmonta el formulario.

El email que se guarda en la sesión SHALL ser el que produjo la validación —ya normalizado por el schema—, no el texto crudo del campo.

#### Scenario: Inicio de sesión exitoso

- **WHEN** el Bridge responde exitosamente a un inicio de sesión
- **THEN** la sesión queda autenticada con el token recibido

#### Scenario: Registro exitoso

- **WHEN** el Bridge responde exitosamente a un registro
- **THEN** la sesión queda autenticada con el token recibido, sin requerir un inicio de sesión posterior

#### Scenario: El contenedor recibe el aviso de éxito

- **WHEN** cualquiera de los dos flujos completa exitosamente
- **THEN** se invoca la devolución de llamada de éxito provista por el contenedor, exactamente una vez

#### Scenario: La sesión ya está establecida cuando se avisa al contenedor

- **WHEN** cualquiera de los dos flujos completa exitosamente
- **THEN** en el instante en que se invoca la devolución de llamada de éxito, la sesión ya figura autenticada

#### Scenario: Se guarda el email normalizado

- **WHEN** el usuario ingresa un email con espacios al principio o al final y el flujo completa exitosamente
- **THEN** el email guardado en la sesión es el normalizado, sin esos espacios

---

### Requirement: Cada clase de fallo del servidor produce un mensaje fijo decidido por el cliente

Ante un fallo del Bridge, ambos flujos SHALL exponer un mensaje de error de servidor, visible en el formulario y distinto de los errores por campo.

El mensaje SHALL determinarse por el código de estado y por la operación:

- Inicio de sesión con `401`: `Credenciales incorrectas.`
- Registro con `409`: `Este email ya está registrado.`
- Cualquier otro fallo —incluidos `400`, `422`, `500`, `502`, la red caída y el tiempo de espera agotado—: un único mensaje genérico, declarado una sola vez y compartido por ambos flujos.

El contenido del cuerpo de error del Bridge SHALL NOT mostrarse al usuario: los mensajes visibles son literales del cliente. El cuerpo recibido puede conservarse en el error para diagnóstico, pero no se renderiza.

Ante un fallo, la sesión SHALL permanecer sin establecer y la devolución de llamada de éxito SHALL NOT invocarse.

#### Scenario: Credenciales incorrectas

- **WHEN** el Bridge responde `401` a un inicio de sesión
- **THEN** el formulario muestra `Credenciales incorrectas.`, la sesión no queda autenticada y no se avisa al contenedor

#### Scenario: Email ya registrado

- **WHEN** el Bridge responde `409` a un registro
- **THEN** el formulario muestra `Este email ya está registrado.`, la sesión no queda autenticada y no se avisa al contenedor

#### Scenario: Fallo genérico del servidor

- **WHEN** el Bridge responde `500` a cualquiera de las dos operaciones
- **THEN** el formulario muestra el mensaje genérico de fallo, y no un texto derivado de la respuesta del servidor

#### Scenario: Fallo de red

- **WHEN** la petición falla sin obtener respuesta del servidor
- **THEN** el formulario muestra el mismo mensaje genérico de fallo

#### Scenario: El detalle del servidor no se filtra a la interfaz

- **WHEN** el Bridge responde un error cuyo cuerpo trae un detalle descriptivo
- **THEN** ese detalle no aparece en ninguna parte de lo que ve el usuario

#### Scenario: Un código de estado sin lectura en la operación cae al genérico

- **WHEN** el Bridge responde `409` a un inicio de sesión, o `401` a un registro
- **THEN** el formulario muestra el mensaje genérico de fallo, no el mensaje de la otra operación

---

### Requirement: El estado de envío es único, se refleja en el botón e impide el doble envío

Cada flujo SHALL exponer un único estado de envío en curso, derivado del estado del formulario y no de una bandera propia mantenida en paralelo.

Mientras ese estado esté activo, el botón de envío SHALL mostrar el indicador de carga y SHALL estar deshabilitado, de modo que un segundo envío sea imposible a nivel del documento y no por convención.

Dos activaciones consecutivas del botón durante un envío en curso SHALL producir exactamente una petición al Bridge.

Al terminar el envío —con éxito o con fallo— el estado SHALL desactivarse.

#### Scenario: El botón muestra carga durante el envío

- **WHEN** hay un envío en curso
- **THEN** el botón de envío muestra el indicador de carga y está deshabilitado

#### Scenario: Doble activación produce una sola petición

- **WHEN** el usuario activa el botón de envío dos veces seguidas mientras la primera petición sigue en curso
- **THEN** se emite exactamente una petición al Bridge

#### Scenario: El estado se libera tras un fallo

- **WHEN** un envío termina con un fallo del servidor
- **THEN** el estado de envío se desactiva y el botón vuelve a estar habilitado

---

### Requirement: El error de servidor anterior se limpia al comenzar un envío nuevo

Al iniciar un envío, el mensaje de error de servidor del intento anterior SHALL borrarse antes de emitir la petición.

En ningún momento SHALL coexistir el indicador de carga del intento en curso con el mensaje de fallo del intento anterior.

#### Scenario: Un segundo intento parte sin el error del primero

- **WHEN** un primer envío falla y el usuario corrige el formulario y envía de nuevo
- **THEN** el mensaje de error del primer intento desaparece al comenzar el segundo

---

### Requirement: Los formularios renderizan sus campos con los primitivos compartidos y no crean primitivos propios

El formulario de inicio de sesión SHALL renderizar un campo de email y uno de contraseña, y un botón de envío rotulado `Ingresar`.

El formulario de registro SHALL renderizar un campo de email, uno de contraseña y uno de confirmación de contraseña, y un botón de envío rotulado `Registrarme`.

Ambos SHALL construir esos controles con los primitivos de la capa `shared` ya existentes —el campo de entrada con etiqueta y mensaje de error, y el botón con estado de carga—, sin definir controles propios equivalentes.

Los campos de contraseña SHALL ocultar lo que se escribe.

Cada campo SHALL tener una etiqueta asociada, de modo que sea localizable por su nombre accesible.

#### Scenario: Campos del formulario de inicio de sesión

- **WHEN** se renderiza el formulario de inicio de sesión
- **THEN** existen un campo de email y un campo de contraseña, cada uno localizable por su etiqueta, y un botón rotulado `Ingresar`

#### Scenario: Campos del formulario de registro

- **WHEN** se renderiza el formulario de registro
- **THEN** existen un campo de email, uno de contraseña y uno de confirmación de contraseña, cada uno localizable por su etiqueta, y un botón rotulado `Registrarme`

#### Scenario: Las contraseñas no se muestran en pantalla

- **WHEN** se renderiza cualquiera de los dos formularios
- **THEN** todos sus campos de contraseña ocultan el texto ingresado

#### Scenario: No se introducen primitivos nuevos

- **WHEN** se inspecciona el código de los dos formularios
- **THEN** los controles de entrada y el botón provienen de los primitivos de `shared/ui`, y la slice no define componentes equivalentes propios

---

### Requirement: Los formularios ignoran cómo están contenidos y ofrecen el cambio al otro flujo por devolución de llamada

Ninguno de los dos formularios SHALL conocer el contenedor que lo monta: SHALL NOT importar el primitivo de diálogo, SHALL NOT cerrarlo, y SHALL NOT decidir navegación.

El formulario de inicio de sesión SHALL ofrecer un control rotulado con la invitación a registrarse, y el de registro un control rotulado con la invitación a iniciar sesión. Cada uno SHALL limitarse a invocar la devolución de llamada de cambio provista por su contenedor.

Esos controles SHALL ser botones, no enlaces: no navegan a ninguna dirección, y un enlace sin destino real es un enlace roto para una tecnología de asistencia.

Ninguno de los dos formularios SHALL enviarse cuando el usuario active el control de cambio.

#### Scenario: El formulario de inicio de sesión ofrece ir al registro

- **WHEN** el usuario activa el control que invita a registrarse desde el formulario de inicio de sesión
- **THEN** se invoca la devolución de llamada de cambio hacia el registro, y no se emite ninguna petición al Bridge

#### Scenario: El formulario de registro ofrece ir al inicio de sesión

- **WHEN** el usuario activa el control que invita a iniciar sesión desde el formulario de registro
- **THEN** se invoca la devolución de llamada de cambio hacia el inicio de sesión, y no se emite ninguna petición al Bridge

#### Scenario: Los formularios no conocen el diálogo que los contiene

- **WHEN** se inspeccionan los imports de los dos formularios
- **THEN** ninguno importa el primitivo de diálogo de `shared/ui`

---

### Requirement: La slice de autenticación respeta la dirección de capas y expone una única API pública

Todos los archivos de la slice de autenticación SHALL residir bajo la capa `features` y SHALL NOT importar de ninguna capa anterior en la dirección `app → pages → widgets → features → entities → shared`.

La slice SHALL exponer una API pública única desde la cual sus consumidores importan los dos formularios; ningún consumidor SHALL importar una ruta interna de la slice.

El proyecto SHALL compilar sin errores de TypeScript con la slice incorporada.

#### Scenario: Ningún archivo de la slice cruza hacia una capa anterior

- **WHEN** se recorren los imports de todos los archivos de la slice de autenticación
- **THEN** ninguno resuelve a una capa anterior a `features`, ni por alias ni por ruta relativa

#### Scenario: Los formularios se importan desde la API pública de la slice

- **WHEN** un consumidor necesita los formularios de inicio de sesión y de registro
- **THEN** ambos están disponibles desde la API pública de la slice de autenticación

#### Scenario: El proyecto compila

- **WHEN** se ejecuta la construcción del frontend
- **THEN** el comando termina con código de salida `0` y sin errores de TypeScript

