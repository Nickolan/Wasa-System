## Purpose

Primitivos de UI (`Button`, `Input`, `Checkbox`, `Spinner`, `Modal`, `Card`, `Table`, `PageShell`, `PageHeader`) en `shared/ui/`, agnósticos del dominio WASA y reutilizables por cualquier feature o entidad sin conocimiento de auth ni de escaneo.

## Requirements

### Requirement: Los primitivos de UI viven en `shared/` y son agnósticos del dominio

Los componentes `Button`, `Input`, `Checkbox`, `Spinner`, `Modal`, `Card`, `Table`, `PageShell` y `PageHeader` SHALL residir en `wasa-landing/src/shared/ui/`, un archivo por componente en `PascalCase.tsx`, y SHALL permanecer libres de todo conocimiento del dominio WASA: ninguno referencia auth, escaneo, SQLMap ni ninguna entidad del negocio, ni en sus imports, ni en sus props, ni en texto literal embebido.

Los primitivos de composición (`Card`, `Table`, `PageShell`, `PageHeader`) SHALL ser contenedores opacos: reciben su contenido por `children` y no interpretan qué es lo que contienen.

#### Scenario: Cada primitivo existe en su archivo

- **WHEN** se inspecciona `wasa-landing/src/shared/ui/`
- **THEN** existen `Button.tsx`, `Input.tsx`, `Checkbox.tsx`, `Spinner.tsx`, `Modal.tsx`, `Card.tsx`, `Table.tsx`, `PageShell.tsx` y `PageHeader.tsx`

#### Scenario: Ningún primitivo importa de una capa superior

- **WHEN** se inspeccionan los imports de todos los archivos bajo `src/shared/ui/`
- **THEN** no aparece ningún import de `@app`, `@pages`, `@widgets`, `@features` ni `@entities`, ni su equivalente por ruta relativa

#### Scenario: El texto de dominio lo aporta el consumidor, no el primitivo

- **WHEN** se inspecciona el código fuente de los primitivos
- **THEN** ninguno contiene texto de dominio hardcodeado (etiquetas de auth, de escaneo, de severidad o de la declaración ética): todo texto visible llega por props o por `children`

#### Scenario: Los primitivos de composición no interpretan su contenido

- **WHEN** se renderiza cualquiera de `Card`, `Table`, `PageShell` o `PageHeader` con contenido arbitrario por `children`
- **THEN** el contenido aparece en el documento sin transformación, y el primitivo no declara ninguna prop que describa el dominio de ese contenido

#### Scenario: El proyecto compila con los primitivos incorporados

- **WHEN** se ejecuta `npm run build` en `wasa-landing/`
- **THEN** el comando termina con código de salida `0` y sin errores de TypeScript

### Requirement: Los primitivos aceptan las props nativas de su elemento

Cada primitivo que envuelve un elemento HTML SHALL extender las props nativas de ese elemento, de modo que el consumidor pueda pasar atributos estándar (`type`, `name`, `placeholder`, `onBlur`, `aria-*`, `data-*`, `ref`) sin que el componente tenga que declararlos uno por uno. La prop `className` SHALL fusionarse con las clases internas del componente en lugar de reemplazarlas o ser ignorada.

#### Scenario: Atributos nativos llegan al DOM

- **WHEN** se renderiza `<Button type="submit" data-testid="x">Enviar</Button>`
- **THEN** el `<button>` resultante tiene `type="submit"` y `data-testid="x"`

#### Scenario: Registro de React Hook Form sobre un Input

- **WHEN** se renderiza un `Input` esparciendo sobre él el resultado de `register("email")` de React Hook Form (que aporta `name`, `onChange`, `onBlur` y `ref`)
- **THEN** el `<input>` del DOM recibe esos atributos y su `ref` queda asociada al nodo real

#### Scenario: className del consumidor se fusiona, no se pierde

- **WHEN** se renderiza un primitivo con una `className` que colisiona con una clase interna del mismo grupo de utilidades Tailwind (por ejemplo un padding distinto)
- **THEN** la clase del consumidor prevalece en el `class` final y la clase interna en conflicto no queda duplicada

### Requirement: Button expone variantes y estado de carga

`Button` SHALL soportar las variantes visuales `primary` (default) y `secondary`, y una prop booleana `loading`. Con `loading` activo el botón SHALL renderizar el `Spinner`, SHALL quedar deshabilitado y SHALL exponer `aria-busy="true"`, de modo que sea imposible disparar un segundo submit mientras hay una petición en vuelo.

#### Scenario: Botón en estado de carga

- **WHEN** se renderiza `<Button loading>Ingresar</Button>`
- **THEN** el botón contiene un `Spinner`, tiene el atributo `disabled` y `aria-busy="true"`

#### Scenario: No hay doble submit durante la carga

- **WHEN** el usuario hace clic sobre un `<Button loading onClick={fn}>`
- **THEN** `fn` no se invoca ninguna vez

#### Scenario: Botón en reposo

- **WHEN** se renderiza `<Button onClick={fn}>Ingresar</Button>` sin `loading`
- **THEN** el botón no contiene ningún `Spinner`, no está deshabilitado, y un clic invoca `fn` exactamente una vez

#### Scenario: La variante cambia la apariencia

- **WHEN** se renderizan `<Button variant="primary">` y `<Button variant="secondary">`
- **THEN** el `class` resultante difiere entre ambas, y `variant="primary"` es el comportamiento por defecto cuando la prop se omite

#### Scenario: `disabled` explícito se respeta aunque no haya carga

- **WHEN** se renderiza `<Button disabled onClick={fn}>` sin `loading`
- **THEN** el botón está deshabilitado y un clic no invoca `fn`

### Requirement: Input asocia label, error y ayuda de forma accesible

`Input` SHALL renderizar un `<label>` asociado a su `<input>` mediante un identificador único generado por el propio componente cuando el consumidor no provee uno. SHALL aceptar `error?: string` y `helper?: string`. Con `error` presente, el componente SHALL mostrar el mensaje, aplicar el borde de error (rojo) y marcar `aria-invalid="true"`, y el mensaje SHALL quedar referenciado desde el input vía `aria-describedby`. El estado `valid` SHALL aplicar el borde de validez (verde). `error` SHALL tener precedencia sobre `helper` y sobre `valid`.

#### Scenario: Label asociada al control

- **WHEN** se renderiza `<Input label="Email" />`
- **THEN** consultar el input por su etiqueta accesible "Email" lo encuentra, y el `for` del label coincide con el `id` del input

#### Scenario: Dos Inputs en la misma pantalla no colisionan de id

- **WHEN** se renderizan dos `<Input label="Email" />` y `<Input label="Contraseña" />` en el mismo árbol
- **THEN** sus inputs tienen `id` distintos y cada label apunta al suyo

#### Scenario: Estado de error

- **WHEN** se renderiza `<Input label="Email" error="Email inválido" />`
- **THEN** el texto "Email inválido" es visible, el input tiene `aria-invalid="true"`, su `aria-describedby` apunta al elemento que contiene ese texto, y su `class` incluye la utilidad de borde de error

#### Scenario: Texto de ayuda sin error

- **WHEN** se renderiza `<Input label="Email" helper="Usá tu email de trabajo" />`
- **THEN** el texto de ayuda es visible, está referenciado por `aria-describedby`, y el input no tiene `aria-invalid="true"`

#### Scenario: El error desplaza al helper

- **WHEN** se renderiza un `Input` con `helper` y `error` simultáneos
- **THEN** se muestra únicamente el mensaje de error y el texto de ayuda no aparece en el documento

#### Scenario: Estado válido

- **WHEN** se renderiza `<Input label="Email" valid />` sin `error`
- **THEN** el `class` del input incluye la utilidad de borde de validez y no la de error

#### Scenario: Input en reposo

- **WHEN** se renderiza `<Input label="Email" />` sin `error`, `helper` ni `valid`
- **THEN** no hay mensaje asociado, el input no declara `aria-describedby` y no está marcado como inválido

### Requirement: Checkbox embebe su label y expone estado de error

`Checkbox` SHALL renderizar un `<input type="checkbox">` con su label embebida y asociada, de modo que un clic sobre el texto alterne el control. SHALL aceptar `error?: string`, y con error presente SHALL mostrar el mensaje y marcar el control con `aria-invalid="true"`.

#### Scenario: Clic sobre el texto alterna el control

- **WHEN** el usuario hace clic sobre el texto de la label de `<Checkbox label="Acepto los términos" />`
- **THEN** el checkbox queda marcado

#### Scenario: Checkbox con error

- **WHEN** se renderiza `<Checkbox label="Acepto los términos" error="Debés aceptar para continuar" />`
- **THEN** el mensaje es visible, el control tiene `aria-invalid="true"` y su `aria-describedby` apunta al mensaje

#### Scenario: Estado controlado por el consumidor

- **WHEN** se renderiza `<Checkbox label="Acepto" checked={false} onChange={fn} />` y el usuario lo clickea
- **THEN** `fn` se invoca una vez y el componente no altera el estado por su cuenta

### Requirement: Spinner es un indicador SVG animado y no anunciado por defecto

`Spinner` SHALL renderizar un SVG animado (rotación continua vía la utilidad `animate-spin` de Tailwind), con tamaño configurable por prop y sin dependencias externas de iconos. Por defecto SHALL ser decorativo (`aria-hidden="true"`) para no duplicar anuncios cuando vive dentro de un control que ya expone `aria-busy`; cuando el consumidor provee una etiqueta, SHALL anunciarse como región de estado.

#### Scenario: Spinner decorativo por defecto

- **WHEN** se renderiza `<Spinner />`
- **THEN** el nodo raíz es un `<svg>` con la clase `animate-spin` y `aria-hidden="true"`, y no expone rol accesible alguno

#### Scenario: Spinner anunciado

- **WHEN** se renderiza `<Spinner label="Cargando" />`
- **THEN** existe un elemento con `role="status"` cuyo nombre accesible es "Cargando", y el SVG deja de estar oculto para las tecnologías asistivas

#### Scenario: Tamaño configurable

- **WHEN** se renderizan `<Spinner size="sm" />` y `<Spinner size="md" />`
- **THEN** el `class` del SVG difiere entre ambos tamaños

### Requirement: Modal es un contenedor controlado con backdrop y cierre por Escape

`Modal` SHALL ser completamente controlado: recibe `isOpen` y `onClose` y nunca gestiona su propia visibilidad. Con `isOpen` falso SHALL no renderizar nada en el documento. Con `isOpen` verdadero SHALL renderizar un backdrop y un contenedor de diálogo con `role="dialog"` y `aria-modal="true"`, y SHALL invocar `onClose` cuando el usuario presiona `Escape` o hace clic en el backdrop. El contenido llega exclusivamente por `children`: el `Modal` no conoce ni el contenido de auth ni el de escaneo.

El ancho máximo del diálogo SHALL ser configurable por el consumidor mediante una prop dedicada, con el ancho estrecho actual como valor por defecto, de modo que un contenido más ancho —una grilla de metadatos, una tabla— no obligue a reimplementar el primitivo. El diálogo SHALL acotar su alto y desplazar internamente su contenido cuando éste excede el alto de la ventana, en lugar de desbordar la página.

#### Scenario: Cerrado no renderiza nada

- **WHEN** se renderiza `<Modal isOpen={false} onClose={fn}>contenido</Modal>`
- **THEN** ni el contenido ni el backdrop existen en el documento

#### Scenario: Abierto renderiza backdrop y diálogo

- **WHEN** se renderiza `<Modal isOpen onClose={fn}>contenido</Modal>`
- **THEN** existe un elemento con `role="dialog"` y `aria-modal="true"` que contiene "contenido", y existe el backdrop detrás de él

#### Scenario: Cierre con Escape

- **WHEN** el modal está abierto y el usuario presiona la tecla `Escape`
- **THEN** `onClose` se invoca exactamente una vez

#### Scenario: Cierre por clic en el backdrop

- **WHEN** el usuario hace clic sobre el backdrop
- **THEN** `onClose` se invoca exactamente una vez

#### Scenario: Un clic dentro del contenido no cierra

- **WHEN** el usuario hace clic sobre un elemento de `children` dentro del diálogo
- **THEN** `onClose` no se invoca

#### Scenario: Escape no cierra un modal cerrado

- **WHEN** el modal está montado con `isOpen={false}` y se presiona `Escape`
- **THEN** `onClose` no se invoca

#### Scenario: El listener de teclado no sobrevive al cierre

- **WHEN** un modal abierto se cierra o se desmonta, y luego se presiona `Escape`
- **THEN** `onClose` no se invoca (el listener global fue removido)

#### Scenario: El diálogo toma su nombre accesible del título

- **WHEN** se renderiza `<Modal isOpen onClose={fn} title="Iniciar sesión">…</Modal>`
- **THEN** el título es visible y el elemento con `role="dialog"` toma "Iniciar sesión" como nombre accesible

#### Scenario: El scroll de la página queda bloqueado mientras el modal está abierto

- **WHEN** el modal se abre y luego se cierra
- **THEN** mientras está abierto el `body` no permite scroll, y al cerrarse el `body` recupera su estado de scroll previo

#### Scenario: El ancho por defecto es el estrecho

- **WHEN** se renderiza un `Modal` abierto sin especificar ancho
- **THEN** el diálogo aplica el mismo ancho máximo que aplicaba antes de que la prop existiera

#### Scenario: Un consumidor puede pedir un diálogo más ancho

- **WHEN** se renderizan dos `Modal` abiertos, uno por defecto y otro pidiendo el ancho amplio
- **THEN** el `class` del diálogo difiere entre ambos, y el segundo declara un ancho máximo mayor

#### Scenario: Un contenido más alto que la ventana se desplaza dentro del diálogo

- **WHEN** se renderiza un `Modal` abierto cuyo `children` excede el alto de la ventana
- **THEN** el diálogo declara un alto máximo y su propio desplazamiento vertical, y el documento de fondo sigue sin desplazarse

---

### Requirement: Card presenta contenido sobre una superficie elevada

`Card` SHALL renderizar un contenedor de superficie elevada —el mismo tratamiento visual en toda la aplicación— que recibe su contenido por `children`. SHALL aceptar opcionalmente un título, que renderiza como encabezado de la tarjeta con la jerarquía tipográfica del sistema; sin título, la tarjeta es un contenedor puro.

SHALL permitir al consumidor elegir el elemento semántico raíz (por ejemplo `section` o `div`), de modo que una tarjeta que además es una región identificable pueda declararse como tal sin envolturas adicionales. La prop `className` SHALL fusionarse con las clases internas.

#### Scenario: Card sin título es un contenedor puro

- **WHEN** se renderiza `<Card>contenido</Card>`
- **THEN** el contenido es visible y no hay ningún encabezado en el árbol de la tarjeta

#### Scenario: Card con título renderiza su encabezado

- **WHEN** se renderiza `<Card title="Distribución">contenido</Card>`
- **THEN** "Distribución" aparece como encabezado y el contenido sigue siendo visible

#### Scenario: El elemento raíz es configurable

- **WHEN** se renderiza una `Card` pidiendo `section` como elemento raíz y un nombre accesible
- **THEN** existe una región con ese nombre accesible que contiene el contenido de la tarjeta

#### Scenario: className del consumidor se fusiona

- **WHEN** se renderiza `<Card className="…">` con una clase que colisiona con una interna del mismo grupo de utilidades
- **THEN** la clase del consumidor prevalece en el `class` final y la interna en conflicto no queda duplicada

---

### Requirement: Table estructura datos tabulares con una apariencia única

`Table` SHALL proveer la estructura visual compartida de una tabla de datos: el contenedor que absorbe el desbordamiento horizontal, el elemento `<table>`, y la apariencia de la fila de encabezado y de las celdas. Las columnas, las filas y su contenido SHALL llegar por `children`: el primitivo no conoce ni los datos ni su forma.

El contenedor SHALL acotar el desbordamiento dentro de sí mismo, de modo que una tabla ancha nunca provoque desplazamiento horizontal del documento.

#### Scenario: La tabla renderiza el contenido del consumidor

- **WHEN** se renderiza una `Table` con un encabezado y dos filas provistos por `children`
- **THEN** existe un elemento `table` en el documento con ese encabezado y esas dos filas

#### Scenario: El desbordamiento queda contenido

- **WHEN** se inspecciona el contenedor que envuelve al `table`
- **THEN** declara su propio desplazamiento horizontal

#### Scenario: El primitivo no conoce los datos

- **WHEN** se inspecciona el código fuente de `Table.tsx`
- **THEN** no declara ninguna prop ni tipo que describa columnas, severidades, vulnerabilidades ni ninguna entidad del dominio

---

### Requirement: PageShell y PageHeader dan a toda página el mismo marco

`PageShell` SHALL proveer el contenedor raíz de una página: alto mínimo de ventana, fondo base del sistema y disposición vertical. `PageHeader` SHALL proveer el encabezado de una página: el título con la jerarquía tipográfica de página, un subtítulo opcional, y el espaciado que despeja la barra de navegación fija.

`PageHeader` SHALL renderizar su título como el encabezado de primer nivel del documento, de modo que cada página siga teniendo exactamente uno.

#### Scenario: PageShell envuelve el contenido de la página

- **WHEN** se renderiza `<PageShell>contenido</PageShell>`
- **THEN** el contenido es visible dentro de un elemento `main`

#### Scenario: PageHeader expone el encabezado de primer nivel

- **WHEN** se renderiza `<PageHeader title="Panel de resultados" />`
- **THEN** existe un encabezado de nivel 1 cuyo texto es "Panel de resultados"

#### Scenario: El subtítulo es opcional

- **WHEN** se renderiza un `PageHeader` sin subtítulo y otro con subtítulo
- **THEN** el primero no agrega ningún párrafo al documento y el segundo muestra el texto del subtítulo

#### Scenario: Una página compuesta tiene un solo encabezado de primer nivel

- **WHEN** se renderiza cualquiera de las páginas de la aplicación
- **THEN** el documento contiene exactamente un encabezado de nivel 1
