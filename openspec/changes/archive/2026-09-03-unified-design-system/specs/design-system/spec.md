## Purpose

Define el contrato visual único del frontend de WASA: dónde vive la fuente de verdad de los tokens de diseño (color, tipografía, espaciado, radio, elevación), qué roles semánticos expone, y la obligación de que toda superficie de la aplicación derive su apariencia de esa fuente en lugar de redeclararla por su cuenta.

## ADDED Requirements

### Requirement: Los tokens de diseño tienen una única fuente de verdad

El sistema SHALL declarar sus tokens de diseño —los roles semánticos de color de superficie, de texto, de borde, de marca y de estado, más la escala tipográfica, la de espaciado y la de radio— en una única fuente de verdad del proyecto.

Ningún archivo fuente fuera de esa fuente SHALL declarar un color literal en notación hexadecimal ni en `rgb()`/`rgba()`. Los valores de color que necesita una biblioteca de terceros que no consume clases CSS (por ejemplo, la de gráficos) SHALL leerse de un módulo que derive de la misma fuente, nunca escribirse a mano en el punto de uso.

Un token declarado y no consumido por nadie SHALL considerarse una violación de este requisito: la fuente de verdad describe el sistema real, no un sistema aspiracional.

#### Scenario: Ningún componente escribe un color literal

- **WHEN** se inspecciona el código fuente de `src/pages/`, `src/widgets/`, `src/features/`, `src/entities/` y `src/shared/`
- **THEN** ningún archivo contiene un literal de color hexadecimal ni una función `rgb()`/`rgba()`, con la única excepción del módulo de tokens y de la hoja de estilos global

#### Scenario: Todo token declarado tiene al menos un consumidor

- **WHEN** se recorre la lista de tokens semánticos declarados en la fuente de verdad
- **THEN** para cada uno existe al menos un archivo del proyecto que lo consume

#### Scenario: Los colores que consume la biblioteca de gráficos salen del módulo de tokens

- **WHEN** se inspecciona el widget de gráficos del panel de resultados
- **THEN** los colores de ejes, rejilla, serie y sectores llegan importados desde el módulo de tokens, y ninguno aparece escrito literalmente en el archivo

---

### Requirement: Una severidad se ve igual en toda la aplicación

El sistema SHALL derivar de un único mapeo la apariencia visual de cada nivel de severidad, de modo que un mismo nivel se represente con el mismo color en toda la aplicación, sin importar en qué superficie aparezca (gráfico, insignia de tabla, detalle).

El conjunto de niveles cubierto por la representación gráfica y el cubierto por la representación tipo insignia SHALL ser el mismo conjunto, y ambos SHALL declarar la misma respuesta para un nivel que el sistema no enumera.

#### Scenario: Gráfico e insignia coinciden en los niveles que cubren

- **WHEN** se comparan las claves del mapeo de color de gráfico y las del mapeo de clases de insignia
- **THEN** son exactamente el mismo conjunto de niveles de severidad

#### Scenario: Un mismo nivel no se representa con dos familias de color

- **WHEN** se toma cualquier nivel de severidad enumerado y se comparan su color de gráfico y su clase de insignia
- **THEN** ambos derivan de la misma familia de color del sistema de tokens

#### Scenario: Un nivel no enumerado tiene una respuesta definida en ambas representaciones

- **WHEN** se consulta el mapeo con un nivel de severidad que el sistema no enumera
- **THEN** tanto la representación de gráfico como la de insignia devuelven su valor de reserva, y ninguna falla ni devuelve indefinido

---

### Requirement: Toda superficie de la aplicación deriva su apariencia del sistema compartido

Las superficies visuales que se repiten en más de una pantalla —el contenedor de página, el encabezado de página, la tarjeta de contenido y la tabla de datos— SHALL provenir de un primitivo compartido.

Ningún par de módulos SHALL declarar por su cuenta la misma cadena de clases de composición para una de esas superficies: si dos lugares necesitan la misma apariencia, la obtienen del mismo primitivo.

Esto SHALL valer por igual para las pantallas de presentación (inicio, información), las de escaneo (formulario, espera) y las del panel de resultados: ninguna es una excepción con lenguaje visual propio.

#### Scenario: Las páginas comparten un mismo contenedor

- **WHEN** se inspeccionan las páginas de inicio, de escaneo, de información y de resultados
- **THEN** todas obtienen el contenedor de página del mismo primitivo compartido, y ninguna redeclara sus clases de composición

#### Scenario: Las tarjetas del panel de resultados no redeclaran su apariencia

- **WHEN** se inspeccionan los widgets del panel de resultados que presentan contenido en tarjeta
- **THEN** ninguno declara una constante propia de clases de tarjeta: todos componen sobre el primitivo compartido

#### Scenario: Las dos tablas del panel comparten primitivo

- **WHEN** se inspeccionan la tabla de detalle de vulnerabilidades y la de endpoints más afectados
- **THEN** ambas obtienen la estructura visual de la tabla del mismo primitivo, y ninguna declara sus propias clases de tabla, encabezado o celda

#### Scenario: Toda página presenta su encabezado con el mismo patrón

- **WHEN** se recorren las páginas que exponen un encabezado de título
- **THEN** todas lo obtienen del mismo primitivo de encabezado, con la misma jerarquía tipográfica y el mismo espaciado respecto de la barra de navegación fija

---

### Requirement: La armonización no altera el comportamiento observable

Este trabajo SHALL ser puramente visual. Ningún contrato de datos, ninguna llamada de red, ningún esquema de validación, ningún estado de sesión y ninguna condición de renderizado SHALL cambiar como consecuencia de él.

Toda la suite de tests existente SHALL seguir pasando sin que se relaje, se elimine ni se marque como omitida ninguna aserción de comportamiento. Un test existente SHALL poder cambiar únicamente cuando afirmaba una clase de presentación concreta que el sistema de tokens reemplaza, nunca cuando afirmaba un comportamiento.

#### Scenario: Los contratos de datos quedan intactos

- **WHEN** se comparan los módulos de API, de esquemas de validación y de estado de dominio antes y después del cambio
- **THEN** no presentan diferencias

#### Scenario: La suite de comportamiento sigue verde

- **WHEN** se ejecuta la suite completa de tests del frontend
- **THEN** termina sin fallos, y ningún test de comportamiento fue eliminado ni omitido

#### Scenario: El proyecto compila

- **WHEN** se ejecuta la construcción de producción del frontend
- **THEN** el comando termina con código de salida `0` y sin errores de TypeScript

---

### Requirement: La armonización respeta las garantías de adaptabilidad ya vigentes

La pasada visual SHALL preservar las garantías que la aplicación ya ofrece sobre pantallas angostas: ninguna superficie SHALL fijar un ancho ni un ancho mínimo en píxeles, y toda disposición en varias columnas SHALL partir de una sola columna y ampliarse a partir de puntos de corte.

Esta garantía SHALL extenderse a las superficies del panel de resultados, que hasta ahora quedaban fuera del alcance verificado.

#### Scenario: Ninguna superficie nueva fija un ancho en píxeles

- **WHEN** se inspeccionan las declaraciones de estilo de todas las páginas y widgets, incluidos los del panel de resultados
- **THEN** ninguna fija un ancho ni un ancho mínimo en píxeles, ni mediante utilidad ni mediante estilo en línea

#### Scenario: Las rejillas del panel parten de una columna

- **WHEN** se inspeccionan las disposiciones en rejilla de los indicadores, los gráficos y los filtros del panel de resultados
- **THEN** su estado base es de una sola columna y las columnas adicionales se aplican a partir de un punto de corte

#### Scenario: Una tabla ancha no desborda la página

- **WHEN** se inspeccionan las tablas de datos del panel de resultados
- **THEN** cada una delega su desbordamiento horizontal a un contenedor propio, de modo que el documento no se desplace horizontalmente
