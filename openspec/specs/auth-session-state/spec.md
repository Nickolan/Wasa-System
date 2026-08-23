## Purpose

Definir la sesión autenticada tal como la ve el frontend: qué constituye estar autenticado, qué se recuerda entre recargas y bajo qué condición, cómo se cierra la sesión, y la garantía de que ningún resto de una sesión inválida quede almacenado. Es la única fuente de verdad de autenticación en el cliente y el predicado sobre el que ramifica el muro de autenticación (RN-WS-10, RN-WS-14, HU-06-04, HU-06-05).

## Requirements

### Requirement: Estar autenticado equivale a tener un token de sesión

El estado de sesión SHALL exponer el token, el email del usuario y un indicador de autenticación, y SHALL mantener en todo momento el invariante de que el indicador está en verdadero si y sólo si hay un token presente. Las tres piezas SHALL cambiar siempre juntas, en una única transición: NO SHALL existir ningún instante observable en el que el indicador afirme autenticación sin token, ni en el que haya token con el indicador en falso.

#### Scenario: Estado inicial antes de cualquier restauración

- **WHEN** la aplicación arranca y todavía no se restauró ninguna sesión
- **THEN** el token y el email son nulos y el indicador de autenticación es falso

#### Scenario: El invariante se sostiene tras cada transición

- **WHEN** se observa el estado después de iniciar sesión, después de cerrarla y después de restaurarla
- **THEN** en las tres observaciones el indicador de autenticación coincide exactamente con "el token no es nulo"

#### Scenario: El indicador no es manipulable por separado

- **WHEN** se inspecciona la superficie pública del estado de sesión
- **THEN** las únicas operaciones que la modifican son iniciar sesión, cerrar sesión y restaurar sesión: no se expone ninguna forma de fijar el indicador de autenticación, el token o el email de manera independiente

### Requirement: Iniciar sesión establece la sesión y la recuerda

Al iniciar sesión con un token y un email, el estado de sesión SHALL quedar autenticado con esos valores, y la sesión SHALL persistirse en el almacenamiento del navegador (`localStorage`) para poder restaurarse en una carga posterior de la aplicación.

#### Scenario: La sesión queda establecida en memoria

- **WHEN** se inicia sesión con un token vigente y un email
- **THEN** el estado expone exactamente ese token y ese email, y el indicador de autenticación es verdadero

#### Scenario: La sesión queda persistida

- **WHEN** se inicia sesión y a continuación se inspecciona el almacenamiento del navegador
- **THEN** el token y el email están guardados allí

#### Scenario: Un inicio de sesión posterior reemplaza al anterior

- **WHEN** se inicia sesión con un token y un email, y luego se vuelve a iniciar sesión con otro token y otro email
- **THEN** tanto el estado como el almacenamiento contienen únicamente los valores del segundo inicio de sesión, sin rastro de los primeros

### Requirement: Sólo se recuerda lo mínimo para restaurar la sesión

El almacenamiento SHALL contener únicamente el token y el email. NO SHALL contener la contraseña del usuario en ninguna forma —ni en claro, ni codificada, ni derivada— ni ningún otro dato personal.

#### Scenario: Contenido acotado del almacenamiento

- **WHEN** se inicia sesión y se inspecciona la totalidad de lo que la aplicación escribió en el almacenamiento del navegador
- **THEN** lo escrito se reduce al token y al email, y nada más

#### Scenario: La contraseña nunca se persiste

- **WHEN** se completa un inicio de sesión
- **THEN** ningún valor presente en el almacenamiento del navegador contiene la contraseña usada para autenticarse

### Requirement: Cerrar sesión borra la sesión por completo y sin hablar con el servidor

Al cerrar sesión, el estado SHALL volver a su condición no autenticada (token y email nulos, indicador en falso) y la sesión persistida SHALL eliminarse del almacenamiento del navegador. El cierre de sesión SHALL ser una operación **puramente local**: NO SHALL emitir ninguna petición al FastAPI Bridge ni a ningún otro servicio.

#### Scenario: El estado vuelve a no autenticado

- **WHEN** se cierra la sesión estando autenticado
- **THEN** el token y el email son nulos y el indicador de autenticación es falso

#### Scenario: No queda nada almacenado

- **WHEN** se cierra la sesión y se inspecciona el almacenamiento del navegador
- **THEN** no queda ningún dato de sesión guardado

#### Scenario: Sin petición al backend

- **WHEN** se cierra la sesión
- **THEN** no se emite ninguna petición de red

#### Scenario: La sesión cerrada no reaparece al recargar

- **WHEN** se cierra la sesión y a continuación se restaura la sesión como si la aplicación se hubiera recargado
- **THEN** la aplicación queda no autenticada

#### Scenario: Cerrar sesión sin sesión abierta es inocuo

- **WHEN** se cierra la sesión estando ya no autenticado
- **THEN** el estado sigue siendo no autenticado y no se propaga ningún error

### Requirement: La sesión se restaura al recargar sólo si el token sigue vigente

Al arrancar la aplicación, la restauración SHALL leer la sesión persistida y SHALL admitirla únicamente si el token **no está vencido** según la inspección de vigencia. Una sesión admitida SHALL dejar la aplicación autenticada con el token y el email guardados, sin exigirle al usuario volver a autenticarse.

#### Scenario: Recarga con token vigente

- **WHEN** existe una sesión persistida cuyo token no está vencido y la aplicación arranca
- **THEN** la aplicación queda autenticada con ese token y ese email

#### Scenario: Recarga sin sesión persistida

- **WHEN** no hay ninguna sesión persistida y la aplicación arranca
- **THEN** la aplicación queda no autenticada y no se propaga ningún error

#### Scenario: La vigencia se evalúa en cada arranque, no una sola vez

- **WHEN** una misma sesión persistida se restaura estando el token vigente y, más tarde, se restaura ya vencido el token
- **THEN** la primera restauración deja la aplicación autenticada y la segunda la deja no autenticada

### Requirement: Una sesión inválida no sobrevive y no queda almacenada

Si la sesión persistida está vencida, corrupta o incompleta, la restauración SHALL dejar la aplicación **no autenticada** y SHALL **eliminar del almacenamiento** lo que haya encontrado, de modo que un dato inválido no se reevalúe en cada arranque posterior. Se consideran inválidas, sin limitarse a: la sesión con token vencido, el contenido almacenado que no se pueda interpretar, y la sesión a la que le falte el token o el email. La restauración NO SHALL propagar ningún error a la aplicación en ninguno de estos casos.

#### Scenario: Recarga con token vencido

- **WHEN** existe una sesión persistida cuyo token está vencido y la aplicación arranca
- **THEN** la aplicación queda no autenticada

#### Scenario: El token vencido se purga del almacenamiento

- **WHEN** se restaura una sesión con token vencido y a continuación se inspecciona el almacenamiento del navegador
- **THEN** no queda ningún dato de sesión guardado

#### Scenario: Contenido almacenado ilegible

- **WHEN** el almacenamiento contiene, bajo la clave de sesión, contenido que la aplicación no puede interpretar y la aplicación arranca
- **THEN** la aplicación queda no autenticada, el contenido ilegible se elimina y no se propaga ningún error

#### Scenario: Sesión almacenada incompleta

- **WHEN** el almacenamiento contiene una sesión a la que le falta el token o le falta el email, y la aplicación arranca
- **THEN** la aplicación queda no autenticada y el resto incompleto se elimina

#### Scenario: La aplicación renderiza igual ante un almacenamiento corrupto

- **WHEN** la aplicación arranca con contenido corrupto en el almacenamiento
- **THEN** la interfaz se renderiza normalmente, mostrando el estado no autenticado, sin pantalla en blanco ni error sin capturar

### Requirement: La restauración ocurre al montar la aplicación y es idempotente

La aplicación SHALL disparar la restauración de sesión al montarse, desde un único punto. La restauración SHALL ser idempotente: invocarla más de una vez sobre el mismo almacenamiento SHALL producir el mismo estado final, sin efectos acumulativos — condición necesaria porque el modo estricto de React monta los efectos dos veces en desarrollo.

#### Scenario: Montar la aplicación restaura la sesión

- **WHEN** existe una sesión persistida vigente y se monta la aplicación
- **THEN** el estado de sesión queda autenticado sin que ninguna otra parte de la interfaz haya tenido que solicitarlo

#### Scenario: Doble montaje en modo estricto

- **WHEN** se monta la aplicación bajo el modo estricto de React, que ejecuta los efectos dos veces
- **THEN** el estado final de sesión es el mismo que con una sola ejecución, y el almacenamiento no sufre escrituras adicionales

#### Scenario: Punto único de restauración

- **WHEN** se inspecciona el árbol de la aplicación
- **THEN** la restauración de sesión se dispara desde un único lugar al montar, y ningún otro componente la invoca

### Requirement: Un almacenamiento indisponible degrada la persistencia, no la aplicación

Si el almacenamiento del navegador no está disponible o rechaza las operaciones —modo privado, almacenamiento deshabilitado, cuota agotada—, la aplicación SHALL seguir funcionando: la sesión SHALL establecerse en memoria y valer para la pestaña actual, y la imposibilidad de persistirla NO SHALL propagarse como un error a la interfaz ni impedir el inicio o el cierre de sesión.

#### Scenario: Inicio de sesión con almacenamiento que rechaza escrituras

- **WHEN** se inicia sesión mientras el almacenamiento del navegador lanza un error ante cualquier escritura
- **THEN** el estado queda autenticado en memoria y no se propaga ningún error a la interfaz

#### Scenario: Restauración con almacenamiento que rechaza lecturas

- **WHEN** la aplicación arranca mientras el almacenamiento del navegador lanza un error ante cualquier lectura
- **THEN** la aplicación queda no autenticada y se renderiza normalmente, sin error sin capturar

#### Scenario: Cierre de sesión con almacenamiento que rechaza el borrado

- **WHEN** se cierra la sesión mientras el almacenamiento del navegador lanza un error ante el borrado
- **THEN** el estado en memoria queda no autenticado igualmente y no se propaga ningún error

### Requirement: El estado de sesión es consumible por el resto del frontend sin acoplarse al almacenamiento

El token SHALL ser legible desde el estado de sesión por los consumidores que lo necesiten —en particular el cliente HTTP que adjunta la credencial en las peticiones al Bridge—, de modo que ningún otro módulo necesite leer el almacenamiento del navegador por su cuenta. El estado de sesión SHALL ser el único módulo de la aplicación que lee o escribe la sesión persistida.

#### Scenario: El token es legible desde el estado

- **WHEN** la aplicación está autenticada y un consumidor solicita el token al estado de sesión
- **THEN** obtiene el token vigente de la sesión actual

#### Scenario: Punto único de acceso al almacenamiento

- **WHEN** se inspeccionan todos los módulos de la aplicación
- **THEN** el único que accede al almacenamiento del navegador para leer o escribir la sesión es el que gobierna el estado de sesión

#### Scenario: Los consumidores se suscriben a lo que necesitan

- **WHEN** un componente consume el estado de sesión
- **THEN** lo hace seleccionando la porción que necesita, y no vuelve a renderizarse por cambios en porciones que no seleccionó
