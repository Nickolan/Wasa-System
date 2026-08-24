## Purpose

Define qué secciones componen la Landing pública de WASA, en qué orden aparecen, qué información puede leer cualquier visitante sin sesión y qué detalles de la infraestructura interna nunca pueden aparecer en pantalla.

## ADDED Requirements

### Requirement: La Landing se compone de secciones fijas y en un orden fijo

La página de aterrizaje SHALL estar compuesta por, al menos y en este orden: la sección de presentación, la sección de herramientas, la sección del flujo paso a paso, la sección del formulario de escaneo y el pie de página.

Ninguna de esas secciones SHALL depender del estado de sesión para existir: todas SHALL renderizarse tanto para un visitante con sesión como para uno sin ella. Lo que la sesión decide es el **contenido** de la sección del formulario de escaneo (ver `auth-wall`), no la presencia de ninguna sección.

Cada sección SHALL ser una región identificable del documento, de modo que se pueda alcanzar y nombrar sin depender de su posición visual.

#### Scenario: Un visitante sin sesión ve las cinco secciones

- **WHEN** se renderiza la Landing sin sesión activa
- **THEN** están presentes la presentación, las herramientas, el flujo paso a paso, la sección del formulario y el pie

#### Scenario: Un visitante con sesión ve las mismas cinco secciones

- **WHEN** se renderiza la Landing con sesión activa
- **THEN** están presentes las mismas cinco secciones, en el mismo orden

#### Scenario: Cada sección se puede alcanzar y nombrar por su rol

- **WHEN** se recorre el árbol de accesibilidad de la Landing
- **THEN** la presentación, las herramientas, el flujo y la sección del formulario exponen cada una una región con nombre accesible propio, y el pie se expone como la región de pie de página

#### Scenario: El orden es el declarado

- **WHEN** se recorre el documento de la Landing de arriba hacia abajo
- **THEN** la presentación aparece antes que las herramientas, las herramientas antes que el flujo, el flujo antes que la sección del formulario, y el pie al final

---

### Requirement: El llamado a la acción principal lleva al usuario al siguiente paso que le corresponde

La sección de presentación SHALL exponer exactamente **un** llamado a la acción principal, con un rótulo estable que no cambie según el estado de sesión.

Su destino SHALL depender del estado de sesión:

- Sin sesión, SHALL abrir el modal de inicio de sesión y SHALL NOT desplazar la página.
- Con sesión, SHALL desplazar la vista hasta la sección del formulario de escaneo y SHALL NOT abrir ningún modal.

El desplazamiento SHALL apuntar al ancla de la sección del formulario, no al formulario mismo, de modo que el destino exista también cuando el formulario no esté renderizado.

Si el entorno no ofrece la capacidad de desplazamiento, la acción SHALL NO fallar ni propagar error alguno.

#### Scenario: Sin sesión, el llamado a la acción abre el inicio de sesión

- **WHEN** un visitante sin sesión activa el llamado a la acción de la presentación
- **THEN** se abre el modal de inicio de sesión y la vista no se desplaza

#### Scenario: Con sesión, el llamado a la acción lleva al formulario

- **WHEN** un visitante con sesión activa el llamado a la acción de la presentación
- **THEN** la vista se desplaza hasta la sección del formulario de escaneo y no se abre ningún modal

#### Scenario: El rótulo no delata el estado de sesión

- **WHEN** se compara el llamado a la acción con y sin sesión
- **THEN** su rótulo es el mismo en ambos casos

#### Scenario: El ancla de destino existe en los dos estados

- **WHEN** se busca en el documento el ancla del formulario de escaneo, con y sin sesión
- **THEN** existe en ambos casos

#### Scenario: Un entorno sin desplazamiento no rompe la acción

- **WHEN** se activa el llamado a la acción con sesión en un entorno que no implementa el desplazamiento de la vista
- **THEN** la acción termina sin lanzar ningún error

---

### Requirement: La sección de herramientas declara qué ejecuta WASA y qué detecta cada herramienta

La sección de herramientas SHALL presentar al menos cuatro tarjetas, una por cada herramienta que el orquestador ejecuta: ZAP, Nuclei, ffuf y SQLMap.

Cada tarjeta SHALL exponer el nombre de la herramienta, un ícono y una descripción de qué detecta esa herramienta. Ninguna tarjeta SHALL quedar sin descripción.

El ícono SHALL ser decorativo: SHALL NOT aportar el nombre accesible de la tarjeta, que sale del texto.

#### Scenario: Las cuatro herramientas están presentes

- **WHEN** se renderiza la sección de herramientas
- **THEN** aparecen ZAP, Nuclei, ffuf y SQLMap

#### Scenario: Cada herramienta explica qué detecta

- **WHEN** se inspecciona cada tarjeta de la sección
- **THEN** cada una tiene un texto descriptivo no vacío además de su nombre

#### Scenario: La sección es legible sin los íconos

- **WHEN** se obtiene el texto accesible de la sección ignorando los elementos decorativos
- **THEN** los cuatro nombres y sus descripciones siguen estando disponibles

---

### Requirement: El flujo paso a paso empieza por crear la cuenta y abstrae la infraestructura

La sección del flujo SHALL presentar al menos cuatro pasos, numerados o inequívocamente ordenados, cuyo **primer** paso SHALL ser crear la cuenta, y que SHALL cubrir además la configuración del escaneo, su envío y la consulta de los resultados.

Ningún texto visible de la Landing SHALL mencionar la infraestructura interna que ejecuta el escaneo: ni el orquestador de workflows, ni la cola, ni el worker, ni el motor de base de datos. El usuario SHALL poder entender el proceso sin conocer ninguno de esos componentes.

#### Scenario: Los cuatro pasos están presentes y ordenados

- **WHEN** se renderiza la sección del flujo
- **THEN** hay al menos cuatro pasos y su orden es explícito

#### Scenario: Crear la cuenta es el primer paso

- **WHEN** se lee el primer paso del flujo
- **THEN** describe la creación de la cuenta

#### Scenario: La infraestructura interna no aparece en pantalla

- **WHEN** se inspecciona todo el texto visible de la Landing
- **THEN** no aparecen los nombres de los componentes internos de orquestación, encolado ni ejecución

---

### Requirement: El aviso ético es visible para cualquier visitante y no puede ocultarse

El aviso de uso autorizado SHALL renderizarse para **todo** visitante, tenga o no sesión activa, y SHALL mencionar explícitamente la autorización del propietario del objetivo.

El aviso SHALL NOT depender de ninguna interacción para hacerse visible: SHALL NOT estar detrás de un desplegable, de una pestaña, de un modal ni del muro de autenticación.

#### Scenario: Un visitante sin sesión ve el aviso ético

- **WHEN** se renderiza la Landing sin sesión activa
- **THEN** el aviso de uso autorizado es visible sin ninguna interacción previa

#### Scenario: Un visitante con sesión también lo ve

- **WHEN** se renderiza la Landing con sesión activa
- **THEN** el aviso de uso autorizado sigue siendo visible

#### Scenario: El aviso nombra la autorización del propietario

- **WHEN** se lee el texto del aviso
- **THEN** menciona explícitamente contar con autorización del propietario del objetivo

---

### Requirement: El pie cierra la página con la identidad del proyecto

El pie SHALL renderizarse en todo estado de sesión e identificar al proyecto y su marco académico.

El pie SHALL NOT contener controles que dependan de la sesión ni acciones que modifiquen el estado de la aplicación.

#### Scenario: El pie está presente

- **WHEN** se renderiza la Landing
- **THEN** existe un pie de página con la identidad del proyecto

#### Scenario: El pie no ofrece acciones de sesión

- **WHEN** se inspeccionan los controles del pie
- **THEN** no hay controles de inicio de sesión, registro ni cierre de sesión

---

### Requirement: Las secciones de la Landing son adaptables y no imponen un ancho mínimo

Ninguna sección de la Landing SHALL fijar un ancho ni un ancho mínimo en píxeles que obligue al documento a desplazarse horizontalmente en una pantalla angosta.

Las disposiciones en varias columnas SHALL partir de una sola columna y ampliarse a partir de puntos de corte, no al revés.

#### Scenario: Sin anchos fijos en píxeles

- **WHEN** se inspeccionan las declaraciones de estilo de las secciones de la Landing
- **THEN** ninguna fija un ancho ni un ancho mínimo en píxeles

#### Scenario: La disposición parte de una columna

- **WHEN** se inspecciona la disposición de la sección de herramientas y la del flujo
- **THEN** su estado base es de una sola columna y las columnas adicionales se aplican a partir de un punto de corte
