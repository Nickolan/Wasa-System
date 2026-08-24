# auth-client-requests Specification

## Purpose
TBD - created by archiving change feature-auth. Update Purpose after archive.
## Requirements
### Requirement: El cliente llama a los dos endpoints públicos de autenticación del Bridge

El frontend SHALL exponer exactamente dos operaciones de red de autenticación: una que registra un usuario y otra que inicia sesión. La operación de registro SHALL emitir `POST` a `/api/v1/auth/register` y la de inicio de sesión SHALL emitir `POST` a `/api/v1/auth/login`, ambas contra el origen configurado del Bridge.

El origen y el prefijo de versión de la API SHALL declararse en un único lugar de la slice, de modo que cada operación aporte únicamente su segmento final: un cambio de prefijo SHALL requerir editar un solo módulo.

El origen SHALL provenir de la puerta única de configuración de entorno del frontend; ningún módulo de autenticación SHALL leer las variables de entorno directamente.

#### Scenario: El registro emite un POST a la ruta del Bridge

- **WHEN** se invoca la operación de registro con un email y una contraseña
- **THEN** se emite una petición `POST` cuya ruta termina en `/api/v1/auth/register` y cuyo origen es el configurado para el Bridge

#### Scenario: El inicio de sesión emite un POST a la ruta del Bridge

- **WHEN** se invoca la operación de inicio de sesión con un email y una contraseña
- **THEN** se emite una petición `POST` cuya ruta termina en `/api/v1/auth/login` y cuyo origen es el configurado para el Bridge

#### Scenario: El prefijo de la API está declarado una sola vez

- **WHEN** se inspecciona el código de las dos operaciones de red
- **THEN** ninguna de las dos repite el origen ni el prefijo de versión: ambos vienen del módulo compartido de la slice

---

### Requirement: El cuerpo del registro se proyecta explícitamente y excluye la confirmación de contraseña

El cuerpo enviado a la operación de registro SHALL contener exactamente los campos `email` y `password`, construidos campo por campo a partir de los valores validados. El campo de confirmación de contraseña SHALL NOT viajar por la red: es un control de la interfaz, no un dato del dominio, y el Bridge lo rechazaría por prohibir campos extra.

La construcción del cuerpo SHALL ser una lista explícita de campos permitidos, no una copia por difusión del objeto del formulario ni un borrado de campos sobre esa copia: un campo que se agregue al formulario en el futuro SHALL quedar fuera del cuerpo por omisión, no adentro por descuido.

#### Scenario: La confirmación de contraseña no sale del navegador

- **WHEN** se invoca la operación de registro con email, contraseña y confirmación de contraseña
- **THEN** el cuerpo enviado contiene únicamente las claves `email` y `password`, y no contiene la confirmación

#### Scenario: Un campo extra del formulario tampoco viaja

- **WHEN** se invoca la operación de registro con un objeto de formulario que incluye un campo adicional no contemplado
- **THEN** el cuerpo enviado sigue conteniendo únicamente `email` y `password`

---

### Requirement: Una respuesta exitosa devuelve el token tal como lo emite el Bridge

La operación de inicio de sesión SHALL considerar exitosa la respuesta `200` y la de registro SHALL considerar exitosa la respuesta `201`. En ambos casos SHALL devolver el cuerpo de la respuesta como la respuesta de token del Bridge, conservando los nombres de sus miembros tal como viajan por el cable.

La respuesta exitosa SHALL NOT re-validarse contra un schema de runtime en este alcance: se tipa, no se parsea.

#### Scenario: El inicio de sesión exitoso devuelve el token

- **WHEN** el Bridge responde `200` con un cuerpo que contiene el token de acceso, su tipo y su vencimiento
- **THEN** la operación devuelve ese cuerpo sin transformarlo y sin lanzar

#### Scenario: El registro exitoso devuelve el token

- **WHEN** el Bridge responde `201` con un cuerpo que contiene el token de acceso, su tipo y su vencimiento
- **THEN** la operación devuelve ese cuerpo sin transformarlo y sin lanzar

---

### Requirement: Toda respuesta no exitosa se convierte en un error de cliente uniforme que preserva el código de estado

Ante cualquier respuesta que no sea la exitosa de su operación, ambas operaciones SHALL lanzar un error de cliente propio de la slice —una instancia real de la clase de error del lenguaje, distinguible por `instanceof`— que SHALL exponer el código de estado HTTP recibido.

Ese error SHALL exponer además el cuerpo de error del Bridge cuando el cuerpo recibido tenga efectivamente la forma del contrato de error de la API; cuando el cuerpo esté ausente o no tenga esa forma, el error SHALL exponer su ausencia explícitamente en vez de inventar un contenido.

Cuando la petición falle sin llegar a obtener una respuesta —red caída, tiempo de espera agotado, origen inalcanzable—, el error SHALL lanzarse igual, con el código de estado explícitamente ausente.

Este error SHALL NOT ser el mismo artefacto que el tipo que describe el cuerpo de error de la API: ese tipo describe datos recibidos, este error describe una petición fallida, y el error SHALL reutilizar aquel tipo para describir el cuerpo que transporta.

#### Scenario: Credenciales rechazadas en el inicio de sesión

- **WHEN** el Bridge responde `401` a la operación de inicio de sesión
- **THEN** la operación lanza el error de cliente de la slice con código de estado `401`

#### Scenario: Email duplicado en el registro

- **WHEN** el Bridge responde `409` a la operación de registro
- **THEN** la operación lanza el error de cliente de la slice con código de estado `409`

#### Scenario: El cuerpo de error del Bridge queda disponible en el error

- **WHEN** el Bridge responde con un error cuyo cuerpo declara los cinco miembros del contrato de error de la API
- **THEN** el error lanzado expone ese cuerpo tal como se recibió

#### Scenario: Un cuerpo de error que no respeta el contrato no se interpreta

- **WHEN** el Bridge —o un intermediario en el camino— responde con un error cuyo cuerpo no tiene la forma del contrato de error de la API
- **THEN** el error lanzado expone su código de estado y declara explícitamente que no hay cuerpo de error interpretable

#### Scenario: Fallo de red sin respuesta

- **WHEN** la petición falla sin obtener respuesta del servidor
- **THEN** la operación lanza el error de cliente de la slice con el código de estado explícitamente ausente

#### Scenario: El error es distinguible en tiempo de ejecución

- **WHEN** se captura el error que lanza cualquiera de las dos operaciones
- **THEN** es una instancia de la clase de error de la slice y satisface `instanceof Error`

---

### Requirement: Las peticiones de autenticación no pasan por el cliente HTTP autenticado

Las operaciones de autenticación SHALL usar un cliente HTTP propio de la slice, sin interceptor que adjunte credenciales de sesión y sin interceptor que cierre la sesión ante un `401`.

Ningún módulo de la slice de autenticación SHALL importar el cliente HTTP compartido de la capa `shared`, ni en este change ni cuando ese cliente exista: los endpoints de autenticación son públicos, y su `401` significa "credenciales incorrectas", no "sesión expirada". Enrutarlos por el cliente autenticado haría que un intento de inicio de sesión fallido cerrara la sesión vigente del usuario.

#### Scenario: La slice no importa el cliente HTTP compartido

- **WHEN** se inspeccionan los imports de todos los archivos de la slice de autenticación
- **THEN** ninguno importa el cliente HTTP compartido de `shared/api`, ni por alias ni por ruta relativa

#### Scenario: Un inicio de sesión fallido no toca la sesión vigente

- **WHEN** existe una sesión establecida y una operación de inicio de sesión recibe `401`
- **THEN** la sesión vigente permanece intacta: sigue autenticada y conserva su token

#### Scenario: Las peticiones de autenticación no llevan credenciales de sesión

- **WHEN** existe una sesión establecida y se invoca cualquiera de las dos operaciones de autenticación
- **THEN** la petición emitida no incluye una cabecera de autorización

---

### Requirement: Ningún módulo de autenticación escribe en la consola

Ningún archivo de la slice de autenticación SHALL invocar la consola del navegador —en ninguna de sus variantes— en ningún camino de ejecución, incluido el de error.

Este es el borde donde la contraseña en texto plano está en memoria y en el cuerpo de la petición; volcar un error de red a la consola imprime la configuración de la petición y, con ella, el cuerpo enviado.

#### Scenario: La slice está libre de escritura a consola

- **WHEN** se inspecciona el código fuente de todos los archivos de la slice de autenticación
- **THEN** no aparece ninguna invocación a la consola del navegador

#### Scenario: El camino de error tampoco loguea

- **WHEN** una operación de autenticación falla y su error se propaga
- **THEN** no se produce ninguna escritura a la consola durante el fallo

