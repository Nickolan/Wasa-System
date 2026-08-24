## Context

Motivación en `proposal.md` §Why. Lo que este design fija es el estado real del código con el que se trabaja y las restricciones que condicionan el enfoque.

**Lo que ya existe y este change consume sin tocar**

| Pieza | Dónde | Qué aporta a CHANGE-19 |
|---|---|---|
| Estado de sesión | `src/entities/user/model/authStore.ts`, exportado como `useAuthStore` por `src/entities/user/index.ts` | `isAuthenticated`, `logout`; el `hydrate` ya lo invoca `App.tsx` al montar |
| Formularios de auth | `src/features/auth/index.ts` | `LoginForm` (props `onSuccess`, `onSwitchToRegister`) y `RegisterForm` (props `onSuccess`, `onSwitchToLogin`) |
| Formulario de escaneo | `src/features/scan-form/index.ts` | `ScanForm` — sin props; ya trae validación, estados de carga/éxito/error y redirección al Dashboard |
| Contenedor de diálogo | `src/shared/ui/Modal.tsx` | Controlado (`isOpen`/`onClose`), cierra por `Escape` y por backdrop, bloquea el scroll del body, **desmonta** al cerrar, `role="dialog"` + `aria-modal` + `aria-labelledby` desde `title` |
| Primitivos | `src/shared/ui/` | `Button` (variantes `primary`/`secondary`, `loading`), `Input`, `Checkbox`, `Spinner` |

**Lo que está vacío**: `src/widgets/` contiene únicamente un `.gitkeep`. `src/pages/LandingPage/index.tsx` es el placeholder de CHANGE-00b más un `<ScanForm />` montado suelto con el comentario "para probarlo" — visible hoy para cualquier anónimo.

**Restricción 1 — FSD verificado por test.** `tests/fsd-boundaries.test.ts` recorre todo `src/` y falla si un archivo importa de una capa anterior en `app → pages → widgets → features → entities → shared`. Los widgets pueden importar de `features`, `entities` y `shared`; **no** de `pages` ni de `app`. El test permite el import entre slices de una misma capa, pero este design no lo usa (D-2).

**Restricción 2 — el inventario de archivos está aseverado.** `tests/structure.test.ts` afirma el contenido exacto de `src/features/auth`, `src/features/scan-form`, `src/entities/*` y `src/shared/ui`, y exige que todo `.gitkeep` restante esté anotado. Poblar `widgets/` obliga a extender ese archivo, no a aflojarlo. Nota: al borrar `src/widgets/.gitkeep` queda al menos `src/app/stores/.gitkeep`, así que la aserción `gitkeeps.length > 0` sigue en verde.

**Restricción 3 — jsdom no hace layout.** El runner es Vitest sobre jsdom: no hay CSSOM aplicado, no hay medidas, y `Element.prototype.scrollIntoView` **no está implementado** (es `undefined`, no un no-op). Ninguna aserción de "es responsive a 375 px" es verificable en la suite; y cualquier scroll tiene que llamarse de forma que no explote (D-7, D-12).

**Restricción 4 — `Modal` está congelado.** Su contrato lo fija `shared-ui-kit` con diez escenarios. Cambiarlo es cambiar una capability que este change no tiene ningún criterio de aceptación para tocar.

**Modo TDD estricto activo** (ver `~/.claude/CLAUDE.md`): el apply de este change escribe el test **antes** que cada módulo de producción, y cada grupo de `tasks.md` sigue RED → GREEN → TRIANGULATE → REFACTOR. `tasks.md` ya está estructurado así; no reordenarlo a "implementar y después testear".

**Governance MEDIO**: implementar en pasos y surfacear al usuario las decisiones no obvias. Las que se apartan de la letra de `CHANGES.md` son **D-2** (Hero no importa de otra slice de widgets: recibe el ancla por prop), **D-3** (los modales suman una quinta prop opcional, `onAuthSuccess`, que `CHANGES.md` no declara: el éxito cierra el diálogo y además desplaza la vista al formulario) y sobre todo **D-8** (el aviso ético se renderiza también para el anónimo, no sólo detrás del muro). Si alguna no se comparte, discutirla **antes** de implementarla.

## Goals / Non-Goals

**Goals:**

- Un único dueño del estado "qué modal está abierto", de forma que "los dos abiertos" sea irrepresentable en el tipo, no evitado por disciplina.
- Que la ocultación del formulario de escaneo sea por **ausencia del nodo**, verificable con una consulta al documento, y no por estilo.
- Componer widgets sobre las piezas existentes sin modificar ni un archivo de `features/`, `entities/` o `shared/`.
- Que el destino del CTA de la presentación exista siempre, en los dos estados de sesión.
- Dejar el contenido estático (herramientas, pasos) en estructuras de datos, para que el rediseño de CHANGE-20 cambie presentación sin tocar contenido.

**Non-Goals:**

- Reabrir el contrato de `Modal`, de los formularios de auth o del formulario de escaneo. Se consumen tal como están.
- Accesibilidad de foco dentro del diálogo (atrapado, foco inicial, restauración al disparador) — ver R-1.
- Ruteo, navegación por hash persistente, animaciones de apertura/cierre, o recordar en la URL qué modal estaba abierto.
- El diseño visual definitivo: acá las clases Tailwind son planas y provisionales (D-13); los tokens semánticos son CHANGE-20.
- Sincronizar los escenarios desactualizados del requisito "Cada pieza de dominio aparece únicamente en el change que la implementa" de `landing-bootstrap` (deuda de CHANGE-15/16/18 — ver `proposal.md` §Impact).

## Decisions

### D-1 — El estado de los modales es una máquina de tres estados, con un solo dueño

El estado se modela como una unión, no como dos booleanos:

```ts
// widgets/auth-modal/model/useAuthModal.ts (forma, no implementación final)
export type AuthModalMode = 'login' | 'register' | null

export interface AuthModalState {
  mode: AuthModalMode
  openLogin: () => void
  openRegister: () => void
  close: () => void
}
```

`useAuthModal()` vive en `widgets/auth-modal/model/` y su **único** llamador es `pages/LandingPage`. La página deriva `isOpen` de `mode` para cada modal y reparte `openLogin` / `openRegister` a los widgets que los disparan.

*Por qué*: con `isLoginOpen` y `isRegisterOpen` como booleanos independientes, "los dos abiertos" es un estado alcanzable que hay que evitar en cada transición, y el bug clásico —alternar dejando el anterior abierto— sólo se descubre en pantalla. Con una unión, el escenario "sólo un diálogo a la vez" de `auth-modal-flow` es cierto por construcción y el test lo confirma en vez de sostenerlo.

*Alternativas descartadas*:

- **Estado local en cada widget**: el Hero y el muro abrirían modales distintos; dos copias del mismo estado y dos diálogos posibles en el documento a la vez. Además ninguno de los dos widgets es un lugar sensato para hospedar un diálogo que el otro dispara.
- **Un store Zustand global para los modales**: convierte estado efímero de presentación en estado global de la aplicación, obliga a resetearlo entre tests y contradice la regla del proyecto de que `entities/` guarda estado de **dominio**. La visibilidad de un modal no es dominio.
- **`mode` en `useState` dentro de `LandingPage`, sin hook**: funciona, pero deja la lógica de transición (incluido el "alternar") desperdigada en la página y no testeable sin montar la Landing entera. El hook la aísla y se testea solo.

### D-2 — Ningún widget importa de otra slice de widgets: todo cruce pasa por la página

`HeroWidget` recibe por props lo que necesita del resto de la Landing:

```ts
export interface HeroWidgetProps {
  scanFormAnchorId: string
  onRequestLogin: () => void
}
```

La página importa `SCAN_FORM_ANCHOR_ID` de `widgets/scan-form` y `useAuthModal` de `widgets/auth-modal`, y se los pasa. `ScanFormWidget` recibe `onRequestLogin` y `onRequestRegister`.

*Por qué*: `tests/fsd-boundaries.test.ts` permitiría `widgets/hero → widgets/scan-form` (mismo índice de capa), pero FSD desaconseja el acoplamiento entre slices hermanas: dos secciones de la Landing que se conocen entre sí dejan de poder moverse, reordenarse o reutilizarse por separado. La página ya es el lugar que conoce a todas.

*Alternativas descartadas*:

- **Hero importa el ancla desde `widgets/scan-form`**: pasa el test, pero ata el Hero a la existencia de esa slice.
- **Literal `'scan-form'` duplicado en Hero y en ScanFormWidget**: dos fuentes de verdad para un identificador que tiene que coincidir exactamente; el día que una cambie, el CTA deja de scrollear en silencio y ningún test lo nota.
- **El ancla en `shared/`**: `'scan-form'` es un identificador de esta Landing, no una utilidad agnóstica de dominio; metería conocimiento del producto en la capa que la regla dura exige limpia.

### D-3 — El éxito de la autenticación cierra el modal y desplaza la vista al formulario (Open Question 1, resuelta)

`LoginModal` y `RegisterModal` conservan las props que declara `CHANGES.md` (`isOpen`, `onClose`, `onSwitchToRegister` / `onSwitchToLogin`) y suman una quinta, opcional: `onAuthSuccess?: () => void`. El formulario se cablea así:

```tsx
<Modal isOpen={isOpen} onClose={onClose} title="Iniciar sesión">
  <LoginForm
    onSuccess={() => { onClose(); onAuthSuccess?.() }}
    onSwitchToRegister={onSwitchToRegister}
  />
</Modal>
```

La aparición del formulario de escaneo la sigue decidiendo sola `ScanFormWidget`, suscripto a `isAuthenticated`: cuando `useLogin` establece la sesión (antes de invocar `onSuccess`, según `auth-form-flows`), el widget se re-renderiza sin que nadie se lo pida. Lo único que `onAuthSuccess` agrega es el desplazamiento de la vista.

`LandingPage` pasa el mismo `onAuthSuccess` a ambos modales:

```tsx
// src/pages/LandingPage/index.tsx (forma)
const scrollToScanForm = () => {
  document.getElementById(SCAN_FORM_ANCHOR_ID)?.scrollIntoView?.({ behavior: 'smooth' })
}
```

*Por qué*: el usuario confirmó que quiere el desplazamiento (resolución de la Open Question 1 original). Se implementa **sin distinguir el disparador** (muro vs. CTA del Hero): `useAuthModal` (D-1) no rastrea desde dónde se abrió cada modal, y agregar ese origen al estado sólo para condicionar un scroll infla la máquina de estados por una diferencia cosmética — en ambos casos el usuario termina queriendo ver el formulario recién revelado. Mismo patrón defensivo que D-7 (`?.()` en la llamada, no sólo en el acceso al elemento) para no romper en jsdom.

*Alternativa descartada*: **rastrear el origen del modal en `useAuthModal` y scrollear sólo si vino del muro**. Es lo que Open Question 1 insinuaba, pero exige que el hook de estado sepa algo que no necesita para su responsabilidad (cuál modal está abierto), y el caso "vino del Hero" tampoco se beneficia de quedarse arriba sin ver el formulario. Si en el futuro se necesita distinguir, se agrega ahí.

### D-4 — Se reutiliza `shared/ui/Modal` sin tocarlo, y su desmontaje al cerrar es lo que da "reabrir limpio"

`Modal` ya resuelve `Escape`, clic en backdrop (comparando `target === currentTarget`, así que un clic dentro del formulario no cierra), bloqueo y restauración del scroll del body, y `role="dialog"` con nombre accesible desde `title`. Los widgets `LoginModal`/`RegisterModal` son **cáscaras**: pasan `isOpen`/`onClose`, ponen el `title` y renderizan el formulario como `children`.

El requisito "un modal reabierto empieza limpio" de `auth-modal-flow` **no se implementa**: sale gratis de que `Modal` haga `return null` en vez de ocultar (D-11 de CHANGE-15). Al cerrar, `LoginForm` se desmonta y con él su `useForm`; al reabrir hay una instancia nueva. Lo mismo al alternar: `mode` cambia, un modal desmonta y el otro monta.

*Consecuencia a tener presente al implementar*: no agregar `key`, ni memoizar los formularios, ni "optimizar" manteniéndolos montados con `display:none`. Esa optimización rompería cuatro escenarios de golpe.

*Alternativa descartada*: **extender `Modal` con atrapado de foco en este change**. Cambia una capability congelada (`shared-ui-kit`, diez escenarios) por un criterio de aceptación que este change no tiene. Ver R-1.

### D-5 — El ancla vive en la sección exterior y existe en los dos estados de sesión

```tsx
// widgets/scan-form/ui/ScanFormWidget.tsx (forma)
<section id={SCAN_FORM_ANCHOR_ID}>
  {/* aviso ético — siempre (D-8) */}
  {isAuthenticated ? <>{/* ScanForm + cerrar sesión */}</> : <>{/* muro */}</>}
</section>
```

*Por qué*: `ScanForm` no acepta prop `id`, así que el ancla tiene que estar en un envoltorio de todos modos. Ponerla en el envoltorio **exterior** (y no dentro de la rama autenticada) hace que el destino del CTA exista siempre. El caso que lo justifica no es el anónimo —a ese el CTA le abre el modal— sino el usuario cuya sesión expira mientras la página está abierta: el `401` cierra la sesión (`scan-submission`), el widget vuelve al muro, y si el ancla hubiera estado en la rama autenticada, el CTA pasaría a apuntar a la nada.

*Alternativa descartada*: **envolver el `<ScanForm />` en un `<div id="scan-form">` dentro de la rama autenticada** — la letra del roadmap. El ancla desaparece justo en el estado en que el usuario más necesita que lo lleven al muro.

### D-6 — La ocultación es por ausencia del nodo, no por estilo

El muro y el formulario son ramas de un ternario sobre `isAuthenticated`, leído con un selector del store (`useAuthStore((s) => s.isAuthenticated)`), no con `getState()`.

*Por qué*: `auth-wall` exige que **ningún campo exista en el documento** sin sesión. `hidden`, `display:none` o `disabled` dejan los inputs en el DOM: accesibles por consola, por lector de pantalla en algunos casos, y presentes en cualquier serialización de la página. El selector (y no `getState()`) es lo que hace que la transición sea reactiva sin recargar.

### D-7 — El scroll vive en el hook del Hero, con invocación defensiva, y no se agrega nada a `shared/`

```ts
// widgets/hero/model/useHeroCta.ts (forma)
const element = document.getElementById(anchorId)
element?.scrollIntoView?.({ behavior: 'smooth' })
```

La llamada al método es opcional (`?.()`), no sólo el acceso al elemento.

*Por qué*: jsdom no implementa `scrollIntoView` — en el entorno de tests el método es `undefined`, así que `element.scrollIntoView({...})` **lanza `TypeError`** y tumbaría cualquier test del CTA autenticado. El `?.()` hace que el escenario "un entorno sin desplazamiento no rompe la acción" de `landing-composition` sea cierto sin stubs frágiles, y permite además testear el camino real stubbeando el método sobre el elemento.

*Alternativas descartadas*:

- **Un helper `scrollToElementId` en `shared/lib/utils.ts`**: obligaría a modificar la capability `shared-client-utils` para un único llamador. YAGNI; si CHANGE-20 necesita más scroll, ahí se promueve.
- **Stubbear `Element.prototype.scrollIntoView` en `tests/setup.ts`**: esconde el problema en vez de resolverlo, y hace que el código de producción dependa de una capacidad que el navegador sí tiene pero que nadie verifica que exista.
- **`window.location.hash = '#scan-form'`**: cambia la URL, ensucia el historial de navegación y no permite scroll suave.

### D-8 — El aviso ético se renderiza para todos, no sólo detrás del muro (desvío deliberado de `CHANGES.md`)

La letra del roadmap dice: "si `isAuthenticated` → aviso ético + `<ScanForm />`". Este design lo saca del condicional: el aviso se renderiza en la sección, en los dos estados.

*Por qué*: la KB es explícita en dos lugares y en sentido contrario a esa letra. `06_funcionalidades.md` HU-01-04 lo escribe como historia del **Usuario Anónimo** ("para que el marco ético quede explícito **antes de registrarme**") y su criterio de aceptación dice "no puede ocultarse". `03_actores_y_roles.md` lo lista en la matriz RBAC como contenido de lectura del rol Anónimo. Un aviso ético que sólo ve quien ya se registró no cumple la función que la KB le asigna. Ante conflicto entre la letra del roadmap y la KB, prevalece la KB.

*Nota de alcance*: esto **no** duplica el checkbox de declaración ética del `ScanForm` (RN-WS-01), que es otra cosa —un consentimiento por escaneo, no un aviso informativo— y sigue viviendo dentro del formulario, intacto.

*Alternativa descartada*: **el aviso en el `FooterWidget`**. Cumpliría "visible para el anónimo", pero al pie de la página, lejos del formulario que habilita, que es exactamente donde tiene que estar para cumplir su función.

### D-9 — El contenido estático son datos, no marcado

Las cuatro herramientas y los cuatro pasos se declaran como arreglos de constantes en el módulo del widget y se renderizan con un `map`:

```ts
const TOOLS = [
  { name: 'ZAP', icon: …, description: 'Detecta …' },
  …
] as const
```

*Por qué*: los escenarios de `landing-composition` afirman "al menos cuatro" y "cada tarjeta tiene descripción no vacía". Con datos, el test recorre la estructura y esas aserciones son sobre el contenido; con cuatro bloques de JSX copiados, el test sólo puede buscar textos sueltos y una tarjeta sin descripción pasa desapercibida. Además, agregar una quinta herramienta pasa a ser una línea.

*Consecuencia*: la constante se exporta desde el módulo del widget para que el test la recorra, pero **no** desde el `index.ts` de la slice: es un detalle interno, no API pública.

### D-10 — Los íconos son SVG en línea y decorativos

Cada tarjeta de herramienta y cada paso llevan un `<svg aria-hidden="true" focusable="false">` en línea. No se agregan archivos a `public/`, no se instala ninguna librería de íconos y ninguna imagen entra por red.

*Por qué*: la ilustración del Hero y los íconos de HU-01-01/HU-01-02 son adornos; su significado ya está en el texto. Marcados como decorativos, el nombre accesible de cada tarjeta sale del texto —que es lo que el escenario "la sección es legible sin los íconos" verifica— y no hay assets binarios, ni carga de red, ni configuración de bundler que mantener.

*Alternativa descartada*: **una librería de íconos (`lucide-react` o similar)**. Una dependencia nueva para seis glifos, contra el "sin dependencias nuevas" del proposal.

### D-11 — El cierre de sesión llama al store y nada más

El control de "Cerrar sesión" invoca `useAuthStore.getState().logout()` a través del selector de acción, y no emite ninguna petición.

*Por qué*: `auth-session-state` ya define que cerrar sesión es una limpieza puramente local (HU-06-05: "limpieza local únicamente, sin request al backend") — el JWT no tiene revocación del lado del Bridge. El widget no agrega nada; sólo dispara la acción que ya existe. El escenario "el cierre de sesión no habla con el servidor" es una aserción de que nadie fue creativo acá.

### D-12 — Lo responsive se verifica con un guard de fuente y un checkpoint manual, no con una aserción falsa

Dos mecanismos, ninguno de los cuales finge medir layout:

1. **Guard de fuente** (`tests/landing-responsive.test.ts`): recorre `src/widgets/` y falla si aparece una utilidad de ancho o ancho mínimo en píxeles (`w-[…px]`, `min-w-[…px]`, `width:` en estilos en línea). Es del mismo tipo que los guards de fuente que la suite ya tiene (`env.test.ts`, `storage-single-access-point.test.ts`).
2. **Checkpoint manual en `tasks.md`**: `npm run dev` y revisión a 375 px y 1280 px, con el resultado anotado en la tarea.

*Por qué*: jsdom no aplica CSS ni calcula geometría; un test que afirme "es responsive" mirando clases de Tailwind sólo verifica que alguien escribió una clase, y contradice el criterio R-1 de CHANGE-15 (los tests no afirman utilidades visuales concretas). Lo único que un test **sí** puede afirmar sin mentir es la ausencia de la construcción que rompe el diseño angosto. El resto es verificación humana, y `tasks.md` la hace explícita en vez de darla por hecha.

### D-13 — Las clases Tailwind son planas y están concentradas en constantes por componente

Cada widget declara sus clases en constantes en la cabecera del archivo (`SECTION_CLASSES`, `CARD_CLASSES`, …), como ya hacen `LoginForm`, `RegisterForm` y `Button`.

*Por qué*: continuidad con lo establecido en CHANGE-15/16/18, y es lo que permite que CHANGE-20 reemplace utilidades planas por tokens semánticos en un punto por componente sin tocar lógica ni tests.

### D-14 — Los tests existentes que caducan se reescriben, no se relajan

Dos archivos afirman hoy cosas que este change vuelve falsas o insuficientes:

- `tests/landing-page.test.tsx` sólo busca el texto "WASA". Seguiría en verde por casualidad (el Hero dice "WASA") sin verificar nada de la composición: pasa a afirmar que las cinco secciones están presentes y en orden.
- `tests/structure.test.ts` no dice nada de `src/widgets/`: pasa a enumerar el inventario exacto de la capa y a afirmar que su `.gitkeep` desapareció.

*Por qué*: es el mismo criterio de D-13 de CHANGE-18 y D-9 de CHANGE-17 — una aserción que caducó se actualiza para describir el estado nuevo; borrarla o debilitarla convierte el test en decoración.

### D-15 — Cada sección lleva nombre accesible: `aria-labelledby` al encabezado, o `aria-label` si no hay encabezado

`landing-composition` exige que cada sección sea "una región identificable del documento, de modo que se pueda alcanzar y **nombrar** sin depender de su posición visual". Un `<section>` **sin nombre accesible no expone `role="region"`**: en el árbol de accesibilidad es un contenedor genérico, indistinguible de un `<div>`. Marcar la sección con `<section>` no alcanza para cumplir el requisito.

- `HeroWidget`, `FeaturesWidget`, `HowItWorksWidget`: `aria-labelledby` apuntando al `id` de su propio encabezado (`useId()`, igual que `shared/ui/Modal`), así el nombre de la región y el título visible no pueden divergir.
- `ScanFormWidget`: no tiene encabezado visible propio, así que lleva `aria-label` con una constante (`SECTION_LABEL`), **igual en los dos estados de sesión** — la región no cambia de identidad cuando cambia su contenido, por el mismo motivo que el ancla vive afuera del condicional (D-5).
- `FooterWidget`: `<footer>` ya es `contentinfo` por sí solo; no necesita nada.

*Por qué `useId()` y no `id` literales*: los widgets son secciones únicas de una sola Landing, pero un `id` literal duplicaría el identificador en cuanto un test (o un futuro rediseño) montara dos instancias, y los `id` duplicados rompen `aria-labelledby` en silencio.

*Consecuencia para CHANGE-20*: al reemplazar utilidades planas por tokens no se puede perder el `aria-labelledby`/`aria-label` ni desacoplar el `id` del encabezado; el guard de composición lo verifica por rol y nombre, no por clase.

## Risks / Trade-offs

**[R-1] El diálogo no atrapa el foco ni lo devuelve al disparador.** `shared/ui/Modal` no implementa foco inicial, atrapado dentro del diálogo ni restauración al cerrar. Un usuario de teclado puede tabular fuera del modal abierto hacia el contenido de fondo, y al cerrarse el foco queda en `<body>`. Este change lo hereda tal cual.
→ *Mitigación*: se documenta acá y en `proposal.md` como limitación conocida en vez de resolverse a medias. `Modal` sí bloquea el scroll del body y sí cierra con `Escape`, así que el modal no es una trampa. Cerrar la brecha es un cambio a `shared-ui-kit` (tres o cuatro escenarios nuevos) y debe proponerse como tal — el candidato natural es CHANGE-20, que ya toca toda la capa de presentación.

**[R-2] El guard de "la infraestructura interna no aparece en pantalla" puede dar falsos negativos o positivos.** Si se implementa escaneando el código fuente, un comentario que mencione n8n lo hace fallar sin que nada salga en pantalla; si se implementa sobre el texto renderizado, no cubre contenido que aparezca sólo en un estado no ejercitado.
→ *Mitigación*: el guard se escribe sobre el **texto renderizado** de la Landing completa, en los dos estados de sesión (con y sin), no sobre la fuente. Un comentario del código no es "texto visible" y no debe hacerlo fallar — el precedente contrario ya costó una regresión en CHANGE-18 (`env.test.ts` falló por un literal dentro de un comentario).

**[R-3] Lo responsive queda fuera de la red de seguridad automatizada.** El criterio de aceptación menciona 375 px y 1280 px y la suite no puede verificarlo (D-12).
→ *Mitigación*: checkpoint manual obligatorio en `tasks.md` con resultado anotado, más el guard de anchos fijos. Si el checkpoint no se hace, el change no está terminado.

**[R-4] Este change es el que hace cumplir RN-WS-10 en el cliente, y es sólo el cliente.** Ocultar el formulario no impide que alguien emita `POST /api/v1/scan/start` a mano.
→ *Mitigación*: ninguna acá, y es correcto: el control real es el `401` del Bridge (`request-authentication`), que ya existe y ya está testeado. Lo que sí hace este design es no confundir las dos cosas — `auth-wall` declara explícitamente que el muro es presentación.

**[R-5] El escenario "La app renderiza el placeholder de la Landing" queda con un nombre desactualizado en el spec principal.** La herramienta exige que un requisito MODIFICADO conserve todos los escenarios existentes, y no ofrece renombrar escenarios; el escenario se conserva verbatim (su contenido sigue siendo cierto: la app renderiza `LandingPage`) y se le suma otro que afirma la composición.
→ *Mitigación*: la cobertura es correcta, el nombre es cosmético. Renombrarlo pertenece a la misma sincronización de `landing-bootstrap` que ya se difirió en `proposal.md` §Impact.

**[R-6] Riesgo de que el apply "optimice" manteniendo los formularios montados.** Cuatro escenarios de `auth-modal-flow` dependen de que `Modal` desmonte al cerrar (D-4).
→ *Mitigación*: los tests de "reabrir limpio" y "alternar limpio" se escriben en RED antes de los modales, así que cualquier intento posterior de mantenerlos montados los pone en rojo de inmediato.

## Migration Plan

No hay migración de datos, de esquema ni de API: el change es aditivo dentro del frontend. El único reemplazo es el de `pages/LandingPage/index.tsx`, cuyo contenido actual es un placeholder sin estado propio.

Efecto observable del despliegue: el formulario de escaneo **deja de estar accesible** para visitantes anónimos, que es el objetivo (RN-WS-10). Rollback = revertir el commit; no queda estado persistido por este change (el token en `localStorage` es de CHANGE-13 y no se toca).

## Open Questions

1. ~~¿El login exitoso desde el muro debería, además de cerrar el modal, desplazar la vista hasta el formulario recién revelado?~~ **Resuelta**: sí, ver D-3 (versión final) y el nuevo escenario "El éxito desplaza la vista al formulario de escaneo" en `auth-modal-flow`.
2. **Texto exacto (copy) del Hero, de las descripciones de las cuatro herramientas, de los cuatro pasos y del pie.** Las specs exigen que existan, que sean no vacíos y que no nombren la infraestructura interna; la redacción concreta puede ajustarse después sin tocar specs, diseño ni tareas.
