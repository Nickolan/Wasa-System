## Purpose

Define la envoltura del documento que rodea a la composición de la Landing: el idioma y el título que declara, la superficie sobre la que se pinta, la tipografía con la que se lee, el punto único donde viven los valores de diseño, y el presupuesto de rendimiento que nada de eso puede exceder.

## ADDED Requirements

### Requirement: El documento declara el idioma real de su contenido

El documento SHALL declarar como idioma el mismo en el que está escrito su contenido visible. Dado que la totalidad del texto de la Landing está en español, el idioma declarado SHALL ser español.

La declaración SHALL estar en el documento desde su entrega inicial, sin depender de que la aplicación monte: un agente que sólo lea el documento servido SHALL poder determinar el idioma.

#### Scenario: El idioma declarado es el del contenido

- **WHEN** se inspecciona el documento servido por la aplicación
- **THEN** declara español como idioma del contenido

#### Scenario: El idioma no depende del montaje de la aplicación

- **WHEN** se lee el documento antes de que la aplicación haya montado
- **THEN** el idioma ya está declarado

#### Scenario: La auditoría de accesibilidad no reporta discrepancia de idioma

- **WHEN** se audita la accesibilidad de la página cargada
- **THEN** no se reporta que el idioma declarado no corresponda al contenido

---

### Requirement: El título del documento identifica al producto

El título del documento SHALL nombrar al producto ante el usuario, no al paquete que lo construye. SHALL NOT ser el identificador técnico del proyecto ni un valor residual de un andamiaje.

#### Scenario: El título nombra al producto

- **WHEN** se inspecciona el título del documento
- **THEN** identifica a WASA ante un usuario que no conoce el repositorio

#### Scenario: Sin restos del andamiaje

- **WHEN** se compara el título con el identificador del paquete del proyecto
- **THEN** el título no es ese identificador

---

### Requirement: La superficie base del documento es la del producto desde el primer pintado

La superficie sobre la que se pinta el documento SHALL ser la superficie oscura del producto, y SHALL estar declarada a nivel del documento, no únicamente en el contenedor de la composición.

Entre la entrega del documento y el primer pintado del contenido SHALL NOT aparecer una superficie clara: no SHALL haber destello blanco de carga.

Toda área del área visible que no esté cubierta por el contenido —en particular la que queda expuesta al desplazarse más allá de los límites del documento— SHALL mostrar esa misma superficie base.

El documento SHALL declarar que su combinación de colores es oscura, de modo que los controles provistos por el agente de usuario y sus superficies por defecto se ajusten a ella en lugar de contrastar contra ella.

#### Scenario: La superficie está declarada en el documento

- **WHEN** se inspeccionan los estilos aplicados a la raíz del documento
- **THEN** tiene la superficie oscura del producto como fondo

#### Scenario: Sin destello claro antes del contenido

- **WHEN** se carga la página y se observa el intervalo previo al primer pintado del contenido
- **THEN** no se muestra una superficie clara en ningún momento

#### Scenario: El sobre-desplazamiento no revela una superficie ajena

- **WHEN** se desplaza la vista más allá del final del contenido
- **THEN** el área expuesta muestra la misma superficie base

#### Scenario: La combinación de colores declarada es oscura

- **WHEN** se inspecciona la combinación de colores declarada por el documento
- **THEN** es oscura

---

### Requirement: La Landing se lee con la tipografía del proyecto, declarada una sola vez

La Landing SHALL renderizarse con una tipografía elegida por el proyecto, y SHALL NOT quedar librada a la pila tipográfica por defecto del agente de usuario.

Esa tipografía SHALL declararse en un único lugar, aplicable a todo el documento. Ninguna sección, widget ni componente SHALL declarar su propia familia tipográfica para obtener la del proyecto: heredarla SHALL ser el camino por defecto.

La declaración SHALL incluir una cadena de reemplazo hacia tipografías siempre disponibles en el sistema, de modo que la falta de la tipografía elegida degrade la apariencia sin romper la lectura.

#### Scenario: El texto se renderiza con la tipografía del proyecto

- **WHEN** se inspecciona la tipografía efectiva de cualquier texto de la Landing
- **THEN** es la tipografía elegida por el proyecto

#### Scenario: La declaración es única

- **WHEN** se buscan en el árbol de la aplicación las declaraciones de familia tipográfica
- **THEN** existe una sola, en la hoja de estilos global de la capa de aplicación

#### Scenario: Ningún componente redeclara la familia

- **WHEN** se inspeccionan las secciones, widgets y componentes de la Landing
- **THEN** ninguno declara su propia familia tipográfica

#### Scenario: La tipografía no disponible degrada sin romper

- **WHEN** la tipografía elegida no puede cargarse
- **THEN** el texto se renderiza con una tipografía de reemplazo y sigue siendo legible

---

### Requirement: Los valores de diseño tienen un punto único de declaración

Los valores de diseño que la interfaz comparte —la familia tipográfica, la superficie base, la superficie elevada, el color de marca y los colores de estado de error y de éxito— SHALL estar declarados como tokens en un único lugar de la capa de aplicación, disponible para toda la interfaz.

Los tokens SHALL declararse con los valores que la interfaz ya usa: la introducción de este punto único SHALL NOT producir ningún cambio visual respecto del estado previo.

Cada token declarado SHALL nombrar un valor que la interfaz ya usa hoy: SHALL NOT introducirse valores nuevos que no aparezcan en ninguna sección, ni tokens que no correspondan a nada de lo que está en pantalla.

#### Scenario: Los tokens compartidos están declarados

- **WHEN** se inspecciona la hoja de estilos global de la capa de aplicación
- **THEN** declara tokens para la familia tipográfica, la superficie base, la superficie elevada, el color de marca y los colores de error y de éxito

#### Scenario: La declaración no cambia la apariencia

- **WHEN** se compara la apariencia de la Landing antes y después de introducir los tokens
- **THEN** no hay diferencia visual en ninguna sección

#### Scenario: Sin tokens huérfanos

- **WHEN** se contrasta el valor de cada token declarado con los valores que la interfaz aplica
- **THEN** cada token nombra un valor ya presente en alguna sección, y ninguno introduce un valor nuevo

---

### Requirement: Cargar la tipografía no retrasa la lectura ni excede el presupuesto de rendimiento

Mientras la tipografía elegida no esté disponible, el texto SHALL mostrarse igualmente con una tipografía de reemplazo: SHALL NOT quedar invisible a la espera de la descarga.

Si la tipografía se obtiene de un origen externo, la conexión a ese origen SHALL establecerse anticipadamente y SHALL NOT quedar encadenada detrás de la descarga de la hoja de estilos de la aplicación.

SHALL cargarse únicamente los cortes tipográficos que la interfaz usa; SHALL NOT descargarse variantes sin consumidor.

La página construida para producción SHALL obtener una puntuación de rendimiento superior a 80 en una auditoría de Lighthouse en modo escritorio.

#### Scenario: El texto es visible antes que la tipografía

- **WHEN** se carga la página con la descarga de la tipografía demorada
- **THEN** el texto ya es visible con una tipografía de reemplazo

#### Scenario: La conexión al origen externo no está encadenada

- **WHEN** se inspecciona la cadena de peticiones críticas de la carga
- **THEN** la conexión al origen de la tipografía no espera a que se descargue la hoja de estilos de la aplicación

#### Scenario: Sólo los cortes usados

- **WHEN** se contrastan los cortes tipográficos descargados con los que la interfaz aplica
- **THEN** no se descarga ningún corte que la interfaz no use

#### Scenario: Presupuesto de rendimiento respetado

- **WHEN** se audita con Lighthouse en modo escritorio el build de producción servido
- **THEN** la puntuación de rendimiento es mayor a 80
