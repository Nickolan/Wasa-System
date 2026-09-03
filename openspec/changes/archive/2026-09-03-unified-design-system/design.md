## Context

Ver `proposal.md` §Why para la motivación. Lo que sigue es sólo el estado actual que condiciona el enfoque.

**El lenguaje visual de la landing ya existe y es coherente.** `src/app/index.css` define utilidades de composición (`.glass-card`, `.glass-nav`, `.text-gradient`, `.glow-brand`, `.bg-grid-pattern`) y seis animaciones con retardos escalonados. `HeroWidget`, `FeaturesWidget`, `HowItWorksWidget` y `Navbar` las consumen de forma consistente: superficie `slate-950`, tarjetas glassmorphism `rounded-2xl`, acento `sky`, texto en la rampa `slate-100 → 300 → 400 → 500 → 600`.

**El dashboard no la sigue.** CHANGE-26 lo portó a "un tema oscuro coherente con el resto", pero en la práctica inventó su propio dialecto: tarjetas planas `rounded-lg border border-slate-800 bg-slate-900/60`, títulos `font-semibold` (la landing usa `font-bold`), sin animación de entrada, sin reacción al hover, y con hexadecimales sueltos en el JSX para Recharts.

**La capa de tokens existe pero está muerta.** `@theme static` declara `--color-surface-base`, `--color-surface-elevated`, `--color-brand`, `--color-danger`, `--color-success`. Un `grep` sobre todo `src/` confirma que **cero archivos** consumen las utilidades que esos tokens generan (`bg-surface-elevated`, `text-brand`, …). Es decoración.

**Restricciones que acotan el enfoque:**

- Tailwind 4 vía plugin de Vite. `tests/tailwind-pipeline.test.ts` prohíbe `tailwind.config.*` y `postcss.config.*`: la configuración de tema va en `@theme`, dentro de `src/app/index.css`, y en ningún otro lado.
- `tests/structure.test.ts` prohíbe `src/App.css` y `src/index.css`: una sola hoja global.
- `tests/landing-responsive.test.ts` escanea **todo** `widgets/` y `pages/` (dashboard incluido) y falla ante `w-[…px]`, `min-w-[…px]` o un `width` en estilo en línea, y ante una rejilla multi-columna sin base `grid-cols-1`.
- `tests/fsd-boundaries.test.ts` y `tests/shared-domain-agnostic.test.ts`: `shared/` no puede importar de capas superiores ni conocer el dominio.
- Los tests existentes que miran clases son cuatro (`input`, `spinner`, `navbar`, `landing-responsive`) y **ninguno afirma un color concreto** — es el patrón R-1 heredado de CHANGE-15: los tests afirman "las clases difieren", nunca "es celeste". Ese patrón se mantiene.

## Goals / Non-Goals

**Goals:**

- Que un cambio de color, de radio o de peso tipográfico se haga en **un** archivo y se propague a todo el sistema.
- Que el dashboard sea indistinguible del resto de la aplicación en cuanto a lenguaje visual.
- Colapsar la duplicación estructural que el `/code-review` de CHANGE-26 difirió a este change.

**Non-Goals:**

- No se rediseña la identidad. Los valores de los tokens **salen del código actual**; ninguno se inventa.
- No se migra a una biblioteca de componentes de terceros (shadcn, Radix, HeadlessUI).
- No se introduce modo claro. `color-scheme: dark` sigue fijo; la nomenclatura de tokens es semántica igual, pero sin segunda paleta.
- No se toca ningún archivo de `api/`, ni esquemas Zod, ni stores, ni hooks de datos.
- No se refactoriza `entities/dashboard/lib/metrics.ts` ni ninguna derivación de dominio.

---

## Decisiones que requieren aprobación del usuario

> Estas cuatro afectan a TODO el sistema y se surfacean antes del `apply`, según el nivel de governance MEDIO del change. El resto de las decisiones (D-5 en adelante) son consecuencia técnica de éstas.

### D-1 — La landing es el canon; el dashboard se adapta *(aprobar)*

**Decisión**: el lenguaje visual de referencia es el que la landing y el scan-form ya establecieron. El dashboard adopta ese lenguaje. No al revés, y no una tercera identidad nueva.

**Por qué**: es lo que el usuario pidió textualmente ("consolidar", "solo diseño"), es la superficie con más trabajo de diseño invertido (CHANGE-17/19 hicieron una pasada explícita de "estilos afinados"), y es la primera pantalla que ve cualquiera.

**Alternativa descartada**: rediseñar desde cero. Multiplica el diff, invalida el trabajo de dos changes archivados y contradice el encargo.

---

### D-2 — La paleta concreta *(aprobar)*

Todos los valores ya existen en el código. La columna "hoy" dice de dónde salieron.

**Superficies y bordes**

| Rol semántico | Valor | Hoy aparece en |
|---|---|---|
| `surface-base` | `slate-950` `#020617` | fondo de las 4 páginas y del `html` |
| `surface-elevated` | `slate-900` `#0f172a` | `Modal`, fondo de `Input`, tarjetas del dashboard (a `/60`) |
| `surface-sunken` | `slate-950` `#020617` | caja de evidencia del modal de vulnerabilidad |
| `border-subtle` | `slate-800` `#1e293b` | bordes de tarjeta del dashboard, separadores de navbar y footer (a `/50`) |
| `border-strong` | `slate-700` `#334155` | botón secundario, borde en reposo de `Input`, `select` de filtros |

**Marca**

| Rol | Valor | Hoy aparece en |
|---|---|---|
| `brand` | `sky-600` `#0284c7` | CTA, anillo de foco, vista activa del conmutador |
| `brand-hover` | `sky-500` `#0ea5e9` | hover del CTA |
| `brand-accent` | `sky-400` `#38bdf8` | íconos, antetítulos, escudo del logo, inicio del degradado |

El degradado de título (`.text-gradient`) se conserva tal cual: `sky-400 → indigo-400 → purple-400`. Es la única presencia de índigo/púrpura del sistema y es deliberadamente decorativa.

**Texto** (la rampa que la landing ya usa, nombrada)

| Rol | Valor | Uso |
|---|---|---|
| `text-emphasis` | `white` | cifras destacadas, énfasis dentro de un título |
| `text-primary` | `slate-100` `#f1f5f9` | texto corriente sobre superficie oscura |
| `text-secondary` | `slate-400` `#94a3b8` | párrafos, etiquetas de KPI, ejes de gráfico |
| `text-muted` | `slate-500` `#64748b` | pies de foto, referencias, links del footer |

**Estado y severidad**

| Rol | Valor | Hoy |
|---|---|---|
| `danger` | `red-500` `#ef4444` | errores de formulario **y** severidad Critical |
| `warning` | `orange-500` `#f97316` | severidad High |
| `caution` | `yellow-500` `#eab308` | severidad Medium |
| `info` | `sky-500` `#0ea5e9` | severidad Low — **cambia**, ver abajo |
| `success` | `green-500` `#22c55e` | campo válido, escaneo aceptado |
| `neutral` | `slate-500` `#64748b` | severidad no enumerada |

**El único valor que cambia**: hoy la severidad "Low" es `#3b82f6` (blue-500) en el gráfico de torta y `bg-sky-500/20 text-sky-300` en el badge de la tabla — dos azules distintos para el mismo dato. Se unifica en `sky-500`, que además es la familia de marca. Por la misma razón, la línea del gráfico de tendencia pasa de `#3b82f6` a `sky-500`.

---

### D-3 — Hasta dónde llega la sustitución por utilidades semánticas *(aprobar)*

Ésta es la decisión con más impacto sobre el tamaño del diff.

**Opción A — sustitución total.** Reemplazar cada `bg-slate-900`, `text-slate-400`, `border-slate-700` del proyecto por `bg-surface-elevated`, `text-secondary`, `border-strong`. Toca ~30 archivos, cientos de líneas, y **no cambia un solo píxel**.

**Opción B — los primitivos son la frontera *(recomendada)*.** Los tokens semánticos se consumen en tres lugares: la hoja global (`@theme` y las utilidades de composición), los primitivos de `shared/ui/`, y el módulo de tokens que alimenta a Recharts. Los widgets dejan de nombrar colores porque dejan de declarar superficies: consumen `Card`, `Table`, `PageShell`, `PageHeader`. Donde queda un color puntual que ningún primitivo cubre (por ejemplo el texto de un párrafo), se usa la utilidad literal de Tailwind.

**Se elige B.** El objetivo real es *"un solo lugar donde cambiar"*, y los primitivos ya lo entregan: si `Card` define la superficie, cambiar la superficie de todas las tarjetas es una línea, se hayan escrito con token o con utilidad literal. La Opción A paga un diff enorme y un riesgo de regresión no trivial por una ganancia nominal. La spec `design-system` refleja esto: prohíbe **hexadecimales sueltos** y **cadenas de composición duplicadas**, no el uso de la escala de Tailwind.

**Consecuencia verificable**: el guard de "ningún literal hexadecimal fuera del módulo de tokens" es la aserción que hace cumplir esta decisión, y es la que hoy fallaría (`DashboardChartsWidget.tsx` y `severityVisuals.ts` tienen hexes).

---

### D-4 — Las tarjetas del dashboard adoptan glassmorphism *(aprobar — es el cambio más visible)*

**Decisión**: `Card` se implementa sobre `.glass-card` + `rounded-2xl`, el tratamiento que `FeaturesWidget` y `HowItWorksWidget` ya usan. Las nueve superficies del dashboard pasan de `rounded-lg border border-slate-800 bg-slate-900/60` a ese tratamiento, y ganan la animación de entrada escalonada (`animate-fade-in-up` + `animation-delay-*`) que la landing ya tiene.

**Por qué**: es el cambio que más contribuye a que "se vea como un solo producto", y es exactamente la brecha que CHANGE-26 dejó abierta.

**Trade-off honesto**: `backdrop-filter: blur(12px)` sobre una tabla de muchas filas o sobre un `ResponsiveContainer` de Recharts tiene un costo de composición en el navegador. Mitigación: la tarjeta de tabla larga (`dashboard-detail-table`, `max-h-[32rem]` con scroll interno) usa la variante `Card` sin blur — misma superficie, mismo borde, mismo radio, sin filtro. La spec no obliga a que sean idénticas, obliga a que no las declare cada widget por su cuenta.

**Alternativa descartada**: llevar la landing hacia las tarjetas planas del dashboard. Sería consolidar hacia abajo.

---

## Decisiones técnicas (consecuencia de las anteriores)

### D-5 — Dónde vive cada tipo de token

Dos sedes, con una regla clara de reparto:

- **`src/app/index.css`, bloque `@theme`** — todo lo que Tailwind puede convertir en utilidad: colores, familia tipográfica, radios. Es la única sede posible (el pipeline prohíbe `tailwind.config.*`), y hace que `bg-surface-elevated` exista como clase real.
- **`src/shared/ui/tokens.ts`** — los mismos valores en TypeScript, **sólo** para los consumidores que no pueden leer una clase CSS: Recharts, que recibe `stroke`/`fill` como strings. Es un archivo de constantes, sin JSX, sin lógica.

**El riesgo obvio es la deriva entre las dos sedes**, y se cubre con un test: por cada color declarado en `tokens.ts` debe existir la declaración correspondiente en el `@theme` de `index.css`, con el mismo valor. Es un test de lectura de archivos, del mismo tipo que `tailwind-pipeline.test.ts`.

**Lo que NO se hace**: un diccionario TypeScript de cadenas de clases (`export const CARD_CLASSES = 'rounded-2xl …'`) importado por los widgets. Sería mover la duplicación de sitio en vez de eliminarla, y es exactamente el antipatrón que el `/code-review` marcó.

### D-6 — La escala tipográfica se nombra, no se cambia

Todos estos niveles ya existen en el código; se documentan y se aplican de forma consistente. Sólo uno cambia de valor.

| Nivel | Clases | Dónde |
|---|---|---|
| `display` | `text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight` | h1 del hero |
| `page-title` | `text-3xl sm:text-4xl font-bold tracking-tight` + `.text-gradient` | h1 de página |
| `section-title` | `text-3xl sm:text-4xl font-bold tracking-tight` | h2 de sección de la landing |
| `subsection-title` | `text-2xl sm:text-3xl font-bold tracking-tight` | h2 de about y de la pantalla de espera |
| `card-title` | `text-lg font-bold` | h3 de tarjeta |
| `eyebrow` | `text-sm font-semibold uppercase tracking-wider text-sky-400` | antetítulo de sección |
| `body` | `text-base leading-relaxed text-slate-400` | párrafo |
| `label` | `text-sm font-medium text-slate-200` | etiqueta de campo |
| `caption` | `text-xs text-slate-500` | referencia, pie |

**El único cambio**: `card-title` pasa a `font-bold` en todas partes. Hoy la landing usa `font-bold` (`FeaturesWidget`, `HowItWorksWidget`) y el dashboard `font-semibold` (los cuatro widgets con `TITLE_CLASSES`). Se unifica en `font-bold`, el del canon.

### D-7 — La escala de espaciado y de contenedores se nombra, no se cambia

- **Canal lateral**: `px-6`, universal. No se toca.
- **Ritmo vertical de sección**: `py-24` para secciones informativas (landing, about), `py-16` para secciones interactivas (formulario, espera). Ya es así; se documenta el criterio.
- **Encabezado de página**: `px-6 pt-28 pb-8`. El `pt-28` existe para despejar el `Navbar` fijo — es la razón por la que no puede reducirse sin más, y por la que conviene que viva en un primitivo en vez de repetirse a mano (hoy está copiado tres veces y **falta** en `AboutPage`).
- **Anchos de contenedor**: `max-w-6xl` (cromo de la app y dashboard), `max-w-5xl` (rejilla de tarjetas), `max-w-4xl` (timeline), `max-w-3xl` (prosa), `max-w-xl`/`max-w-lg` (medida de párrafo), `max-w-md` (formularios y modal estrecho), `max-w-2xl` (modal ancho).
- **Radios**: `rounded-md` controles · `rounded-lg` contenedores chicos · `rounded-xl` CTA prominente · `rounded-2xl` tarjetas · `rounded-full` píldoras e insignias.

### D-8 — `Modal` gana `maxWidth` como unión cerrada, no como `className` libre

**Decisión**: `maxWidth?: 'sm' | 'lg'`, con `'sm'` por defecto (el `max-w-md` actual) y `'lg'` = `max-w-2xl` (el ancho que el modal de vulnerabilidad ya usa). Además el diálogo compartido gana `max-h-[85vh] overflow-y-auto`, que hoy sólo tiene el modal de vulnerabilidad.

**Por qué una unión y no `className`**: `className` libre permitiría a cada consumidor inventar su propio ancho, que es precisamente cómo nace la divergencia que este change viene a cerrar. Dos anchos nombrados son un token; un string arbitrario no.

**Efecto colateral deseado**: los modales de auth heredan el `max-h`/`overflow-y`. Hoy, un formulario de registro con varios errores de validación en una ventana baja puede desbordar sin scroll propio. Es una corrección real, y no es lógica: es contención visual.

### D-9 — `DashboardVulnerabilityModal` se colapsa sobre el primitivo compartido

Es la deuda que D-6 de CHANGE-26 dejó agendada textualmente para este change. El widget conserva su `model/content.ts` y su composición de metadatos; deja de reimplementar el contenedor, el backdrop, el listener de `Escape`, el bloqueo de scroll y el cierre por backdrop.

**Detalle a resolver**: el modal de vulnerabilidad tiene un botón `×` de cierre que el `Modal` compartido no tiene. Para que el colapso sea total hay que llevar ese botón al primitivo. Ver la pregunta abierta P-1: **es la única decisión de este change que agrega un control a una pantalla, y por eso se surfacea aparte.**

### D-10 — `PageShell` y `PageHeader`: `AboutPage` gana un encabezado que hoy no tiene

`PageShell` colapsa el `flex min-h-screen w-full flex-col bg-slate-950` repetido en las cuatro páginas. `PageHeader` colapsa el bloque `px-6 pt-28 pb-8` + `h1.text-gradient` (+ subtítulo opcional) repetido en `ScanPage` dos veces y en `DashboardPage` una.

**Consecuencia**: `AboutPage` hoy **no tiene ningún `h1`** — arranca directamente con los `h2` de `AboutWidget`. Es un defecto de accesibilidad real (una página sin encabezado de primer nivel) además de una inconsistencia visual. Al componer sobre `PageHeader`, gana uno. Eso implica texto nuevo en pantalla: ver la pregunta abierta P-2.

### D-11 — Cómo se testea una pasada visual sin escribir tests falsos

El modo TDD estricto del proyecto está activo, pero jsdom no aplica CSS ni calcula geometría: **ningún test puede afirmar honestamente que algo "se ve bien"**. El proyecto ya resolvió esto antes (`landing-responsive.test.ts` lo explica en su cabecera). Se sigue el mismo criterio: los tests de este change son **guards estructurales y de composición**, no aserciones de apariencia.

Lo que sí es verificable, y es lo que las specs afirman:

1. Ningún literal hexadecimal ni `rgb()` fuera del módulo de tokens y de la hoja global.
2. Todo token declarado tiene al menos un consumidor (mata la capa muerta y evita que vuelva).
3. `tokens.ts` e `index.css` no divergen.
4. Los mapas de severidad de gráfico y de insignia cubren el mismo conjunto de claves y comparten familia de color.
5. Ningún par de módulos declara la misma cadena de clases de composición.
6. Cada página compone `PageShell`; cada página tiene exactamente un `h1`.
7. Los primitivos nuevos cumplen las mismas reglas que los cinco existentes (sin dominio, sin importar capas superiores, `className` fusionable).
8. `Modal` con `maxWidth` por defecto conserva su clase de ancho actual; con `'lg'` difiere.
9. Los guards de adaptabilidad ya vigentes siguen verdes, ahora también sobre el dashboard.

**Lo que explícitamente no se testea**: que un color sea celeste, que una sombra tenga tal difuminado, que la animación dure 600 ms. Escribir eso sería una tautología sobre el propio código.

### D-12 — Orden de ejecución: primitivos primero, superficies después

1. Tokens (`@theme` + `tokens.ts`) — nadie los consume todavía, diff aislado y sin riesgo.
2. Primitivos (`Card`, `Table`, `PageShell`, `PageHeader`, `Modal.maxWidth`) — con sus tests, sin tocar ningún consumidor.
3. Migración del dashboard sobre los primitivos — el grueso del diff, un widget por vez.
4. Migración de las páginas sobre `PageShell`/`PageHeader`.
5. Pasada de consistencia tipográfica sobre landing / scan / about.
6. Guards globales (los nueve de D-11) al final, cuando ya hay algo que puedan afirmar.

**Por qué así**: cada paso deja el árbol compilando y la suite verde. El paso 3 es el único con volumen, y para entonces los primitivos ya están probados: si algo se rompe ahí, es composición, no diseño.

---

## Risks / Trade-offs

- **[El diff toca casi todo el frontend y puede chocar con trabajo paralelo]** → Se ejecuta en una sola pasada, en su propia rama, sin solaparse con otro change. Los cuatro fixes finales son secuenciales; éste es el último.

- **[`tests/navbar.test.tsx` afirma la clase `bg-white/10` del link activo]** → Es la única aserción de clase concreta de todo el proyecto que puede romperse. El estado activo del navbar **no se toca**; si la pasada de consistencia llegara a alterarlo, se actualiza el test a "las clases de activo e inactivo difieren" (patrón R-1) en vez de a otro color literal.

- **[`glass-card` sobre tablas y gráficos degrada el rendimiento de composición]** → Cubierto por D-4: la variante sin blur para la superficie de tabla larga.

- **[Un guard de "cero hexadecimales" es frágil ante un falso positivo]** → El escaneo excluye explícitamente `shared/ui/tokens.ts` y `app/index.css`, y se prueba a sí mismo con un fixture que debe fallar (el patrón "guard sobre el guard" que `landing-responsive.test.ts` ya usa en este repo).

- **[Riesgo de arrastrarse a cambios de lógica]** → La spec `design-system` lo convierte en criterio verificable: los módulos de API, esquemas y estado de dominio no presentan diferencias. Un `git diff --stat` sobre esas rutas es la evidencia.

- **[`AboutPage` gana un `h1` y `Modal` gana un botón de cierre: es contenido nuevo, no sólo estilo]** → Son las dos únicas desviaciones de "sólo diseño" y por eso están aisladas como preguntas abiertas, no resueltas por cuenta propia. Si el usuario las rechaza, el change sigue en pie: `AboutPage` compone `PageShell` sin `PageHeader`, y `DashboardVulnerabilityModal` pasa su `×` como parte de sus `children`.

## Open Questions

- **P-1 — ¿El `Modal` compartido incorpora un botón `×` de cierre?** Hoy los modales de auth sólo se cierran con `Escape` o clic en el backdrop; el modal de vulnerabilidad sí tiene `×`. Llevarlo al primitivo completa el colapso de D-9 y mejora la accesibilidad de los modales de auth (un cierre visible y alcanzable por teclado). **Contra**: agrega un control a una pantalla, que roza el límite de "sólo diseño". *Recomendación: sí — es una afordancia visual, y sin ella el colapso del modal queda a medias.*

- **P-2 — ¿`AboutPage` gana encabezado de página, y con qué texto?** Hoy `/about` no tiene `h1`. Componer `PageHeader` lo corrige pero introduce texto nuevo. *Recomendación: sí, con el título "Acerca de WASA" — que es el rótulo que el `Navbar` ya usa para llegar a esa página, de modo que no se inventa copy nuevo.*

- **P-3 — ¿Alcanza `sky` como único acento, o el dashboard merece un acento propio?** El sistema entero acentúa en `sky`, y el dashboard también (conmutador activo, foco de filtros). Un panel de datos a veces se beneficia de un acento distinto para separar "informar" de "actuar". *Recomendación: no — un solo acento es lo que hace que se lea como un solo producto, y es el encargo textual.*
