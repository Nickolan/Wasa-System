## Purpose

Define el **borde HTTP del disparo de escaneos**: la operación por la que un cliente pide iniciar un escaneo, quién tiene permiso de invocarla, cuánto puede invocarla desde un mismo origen, qué respuesta recibe cuando su pedido fue aceptado, qué recibe ante cada forma de rechazo, y cómo se documenta esa operación. `scan-initiation` describe qué decide el Bridge al iniciar un escaneo; esta capability describe quién puede pedírselo por red y qué se le responde.

## ADDED Requirements

### Requirement: Existe una operación de disparo de escaneo alcanzable por red

El servicio SHALL exponer una operación de disparo de escaneo en `POST /api/v1/scan/start`. La operación SHALL aceptar el cuerpo de solicitud definido por el contrato de datos del dominio scan y SHALL estar disponible en la aplicación de producción, no sólo en configuraciones de prueba. La operación SHALL SER la única del dominio scan expuesta por el servicio: no SHALL exponerse consulta de estado, listado ni cancelación de escaneos. (HU-03-03, RN-WS-07)

#### Scenario: La operación existe y no responde "no encontrado"

- **WHEN** se invoca `POST /api/v1/scan/start` sobre la aplicación de producción
- **THEN** la respuesta NO es `404`: la ruta está registrada en la superficie de API

#### Scenario: Sólo el verbo de disparo está admitido

- **WHEN** se invoca la ruta de disparo de escaneo con un método distinto de `POST` (por ejemplo `GET`)
- **THEN** la respuesta es `405`, no `200` ni `404`

#### Scenario: El dominio scan no expone ninguna otra operación

- **WHEN** se inspecciona la superficie de API del servicio bajo el prefijo del dominio scan
- **THEN** la única ruta registrada es la de disparo de escaneo

### Requirement: El disparo de escaneo está cerrado a quien no presenta credencial válida

La operación de disparo de escaneo SHALL exigir una credencial de acceso válida presentada como *bearer token* en la cabecera de autorización. Una solicitud sin credencial, con credencial malformada, con firma inválida o expirada SHALL rechazarse con status `401` y SHALL NOT ejecutar lógica de negocio ni contactar al orquestador. El rechazo SHALL NOT revelar el motivo específico —no distingue "expirado" de "firma inválida"— porque esa distinción es información útil para un atacante. La identidad autenticada SHALL quedar disponible para la operación, y SHALL NOT provenir del cuerpo de la solicitud. (RN-WS-11, HU-03-03)

#### Scenario: Sin cabecera de autorización

- **WHEN** se invoca el disparo de escaneo con un cuerpo válido pero sin cabecera de autorización
- **THEN** la respuesta es `401` y ningún escaneo se entrega al orquestador

#### Scenario: Credencial expirada

- **WHEN** se invoca el disparo de escaneo con un cuerpo válido y una credencial vencida
- **THEN** la respuesta es `401` y ningún escaneo se entrega al orquestador

#### Scenario: Credencial malformada o con firma inválida

- **WHEN** se invoca el disparo de escaneo con una credencial que no es un token verificable, o cuya firma no corresponde al secreto del servicio
- **THEN** la respuesta es `401`, y su cuerpo no indica cuál de los dos motivos causó el rechazo

#### Scenario: La credencial se rechaza antes de tocar el orquestador

- **WHEN** una solicitud es rechazada por credencial ausente o inválida
- **THEN** la lógica de iniciación de escaneo no llega a ejecutarse: no se genera identificador de escaneo ni se abre canal hacia el orquestador

#### Scenario: Credencial válida habilita la operación

- **WHEN** se invoca el disparo de escaneo con un cuerpo válido y una credencial válida
- **THEN** la solicitud es atendida y la identidad autenticada queda disponible para la operación

### Requirement: Una solicitud aceptada recibe una confirmación de aceptación, no un resultado

Cuando la solicitud es válida, está autenticada, está dentro de cupo y el orquestador aceptó la entrega, el servicio SHALL responder con status `202 Accepted`. El cuerpo SHALL ser la confirmación de iniciación definida por el contrato de datos del dominio scan —identificador del escaneo, estado de encolado y mensaje legible— trasladada **sin transformar**: el borde HTTP SHALL NOT agregar, quitar ni renombrar campos, ni reinterpretar sus valores. El status SHALL NOT ser `200`: la respuesta confirma que el escaneo fue encolado, no que haya terminado ni que haya encontrado algo. (RN-WS-07, RN-WS-08, HU-03-03)

#### Scenario: Aceptación con status 202

- **WHEN** una solicitud válida y autenticada logra entregarse al orquestador
- **THEN** la respuesta es `202`, y no `200` ni `201`

#### Scenario: El cuerpo es la confirmación de iniciación sin transformar

- **WHEN** se inspecciona el cuerpo de una respuesta de aceptación
- **THEN** contiene exactamente los campos de la confirmación de iniciación, con los mismos valores que produjo la capa de negocio, sin campos agregados ni renombrados

#### Scenario: El identificador devuelto es el del escaneo entregado

- **WHEN** se compara el identificador del cuerpo de la respuesta con el que viajó en el mensaje al orquestador
- **THEN** son el mismo

### Requirement: El disparo de escaneo aplica el cupo por origen del dominio scan sobre la ruta real

El cupo de solicitudes por dirección IP definido para el dominio scan SHALL estar aplicado sobre la operación de disparo de escaneo de la aplicación de producción, y no solamente demostrado sobre rutas de prueba. La solicitud que exceda el cupo SHALL rechazarse con status `429` sin ejecutar la lógica de iniciación ni contactar al orquestador. El cupo SHALL SER el declarado por configuración del servicio y SHALL NOT estar fijado en el código de la operación. Ninguna otra ruta de la aplicación SHALL quedar sujeta a ese cupo por efecto de este endpoint. (RN-WS-06, HU-03-03)

#### Scenario: El cupo está aplicado sobre la operación real

- **WHEN** se inspecciona la política de tasa efectiva de la aplicación de producción
- **THEN** la operación de disparo de escaneo figura como sujeta al cupo del dominio scan

#### Scenario: Solicitud por encima del cupo

- **WHEN** una misma IP autenticada supera el cupo configurado de solicitudes de disparo dentro de la ventana
- **THEN** la respuesta es `429` y ningún escaneo adicional se entrega al orquestador

#### Scenario: El cupo del endpoint no se derrama al resto del servicio

- **WHEN** una IP agotó su cupo de disparo de escaneo y a continuación solicita el endpoint de salud
- **THEN** la respuesta de salud sigue siendo `200`

### Requirement: La indisponibilidad del orquestador se reporta como falla de la pasarela

Cuando la entrega del escaneo al orquestador no puede completarse —tiempo de espera agotado, conexión rechazada, cualquier falla de transporte o una respuesta fuera del rango de éxito— el servicio SHALL responder con status `502 Bad Gateway`. El cuerpo SHALL SER Problem Details (RFC 7807) y SHALL NOT incluir el destino del orquestador, su credencial de webhook, el cuerpo de su respuesta, trazas de pila ni nombres de módulos internos. Esta SHALL SER la única condición de la operación que produce `502`: cualquier otra falla no prevista SHALL seguir la política general de errores del servicio. (RN-WS-09, HU-03-04)

#### Scenario: El orquestador no responde

- **WHEN** una solicitud válida y autenticada se procesa mientras el orquestador está inaccesible o responde fuera del rango de éxito
- **THEN** la respuesta es `502` con cuerpo Problem Details

#### Scenario: El error no filtra la configuración del orquestador

- **WHEN** se inspecciona el cuerpo de la respuesta `502`
- **THEN** no aparecen la URL del orquestador, su credencial de webhook, el cuerpo de su respuesta, trazas de pila ni rutas de archivos del servidor

#### Scenario: La sesión de la aplicación objetivo no se filtra

- **WHEN** se inspecciona el cuerpo de cualquier respuesta de error de la operación
- **THEN** no aparece la credencial de sesión de la aplicación objetivo enviada en la solicitud

### Requirement: Toda respuesta de rechazo de la operación es Problem Details

Toda respuesta de la operación de disparo de escaneo que no sea de éxito —credencial ausente o inválida, cuerpo inválido, cupo excedido, orquestador indisponible, falla no prevista— SHALL entregarse en formato Problem Details (RFC 7807) con los campos `type`, `title`, `status`, `detail` e `instance`, y con el tipo de contenido correspondiente. El campo `instance` SHALL reflejar la ruta de la operación que falló. Ninguna respuesta de error SHALL salir en el formato por defecto del framework web. (RN-WS-09, HU-03-04, HU-03-07)

#### Scenario: Rechazo por credencial

- **WHEN** la operación responde `401`
- **THEN** el cuerpo es Problem Details con los cinco campos y su `instance` es la ruta de disparo de escaneo

#### Scenario: Rechazo por cuerpo inválido

- **WHEN** se invoca la operación con credencial válida y un cuerpo que viola el contrato de datos (URL objetivo ausente o no válida, sesión vacía, nivel o riesgo fuera de rango)
- **THEN** la respuesta es un rechazo de validación (`400` o `422`) con cuerpo Problem Details, y ningún escaneo se entrega al orquestador

#### Scenario: Rechazo por cupo excedido

- **WHEN** la operación responde `429`
- **THEN** el cuerpo es Problem Details y la respuesta incluye la cabecera que indica cuándo reintentar

#### Scenario: El contrato de datos del cuerpo es el del dominio scan, sin duplicarse

- **WHEN** se comparan las condiciones bajo las cuales la operación rechaza un cuerpo con las del contrato de datos del dominio scan
- **THEN** coinciden: el borde HTTP no impone validaciones propias adicionales ni relaja las existentes

### Requirement: La documentación interactiva declara la operación como protegida

La documentación OpenAPI generada por el servicio SHALL incluir la operación de disparo de escaneo declarando su requisito de credencial *bearer*, de modo que la interfaz interactiva la muestre como operación protegida y ofrezca un campo para presentar la credencial. La documentación SHALL declarar además el cuerpo de solicitud esperado y el status de aceptación. (HU-03-03)

#### Scenario: El esquema de seguridad está declarado

- **WHEN** se inspecciona el documento OpenAPI del servicio
- **THEN** la operación de disparo de escaneo declara un requisito de seguridad de tipo *bearer token*

#### Scenario: La interfaz interactiva muestra la operación como protegida

- **WHEN** se abre la documentación interactiva del servicio
- **THEN** la operación de disparo de escaneo aparece marcada como protegida (candado de autenticación)

#### Scenario: Los endpoints públicos no quedan marcados como protegidos

- **WHEN** se inspecciona la declaración de seguridad del endpoint de salud en el documento OpenAPI
- **THEN** no declara requisito de credencial: la protección es por operación, no global
