## Context

El repositorio contiene hoy el sistema WASA heredado de la tesis (`dashboard/`, el workflow `Flujo_Fuzzing_N8N.json`, la instancia PostgreSQL `db_fuzzing`), la documentación del proyecto (`knowledge-base/`, `CHANGES.md`) y el scaffold del backend recién cerrado (`fastapi_bridge/`, CHANGE-00a, archivado con 63 tests verdes). No existe todavía ninguna línea del frontend nuevo.

`CHANGE-00b` es el otro nodo raíz del roadmap (sin dependencias, GATE 0). Su output no es funcionalidad: es el **contrato estructural** del frontend sobre el que se van a escribir los ocho changes de la FASE 4 (13 a 20) más CHANGE-00c. Las decisiones que se tomen acá — versiones del stack, dónde vive cada capa, cómo se resuelven los alias, cómo se testea, cómo se enforcea la dirección de dependencias FSD — se heredan sin discusión en todos ellos.

Restricciones que condicionan el diseño:

- **Arquitectura fijada por la KB**: `knowledge-base/08_arquitectura_propuesta.md` define el árbol FSD de `wasa-landing/` y la regla estricta `app → pages → widgets → features → entities → shared`. No es negociable; este design la implementa, no la rediscute.
- **Rutas ya comprometidas por el roadmap**: `CHANGES.md` referencia rutas literales que este scaffold debe honrar — `src/app/stores/authStore.ts` (CHANGE-13), `src/app/index.css` (CHANGE-20), `src/pages/LandingPage/index.tsx` (CHANGE-20), `src/shared/lib/utils.ts` (CHANGE-13/15), y los alias `@features`, `@entities`, `@pages`, `@widgets` (criterio de aceptación de CHANGE-15).
- **Tabla de stack con versiones explícitas**: `knowledge-base/02_descripcion_general.md` fija hoy React 19.x, TS 5.9.x, Vite 7.x, Tailwind CSS 4.x, React Hook Form 7.x, Zod 3.x. La tabla **fue actualizada por decisión explícita del usuario** durante este propose: la versión original (React 18 / Vite 5 / Tailwind 3) quedó obsoleta y se resolvió modernizar en lugar de hacer downgrade sobre lo que scaffoldea `npm create vite@latest` (ver D-2).
- **Máquina de desarrollo**: Node v24.14.1, npm 11.11.0, Windows 11.
- **TDD estricto activo** en el proyecto: obliga a que exista un runner de tests ya en el scaffold, igual que en CHANGE-00a. Sin él, CHANGE-13 no puede empezar en RED.
- **Governance BAJO**: scaffolding sin lógica de negocio ni superficie de seguridad; se implementa con autonomía y se reportan las decisiones no obvias.
- **Precedente de CHANGE-00a**: el scaffold del backend estableció un patrón que conviene replicar por simetría — manifiesto de runtime separado del de desarrollo, módulos placeholder sin código muerto, y las reglas de capa convertidas en tests ejecutables en lugar de comentarios.

## Goals / Non-Goals

**Goals:**

- Dejar `wasa-landing/` como proyecto Vite operativo: `npm run dev` en el puerto 5173 y `npm run build` sin errores de TypeScript, en una máquina limpia y sin el Bridge corriendo.
- Materializar las seis capas FSD con los subdirectorios que el roadmap ya compromete, para que cada change posterior tenga un destino inequívoco.
- Dejar el pipeline Tailwind 4 → plugin `@tailwindcss/vite` → Vite verificado por un componente real, no por fe.
- Cablear los seis path aliases de modo que resuelvan idénticamente en bundler, compilador de tipos y runner de tests — una única fuente de verdad, no tres tablas que se desincronizan.
- Dejar el andamiaje de tests operativo para que CHANGE-13 pueda empezar directo en RED.
- Convertir la regla de capas FSD en un test ejecutable, no en un comentario: la dirección de dependencias se verifica automáticamente en cada corrida.

**Non-Goals:**

- Ninguna funcionalidad de negocio: sin `authStore`, sin schemas Zod, sin átomos de UI, sin features, sin widgets reales.
- Sin `axiosInstance` ni interceptor Bearer (CHANGE-16), sin `shared/config/env.ts` ni archivos `.env` (CHANGE-00c).
- Sin sistema de diseño: sin paleta, sin tokens semánticos, sin tipografía, sin dark mode (CHANGE-15 y CHANGE-20).
- Sin router (la Landing es single-page; el roadmap nunca introduce `react-router`).
- Sin Prettier, husky, lint-staged, CI, Docker ni Storybook (fuera del scope declarado).
- Sin tocar `dashboard/`, `fastapi_bridge/` ni nada del sistema WASA existente.

## Decisions

### D-1. `wasa-landing/` como directorio hermano en la raíz, sin herramienta de monorepo

El repo pasa a alojar tres proyectos con toolchains distintas: `dashboard/` (Node, heredado), `fastapi_bridge/` (Python) y `wasa-landing/` (Node, nuevo). La KB nombra el directorio `wasa-landing/` sin calificarlo.

**Decisión**: `wasa-landing/` cuelga de la raíz del repo, con su propio `package.json`, su propio `node_modules/` y sus propios scripts. Nada de npm workspaces, Turborepo o pnpm.

**Rationale**: los tres proyectos no comparten dependencias — un workspace no ahorraría nada y agregaría un `package.json` raíz que hoy no existe, más una capa de indirección en cada comando. El costo de coordinación es cero porque cada uno se arranca por separado.

**Alternativa descartada**: `frontend/` o `apps/wasa-landing/` — desalinearían el nombre respecto de la KB y de las 20+ referencias de `CHANGES.md`.

### D-2. Se adopta lo que scaffoldea `npm create vite@latest` hoy — sin downgrade — y Tailwind 4

`npm create vite@latest -- --template react-ts` hoy genera **React 19, Vite 7 y TypeScript 5.9**. La tabla de stack original de `knowledge-base/02_descripcion_general.md` fijaba React 18.x, Vite 5.x, TS 5.x y Tailwind 3.x — más viejo que el ecosistema actual.

**Decisión (tomada explícitamente por el usuario; ya no es Open Question)**: **no se hace downgrade**. Se conserva íntegro lo que el template genera hoy (React 19, React DOM 19, `@types/react`/`@types/react-dom` 19, Vite 7, `@vitejs/plugin-react` en su línea para Vite 7, TypeScript 5.9) y se adopta **Tailwind CSS 4** en lugar de 3.x. Las dependencias de dominio conservan las líneas del roadmap: `react-hook-form@^7`, `zod@^3`, `@hookform/resolvers`, `axios`, `zustand`.

**Propagación**: la tabla de stack de `knowledge-base/02_descripcion_general.md` y las tablas "Stack Tecnológico" de `CLAUDE.md`/`AGENTS.md` **ya fueron actualizadas** a React 19.x / TS 5.9.x / Vite 7.x / Tailwind 4.x como parte de esta decisión. La KB sigue siendo fuente de verdad; lo que cambió es su contenido, no su autoridad.

**Rationale**: el scaffold es el único momento barato para fijar versiones — después hay ocho changes de frontend escritos encima. Adoptar el default del template elimina un paso de reinstalación frágil, evita quedar en una línea de Vite que ya está en modo mantenimiento, y alinea el proyecto con la documentación y los ejemplos actuales de todo el ecosistema (incluida la skill `tailwind-design-system`, que es v4 — ver D-6).

**Alternativa descartada**: instalar y después bajar a React 18.3 / Vite 5.4 / Tailwind 3.4. Descartada por decisión del usuario: agrega un paso de downgrade + reinstalación desde cero, deja el proyecto naciendo con deuda de versiones, y obliga a traducir a v3 la sintaxis v4 de la skill de Tailwind.

**Consecuencias de scope** (respecto del texto literal de `CHANGE-00b` en `CHANGES.md`):
- **Desaparecen** `tailwind.config.ts`, `postcss.config.*` y la dependencia `autoprefixer`. Tailwind 4 no los usa.
- **Entran** el plugin `@tailwindcss/vite` registrado en `vite.config.ts` y la única línea `@import "tailwindcss";` en `src/app/index.css` (ver D-4 y D-8).
- El `content` de Tailwind deja de declararse: v4 detecta las fuentes automáticamente desde el grafo de módulos del bundler, así que la garantía "ninguna capa FSD queda fuera del purgado" se cumple por construcción y no por configuración (ver D-5).
- Corresponde reflejar esto en `CHANGES.md`; queda como OQ-3.

**Riesgo aceptado**: React 19 cambia el comportamiento de `useEffect` bajo `StrictMode` respecto de React 18 — ver D-16, que lo eleva a CHANGE-13 y CHANGE-20.

### D-3. Vitest + Testing Library + jsdom como devDependencies — el análogo frontend de `requirements-dev.txt`

`CHANGES.md` no lista ningún runner de tests para el frontend y sus criterios de aceptación se apoyan en `tsc --noEmit` y `npm run build`. Pero varios criterios posteriores describen **comportamiento**, no compilación: "`authStore.logout()` limpia token, email, isAuthenticated y localStorage" (CHANGE-13), "`jwtIsExpired(token)` retorna true si el claim `exp` está en el pasado" (CHANGE-13), "`<Modal isOpen onClose={fn}>` cierra con Escape" (CHANGE-15). Bajo TDD estricto eso exige un runner, y el runner tiene que existir antes del primer RED.

**Decisión**: se agregan como devDependencies `vitest` (línea compatible con Vite 7 — Vitest 3.x), `@testing-library/react` (línea con soporte React 19), `@testing-library/jest-dom`, `@testing-library/user-event` y `jsdom`. La configuración de Vitest vive **dentro de `vite.config.ts`** (bloque `test`), no en un `vitest.config.ts` separado.

**Rationale de la config compartida**: un archivo único garantiza que `resolve.alias` sea el mismo en dev, build y test — es lo que hace verdadera la escena "los alias resuelven en el runner de tests". Dos archivos se desincronizan a la primera.

**Alternativa descartada**: Jest — exigiría su propio transformador, su propio mapeo de alias y su propia resolución de ESM, duplicando lo que Vite ya resuelve.

**Nota de scope**: es una adición sobre el scope literal del roadmap, exactamente como `requirements-dev.txt` lo fue en CHANGE-00a (D-3 de aquel design). Se eleva como Open Question para reflejarlo en `CHANGES.md`.

### D-4. Tailwind 4 se integra con el plugin `@tailwindcss/vite`, no con PostCSS

El scope de `CHANGES.md` pide `postcss.config.ts` + `autoprefixer`, que es la mecánica de Tailwind 3. Tailwind 4 ofrece dos caminos: el plugin de PostCSS (`@tailwindcss/postcss`) o el **plugin nativo de Vite** (`@tailwindcss/vite`). Además, v4 ya no necesita `autoprefixer` (el prefijado va incorporado vía Lightning CSS) ni `postcss-import`.

**Decisión**: se instala `tailwindcss@^4` + `@tailwindcss/vite@^4` y el plugin se registra en el array `plugins` de `vite.config.ts`, junto a `@vitejs/plugin-react`. **No se crea ningún `postcss.config.*` ni se instala `autoprefixer`.**

**Rationale**: el plugin de Vite es el camino recomendado por Tailwind cuando el bundler es Vite — evita la capa PostCSS intermedia, es más rápido, y deja **una sola** fuente de configuración de build (`vite.config.ts`), coherente con D-3 (Vitest en el mismo archivo) y D-9 (alias en el mismo archivo). Un `postcss.config.js` adicional sería un cuarto archivo de config que puede desincronizarse.

**Alternativa descartada**: `@tailwindcss/postcss` con un `postcss.config.js`. Funciona, pero reintroduce el archivo que v4 vino a eliminar sin ninguna ventaja en este proyecto (no hay otros plugins de PostCSS en el stack).

**Nota**: esto vuelve moot la discusión original `.ts` vs `.js` para `postcss.config` — el archivo directamente no existe.

### D-5. Sin `tailwind.config.ts`: la configuración de Tailwind vive en CSS

Tailwind 4 elimina el archivo de configuración JS/TS del flujo por defecto: el tema se declara con `@theme` dentro del CSS, y la detección de archivos fuente es automática (v4 descubre las plantillas desde el grafo de módulos y el árbol del proyecto, respetando `.gitignore`), sin campo `content`.

**Decisión**: **no se crea `tailwind.config.ts`**. La configuración —cuando haga falta— vive en `src/app/index.css`. En este change no se declara ningún token: se deja el tema por defecto de Tailwind (Non-Goal explícito; ver también OQ-4, que sigue abierta porque la identidad visual del proyecto todavía no está documentada). Si en la implementación resulta necesario acotar el escaneo de fuentes, se hace con `@source` en CSS, no con un archivo de configuración.

**Consecuencia sobre el criterio de aceptación**: la garantía "ninguna capa FSD queda fuera del purgado" ya no se verifica leyendo un campo `content`, sino que se cumple por construcción — cualquier archivo alcanzable desde el entry participa del escaneo. El requirement correspondiente del spec se reformuló en ese sentido.

**Alternativa descartada**: usar `@config "./tailwind.config.ts"` (el puente de compatibilidad de v4 para configs heredadas). Sólo tiene sentido migrando un proyecto v3 existente; acá se parte de cero.

### D-6. Los compact rules de la skill `tailwind-design-system` AHORA aplican verbatim

El registro de skills (`.atl/skill-registry.md`) resume `tailwind-design-system` en clave v4: `@import "tailwindcss"` en vez de las directivas `@tailwind`, tokens bajo `@theme` en CSS en vez de `tailwind.config.ts`, `@custom-variant dark (&:where(.dark, .dark *))` en vez de `darkMode: "class"`, colores semánticos en OKLCH, `@keyframes` dentro de `@theme`.

**Decisión**: con Tailwind 4 adoptado (D-2), **desaparece el desajuste** que este design registraba en su versión anterior: se aplican tanto los **principios** (jerarquía brand → semántico → componente; colores semánticos nombrados en vez de hex sueltos; orden `Base → Variants → Sizes → States → Overrides`) como la **sintaxis** tal cual está escrita en los compact rules. No hay que traducir nada a v3.

**Consecuencia para este change**: acá no se define ningún token todavía (Non-Goal, y OQ-4 sigue abierta). Lo que se documenta ahora es que **CHANGE-15 y CHANGE-20 pueden aplicar la sintaxis v4 de la skill sin adaptación**, escribiendo los tokens en el bloque `@theme` de `src/app/index.css`.

### D-7. El punto de entrada se muda a `src/app/main.tsx`

El template de Vite pone el entry en `src/main.tsx`, fuera de toda capa FSD. La KB asigna `main.tsx` explícitamente a `src/app/`.

**Decisión**: se mueve a `src/app/main.tsx` y se actualiza el `<script type="module" src="...">` de `index.html`. Se borran del template `src/main.tsx`, `src/App.tsx` (raíz), `src/App.css`, `src/index.css`, `src/assets/react.svg` y `public/vite.svg`.

**Rationale**: dejar un módulo fuera de las capas convierte la regla FSD en "casi siempre", y una regla con excepciones no se puede testear. Con el entry dentro de `app/` — la capa más alta, la que puede importar de todas — el grafo de dependencias es uniforme.

### D-8. La hoja de estilos global vive en `src/app/index.css`

`CHANGES.md` referencia literalmente `src/app/index.css` en el scope de CHANGE-20 ("fuentes Google + variables CSS globales").

**Decisión**: `src/app/index.css` contiene la única línea `@import "tailwindcss";` (la forma de Tailwind 4; las tres directivas `@tailwind base/components/utilities` ya no existen) y nada más en este change — sin bloque `@theme`, sin tokens. Se importa desde `src/app/main.tsx`. Coherente con D-7: los estilos globales son responsabilidad de la capa `app/`.

**Nota**: este archivo es el punto donde CHANGE-15/CHANGE-20 van a agregar el `@theme` con los tokens de diseño y el `@custom-variant dark`, siguiendo la skill `tailwind-design-system` (D-6). Por eso se deja creado y cableado desde ya, aunque en este change su contenido sea una sola línea.

### D-9. Seis alias de capa (`@app`…`@shared`), declarados en dos lugares y heredados por el tercero

`CHANGES.md` fija la convención al escribir el criterio de CHANGE-15 como "Ningún componente importa de `@features`, `@entities`, `@pages`, `@widgets`".

**Decisión**: se declaran los seis alias — `@app`, `@pages`, `@widgets`, `@features`, `@entities`, `@shared` — en `vite.config.ts` (`resolve.alias`, resueltos con `path.resolve(__dirname, "src/<capa>")`) y en `tsconfig.app.json` (`compilerOptions.baseUrl` + `paths`). Vitest hereda automáticamente los de `vite.config.ts` por D-3.

**Por qué en `tsconfig.app.json` y no en `tsconfig.json`**: el template `react-ts` de Vite (5, 6 y 7 por igual) usa un `tsconfig.json` de sólo `references`, que no aplica `compilerOptions` a los archivos de `src/`. Poner los `paths` ahí es el error clásico: el build funciona (Vite resuelve) y el editor marca `Cannot find module`.

**Alternativa descartada**: un único alias `@/` → `src/`. Más corto, pero un alias que apunta a la raíz de `src/` no expresa la capa y hace que el test de fronteras tenga que reconstruirla desde la ruta. Seis alias hacen que la violación de capa sea visible en el propio import.

### D-10. Directorios de capa vacíos se marcan con `.gitkeep` anotado, no con barrels vacíos

Git no versiona directorios vacíos, y la estructura FSD es precisamente el entregable de este change: sin marcador, un `git clone` la pierde.

**Decisión**: cada directorio que este change crea pero no puebla lleva un `.gitkeep` que contiene **una línea de comentario nombrando el change que lo va a poblar** (por ejemplo, en `src/app/stores/.gitkeep`: `# CHANGE-13 — authStore.ts`). El archivo no lo parsea ninguna herramienta, así que el comentario es inocuo.

**Rationale**: es el equivalente frontend del D-9 de CHANGE-00a (módulos placeholder con sólo un docstring que nombra su change). Un `index.ts` con `export {}` sería código muerto que el próximo change tiene que borrar, y bajo TDD estricto sería producción sin test que la exija. Un `.gitkeep` es un marcador de filesystem, no código.

**Alternativa descartada**: barrels `index.ts` por capa desde ya — el `export {}` obligatorio por `isolatedModules` es ruido, y los barrels prematuros en FSD son una fuente conocida de imports circulares.

### D-11. Las fronteras FSD se testean con la API del compilador de TypeScript, no con ESLint

La regla "una capa nunca importa de una capa superior" es la que más fácilmente se erosiona a lo largo de ocho changes de frontend, y es criterio de aceptación explícito de CHANGE-15.

**Decisión**: `tests/fsd-boundaries.test.ts` recorre `src/**/*.{ts,tsx}` con `fs`, extrae los imports de cada archivo con `ts.preProcessFile(source, true, true).importedFiles` (API pública de `typescript`, que ya es devDependency), mapea cada archivo a su capa por la ruta y cada import a su capa por el alias o la ruta relativa, y falla si el índice de la capa importada es menor que el de la importadora en el orden `app(0) → pages(1) → widgets(2) → features(3) → entities(4) → shared(5)`. La tabla de orden es una constante única, parametrizada sobre los tests.

**Rationale**: cero dependencias nuevas, determinístico, corre en milisegundos y no requiere importar los módulos (funciona con capas vacías). Es el mismo patrón que D-12 del backend (`ast` de la stdlib para las fronteras Router/Service/UoW/Repository), lo que mantiene un único modelo mental de "las reglas de capa son tests" en los dos lados del sistema.

**Alternativa descartada**: `eslint-plugin-boundaries` o `eslint-plugin-import` con `no-restricted-imports`. Una dependencia más, configuración en un formato distinto, y la violación aparece como warning de lint en vez de test rojo — más fácil de ignorar.

**Guardia sobre el guardia**: se incluye un caso negativo que alimenta al detector con un fragmento que viola la regla y verifica que efectivamente lo marca. Sin él, el test podría pasar por no detectar nada.

### D-12. `port: 5173` con `strictPort: true`

El criterio de aceptación del roadmap dice "arranca sin errores en puerto 5173". Vite por defecto usa 5173 pero **se corre al 5174 en silencio** si está ocupado — con lo cual el criterio se cumpliría "verde" mientras la app escucha en otro lado, y CHANGE-00c fijaría un `CORS_ORIGINS` que no coincide.

**Decisión**: `server: { port: 5173, strictPort: true }` en `vite.config.ts`. Si el puerto está tomado, Vite falla ruidosamente. Un fallo explícito es preferible a un criterio de aceptación que miente.

### D-13. El placeholder `LandingPage` es la prueba viva del pipeline de estilos

**Decisión**: `src/pages/LandingPage/index.tsx` exporta un componente con clases utilitarias de Tailwind reales (layout, tipografía y color), y `src/app/App.tsx` lo renderiza. El test de renderizado verifica que el componente monta; la verificación visual del criterio "Tailwind funciona en un componente de prueba" se hace en el navegador.

**Rationale**: un `<div>Hello</div>` sin clases dejaría el pipeline de estilos sin evidencia de que funciona hasta CHANGE-15, es decir, tres changes después de haberlo configurado. CHANGE-20 reemplaza el contenido de este archivo por la composición real de widgets; la ruta y el nombre del componente se mantienen.

### D-14. `zustand` se instala y se verifica por importabilidad, sin crear ningún store

El criterio del roadmap es "Zustand instalado y verificado (importación sin error)". `src/app/stores/authStore.ts` es scope explícito de CHANGE-13.

**Decisión**: el test importa `create` desde `zustand` y verifica que la resolución del módulo y de sus tipos funciona. No se crea ningún store, ni siquiera de ejemplo.

**Rationale**: un store de ejemplo sería código muerto que CHANGE-13 tendría que borrar, y bajo TDD estricto sería producción escrita sin un test de comportamiento que la exija. Los compact rules de la skill `zustand` (stores por dominio, acciones nombradas como eventos, selectores atómicos, `persist` con `partialize`) aplican a CHANGE-13, no acá.

### D-15. Se conserva el ESLint del template, sin ampliarlo

El template `react-ts` de Vite trae su propia configuración de ESLint con los plugins de React Hooks y React Refresh.

**Decisión**: se conserva tal cual, se verifica que `npm run lint` corre limpio sobre el scaffold, y no se agregan Prettier, husky, lint-staged ni reglas adicionales. La regla FSD no se implementa como regla de ESLint por D-11.

### D-16. `StrictMode` de React 19 se conserva — y su doble invocación de efectos se eleva a CHANGE-13 y CHANGE-20

El template de Vite envuelve la app en `<StrictMode>`. React 19 endurece lo que React 18 ya hacía en desarrollo: montar, desmontar y volver a montar cada componente, invocando **dos veces** los efectos (`useEffect`, y en 19 también con `ref` callbacks y el ciclo de `useLayoutEffect` más estricto). Un efecto no idempotente que en React 18 pasaba desapercibido, en 19 se manifiesta.

**Decisión para este change**: se conserva `<StrictMode>` en `src/app/main.tsx`. El scaffold no tiene ni un solo efecto, así que acá no hay nada que arreglar — el impacto es enteramente aguas abajo.

**Downstream impact — a tener en cuenta al proponer estos changes, no ahora**:
- **CHANGE-13 (`zustand-auth-store`)**: el `hydrate()` del store al cargar la app (leer el token de `localStorage` y poblar `isAuthenticated`) se va a ejecutar **dos veces** en desarrollo si se dispara desde un `useEffect`. Debe ser idempotente, o vivir fuera del ciclo de render (inicialización del módulo del store / middleware `persist` de Zustand, que rehidrata solo). Los criterios de aceptación de CHANGE-13 sobre hidratación tienen que escribirse contra ese comportamiento.
- **CHANGE-20 (`landing-page-composition`)**: cualquier efecto de la composición de la Landing (carga de fuentes, listeners de scroll, analítica, animaciones de entrada) debe limpiarse correctamente en el retorno del `useEffect`, o se duplicará visiblemente en dev.

**Por qué no se resuelve acá**: no hay código que hidratar ni efectos que montar en el scaffold. Documentarlo ahora evita que CHANGE-13/CHANGE-20 hereden un supuesto de React 18 sin darse cuenta.

**Alternativa descartada**: sacar `<StrictMode>` para "no lidiar con esto". Apagaría exactamente el detector que hace visible el bug, y sólo en desarrollo — el problema reaparecería en producción con otra cara.

## Risks / Trade-offs

- **El roadmap `CHANGES.md` sigue describiendo la mecánica de Tailwind 3** (`tailwind.config.ts`, `postcss.config.ts`, `autoprefixer`), que este change ya no produce → Contención: la divergencia está documentada en D-2/D-4/D-5 y elevada como OQ-3 para actualizar `CHANGES.md`. El criterio de aceptación funcional ("Tailwind CSS funciona en un componente de prueba") se cumple igual.
- **Tailwind 4 exige navegadores modernos** (Safari 16.4+, Chrome 111+, Firefox 128+ por el uso de `@property` y `color-mix()`) y no ofrece el fallback de v3 → Aceptado: la Landing es una herramienta interna de tesis, sin compromiso de soporte para navegadores legacy.
- **La detección automática de fuentes de Tailwind 4 es implícita**: nada declara ya qué archivos se escanean, así que un directorio ignorado por `.gitignore` quedaría fuera del CSS generado sin aviso → Contención: el árbol FSD entero está versionado y es alcanzable desde el entry; si alguna vez hiciera falta, `@source` en CSS lo corrige.
- **React 19 sobre código escrito con supuestos de React 18** (doble invocación de efectos en `StrictMode`) → Contención: D-16 lo documenta y lo eleva a CHANGE-13 y CHANGE-20, que son los únicos changes del roadmap con efectos sensibles a hidratación.
- **Compatibilidad Vitest ↔ Vite 7**: instalar una línea vieja de Vitest rompe la resolución de plugins; y `@testing-library/react` necesita la línea con soporte de React 19 → Contención: se fijan las líneas compatibles en la tarea de instalación y se valida con una corrida en vacío del runner antes de escribir el primer test.
- **`.gitkeep` puede leerse como "esta capa ya está hecha"** → Contención en D-10: cada `.gitkeep` nombra el change que la puebla, igual que los docstrings del backend.
- **El test de fronteras FSD sólo ve imports estáticos**: un `import()` dinámico con ruta construida en runtime se le escapa → Aceptado. `ts.preProcessFile` cubre `import`, `export from` y `import()` con literal, que es el 100% de lo que el roadmap va a escribir; no hay carga dinámica planificada en ningún change.
- **Sin pins exactos (se usan rangos `^`)**: dos instalaciones en fechas distintas pueden traer minors distintas → Contención parcial: se versiona `package-lock.json`, que sí fija el árbol resuelto. Mismo trade-off aceptado que en CHANGE-00a.
- **Divergencia documentada entre el scope literal de `CHANGES.md` y lo que se implementa** (sin `tailwind.config.ts`, sin `postcss.config.*`, sin `autoprefixer`; + Vitest y RTL) → Contención: OQ-2 y OQ-3 piden reflejarlo en el roadmap, para que `CHANGES.md` siga siendo fiel al código.
- **Tres `node_modules/` en el repo** (dashboard, wasa-landing y el del entorno de desarrollo) → Aceptado; ninguno se versiona y `.gitignore` los cubre.

## Migration Plan

No aplica migración de datos ni de esquema: el change sólo agrega archivos nuevos bajo `wasa-landing/`, más las entradas de Node en el `.gitignore` de la raíz.

- **Despliegue**: no hay despliegue en este change; los criterios de aceptación son locales (`npm run dev`, `npm run build`, suite verde).
- **Rollback**: eliminar el directorio `wasa-landing/` y revertir el `.gitignore`. Cero efectos colaterales sobre `dashboard/`, `fastapi_bridge/`, n8n o `db_fuzzing`.
- **Verificación posterior**: confirmar que el Dashboard existente y el Bridge siguen arrancando sin cambios — trivialmente cierto, porque no se toca ninguno de los dos.

## Open Questions

1. ~~**Versiones del stack (D-2)**~~ — **RESUELTA por decisión explícita del usuario**: se moderniza. Se adopta lo que `npm create vite@latest -- --template react-ts` produce hoy (React 19 / Vite 7 / TS 5.9) más **Tailwind 4**, sin downgrade. La tabla de stack de `knowledge-base/02_descripcion_general.md` y las de `CLAUDE.md`/`AGENTS.md` ya fueron actualizadas en consecuencia. Ver D-2, y D-16 para el impacto de React 19 sobre CHANGE-13/CHANGE-20.
2. ~~**Vitest + Testing Library + jsdom (D-3)**~~ — **RESUELTA**: `CHANGES.md` §CHANGE-00b ya refleja la instalación real (Tailwind 4 sin postcss/autoprefixer; Vitest/RTL quedan documentados en `tasks.md`/`design.md` como en CHANGE-00a).
3. ~~**El scope de Tailwind en `CHANGES.md` quedó desactualizado (D-2, D-4, D-5)**~~ — **RESUELTA**: se actualizó `CHANGES.md` §CHANGE-00b para reemplazar `tailwind.config.ts`/`postcss.config.ts`/`autoprefixer` por la mecánica real de Tailwind 4 (`@tailwindcss/vite` + `@import "tailwindcss"`).
4. **Identidad visual** — CHANGE-20 menciona "fuentes Google + variables CSS globales" y CHANGE-15 pide `Button` con variantes `primary`/`secondary`, pero no hay paleta, tipografía ni tokens documentados en la KB. No bloquea CHANGE-00b (Non-Goal: el `@theme` de este change queda vacío / con el tema por defecto de Tailwind), **pero sí bloquea CHANGE-15**: conviene definirlos antes de llegar ahí. Con Tailwind 4 el destino de esos tokens ya está fijado — el bloque `@theme` de `src/app/index.css` (D-6, D-8).
5. **Gestor de paquetes** — se usa `npm` (por el `npm create` del roadmap) y se versiona `package-lock.json`. Si el proyecto prefiere `pnpm` para no triplicar `node_modules`, es el momento de decirlo.
