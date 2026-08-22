> **Modo TDD estricto activo.** Cada grupo marcado `(TDD)` sigue el ciclo
> RED → GREEN → TRIANGULATE → REFACTOR. No escribir código de producción sin un
> test que falle primero. Los grupos 1 y 2 son infraestructura de tooling (no hay
> ciclo TDD posible antes de tener runner) y el grupo 8 es verificación manual.
>
> Todos los comandos se ejecutan desde `wasa-landing/` salvo indicación contraria.
>
> **Stack fijado por D-2**: se conserva lo que `npm create vite@latest` scaffoldea hoy
> (React 19, Vite 7, TS 5.9) — **no hay paso de downgrade** — y se usa **Tailwind CSS 4**
> (plugin `@tailwindcss/vite` + `@import "tailwindcss"`; sin `tailwind.config.ts`, sin
> `postcss.config.*`, sin `autoprefixer`).
>
> Referencias: `design.md` (decisiones D-1..D-16), `specs/landing-bootstrap/spec.md`
> (requirements y escenarios = criterios de aceptación).

## 1. Creación del proyecto e instalación del stack

- [x] 1.1 Verificar Node y npm disponibles (`node --version`, `npm --version`); registrar las versiones exactas de la máquina. Vite 7 requiere Node 20.19+ o 22.12+ — confirmar que la máquina lo cumple
- [x] 1.2 Desde la raíz del repo, ejecutar `npm create vite@latest wasa-landing -- --template react-ts` (D-1) y confirmar que el directorio se crea como hermano de `fastapi_bridge/` y `dashboard/`
- [x] 1.3 **Verificación de humo del template intacto**: `npm install`, `npm run dev` y `npm run build` sobre lo que generó Vite, sin tocar nada. Confirma que la toolchain funciona en esta máquina antes de introducir cualquier cambio propio
- [x] 1.4 Registrar las versiones que el template instaló (`react`, `react-dom`, `@types/react`, `@types/react-dom`, `vite`, `@vitejs/plugin-react`, `typescript`) y confirmar que son la línea moderna esperada (React 19, Vite 7, TS 5.9). **No se ajusta ni se baja ninguna versión** (D-2). Si el template generara algo materialmente distinto de lo previsto, registrarlo y continuar con lo que produjo — la decisión es "lo que scaffoldea hoy", no un pin

  **DESVIACIÓN REGISTRADA (D-2 aplicado)**: `npm create vite@latest` (create-vite 9.1.2) generó hoy una línea más nueva de lo previsto en `design.md`: `react@^19.2.8`, `react-dom@^19.2.8`, `@types/react@^19.2.17`, `@types/react-dom@^19.2.3`, `vite@^8.2.0` (no 7.x), `@vitejs/plugin-react@^6.0.4`, `typescript@~6.0.2` (no 5.9.x). Además el template trae `oxlint@^1.75.0` como linter en vez de ESLint (afecta D-15/tarea 8.4), y el contenido de demo usa `src/assets/{react.svg,vite.svg,hero.png}` + `public/icons.svg` (sprite) en vez del `public/vite.svg` + `src/assets/react.svg` asumidos en D-7. Por decisión D-2 ("lo que scaffoldea hoy, no un pin") se continúa con lo generado, sin downgrade y sin instalar ESLint. Se reporta como hallazgo a cerrar en OQ-2/OQ-3 del design.
- [x] 1.5 Instalar las dependencias de runtime del roadmap: `react-hook-form@^7`, `zod@^3`, `@hookform/resolvers`, `axios`, `zustand`
- [x] 1.6 Instalar las devDependencies de estilos (D-4): `tailwindcss@^4` y `@tailwindcss/vite@^4`. **No instalar `postcss` ni `autoprefixer`** — Tailwind 4 no los usa; si el árbol los arrastra como dependencia transitiva, no se declaran en `package.json`
- [x] 1.7 Instalar las devDependencies de test (D-3): `vitest` en la línea compatible con Vite 7 (3.x), `@testing-library/react` en la línea con soporte de React 19, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`. Verificar que la resolución de npm termina sin conflictos de peer dependencies (en particular el peer `react@19` de Testing Library)

  **DESVIACIÓN**: se instaló `vitest@^3` inicialmente (3.2.7, sin conflictos de peer deps en la instalación). Resultó incompatible en *tipos* con `vite@8.2.0` (ver desviación de 1.4: el template scaffoldeó Vite 8, no Vite 7) — `tsc -b` fallaba por el `vite@7.3.6` anidado que trae `vitest@3.2.7`. Se resolvió en la tarea 2.1/3.5 subiendo a `vitest@^4` (4.1.11), cuyo peer range `vite: ^6 || ^7 || ^8` cubre la versión real instalada. `@testing-library/react@16.3.2` sí resolvió limpio contra React 19 desde el inicio, sin cambios.
- [x] 1.8 Agregar al `.gitignore` de la raíz del repo las entradas de Node (`node_modules/`, `dist/`, `*.local`, `npm-debug.log*`) si no están ya. Confirmar que `wasa-landing/package-lock.json` **sí** queda versionado

## 2. Runner de tests operativo

> Precondición del modo TDD: sin runner no hay RED posible en los grupos 3 a 7.

- [x] 2.1 Agregar el bloque `test` a `vite.config.ts` (D-3): `environment: "jsdom"`, `globals: true`, `setupFiles` apuntando a `tests/setup.ts`, e `include` cubriendo `tests/**/*.test.{ts,tsx}`. Añadir la triple-slash reference a los tipos de Vitest para que `tsc` no marque el bloque como desconocido

  **DESVIACIÓN**: la triple-slash reference `/// <reference types="vitest/config" />` no elimina el error de tipos de `tsc -b` sobre el campo `test` (esa mecánica de declaration-merging es de Vitest <0.31). Se usó en su lugar el patrón actual: `import { defineConfig } from 'vitest/config'` en vez de `from 'vite'`, que expone `UserConfig` ya extendido con `test`. Mismo resultado, mecanismo distinto al literal de la tarea.
- [x] 2.2 Crear `tests/setup.ts` con el import de `@testing-library/jest-dom/vitest`
- [x] 2.3 Agregar los scripts `test` y `test:run` a `package.json`
- [x] 2.4 Ejecutar el runner en vacío y confirmar que arranca, no encuentra tests y termina sin errores de configuración (no un fallo de resolución de plugins ni de tipos)

## 3. Punto de entrada en la capa `app` y limpieza del template (TDD)

> Requirements cubiertos: *Estructura de capas Feature-Sliced Design*, *El proyecto compila sin errores de tipos*.

  **DESVIACIÓN adicional (1.7)**: `vitest@^3` (línea prevista para Vite 7) resultó incompatible en tipos con `vite@8.2.0` (el template instaló Vite 8, no Vite 7 — ver desviación de 1.4). `tsc -b` fallaba en `vite.config.ts` por conflicto de tipos `Plugin`/`PluginOption` entre el `vite@8` de nivel superior y el `vite@7.3.6` anidado que traía `vitest@3.2.7`. Se resolvió instalando `vitest@^4` (4.1.11), cuyo `peerDependencies.vite` es `^6 || ^7 || ^8` — compatible con la línea real de Vite que scaffoldeó el template. `npm run build` y la suite de tests quedaron verdes tras el cambio.

- [x] 3.1 **RED** — Escribir `tests/structure.test.ts` con un test que afirme que `src/app/main.tsx` existe y que `src/main.tsx` **no** existe. Ejecutar: debe fallar
- [x] 3.2 **GREEN** — Mover el entry a `src/app/main.tsx` y actualizar el `<script type="module" src="/src/app/main.tsx">` de `index.html` (D-7). Conservar el envoltorio `<StrictMode>` del template (D-16). Ejecutar tests: debe pasar
- [x] 3.3 **TRIANGULATE** — Agregar test: no existen `src/App.css`, `src/index.css`, `src/assets/react.svg` ni `public/vite.svg`. Borrarlos junto con el contenido de demo del template (contador, logos, imports asociados)

  **DESVIACIÓN**: el template real (create-vite 9.1.2) no generó `src/assets/react.svg`/`public/vite.svg` sino `src/assets/{react.svg,vite.svg,hero.png}` + `public/{favicon.svg,icons.svg}` (sprite de iconos de documentación/social del demo) — ver desviación de 1.4. Se borraron todos los activos de demo reales (`src/App.tsx` raíz, `src/App.css`, `src/index.css`, `src/assets/` completo, `public/icons.svg`, `public/favicon.svg`) y se quitó el `<link rel="icon">` de `index.html` (Non-Goal: sin identidad visual todavía, ver OQ-4). El test verifica los paths literales de la tarea (`src/App.css`, `src/index.css`, `src/assets/react.svg`, `public/vite.svg`), que siguen siendo un subconjunto válido de "no existe nada del demo". Se creó un `src/app/App.tsx` mínimo (`return null`) para no dejar el build roto entre este grupo y el grupo 7, donde D-13 lo reemplaza por el placeholder real de `LandingPage`.
- [x] 3.4 **TRIANGULATE** — Agregar test que lea `index.html` y afirme que su único `<script type="module">` apunta a `/src/app/main.tsx` (y no queda ninguna referencia colgada al entry viejo)
- [x] 3.5 Ejecutar `npm run build` y confirmar que sigue compilando tras la mudanza del entry

## 4. Estructura de capas FSD (TDD estructural)

> Requirement cubierto: *Estructura de capas Feature-Sliced Design*. Cada directorio que
> este change crea pero no puebla lleva un `.gitkeep` con una línea de comentario que
> nombra el change que lo va a poblar (D-10). Sin barrels vacíos, sin código muerto.

- [x] 4.1 **RED** — Ampliar `tests/structure.test.ts` con un test parametrizado que afirme la existencia de las seis capas: `src/app/`, `src/pages/`, `src/widgets/`, `src/features/`, `src/entities/`, `src/shared/`. Ejecutar: debe fallar por las que no existen
- [x] 4.2 **GREEN** — Crear los seis directorios de capa con su `.gitkeep` anotado donde corresponda. Ejecutar tests

  **NOTA**: `src/pages/` no recibió `.gitkeep` — este mismo change lo puebla en el grupo 7 (`LandingPage/index.tsx`, D-13), así que nunca queda vacío al cierre del change.
- [x] 4.3 **TRIANGULATE** — Agregar test para los subdirectorios que el roadmap ya compromete: `src/app/stores/` (CHANGE-13), `src/app/providers/`, `src/shared/ui/` (CHANGE-15), `src/shared/api/` (CHANGE-16), `src/shared/config/` (CHANGE-00c), `src/shared/lib/` (CHANGE-13/15). Crearlos con su `.gitkeep` anotado
- [x] 4.4 **TRIANGULATE** — Agregar test de contrato negativo (D-14, Non-Goals): **no** existen `src/app/stores/authStore.ts`, ni ningún archivo bajo `src/entities/`, `src/shared/ui/`, `src/shared/api/` o `src/features/` que no sea un `.gitkeep`. Este test es la guardia contra que el scaffold invada el scope de CHANGE-13 a CHANGE-18
- [x] 4.5 **TRIANGULATE** — Agregar test que afirme que cada `.gitkeep` creado contiene la referencia al change que lo puebla (trazabilidad de D-10; evita que un agente futuro lea el directorio vacío como "capa ya hecha")

## 5. Path aliases (TDD)

> Requirement cubierto: *Path aliases resueltos en build y en type-check*.

- [x] 5.1 **RED** — Escribir `tests/aliases.test.ts` con un test que importe algo a través de un alias (por ejemplo `@shared`) y afirme que resuelve. Ejecutar: debe fallar por módulo no resuelto

  **NOTA**: se creó `src/shared/lib/aliasProbe.ts` como fixture mínimo (no es funcionalidad de dominio) para tener algo real que importar vía `@shared`.
- [x] 5.2 **GREEN** — Declarar los seis alias en `vite.config.ts` (`resolve.alias` con `path.resolve(__dirname, "src/<capa>")`): `@app`, `@pages`, `@widgets`, `@features`, `@entities`, `@shared` (D-9). Ejecutar tests: Vitest hereda la config de Vite, debe pasar

  **DESVIACIÓN**: se usó `import.meta.dirname` en vez de `__dirname` — Vite 8's nuevo `configLoader: 'native'` emite warning deprecando `__dirname` en `vite.config.ts`. Mismo resultado, sintaxis actualizada a lo que exige la línea de Vite realmente instalada (ver desviación 1.4).
- [x] 5.3 **GREEN** — Declarar los mismos seis alias en `compilerOptions.paths` de **`tsconfig.app.json`** (no en `tsconfig.json`, que sólo tiene `references` — D-9), con el `baseUrl` correspondiente. Ejecutar `tsc --noEmit`: no debe reportar `Cannot find module` sobre los imports por alias

  **DESVIACIÓN**: TypeScript ~6.0.2 (no 5.9.x — ver desviación 1.4) deprecó `baseUrl` (TS5101, error en modo estricto de esta versión) y con `moduleResolution: "bundler"` los `paths` no lo necesitan: se resuelven relativos al propio `tsconfig.app.json`. Se omitió `baseUrl` y se usaron rutas con `./` explícito (`"@app/*": ["./src/app/*"]`, etc.). `npx tsc -b --force` corre limpio.
- [x] 5.4 **TRIANGULATE** — Agregar test que lea `vite.config.ts` y `tsconfig.app.json` y afirme que **ambos** declaran los seis alias, con los mismos nombres apuntando a los mismos directorios. Es la guardia contra la desincronización silenciosa entre bundler y compilador
- [x] 5.5 **TRIANGULATE** — Agregar caso: un import por alias desde un archivo de test se resuelve en el runner (la tercera pata de D-3: dev, build y test comparten una única tabla de alias)

## 6. Fronteras de import FSD (TDD estructural)

> Requirement cubierto: *Fronteras de import entre capas FSD*. Se verifica extrayendo los
> imports de cada archivo con `ts.preProcessFile` de la API pública de `typescript`, sin
> importar los módulos (D-11).

- [x] 6.1 **RED** — Escribir `tests/fsd-boundaries.test.ts` con un helper que, dado el contenido de un archivo, devuelva sus módulos importados vía `ts.preProcessFile(source, true, true).importedFiles`, y un segundo helper que mapee un archivo o un especificador de import a su capa FSD (por alias o por ruta relativa). Escribir el primer test: ningún archivo bajo `src/shared/` importa de `@app`, `@pages`, `@widgets`, `@features` ni `@entities`. Ejecutar

  **NOTA de RED**: como el árbol real no tenía ninguna violación todavía, el RED genuino se obtuvo dejando `getImportedModules`/`resolveLayer` como stubs que lanzan `Error('not implemented')` antes de escribir la lógica real — confirmado con la corrida en rojo.
- [x] 6.2 **TRIANGULATE** — Generalizar a la regla completa con la constante de orden `app(0) → pages(1) → widgets(2) → features(3) → entities(4) → shared(5)`: para todo archivo de `src/`, ningún import resuelve a una capa de índice menor que la propia. Parametrizar el test sobre la tabla, de modo que la regla viva en un único lugar (D-11)
- [x] 6.3 **TRIANGULATE** — Agregar caso negativo que valide el propio detector: alimentar el helper con un fragmento de código que viola la regla (por ejemplo, un archivo simulado en `shared/` que importa `@features/auth`) y afirmar que lo marca como violación, nombrando archivo e import. Sin esto, el test podría pasar por no detectar nada
- [x] 6.4 **TRIANGULATE** — Agregar caso: los imports relativos que cruzan capas (`../../features/...`) también se detectan, no sólo los que usan alias
- [x] 6.5 **REFACTOR** — Extraer la tabla de capas y la resolución archivo→capa a un módulo compartido de los tests (`tests/support/fsd.ts`), de modo que agregar una capa o una regla en changes futuros sea una línea. Verificado: la suite sigue verde (45/45)

## 7. Pipeline de estilos Tailwind 4 y placeholder de la Landing (TDD)

> Requirements cubiertos: *Pipeline de estilos Tailwind operativo*, *Estructura de capas
> Feature-Sliced Design* (escena del placeholder), *Dependencias del stack frontend disponibles*.
>
> Mecánica de Tailwind 4 (D-4, D-5, D-8): plugin `@tailwindcss/vite` en `vite.config.ts` +
> `@import "tailwindcss";` en `src/app/index.css`. **No** se crea `tailwind.config.ts`,
> **no** se crea `postcss.config.*`, **no** se instala `autoprefixer`, **no** se declara
> ningún campo `content` (v4 detecta las fuentes automáticamente).

- [x] 7.1 **RED** — Escribir `tests/landing-page.test.tsx` con un test que renderice `App` desde `@app/App` con Testing Library y afirme que el contenido del placeholder de la Landing está en el documento. Ejecutar: debe fallar
- [x] 7.2 **GREEN** — Crear `src/pages/LandingPage/index.tsx` con el componente `LandingPage` (clases utilitarias de Tailwind reales: layout, tipografía y color — D-13) y `src/app/App.tsx` renderizándolo. Ejecutar tests: debe pasar
- [x] 7.3 **GREEN** — Registrar el plugin `@tailwindcss/vite` en el array `plugins` de `vite.config.ts`, junto a `@vitejs/plugin-react` (D-4). Confirmar que **no** se creó ningún `tailwind.config.*` ni `postcss.config.*`
- [x] 7.4 **GREEN** — Crear `src/app/index.css` con la única línea `@import "tailwindcss";` (D-8) e importarlo desde `src/app/main.tsx`. **Sin bloque `@theme`**: la identidad visual no está definida todavía (Non-Goal; OQ-4) y CHANGE-15/CHANGE-20 son los que van a escribir los tokens acá
- [x] 7.5 **TRIANGULATE** — Agregar test que lea `vite.config.ts` y afirme que registra el plugin de Tailwind, **y** que en la raíz del proyecto no existen `tailwind.config.{js,ts,cjs,mjs}` ni `postcss.config.{js,ts,cjs,mjs}` (guardia contra que alguien reintroduzca la mecánica de v3 sobre una instalación v4 — D-4, D-5)
- [x] 7.6 **TRIANGULATE** — Agregar test que afirme que `src/app/index.css` existe, contiene `@import "tailwindcss"` (y **ninguna** directiva `@tailwind base/components/utilities`, que en v4 no existe) y está importado desde `src/app/main.tsx`
- [x] 7.7 **TRIANGULATE** — Agregar test de disponibilidad de Zustand (D-14): `import { create } from "zustand"` resuelve y expone una función. **No** crear ningún store — `authStore.ts` es scope de CHANGE-13
- [x] 7.8 **TRIANGULATE** — Agregar test de manifiesto: `package.json` declara como dependencias de runtime `react`, `react-dom`, `react-hook-form`, `zod`, `@hookform/resolvers`, `axios` y `zustand`; ninguna de las devDependencies de test aparece entre ellas; y `autoprefixer` no figura en ninguna de las dos listas (D-4)
- [x] 7.9 **REFACTOR** — Configurar `server: { port: 5173, strictPort: true }` en `vite.config.ts` (D-12). Verificar que la suite sigue verde

## 8. Verificación de criterios de aceptación

- [x] 8.1 Ejecutar la suite completa y confirmar 100% verde, registrando el conteo final de tests

  **Resultado**: 69/69 tests verdes, 6 archivos de test (`structure`, `aliases`, `fsd-boundaries`, `landing-page`, `tailwind-pipeline`, `manifest`).
- [x] 8.2 Ejecutar `tsc --noEmit` y confirmar cero errores de tipos

  **Resultado**: `npx tsc -b --force` exit code 0, cero errores.
- [x] 8.3 Ejecutar `npm run build` y confirmar código de salida `0` y artefactos en `dist/`

  **Resultado**: exit 0, `dist/index.html`, `dist/assets/*.css`, `dist/assets/*.js` generados.
- [x] 8.4 Ejecutar `npm run lint` (el ESLint que trae el template — D-15) y confirmar que corre limpio sobre el scaffold

  **DESVIACIÓN**: el template real trae `oxlint`, no ESLint (ver desviación 1.4). `npm run lint` (que invoca `oxlint`) corre limpio, exit 0.
- [x] 8.5 Ejecutar `npm run dev` y confirmar arranque en `http://localhost:5173` sin errores. Abrir la página y verificar en la consola del navegador que no hay errores ni peticiones de red fallidas

  **Resultado**: Vite v8.2.2 listo en 394ms, sirviendo en `http://localhost:5173/`. Verificado con `curl`: `index.html`, `/src/app/main.tsx`, `/src/app/App.tsx` y `/src/pages/LandingPage/index.tsx` responden 200. Única petición fallida es el `/favicon.ico` implícito del navegador (no hay `<link rel="icon">` en `index.html` — sin identidad visual todavía, Non-Goal/OQ-4); no es una petición emitida por la app.
- [x] 8.6 Verificación visual del pipeline de estilos: confirmar en el navegador que las clases de Tailwind del placeholder se aplican efectivamente (criterio "Tailwind CSS funciona en un componente de prueba"). Confirmar también que el CSS generado incluye las utilidades usadas por el placeholder — evidencia de que la detección automática de fuentes de v4 alcanza el árbol FSD (D-5)

  **Resultado**: se inspeccionó el CSS servido por el dev server (`/src/app/index.css`) y el CSS de `npm run build`: ambos contienen las reglas reales de las utilidades usadas por `LandingPage` (`.bg-slate-950`, `.text-slate-100`, `.text-slate-400`, `.flex`, `.min-h-screen`, `.text-4xl`, `.sm\:text-5xl`, etc.), generadas sin declarar ningún campo `content` — confirma que la detección automática de v4 alcanza `src/pages/`.
- [x] 8.7 Verificar D-12 en vivo: con el puerto 5173 ocupado, `npm run dev` falla con un error explícito en lugar de reasignarse al 5174

  **Resultado**: con el primer `npm run dev` corriendo en 5173, un segundo `npm run dev` falló con `Error: Port 5173 is already in use` y exit code 1 — no reasignó a 5174.
- [x] 8.8 Confirmar que ningún archivo `.env` fue creado ni versionado en este change (corresponde a CHANGE-00c), y que `node_modules/` y `dist/` no aparecen en `git status`

  **Resultado**: no existe ningún `.env*` bajo `wasa-landing/`. `git status --short` sólo muestra `wasa-landing/` como directorio nuevo (no expandido); `git check-ignore` confirma que `node_modules/` y `dist/` están ignorados vía `wasa-landing/.gitignore`, y `git add --dry-run` no los incluiría.
- [x] 8.9 Revisar los 6 criterios de aceptación de `CHANGE-00b` en `CHANGES.md`, marcarlos y actualizar el estado del change a `[x]`

  **Resultado**: los 6 criterios marcados `[x]`, `Estado` actualizado a `[x] completado`. Pendiente aparte (OQ-3, no bloqueante): la prosa de `Scope` de CHANGE-00b sigue mencionando "Vite 7.x" y `tsconfig.json` para los alias — el stack real quedó en Vite 8.x y los alias van en `tsconfig.app.json` (ver desviaciones de 1.4/5.3). No se tocó esa prosa en este task para no exceder el alcance literal de 8.9; queda anotado para quien cierre OQ-3.
- [x] 8.10 Reportar al usuario, con las versiones exactas instaladas: (a) el stack efectivo que quedó — React 19 / Vite 7 / TS 5.9 / Tailwind 4, según la decisión ya tomada en D-2; (b) las Open Questions que siguen requiriendo decisión — la adición de Vitest/RTL/jsdom respecto del scope literal del roadmap (OQ-2), la desactualización del scope de Tailwind en `CHANGES.md` que corresponde corregir (OQ-3), la identidad visual pendiente que **bloquea CHANGE-15** (OQ-4) y el gestor de paquetes (OQ-5); y (c) el aviso de D-16 para quien proponga CHANGE-13 y CHANGE-20 — bajo React 19 + `StrictMode` los efectos se invocan dos veces en desarrollo, así que la hidratación del `authStore` debe ser idempotente y los efectos de la Landing deben limpiarse

  **Ver reporte final entregado al usuario/orquestador al cierre de esta sesión de apply.**
