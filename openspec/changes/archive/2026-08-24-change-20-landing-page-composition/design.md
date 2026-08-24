## Context

Ver `proposal.md` §Why para la motivación y para la tabla de estado previo verificado. Lo que importa acá son las restricciones que condicionan el cómo:

- **Tailwind 4 sin archivo de configuración.** La spec vigente `landing-bootstrap` (requirement "Pipeline de estilos Tailwind operativo") prohíbe explícitamente `tailwind.config.*` y `postcss.config.*`. El único lugar donde este proyecto puede declarar tokens es CSS: la directiva `@theme` dentro de `src/app/index.css`. No hay alternativa en JavaScript.
- **La paleta ya está fijada de hecho, como literales.** Un relevamiento de las clases de color en `src/` da: `slate` como neutro (`slate-950` fondo base, `slate-900` superficie elevada, `slate-100/200/300/400/500` texto, `slate-500..800` bordes), `sky` como marca (`sky-600` reposo, `sky-500` hover), `red-500` error y `green-500` éxito. Ningún widget usa `font-*` de familia: los seis heredan la pila `sans` por defecto de Tailwind.
- **Ningún archivo de CHANGE-19 se reabre.** Los seis widgets, `LandingPage/index.tsx` y `App.tsx` quedan intactos. Todo el cambio de estilos tiene que producirse por herencia desde la capa de aplicación, no por edición de componentes.
- **Los tests viven en `wasa-landing/tests/*.test.{ts,tsx}`**, planos y en kebab-case, corriendo sobre jsdom. Ya existen tests que inspeccionan archivos estáticos (`tailwind-pipeline.test.ts`, `manifest.test.ts`, `structure.test.ts`) — hay precedente para afirmar sobre el contenido de `index.css` e `index.html`.
- **Los Criterios de Aceptación 1 y 2 ya tienen cobertura**: `tests/landing-page.test.tsx` (orden de secciones) y `tests/app-hydration.test.tsx` (restauración de sesión al montar). Se ejecutan como red de seguridad; no se reescriben.

## Goals / Non-Goals

**Goals:**

- Que la identidad tipográfica y los valores de diseño de la Landing tengan **un solo** punto de declaración, y que llegue a los seis widgets por herencia, sin tocarlos.
- Que introducir esa identidad **no cambie nada visualmente** salvo la familia tipográfica y la desaparición del destello blanco: los tokens de color se declaran con los valores ya vigentes.
- Que cargar una tipografía remota no cueste el presupuesto de rendimiento — el riesgo principal de este change es que agregar una fuente tire Lighthouse por debajo de 80, que es justamente uno de sus Criterios de Aceptación.
- Dejar los dos Criterios de Aceptación de runtime **verificados y registrados**, no asumidos.

**Non-Goals:**

- **No** se refactorizan los widgets para que consuman los tokens semánticos en lugar de los literales de Tailwind. Sería tocar los ocho archivos de CHANGE-19 para cero cambio observable. Los tokens quedan como punto único de verdad declarado, disponible para los changes futuros; la migración de los literales, si alguna vez se quiere, es un change propio.
- **No** se introduce modo claro ni conmutador de tema. La Landing es oscura y única; `color-scheme: dark` se declara para alinear los controles del navegador, no para abrir un sistema de temas.
- **No** se agrega Lighthouse al pipeline de CI ni como dependencia. La medición es manual y se registra en `tasks.md` (ver D-8).
- **No** se agregan metadatos de SEO/redes sociales (`description`, Open Graph, favicon propio). Están fuera del scope de `CHANGES.md` y ninguno de los cuatro Criterios de Aceptación los pide.
  - **Excepción acotada (auditoría 2026-08-24).** La premisa "ninguno de los Criterios de Aceptación lo pide" no se sostenía para el icono: sin `<link rel="icon">` el navegador pide `/favicon.ico` por su cuenta y el `404` aparece como **error rojo en la consola**, que es exactamente lo que prohíbe el Criterio de Aceptación 3. Se agrega `<link rel="icon" href="data:," />`: declara "sin icono" y suprime la petición, sin incorporar ningún recurso ni ninguna decisión de marca — no es el "favicon propio" que este Non-Goal descarta. Revertible borrando una línea. Ver `tasks.md` §8, defecto D20-B.

## Decisions

### D-1 — La tipografía es Inter, en un único corte variable, sin familia monoespaciada

**Decisión.** Inter, cargada como fuente variable en el rango de pesos 400–700.

**Por qué.** La interfaz usa exactamente cuatro pesos: 400 (por defecto), 500 (`font-medium`), 600 (`font-semibold`) y 700 (`font-bold`). Inter es una tipografía de interfaz diseñada para texto de pantalla en tamaños chicos, con alturas de x generosas y formas inequívocas para los caracteres que más importan en un producto de seguridad (el `1`/`l`/`I`, el `0` con barra opcional) — que es exactamente lo que renderiza esta Landing: URLs, identificadores de sesión, parámetros numéricos.

**Alternativas consideradas.**

- *Dejar la pila del sistema* (statu quo). Rendimiento inmejorable y cero peticiones, pero la Landing se ve distinta en cada sistema operativo y el proyecto no tiene identidad propia. Es explícitamente lo que el ítem 3 del scope de `CHANGES.md` pide corregir.
- *Poppins / Space Grotesk*. Tipografías de despliegue: buenas para el título, cansadoras en párrafos y en formularios. La Landing es mayormente texto de interfaz.
- *IBM Plex Sans*. Muy adecuada al registro técnico, pero Google Fonts no la sirve como variable: serían cuatro archivos estáticos en lugar de uno.
- *Agregar una monoespaciada* (p. ej. JetBrains Mono) para URLs y el PHPSESSID. **Rechazado**: hoy ningún componente usa `font-mono`, de modo que la segunda familia se descargaría sin un solo consumidor — duplicando el costo de red por cero beneficio, y violando el requisito "Sólo los cortes usados" de `landing-shell`. Si un change futuro quiere `font-mono` para el campo del objetivo, que traiga la familia consigo.

**A revisar por el usuario.** La KB no especifica tipografía en ningún archivo; esta elección es del agente. Si el usuario prefiere otra familia, cambiar D-1 no afecta a ninguna otra decisión: sólo cambian el nombre en el `<link>` y el valor del token.

### D-2 — La fuente se carga por `<link>` en `index.html`, con `preconnect` y `display=swap`, no por `@import` en el CSS

**Decisión.** En `index.html`, dentro del `<head>`:

1. `<link rel="preconnect">` a `https://fonts.googleapis.com` y a `https://fonts.gstatic.com` (este último con `crossorigin`).
2. `<link rel="stylesheet">` a la hoja de Google Fonts pidiendo Inter en el rango `wght@400..700` y `display=swap`.

**Por qué.** La alternativa obvia —`@import url(...)` como primera línea de `src/app/index.css`— es la peor opción posible para el presupuesto de rendimiento: encadena tres peticiones en serie (HTML → CSS de la app → CSS de la fuente → archivo de la fuente), y las dos primeras son bloqueantes de renderizado. Con el `<link>` en el documento, el navegador descubre la hoja de la fuente en el mismo parseo del HTML, en paralelo con el CSS de la aplicación, y el `preconnect` adelanta el DNS + TLS del origen de los archivos. `display=swap` es lo que hace que el texto se pinte con la tipografía de reemplazo en lugar de quedar invisible. Los tres requisitos de la spec `landing-shell` sobre carga de tipografía ("no encadenada", "texto visible antes que la tipografía", "sólo los cortes usados") describen exactamente esta configuración.

**Consecuencia de scope.** Esta decisión es lo que obliga a tocar `index.html`, un archivo que no está en la lista de scope de `CHANGES.md`. Declarado en `proposal.md` §Impact.

**Alternativa considerada — auto-hospedar la fuente.** Instalar `@fontsource-variable/inter` como dependencia de desarrollo e importar el CSS del paquete, sirviendo el `.woff2` desde el propio origen. Es estrictamente mejor en rendimiento (una conexión menos, sin DNS/TLS a terceros) y en privacidad (ninguna IP de visitante llega a Google — argumento no trivial en un producto de seguridad). **No se elige por defecto** porque agrega una dependencia y porque `CHANGES.md` dice literalmente "fuentes Google". Queda como **plan de escape declarado**: si la medición de D-8 da Performance ≤ 80 y el análisis apunta a la fuente, se migra a auto-hospedaje sin cambiar ninguna spec — el requisito habla de "un origen externo" *si* lo hay, no lo exige.

**A revisar por el usuario.** Si prefiere privacidad sobre literalidad del roadmap, el auto-hospedaje es la opción defendible y conviene decidirlo **antes** del apply, no después.

### D-3 — Los tokens se declaran con `@theme` de Tailwind 4, no como `:root { --x: ... }` a mano

**Decisión.** Un bloque `@theme` en `src/app/index.css`, después del `@import "tailwindcss"`.

**Por qué.** `@theme` hace dos cosas que `:root` no hace: (i) emite igualmente las variables CSS reales, de modo que cualquier CSS crudo puede leerlas; y (ii) las integra al sistema de utilidades, de modo que un token de color queda disponible como clase (`bg-*`, `text-*`) para los changes futuros, sin tener que escribir `bg-[var(--...)]`. Además, sobreescribir `--font-sans` dentro de `@theme` reemplaza la pila por defecto que el *preflight* de Tailwind ya aplica a la raíz del documento: la tipografía llega a los seis widgets **por herencia, sin editar ni uno**, que es la restricción dura de este change. Con `:root` a mano habría que agregar una regla propia de familia y el token no generaría utilidades.

**Alternativa considerada.** `:root` + una regla `html { font-family: ... }` en `@layer base`. Funciona, pero duplica lo que el preflight ya hace y deja los tokens de color fuera del sistema de utilidades. Sin ventaja.

### D-4 — Qué tokens se declaran, y qué significa "sin huérfanos"

**Decisión.** Seis tokens, todos alias de valores **ya presentes** en la interfaz:

| Token | Valor | De dónde sale |
|---|---|---|
| `--font-sans` | Inter + pila de reemplazo del sistema | D-1 |
| superficie base | el `slate-950` que hoy pinta `<main>` | `LandingPage` |
| superficie elevada | el `slate-900` de tarjetas y modales | widgets y `Modal` |
| marca | el `sky-600` del CTA y de los botones primarios | `HeroWidget`, `Button` |
| error | el `red-500` de bordes y mensajes de validación | `Input`, formularios |
| éxito | el `green-500` del borde de campo válido | `Input` |

El requisito "sin tokens huérfanos" de `landing-shell` se interpreta —y así quedó redactado— como: **cada token nombra un valor que la interfaz ya usa**. No exige que el identificador del token esté referenciado desde los widgets, porque eso obligaría a refactorizarlos, que es Non-Goal explícito. Prohíbe lo contrario: inventar colores que no están en pantalla (un `--color-warning` ámbar, por ejemplo, que hoy no usa nadie).

**De los seis, dos se consumen de inmediato** en este change: `--font-sans` (vía preflight) y la superficie base (vía D-5). Los otros cuatro quedan declarados como punto de verdad para los changes futuros.

**Nomenclatura.** Nombres semánticos (`surface`, `brand`, `danger`, `success`), no nombres de color (`slate`, `sky`). El nombre semántico es lo que hace que el token sobreviva a un cambio de paleta; si se llamara `--color-sky` no habría ganado nada sobre el literal.

**Enmienda (auditoría 2026-08-24).** Los tokens de color se declaran como `var(--color-<entrada>)` de la paleta de Tailwind, **no** como un literal hexadecimal. La primera implementación usó los hex de Tailwind 3 y el proyecto usa Tailwind 4, cuya paleta está en oklch y no coincide: `sky-600` es `#0084d1` y no `#0284c7`, `red-500` es `#fb2c36` y no `#ef4444`, `green-500` es `#00c950` y no `#22c55e`. Un literal escrito a mano es una **copia** del valor, no un alias: puede divergir —y divergía— de lo que la interfaz realmente pinta, rompiendo tanto "sin tokens huérfanos" como "sin cambio visual". Referenciar la variable de la paleta hace el alias exacto por construcción; Tailwind emite la variable referenciada aunque ninguna utilidad la use, así que el token no depende de que un widget siga usando esa clase. Ver `tasks.md` §8, defecto D20-A.

### D-5 — La superficie base sube al documento, y el `bg-slate-950` de `<main>` se queda donde está

**Decisión.** Una regla en `@layer base` que aplique a la raíz del documento la superficie base y `color-scheme: dark`.

**Por qué.** Hoy el fondo oscuro vive únicamente en `<main>`, dentro del árbol de React. Eso implica que entre que el navegador entrega el HTML y que React monta, la pantalla está blanca (destello), y que el área de sobre-desplazamiento —el rebote al llegar al final de la página— también es blanca. `color-scheme: dark` completa el cuadro: le dice al navegador que pinte sus propios controles (barras de desplazamiento, autocompletado de los campos de email y contraseña de los modales) en variante oscura, en lugar de estamparlos en blanco sobre una interfaz oscura.

**Por qué NO se le saca el `bg-slate-950` a `<main>`.** Sería editar `LandingPage/index.tsx`, un archivo de CHANGE-19. Como el valor de la regla nueva es exactamente el mismo, la redundancia es inofensiva y no produce diferencia visual alguna. Que un change futuro lo limpie si quiere.

### D-6 — `index.html` declara `lang="es"` y un título propio

**Decisión.** `lang="en"` → `lang="es"`; `<title>wasa-landing</title>` → un título que nombre al producto y lo que hace, en la línea de `WASA — Escaneo automatizado de vulnerabilidades web` (tomado del `<h1>` y del tagline del `HeroWidget`, para no inventar mensajería nueva).

**Por qué.** El contenido visible de la Landing está íntegramente en español; declarar `en` hace que un lector de pantalla lo pronuncie con fonética inglesa y que la auditoría de accesibilidad reporte la discrepancia. El título es residuo del andamiaje de Vite: es el nombre del paquete, visible en la pestaña del navegador, en el historial y en los favoritos.

**Alternativa considerada.** Dejar `index.html` intacto para respetar al pie de la letra la lista de scope de `CHANGES.md`. Rechazada porque D-2 obliga a tocar el archivo de todos modos y porque ambos son defectos reales de un entregable que CHANGE-22 va a someter a un smoke test. Queda declarado en el proposal para que el usuario pueda recortarlo si no está de acuerdo.

### D-7 — La consola limpia se verifica con espías sobre `console`, montando la aplicación entera

**Decisión.** Un test nuevo en `tests/` que monte `App` (no `LandingPage`: hay que incluir el `useEffect` de hidratación y el cableado del cliente HTTP, que es de donde más probablemente salga un aviso) bajo `StrictMode`, con espías sobre `console.error` y `console.warn`, en los dos estados de sesión: sin sesión persistida y con una sesión persistida vigente.

**Por qué el modo estricto.** Es el modo en el que corre la aplicación real (`main.tsx` monta dentro de `<StrictMode>`), y es el que dispara los avisos de doble montaje y de efectos no idempotentes. Un test sin modo estricto verificaría un escenario que no existe en producción.

**Por qué `console.warn` además de `console.error`.** React reporta por `warn` buena parte de lo que importa acá (claves faltantes en listas, props no reconocidas, actualizaciones fuera de `act`). Limitarse a `error` dejaría pasar justo la clase de aviso que este change quiere clausurar.

**Riesgo de falso verde.** Un espía que reemplace `console.error` puede ocultar un fallo real del test. Se mitiga afirmando sobre las llamadas registradas —e imprimiendo su contenido en el mensaje de fallo— en lugar de silenciarlas.

**Alternativa considerada.** Verificación manual, abriendo las herramientas del navegador. Rechazada: no protege contra regresiones, y la spec pide explícitamente que sea automatizada.

### D-8 — Lighthouse se mide a mano contra el build de producción y se registra en `tasks.md`

**Decisión.** `npm run build` + `npm run preview`, auditoría de Lighthouse en modo escritorio sobre la URL servida, y el número obtenido se anota en la tarea correspondiente de `tasks.md` junto con la fecha.

**Por qué a mano.** Automatizarlo significa agregar Lighthouse como dependencia y un runner de navegador sin cabeza (Chrome) al proyecto, para un change de gobernanza BAJA estimado en una hora, cuyo Criterio de Aceptación pide una medición, no un guardián permanente. Además la puntuación de Lighthouse varía entre corridas en una misma máquina: convertida en test automático sería una fuente de fallos intermitentes.

**Por qué contra el build de producción y no contra el servidor de desarrollo.** El servidor de desarrollo sirve módulos sin empaquetar ni minimizar; su puntuación no dice nada del artefacto real. El Criterio de Aceptación aplica al producto, no al entorno de trabajo.

**Qué pasa si da ≤ 80.** Se diagnostica antes de tocar nada. Si el culpable es la fuente, se aplica el plan de escape de D-2 (auto-hospedaje). Si es otra cosa, se registra el hallazgo y se escala al usuario: puede ser un problema que pertenezca a otro change.

## Risks / Trade-offs

- **Agregar una fuente remota baja la puntuación de rendimiento por debajo de 80** → Es el riesgo central: el change introduce justo el tipo de recurso que penaliza el Criterio de Aceptación 4. Mitigado por diseño con `preconnect` + `display=swap` + un único archivo variable + sólo los pesos usados (D-2), y con el auto-hospedaje como plan de escape ya decidido, no improvisado.
- **La fuente cambia las métricas de la tipografía y desacomoda la maquetación** → Inter tiene una altura de x mayor que la mayoría de las pilas del sistema: los textos ocuparán un poco más de ancho. Los widgets ya son fluidos y sin anchos fijos (requisito vigente de `landing-composition`), de modo que el riesgo es estético, no de desbordamiento. Mitigación: revisión visual a 375 px y 1280 px como parte de las tareas.
- **Desplazamiento de contenido al intercambiarse la fuente (`swap`)** → `display=swap` implica, por definición, un reflujo cuando llega Inter. Es la contrapartida aceptada de que el texto sea legible de inmediato; con la fuente en caché deja de ocurrir. La alternativa (`display=optional`) evita el reflujo pero descarta la fuente en la primera visita lenta, que es peor para la identidad que este change viene a establecer.
- **Los tokens conviven con los literales de Tailwind en los widgets** → Durante un tiempo hay dos formas de nombrar el mismo color, y un lector puede creer que son dos sistemas. Mitigación: los tokens se declaran con los valores idénticos y `design.md` deja escrito (Non-Goals) que la migración es un change propio, no un olvido.
- **El test de consola limpia se vuelve frágil ante avisos de terceros** → Un aviso emitido por una biblioteca, ajeno al código de la aplicación, haría fallar la suite por algo que el proyecto no controla. La spec ya excluye los mensajes del entorno de desarrollo y de las herramientas del navegador; si aparece un aviso de biblioteca, la salida del fallo lo identifica y se decide caso por caso — no se agrega una lista de exclusiones por adelantado.

## Migration Plan

No aplica: no hay datos que migrar, ni contrato que versionar, ni despliegue coordinado. El change es aditivo sobre archivos estáticos del frontend. La reversión es revertir el commit; ningún estado persiste fuera del repositorio.

## Open Questions

Ninguna que bloquee. Las dos elecciones que la KB no especifica —la familia tipográfica (D-1) y el mecanismo de carga (D-2)— están **decididas**, no diferidas: el apply puede ejecutarse tal cual. Se señalan al usuario para revisión previa porque son las dos que cambian el resultado visible, y porque la segunda tiene una lectura de privacidad que quizá quiera ejercer.
