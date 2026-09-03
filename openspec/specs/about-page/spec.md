## Purpose

Define la página pública de información del proyecto: el lugar donde cualquier visitante —con sesión o sin ella— puede leer qué es WASA, qué herramientas ejecuta y qué detecta cada una, cómo transcurre un escaneo de punta a punta, y qué hace el sistema con los datos que le entrega. Cubre el objetivo del Usuario Anónimo declarado en la KB ("entender qué es WASA y qué detecta antes de registrarse") con la profundidad que las secciones de la Landing, pensadas como gancho breve, no alcanzan.

## Requirements

### Requirement: La página de información es pública y alcanzable por una ruta propia

La aplicación SHALL exponer la página de información en una ruta propia y estable, distinta de la de la presentación y de la del escaneo, de modo que su dirección sea compartible y recargable.

La página SHALL ser legible sin sesión iniciada: SHALL NOT presentar un muro de autenticación, SHALL NOT requerir credenciales y SHALL NOT emitir ninguna solicitud autenticada para poder mostrar su contenido. Un visitante con sesión activa SHALL ver exactamente el mismo contenido que uno sin ella.

#### Scenario: La ruta propia renderiza la página

- **WHEN** se accede a la ruta de la página de información
- **THEN** se renderiza la página de información y no la presentación ni el formulario de escaneo

#### Scenario: Sin sesión el contenido es completo

- **WHEN** un visitante sin sesión iniciada abre la página de información
- **THEN** ve el contenido completo, sin muro de autenticación ni pedido de credenciales

#### Scenario: La sesión no cambia el contenido

- **WHEN** se compara la página de información vista con sesión activa contra la vista sin sesión
- **THEN** el contenido informativo es el mismo

### Requirement: La página de información cubre cuatro temas obligatorios

El contenido de la página SHALL cubrir, cada uno en una sección identificable con su propio encabezado:

1. **Qué es WASA**: qué problema resuelve la plataforma y a quién está dirigida.
2. **Qué herramientas ejecuta**: las herramientas de análisis que el sistema orquesta —OWASP ZAP, Nuclei, ffuf y SQLMap— y qué detecta cada una.
3. **Cómo es un escaneo de punta a punta**: el recorrido desde que el usuario envía el formulario hasta que recibe el reporte, incluyendo la duración estimada y la entrega por correo electrónico.
4. **Qué pasa con los datos**: qué datos entrega el usuario al usar el sistema, para qué se usan y qué se hace con los hallazgos.

Ninguna de las cuatro secciones SHALL estar vacía ni reducirse a su encabezado. Todo el contenido SHALL estar en español.

#### Scenario: Las cuatro secciones están presentes y con nombre

- **WHEN** se inspecciona la página de información
- **THEN** contiene una sección identificable para cada uno de los cuatro temas, cada una con su encabezado

#### Scenario: Las cuatro herramientas están nombradas

- **WHEN** se lee la sección de herramientas
- **THEN** nombra OWASP ZAP, Nuclei, ffuf y SQLMap, y describe qué detecta cada una

#### Scenario: El flujo declara duración y canal de entrega

- **WHEN** se lee la sección del flujo de escaneo
- **THEN** menciona la duración estimada del escaneo y que el reporte llega por correo electrónico a la casilla del usuario

#### Scenario: Ninguna sección queda vacía

- **WHEN** se inspecciona el contenido de cada una de las cuatro secciones
- **THEN** ninguna consiste únicamente en su encabezado

### Requirement: Lo que la página afirma sobre los datos es verdadero respecto del sistema

La sección sobre el tratamiento de los datos SHALL describir únicamente comportamientos que el sistema efectivamente tiene. SHALL NOT afirmar garantías que el código no provee —cifrado en reposo, retención acotada, borrado a pedido, certificaciones— salvo que existan.

La página SHALL declarar explícitamente que WASA sólo debe usarse sobre objetivos para los que el usuario cuenta con autorización del propietario (RN-WS-01), en línea con el aviso ético que ya exhibe el formulario de escaneo.

#### Scenario: No se prometen garantías inexistentes

- **WHEN** se contrasta cada afirmación de la sección de datos con el comportamiento real del sistema
- **THEN** ninguna afirma una garantía que el sistema no provee

#### Scenario: El aviso de uso autorizado está presente

- **WHEN** se lee la página de información
- **THEN** declara que WASA sólo debe usarse sobre objetivos autorizados por su propietario

### Requirement: La página de información se alcanza desde la barra de navegación

La barra de navegación SHALL ofrecer una entrada hacia la página de información, disponible tanto en la presentación de escritorio como en la de dispositivo móvil, con el mismo tratamiento de estado activo que reciben las demás entradas de navegación interna.

La entrada SHALL navegar dentro de la aplicación, sin recargar el documento ni abrir una ventana nueva.

#### Scenario: La entrada existe en escritorio y en móvil

- **WHEN** se inspecciona la barra de navegación en su presentación de escritorio y en la de móvil
- **THEN** en ambas hay una entrada que lleva a la página de información

#### Scenario: La entrada se marca como activa en la página

- **WHEN** el usuario está en la página de información
- **THEN** la entrada correspondiente de la barra de navegación aparece en estado activo, igual que las demás entradas internas cuando su página está en pantalla

#### Scenario: La navegación es interna

- **WHEN** se activa la entrada de la barra de navegación
- **THEN** la aplicación cambia de página sin recargar el documento y sin abrir una ventana nueva

### Requirement: La página de información respeta la dirección de las capas y es adaptable

La página SHALL componerse de secciones provistas por la capa de widgets y SHALL NOT contener lógica de negocio, acceso a red ni lectura del entorno del bundler por su cuenta. Ningún módulo que la compone SHALL importar de una capa superior a la propia.

El contenido SHALL ser legible tanto en un viewport angosto de teléfono como en uno de escritorio, sin desplazamiento horizontal y sin imponer un ancho mínimo mayor al del viewport.

#### Scenario: La dirección de las capas se respeta

- **WHEN** se inspeccionan los imports de los módulos que componen la página de información
- **THEN** ninguno resuelve a una capa superior a la propia

#### Scenario: El contenido es adaptable

- **WHEN** se presenta la página en un viewport angosto de teléfono
- **THEN** el contenido se lee sin desplazamiento horizontal
