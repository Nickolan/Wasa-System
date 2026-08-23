## Context

CHANGE-00b dejó el frontend con la estructura FSD materializada y verificada por tests, pero con `src/shared/ui/` y `src/shared/lib/` vacíos (solo `.gitkeep`, más el `aliasProbe.ts` que usó el scaffold para probar la resolución de alias). Este change llena esos dos directorios con lo mínimo que necesitan los ocho changes de frontend que vienen después.

Estado real del proyecto al momento de proponer (verificado sobre el árbol, no sobre la KB):

- **Stack instalado**: React 19.2, TypeScript 6.0, Vite 8.2, Tailwind CSS 4.3 (plugin `@tailwindcss/vite`, `@import "tailwindcss"` en `src/app/index.css`, sin `tailwind.config.*`), Vitest 4.1 + Testing Library React 16.3 + `user-event` 14.6 + jsdom 29, oxlint como linter. Es más nuevo que la tabla de `knowledge-base/02_descripcion_general.md` por decisión D-2 de CHANGE-00b ("lo que scaffoldea el template hoy, sin downgrade").
- **Tests**: viven en `wasa-landing/tests/` (no colocados junto al código); `vite.config.ts` los incluye con `include: ['tests/**/*.test.{ts,tsx}']` y `setupFiles: ['./tests/setup.ts']` (que importa `@testing-library/jest-dom/vitest`).
- **Guardia FSD ya operativa**: `tests/fsd-boundaries.test.ts` + `tests/support/fsd.ts` recorren **todo** `src/` y fallan ante cualquier import que cruce hacia una capa anterior. Es genérica: los componentes nuevos quedan cubiertos automáticamente, sin escribir un test de fronteras por componente.
- **Sin sistema de diseño**: no hay tokens, ni paleta semántica, ni `@theme`. La única referencia visual existente es el placeholder de `LandingPage` (`bg-slate-950` / `text-slate-100`), es decir, un fondo oscuro. CHANGE-20 (`design-system`) es el change que introduce tokens.
- **`clsx` y `tailwind-merge` no están instalados**: son dependencias nuevas de este change.

Restricciones que condicionan el diseño:

- **Regla de capas estricta** (`knowledge-base/08_arquitectura_propuesta.md`): `shared/` no conoce nada del dominio WASA. Es la restricción dura de este change: el `Modal` no puede saber que existe el login, el `Input` no puede saber que existe `target_url`.
- **Consumidores ya comprometidos por el roadmap**: CHANGE-16 (LoginForm/RegisterForm con React Hook Form + Zod), CHANGE-18 (ScanForm con checkbox ético y selects de nivel/riesgo), CHANGE-19 (LoginModal/RegisterModal construidos sobre `Modal`), CHANGE-13 (`authStore.hydrate()` consumiendo `jwtIsExpired`). El contrato de props se diseña para esos cuatro consumidores, no en abstracto.
- **React Hook Form es el consumidor principal de `Input` y `Checkbox`**: RHF esparce `name`, `onChange`, `onBlur` y una `ref` sobre el control. Si los primitivos no reenvían props nativas ni `ref`, el `register()` de RHF no funciona y CHANGE-16 tendría que envolverlos con `Controller` — fricción evitable que se resuelve acá.
- **Modo TDD estricto activo**: cada componente entra por un test que falla primero. El runner ya existe, así que no hay tareas de tooling previas salvo instalar dos dependencias.
- **Governance BAJO**: primitivos de presentación, sin superficie de seguridad propia. La única pieza con matiz de seguridad es `jwtIsExpired`, y su política se fija explícitamente en D-8/D-9.

## Goals / Non-Goals

**Goals:**

- Entregar cinco primitivos de UI reutilizables, accesibles y agnósticos del dominio, listos para que CHANGE-16/18/19 los compongan sin modificarlos.
- Entregar `shared/lib/utils.ts` con `cn()` y `jwtIsExpired()`, cerrando de paso la mitad de utilidades de CHANGE-13.
- Dejar cada componente testeado por comportamiento observable (lo que ve y hace el usuario), no por detalles de implementación.
- Dejar las clases de estilo concentradas en un punto por componente, para que CHANGE-20 las reemplace por tokens sin tocar la lógica.
- Mantener verde la guardia de fronteras FSD sin excepciones ni supresiones.

**Non-Goals:**

- **Sin sistema de diseño**: sin paleta semántica, sin `@theme`, sin tokens, sin dark mode explícito, sin tipografía propia (CHANGE-20).
- **Sin componentes de dominio**: nada de `LoginForm`, `ScanForm`, `LoginModal` ni `AuthWall` (CHANGE-16/18/19).
- **Sin más primitivos que los cinco del roadmap**: sin `Select`, `Textarea`, `Tooltip`, `Toast`, `Card`, `Badge`. Los selects de SQLMap de CHANGE-18 se resuelven allá con `<select>` nativo o promoviendo un primitivo en su momento, con un consumidor real que justifique el contrato.
- **Sin focus trap ni gestión de foco completa en el `Modal`** (ver D-13 y Riesgo R-3).
- **Sin animaciones de entrada/salida**, sin `framer-motion`, sin librería de componentes (Radix, Headless UI, shadcn): el scope pide primitivos propios.
- **Sin Storybook** ni catálogo visual.
- **Sin tocar `authStore`, `axiosInstance`, `entities/` ni el backend.**

## Decisions

### D-1. `cn()` = `clsx` + `tailwind-merge`, ambas como dependencias de runtime

**Decisión**: instalar `clsx@^2.1` y `tailwind-merge@^3.6` en `dependencies` (no en `devDependencies`: viajan en el bundle de producción). `cn()` es `twMerge(clsx(inputs))`, con la firma `(...inputs: ClassValue[]) => string` reexportando el tipo `ClassValue` de clsx.

**Rationale**: es exactamente lo que pide el roadmap y es el patrón estándar del ecosistema Tailwind. `clsx` resuelve la parte condicional (objetos, arrays, falsy) y `tailwind-merge` resuelve la parte que `clsx` no puede: que `"px-4 px-8"` colapse a `px-8`. Sin el merge, la `className` que pasa un consumidor no puede sobreescribir la clase por defecto del componente — quedan ambas en el `class` y gana la que esté después en el CSS generado, que el componente no controla.

**Versión**: `tailwind-merge` 3.x es la línea alineada con Tailwind CSS v4 (la 2.x apunta a v3, con otros grupos de utilidades). El proyecto usa Tailwind 4.3, así que la major importa: instalar la 2.x produciría merges incorrectos silenciosos. En apply se verifica la versión efectiva instalada y, si el registry ofreciera una major más nueva declarada como compatible con Tailwind 4, se adopta y se registra la desviación (mismo criterio que D-2 de CHANGE-00b).

**Alternativa descartada**: escribir un `cn()` casero con `.filter(Boolean).join(" ")`. Barato hoy, pero no resuelve conflictos de utilidades — el problema real por el cual existe la función.

### D-2. `shared/lib/utils.ts` lo implementa completo este change; CHANGE-13 pasa a ser consumidor

`CHANGES.md` declara `src/shared/lib/utils.ts` en el scope de **dos** changes que corren en paralelo: CHANGE-13 (`jwtIsExpired`) y CHANGE-15 (`cn` + `jwtIsExpired`). Dos changes escribiendo el mismo archivo en paralelo es una colisión anunciada.

**Decisión**: CHANGE-15 es el **dueño** del módulo e implementa las dos funciones. CHANGE-13 no crea ni edita `utils.ts`: solo lo importa. Su criterio de aceptación "`jwtIsExpired(token)` retorna true si el claim `exp` está en el pasado" queda satisfecho por los tests de este change y se verifica allá por composición (`hydrate()` con token vencido limpia el store).

**Rationale**: `jwtIsExpired` está literalmente en el scope de ambos, y de los dos este es el único que declara el archivo entero. Un dueño único elimina el conflicto de merge y el riesgo de dos implementaciones divergentes de la misma función.

**Consecuencia operativa**: si por orden de ejecución CHANGE-13 se implementara **antes** que este change y creara `utils.ts` con su propia `jwtIsExpired`, este change no la reescribe a ciegas: la somete a los escenarios de `specs/shared-client-utils/spec.md` y la ajusta solo en lo que no los cumpla (en particular la política fail-closed de D-8, que es más estricta que el criterio de aceptación de CHANGE-13).

**Tests separados por función**: `tests/shared-lib-cn.test.ts` y `tests/shared-lib-jwt-is-expired.test.ts`, no un único `utils.test.ts`. Si las dos ramas se tocan igual, el conflicto queda acotado a un archivo de producción y no también al de tests.

### D-3. Exports nombrados, un componente por archivo, sin barrel

**Decisión**: cada primitivo se exporta como export **nombrado** (`export function Button(...)`), un componente por archivo, y **no** se crea `shared/ui/index.ts`. Los consumidores importan `import { Button } from '@shared/ui/Button'`.

**Rationale**: el import nombra el archivo real, lo que hace obvio de dónde sale cada cosa y mantiene la guardia FSD legible (el specifier ya dice la capa y el módulo). Un barrel agregaría un punto de indirección que, con `verbatimModuleSyntax` activo y cinco componentes, no compra nada y sí facilita ciclos de import cuando la carpeta crece.

**Desviación consciente**: `src/pages/LandingPage/index.tsx` usa `export default`. La convención de este change aplica a `shared/ui/`, donde los módulos son piezas atómicas y no puntos de entrada de una ruta. No se toca lo existente.

### D-4. Props = props nativas del elemento + un puñado de props propias, con `className` fusionada por `cn()`

**Decisión**: cada primitivo declara su interfaz como `ComponentPropsWithoutRef<'button' | 'input'> & { …props propias }`, esparce el resto (`...rest`) sobre el elemento nativo y compone su `class` como `cn(clasesBase, clasesDeVariante, clasesDeEstado, className)` — con `className` **al final**, para que el consumidor gane.

**Rationale**: es lo que necesitan los consumidores ya comprometidos. RHF esparce `name`/`onChange`/`onBlur`/`ref` sobre el control; CHANGE-16 necesita `type="submit"` en el botón del form; CHANGE-18 necesita `placeholder` y atributos de validación en los inputs. Declarar props una por una obligaría a volver a tocar `shared/` cada vez que un feature necesita un atributo HTML más — exactamente la clase de acoplamiento que la capa `shared/` existe para evitar.

### D-5. React 19: `ref` es una prop normal, sin `forwardRef`

**Decisión**: los primitivos que envuelven un control (`Button`, `Input`, `Checkbox`) declaran `ref?: Ref<HTMLButtonElement | HTMLInputElement>` como prop y la pasan al elemento nativo. Sin `forwardRef`.

**Rationale**: React 19 permite `ref` como prop en componentes función y `forwardRef` quedó como legado. La `ref` **es obligatoria funcionalmente**: `register()` de RHF la usa para leer el valor del control no controlado. Sin ella, CHANGE-16 no puede usar `register` sobre estos primitivos.

### D-6. Variantes y tamaños viven en mapas `Record<Variante, string>` a nivel de módulo

**Decisión**: cada componente define sus clases por variante/tamaño/estado en un objeto constante a nivel de módulo (por ejemplo `const VARIANT_CLASSES: Record<ButtonVariant, string>`), en lugar de encadenar ternarios dentro del JSX.

**Rationale**: CHANGE-20 va a reemplazar utilidades planas (`bg-sky-600`) por tokens semánticos. Con un mapa por componente, ese change es una edición de constantes en un lugar por archivo, sin tocar lógica ni tests de comportamiento. Además hace que agregar una variante sea una entrada más en el mapa y un caso más en el test.

**Estilo visual base**: el placeholder actual es de fondo oscuro (`bg-slate-950`), así que las variantes se eligen legibles sobre oscuro (primary: fondo `sky-600` con texto claro; secondary: fondo transparente con borde). Es provisorio por definición — el contrato que los tests fijan es "las variantes producen `class` distinto y `primary` es el default", no los valores concretos de color.

### D-7. Ids de accesibilidad generados con `useId()`, con override opcional

**Decisión**: `Input` y `Checkbox` generan su `id` con `useId()` de React cuando el consumidor no pasa uno explícito, y derivan de él los ids del mensaje de error y del helper (`${id}-error`, `${id}-helper`). El `aria-describedby` apunta al que corresponda; el `for` del label siempre apunta al `id` del control.

**Rationale**: la asociación label↔control es lo que hace que los tests puedan buscar por etiqueta accesible y lo que hace usable el formulario con lector de pantalla. Un id fijo hardcodeado rompería con dos instancias del mismo campo en pantalla (el modal de registro tiene dos campos de contraseña). `useId()` es estable entre render y SSR y no requiere contador propio.

**Precedencia error > helper**: con ambos presentes se muestra solo el error. Mostrar los dos duplica el mensaje leído por `aria-describedby` y compite visualmente en el punto exacto en que el usuario necesita una sola instrucción.

### D-8. `jwtIsExpired` es fail-closed y no verifica firma

**Decisión**: ante cualquier token inspeccionable con dudas — vacío, sin tres segmentos, payload no decodificable, JSON inválido, sin `exp`, `exp` no numérico — la función devuelve `true` (expirado). Nunca lanza: todo el parseo va dentro de un `try/catch` que retorna `true` en el `catch`. Y **no verifica la firma**: eso es autoridad del Bridge (`request-authentication` / CHANGE-06).

**Rationale**: es la decisión de seguridad del change, y es asimétrica. Un falso "expirado" cuesta un login de más. Un falso "vigente" deja al usuario con una sesión fantasma: la UI le muestra el formulario de escaneo, el submit se va contra el Bridge y vuelve un 401 opaco que el usuario no pidió. Fail-closed convierte cualquier ambigüedad en el error barato.

Que no verifique firma es igual de deliberado: el frontend no tiene ni puede tener `JWT_SECRET`. Esta función es una **conveniencia de UX** (no restaurar una sesión muerta al recargar), no un control de seguridad. El control real es `get_current_user` en el Bridge, que sí valida firma y expiración. La docstring de la función lo dice explícitamente para que nadie la ascienda a control de acceso en un change futuro.

### D-9. Decodificación base64url a mano, sin dependencia extra

**Decisión**: `jwtIsExpired` parte el token por `.`, toma el segundo segmento, convierte base64url a base64 (`-` → `+`, `_` → `/`), le agrega el padding `=` faltante, lo pasa por `atob` y luego por `JSON.parse`. Compara `payload.exp` (segundos, RFC 7519) contra `Math.floor(Date.now() / 1000)`, sin margen de tolerancia (leeway 0).

**Rationale**: el roadmap lo pide explícitamente sin librería adicional, y son ~8 líneas. `atob` está en todos los navegadores objetivo y en jsdom. El detalle que hay que hacer bien es base64url: `atob` sobre un payload con `-`/`_` o sin padding lanza `InvalidCharacterError`, y la política fail-closed lo convertiría en "expirado" — un bug que se manifestaría como logouts intermitentes según el contenido del payload. Por eso hay un escenario dedicado en la spec.

**Segundos, no milisegundos**: confundir la unidad es el otro bug clásico (todo token parece expirado en 1970, o ninguno expira nunca). También tiene escenario propio.

**Sin leeway**: el Bridge emite tokens de 24h por default; un margen de segundos no cambia nada práctico y agrega un parámetro que nadie configura.

### D-10. `Button` con `loading`: deshabilitado, `aria-busy`, spinner antes del label que permanece visible

**Decisión**: `disabled={disabled || loading}`, `aria-busy={loading}`, y con `loading` activo se renderiza `<Spinner aria-hidden />` **antes** de `children`, que sigue visible.

**Rationale**: el criterio funcional es que no haya doble submit (HU-05-02, y los "no hay doble submit" de CHANGE-16/18). `disabled` lo garantiza en el DOM, no por convención. Mantener el label visible evita el salto de layout de reemplazarlo por un spinner y conserva el nombre accesible del botón. El `aria-busy` va en el botón, y el spinner queda decorativo para no anunciar dos veces lo mismo.

### D-11. `Modal` es totalmente controlado y se **desmonta** al cerrar

**Decisión**: `isOpen` + `onClose` son la única fuente de verdad; con `isOpen === false` el componente retorna `null` (no renderiza oculto con `hidden` ni `display:none`).

**Rationale**: desmontar resetea el estado de `children` gratis — el `LoginModal` de CHANGE-19 reabre con el formulario limpio, sin lógica de reset. Además evita el problema clásico de contenido oculto pero focusable (inputs de un modal cerrado alcanzables con Tab). El costo — perder lo tipeado al cerrar — es el comportamiento esperado de un modal de auth.

### D-12. Cierre por backdrop mediante comparación `target === currentTarget`, no `stopPropagation` en el contenido

**Decisión**: el `onClick` del backdrop cierra solo si `event.target === event.currentTarget`.

**Rationale**: `stopPropagation()` en el contenedor del diálogo funciona, pero corta la propagación de **todos** los clics del contenido hacia arriba, lo que rompe patrones legítimos de los consumidores (un handler en un ancestro, cierre de un dropdown al click-outside). Comparar target/currentTarget logra lo mismo sin interferir con el árbol de eventos ajeno.

El listener de `Escape` se registra en `document` dentro de un `useEffect` que depende de `isOpen`, y la función de limpieza lo remueve al cerrar o desmontar. La spec tiene un escenario dedicado a que el listener no sobreviva al cierre: un listener huérfano cerraría un modal que ya no está, o llamaría `onClose` de un componente desmontado.

### D-13. Accesibilidad del `Modal`: `role="dialog"` + `aria-modal` + `aria-labelledby` + bloqueo de scroll; **sin focus trap**

**Decisión**: el contenedor lleva `role="dialog"`, `aria-modal="true"` y, cuando se pasa `title`, un `aria-labelledby` apuntando al heading del título. Mientras está abierto se bloquea el scroll del `body` (guardando y restaurando el valor previo de `overflow`). **No** se implementan focus trap, foco inicial automático ni restauración de foco al cerrar.

**Rationale**: los cuatro primeros son atributos declarativos, cuestan una línea cada uno y son lo que hace que el diálogo se anuncie como tal. El focus trap es otra categoría: requiere calcular los elementos focusables, interceptar Tab/Shift+Tab y manejar contenido que cambia en vivo — es una feature con su propia superficie de bugs, no un atributo. Queda registrado como deuda explícita (R-3) y como candidato natural para CHANGE-20, donde ya hay un consumidor real (los modales de auth) para validarla.

### D-14. `Spinner` decorativo por defecto, anunciable bajo demanda

**Decisión**: `<Spinner />` renderiza el SVG con `aria-hidden="true"` y sin rol. `<Spinner label="…" />` lo envuelve en un contenedor `role="status"` con el texto accesible (visualmente oculto vía `sr-only`).

**Rationale**: su uso dominante es dentro de `Button loading`, donde el botón ya expone `aria-busy` y su propio label — un `role="status"` ahí duplicaría el anuncio. Pero como spinner suelto (pantalla de carga, resultado pendiente) sí necesita anunciarse. El default cubre el caso frecuente y el opt-in cubre el otro, sin dos componentes.

**SVG inline**: el círculo con `animate-spin` de Tailwind, sin librería de iconos. Una dependencia de iconos para un spinner es desproporcionada, y un SVG inline se estiliza con `currentColor` (hereda el color del botón que lo contiene, gratis).

### D-15. Tests en `tests/`, uno por componente, por comportamiento observable

**Decisión**: los tests van en `wasa-landing/tests/` (donde ya los busca `vite.config.ts`), con un archivo por unidad: `button.test.tsx`, `input.test.tsx`, `checkbox.test.tsx`, `spinner.test.tsx`, `modal.test.tsx`, `shared-lib-cn.test.ts`, `shared-lib-jwt-is-expired.test.ts`. Se usa Testing Library con queries por rol y por etiqueta accesible, y `user-event` para interacción (clic, teclado). Se evita consultar por clase CSS salvo en los escenarios cuyo objeto **es** la clase (bordes de error/validez, variantes distintas, `animate-spin`).

**Rationale**: el proyecto ya fijó `tests/` como convención en CHANGE-00b; mantenerla evita dos lugares donde buscar. `user-event` sobre `fireEvent` porque simula la secuencia real de eventos (un `Escape` genera keydown/keyup, un clic genera pointer/mouse/focus), que es justo lo que estos componentes escuchan.

**Sobre los tests de clase**: son frágiles ante CHANGE-20 por naturaleza. Se acotan a afirmar *que las clases difieren* o *que la clase de estado está presente*, nunca el valor de color exacto — así el cambio a tokens no rompe la suite (ver R-1).

### D-16. La guardia FSD existente cubre este change sin agregar tests de fronteras

**Decisión**: no se escribe ningún test nuevo de fronteras de capas. Se agrega en cambio un test de que `shared/ui/` y `shared/lib/` no contienen texto de dominio hardcodeado, que es la parte de la regla que la guardia genérica **no** puede ver.

**Rationale**: `tests/fsd-boundaries.test.ts` ya recorre todo `src/` y falla ante cualquier import que cruce hacia arriba — los cinco componentes nuevos entran en su barrido sin tocarla. Lo que ningún analizador de imports detecta es un `Modal` que diga "Iniciar sesión" en su interior: eso no es un import, es acoplamiento semántico, y es el modo realista en que la regla "`shared/` no conoce el dominio" se viola en la práctica.

## Risks / Trade-offs

**R-1. Los tests que afirman clases CSS se rompen con CHANGE-20.**
Los escenarios de borde rojo/verde y de variantes distintas miran el `class` del elemento. Cuando CHANGE-20 reemplace `border-red-500` por un token semántico, esos tests fallan.
*Mitigación*: las clases de estado se leen desde los mismos mapas de constantes que usa el componente (D-6), no como literales duplicados en el test; y los escenarios de variante afirman *diferencia entre variantes*, no un valor de color. Así CHANGE-20 actualiza el mapa y la suite lo sigue.

**R-2. `tailwind-merge` desalineado de la major de Tailwind produce merges incorrectos silenciosos.**
Si se instalara la línea 2.x (pensada para Tailwind v3) sobre este proyecto que usa Tailwind 4.3, `cn()` no reconocería los grupos de utilidades nuevos y dejaría pasar conflictos sin colapsar — un bug invisible que se manifiesta como un `className` de consumidor que "no hace nada".
*Mitigación*: D-1 fija la línea 3.x, la tarea de instalación verifica la versión efectiva, y hay un escenario de spec (`cn("px-4","px-8") === "px-8"`) que falla si el merge no está funcionando.

**R-3. Sin focus trap, el modal es imperfectamente accesible.**
Con el modal abierto, Tab puede llevar el foco a elementos de la página de fondo. Es una brecha real de accesibilidad, aceptada conscientemente.
*Mitigación*: `aria-modal="true"` ya le indica al lector de pantalla que el contenido de fondo es inerte (lo cubre para el modo de navegación por lectura, no para el foco de teclado), y el bloqueo de scroll reduce el efecto práctico. Queda registrado como deuda explícita para CHANGE-20.

**R-4. Colisión con CHANGE-13 sobre `shared/lib/utils.ts` si corren realmente en paralelo.**
Ambos changes lo declaran en su scope y el roadmap los pone en la misma tanda.
*Mitigación*: D-2 asigna la propiedad del archivo a este change y define qué hacer si CHANGE-13 llegó primero. Los tests están separados por función para acotar el conflicto.

**R-5. El contrato de props se está diseñando sin sus consumidores escritos.**
`Input`, `Checkbox` y `Modal` se diseñan contra lo que CHANGE-16/18/19 *van a* necesitar según el roadmap, no contra código real. Algo va a faltar (el caso más probable: un `Select` para nivel/riesgo de SQLMap en CHANGE-18, o una variante `danger` de `Button`).
*Mitigación*: apoyarse en props nativas (D-4) hace que la mayoría de las carencias se resuelvan del lado del consumidor sin tocar `shared/`. Y agregar una variante a un mapa (D-6) es aditivo, no un rediseño.

**R-6. `atob` está deprecado en Node, aunque no en el navegador.**
Los tests corren en jsdom, donde `atob` existe. Si algún día una utilidad de `shared/lib` se ejecutara en Node puro, convendría `Buffer.from(..., "base64")`.
*Mitigación*: el frontend es exclusivamente de navegador (sin SSR, sin router, sin Node runtime en el roadmap) y jsdom lo provee. Fuera de eso, el `try/catch` fail-closed impide que un `atob` inexistente escale a una excepción no manejada.

## Migration Plan

No aplica: el change es puramente aditivo. Crea archivos nuevos en `src/shared/ui/` y `src/shared/lib/`, y agrega dos dependencias a `package.json`. Ningún archivo existente cambia de comportamiento, no hay datos que migrar, no hay API que versionar y no hay consumidores previos que romper (nadie importa todavía de `shared/ui/`).

Rollback: revertir el commit y desinstalar `clsx` + `tailwind-merge` deja el frontend exactamente en el estado de CHANGE-00b.

## Open Questions

- **OQ-1 — ¿`Select` entra acá o en CHANGE-18?** CHANGE-18 necesita controles para `sqlmap_level` (1-5) y `sqlmap_risk` (1-3) con tooltips. El roadmap **no** lista `Select` en el scope de este change, así que queda afuera (Non-Goal). Se resuelve en CHANGE-18, donde habrá un consumidor real que defina el contrato en lugar de adivinarlo. *Sin bloqueo para este change.*
- **OQ-2 — ¿Los colores provisorios de las variantes sobreviven a CHANGE-20?** Casi seguro que no, y está bien: D-6 los concentra en un mapa por componente justamente para que ese reemplazo sea barato. *Sin bloqueo.*
- **OQ-3 — ¿Hace falta una variante `danger` de `Button`?** Ningún consumidor del roadmap la pide hoy (no hay acciones destructivas en la Landing; el logout de HU-06-05 es local y no destructivo). Se omite hasta que exista el consumidor. *Sin bloqueo.*
