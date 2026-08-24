## ADDED Requirements

### Requirement: El proyecto expone una validación de humo del recorrido completo

El proyecto SHALL contar con una validación de humo (*smoke test*) que ejercite el recorrido de negocio completo —registro de usuario, inicio de sesión y disparo de escaneo— contra la infraestructura viva del sistema: el FastAPI Bridge sirviendo HTTP real, la base PostgreSQL `db_fuzzing` real, el orquestador n8n real y la Landing Page servida como build de producción. La validación SHALL estar compuesta por dos partes complementarias: un suite automatizado que cubre el recorrido HTTP y sus efectos persistidos, y un runbook manual numerado que cubre los pasos de navegador y de interfaz del orquestador. Toda la validación SHALL ser repetible: cualquier operador SHALL poder ejecutarla de nuevo, desde cero, sin depender de estado dejado por una corrida anterior. (Todas las HU; RN-WS-01 a RN-WS-15)

#### Scenario: El recorrido feliz completo queda cubierto de punta a punta

- **WHEN** se ejecuta la validación de humo sobre un sistema sano
- **THEN** queda demostrado, en una sola corrida encadenada, que un usuario nuevo puede registrarse, obtener sesión, enviar un escaneo y que ese escaneo llega efectivamente al orquestador

#### Scenario: La validación es repetible sin limpieza manual previa

- **WHEN** se ejecuta la validación dos veces seguidas sobre el mismo entorno
- **THEN** la segunda corrida arranca limpia y produce el mismo veredicto que la primera, sin que el operador tenga que borrar datos a mano entre ambas

#### Scenario: Ambas partes de la validación existen y se referencian entre sí

- **WHEN** se inspecciona la validación de humo
- **THEN** existe el suite automatizado y existe el runbook manual, y cada uno declara qué criterios cubre y cuáles delega en el otro

### Requirement: La validación de humo está aislada de la suite unitaria

El suite automatizado de humo SHALL ser *opt-in*: SHALL identificarse con un marcador propio y SHALL omitirse (*skip*) por defecto. La ejecución habitual de la suite de tests del proyecto SHALL seguir corriendo únicamente tests unitarios con dobles, sin abrir conexiones a PostgreSQL, sin invocar al orquestador y sin salir a la red. Cuando la infraestructura viva requerida no está disponible o no está configurada, el suite de humo SHALL omitirse con un motivo legible, y SHALL NOT reportarse como fallo. Un rojo del suite de humo SHALL significar siempre "el sistema está roto", nunca "faltaba levantar algo". (RN-WS-07)

#### Scenario: La suite habitual no toca infraestructura viva

- **WHEN** se ejecuta la suite de tests del proyecto sin habilitar explícitamente la validación de humo
- **THEN** los tests de humo se omiten y ningún test abre una conexión a `db_fuzzing`, al orquestador ni a la red externa

#### Scenario: Infraestructura ausente produce omisión, no rojo

- **WHEN** se habilita la validación de humo pero el Bridge, la base o el orquestador no están alcanzables
- **THEN** los tests afectados se omiten indicando cuál dependencia falta, y la corrida no se marca como fallida

#### Scenario: Un rojo señala un defecto real del sistema

- **WHEN** la infraestructura viva está disponible y un test de humo falla
- **THEN** ese fallo corresponde a un comportamiento incorrecto del sistema y no a una condición de entorno

### Requirement: La validación cubre el recorrido de autenticación y su muro

La validación de humo SHALL verificar, sobre el sistema vivo, el comportamiento completo del muro de autenticación y del ciclo de sesión: que la Landing Page carga en menos de 3 segundos; que sin sesión activa el muro de autenticación es visible y el formulario de escaneo NO lo es; que un registro con email nuevo cierra el modal y revela el formulario de escaneo; que un registro con email ya existente es rechazado con el mensaje "Este email ya está registrado."; que un inicio de sesión con credenciales incorrectas es rechazado con el mensaje "Credenciales incorrectas."; que un inicio de sesión correcto cierra el modal y revela el formulario; que recargar la página con sesión activa mantiene el formulario visible; y que cerrar sesión hace reaparecer el muro. (HU-01-01 a HU-01-04, HU-06-01 a HU-06-03; RN-WS-10, RN-WS-13, RN-WS-14, RN-WS-15)

#### Scenario: Estado anónimo

- **WHEN** un visitante sin sesión abre la Landing Page
- **THEN** la página termina de cargar en menos de 3 segundos, muestra el muro de autenticación y no muestra en ningún momento el formulario de escaneo

#### Scenario: Registro exitoso con email nuevo

- **WHEN** un visitante se registra con un email que no existe todavía y una contraseña válida
- **THEN** obtiene sesión, el modal se cierra y el formulario de escaneo pasa a ser visible

#### Scenario: Registro rechazado por email duplicado

- **WHEN** se intenta registrar un email que ya está en la base
- **THEN** el registro es rechazado y el usuario ve el mensaje "Este email ya está registrado."

#### Scenario: Login rechazado por credenciales incorrectas

- **WHEN** se intenta iniciar sesión con un email inexistente o con una contraseña incorrecta
- **THEN** el intento es rechazado y el usuario ve el mensaje "Credenciales incorrectas.", sin que el sistema revele cuál de los dos datos estaba mal

#### Scenario: Login exitoso

- **WHEN** un usuario ya registrado inicia sesión con sus credenciales correctas
- **THEN** obtiene sesión, el modal se cierra y el formulario de escaneo pasa a ser visible

#### Scenario: La sesión sobrevive a la recarga de la página

- **WHEN** un usuario con sesión activa recarga la Landing Page
- **THEN** la sesión se restaura sola y el formulario de escaneo sigue visible, sin volver a pedir credenciales

#### Scenario: Cierre de sesión

- **WHEN** un usuario con sesión activa cierra sesión
- **THEN** el formulario de escaneo desaparece y el muro de autenticación vuelve a mostrarse

#### Scenario: El usuario registrado quedó realmente persistido

- **WHEN** se consulta la tabla `users` de `db_fuzzing` tras un registro exitoso de la validación
- **THEN** existe la fila del usuario registrado y su contraseña está almacenada como hash, nunca en texto plano

### Requirement: La validación cubre el recorrido de escaneo y sus rechazos

La validación de humo SHALL verificar, sobre el sistema vivo, el recorrido de escaneo completo y sus tres rechazos característicos: que el formulario rechaza campos inválidos antes de enviar; que el botón "Escanear" permanece deshabilitado mientras el checkbox de declaración ética no esté marcado; que un `POST` a `/scan/start` sin JWT es rechazado con `401` y produce un mensaje visible para el usuario; que un `POST` con JWT válido y cuerpo correcto es aceptado con `202` en menos de 3 segundos; que tras ese `202` el frontend redirige al Dashboard; que la ejecución aparece en el historial del orquestador; que la fila del escaneo queda registrada en la tabla `scans` de `db_fuzzing`; y que al superar el presupuesto de 10 solicitudes por IP en la ventana de 60 minutos, la solicitud número 11 recibe `429`. (HU-02-01 a HU-02-05, HU-03-02 a HU-03-04, HU-04-01, HU-05-01, HU-06-04; RN-WS-01 a RN-WS-06, RN-WS-08, RN-WS-09, RN-WS-11)

#### Scenario: Validación de formulario antes del envío

- **WHEN** el usuario intenta enviar el formulario de escaneo con una URL objetivo inválida o con el identificador de sesión vacío
- **THEN** el formulario muestra el error correspondiente por campo y no llega a enviar la solicitud al Bridge

#### Scenario: El checkbox ético bloquea el envío

- **WHEN** el formulario está completo y correcto pero el checkbox de declaración ética no está marcado
- **THEN** el botón "Escanear" permanece deshabilitado

#### Scenario: Escaneo rechazado sin credencial

- **WHEN** se envía un `POST` a `/scan/start` sin el header `Authorization`
- **THEN** el Bridge responde `401` en formato RFC 7807 y el usuario ve un mensaje de sesión inválida en la interfaz

#### Scenario: Escaneo aceptado con credencial válida

- **WHEN** un usuario con sesión activa envía un escaneo válido sobre el objetivo autorizado de pruebas
- **THEN** el Bridge responde `202 Accepted` en menos de 3 segundos, devolviendo el identificador del escaneo

#### Scenario: Redirección al Dashboard tras la aceptación

- **WHEN** el frontend recibe el `202 Accepted`
- **THEN** muestra la confirmación de éxito y redirige automáticamente al Dashboard existente

#### Scenario: El orquestador registra la ejecución

- **WHEN** se inspecciona el historial de ejecuciones del orquestador tras un escaneo aceptado
- **THEN** aparece la ejecución correspondiente, disparada por el webhook y no por el disparador periódico

#### Scenario: El escaneo queda registrado en la base compartida

- **WHEN** se consulta la tabla `scans` de `db_fuzzing` tras un escaneo aceptado
- **THEN** existe la fila del escaneo iniciado, con el objetivo que se envió desde el formulario

#### Scenario: El presupuesto de escaneos se agota con 429

- **WHEN** se envían 11 solicitudes de escaneo desde la misma IP dentro de la ventana de 60 minutos
- **THEN** las primeras 10 son aceptadas y la número 11 es rechazada con `429`

### Requirement: La validación deja evidencia firmada y trazable

Cada corrida de la validación de humo SHALL producir evidencia registrada: fecha, operador, entorno, y para cada uno de los criterios de aceptación un veredicto PASS o FAIL con la observación que lo respalda. Cada criterio de aceptación del change SHALL estar asignado explícitamente a un test automatizado identificable o a un paso numerado del runbook; ningún criterio SHALL quedar sin responsable. Un criterio SHALL NOT firmarse como PASS sin evidencia que lo sostenga. Los defectos hallados SHALL registrarse como hallazgos con su severidad, SHALL NOT corregirse dentro de esta validación, y SHALL NOT impedir que el resto de los criterios se ejecute y se firme.

#### Scenario: Cobertura completa de los criterios

- **WHEN** se coteja la lista de criterios de aceptación contra la validación
- **THEN** cada criterio apunta a un test automatizado o a un paso numerado del runbook, y no queda ninguno huérfano

#### Scenario: Un PASS exige evidencia

- **WHEN** un criterio se firma como PASS
- **THEN** la firma incluye la observación concreta que lo respalda (código de respuesta, tiempo medido, resultado de la consulta, captura o identificador de ejecución)

#### Scenario: Un defecto se documenta sin frenar la corrida

- **WHEN** durante la validación se detecta un comportamiento incorrecto del sistema
- **THEN** se registra como hallazgo con su severidad, el criterio queda firmado como FAIL, y la validación continúa con los criterios restantes

### Requirement: La validación no daña el esquema compartido ni escanea objetivos no autorizados

La validación de humo SHALL tratar las tablas preexistentes de `db_fuzzing` —`scans` y `vulnerabilities`— como **solo lectura**: SHALL consultarlas para verificar efectos, y SHALL NOT insertar, modificar, borrar ni migrar filas en ellas. Las escrituras SHALL limitarse a la tabla `users`, que es propiedad del Bridge, y SHALL usar identidades desechables generadas por corrida, de modo que ninguna cuenta real quede afectada. La limpieza posterior SHALL borrar únicamente las identidades desechables que la propia corrida creó. El escaneo que dispare la validación SHALL apuntar exclusivamente a un objetivo sobre el que el operador tenga autorización explícita —por defecto, infraestructura de pruebas que él mismo controla y hospeda—, coherente con la declaración ética que el propio sistema exige a sus usuarios. Los parámetros de ese objetivo —su URL y el identificador de sesión que lo acompaña— SHALL suministrarse por variables de entorno leídas en tiempo de ejecución y SHALL NOT quedar escritos en el código, en los tests, en las specs ni en la documentación versionada del repositorio. (RN-WS-01)

#### Scenario: Las tablas preexistentes solo se leen

- **WHEN** se inspecciona lo que la validación ejecuta contra `db_fuzzing`
- **THEN** sobre `scans` y `vulnerabilities` solo hay consultas de lectura, y ninguna sentencia de escritura ni de migración

#### Scenario: Identidades desechables por corrida

- **WHEN** la validación crea un usuario para ejercitar el recorrido
- **THEN** ese usuario es único de la corrida y distinguible de cualquier cuenta real, y la limpieza posterior borra ese usuario y ningún otro

#### Scenario: Objetivo de escaneo autorizado

- **WHEN** la validación dispara un escaneo real
- **THEN** el objetivo es infraestructura de pruebas que el propio operador controla y hospeda, nunca un sistema de terceros sin autorización

#### Scenario: Los parámetros del objetivo no quedan versionados

- **WHEN** se inspecciona el repositorio en busca de la URL objetivo y del identificador de sesión que la validación usa para escanear
- **THEN** no aparece ningún valor real: el código los toma de variables de entorno y la documentación solo los nombra o los ilustra con marcadores de posición

#### Scenario: Faltan los parámetros del objetivo

- **WHEN** se habilita la validación de humo sin haber definido en el entorno la URL objetivo o el identificador de sesión
- **THEN** los tests de escaneo se omiten indicando qué variable falta, y no se dispara ningún escaneo contra un destino por defecto
