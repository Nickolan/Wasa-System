> **Modo TDD estricto activo** (Vitest). Cada grupo sigue el ciclo RED → GREEN → TRIANGULATE → REFACTOR: el test se escribe **antes** que el módulo de producción y debe fallar por ausencia del símbolo, no por un error de sintaxis. No invertir el orden ("implementar y después testear") en ningún grupo. Todos los comandos se ejecutan desde `wasa-landing/`.
>
> **Governance MEDIO**: antes de escribir código, releer `design.md` §Decisions. Las tres decisiones que se apartan de la letra de `CHANGES.md` son **D-2** (el Hero recibe el ancla por prop; ningún widget importa de otra slice de widgets), **D-3** (los modales suman una quinta prop opcional, `onAuthSuccess`, que `CHANGES.md` no declara: el éxito cierra el diálogo y además desplaza la vista al formulario) y **D-8** (el aviso ético se renderiza también para el visitante anónimo, no sólo detrás del muro). Si alguna no se comparte, discutirla con el usuario **antes** de implementarla.
>
> **Módulos nuevos** (todos bajo `src/widgets/`): `auth-modal/model/useAuthModal.ts`, `auth-modal/ui/LoginModal.tsx`, `auth-modal/ui/RegisterModal.tsx`, `auth-modal/index.ts`; `scan-form/model/anchor.ts`, `scan-form/ui/ScanFormWidget.tsx`, `scan-form/index.ts`; `hero/model/useHeroCta.ts`, `hero/ui/HeroWidget.tsx`, `hero/index.ts`; `features-section/model/tools.ts`, `features-section/ui/FeaturesWidget.tsx`, `features-section/index.ts`; `how-it-works/model/steps.ts`, `how-it-works/ui/HowItWorksWidget.tsx`, `how-it-works/index.ts`; `footer/ui/FooterWidget.tsx`, `footer/index.ts`.
> **Tests nuevos**: `tests/use-auth-modal.test.tsx`, `tests/auth-modal.test.tsx`, `tests/scan-form-widget.test.tsx`, `tests/hero-widget.test.tsx`, `tests/features-widget.test.tsx`, `tests/how-it-works-widget.test.tsx`, `tests/footer-widget.test.tsx`, `tests/landing-responsive.test.ts`.
> **Archivos existentes que se tocan**: `src/pages/LandingPage/index.tsx` (reescrito), `src/widgets/.gitkeep` (se borra), `tests/landing-page.test.tsx` y `tests/structure.test.ts` (se actualizan, no se relajan — D-14).
> **Archivos que NO se tocan**: nada bajo `src/features/`, `src/entities/` ni `src/shared/`. En particular `shared/ui/Modal.tsx` queda intacto (D-4).

## 1. Red de seguridad

- [x] 1.1 Correr `npm run test:run` y anotar el baseline de la suite completa ("N tests passing / M test files"). Si algo ya falla, **detenerse** y reportarlo como fallo preexistente sin arreglarlo. **Resultado**: 429 tests passing / 40 test files passed, **2 test files failed to load** (`tests/app-http-client-wiring.test.tsx`, `tests/use-scan-form.test.tsx`) — ambos por un import obsoleto `@app/stores/authStore` que no existe (el store vive en `@entities/user` desde CHANGE-16). Fallo preexistente, no relacionado con este change; no se corrige acá.
- [x] 1.2 Correr `npx tsc -b` y confirmar que compila limpio antes de tocar nada (baseline de tipos). **Resultado**: limpio, sin errores.
- [x] 1.3 Releer `src/features/auth/index.ts`, `src/features/scan-form/index.ts` y `src/entities/user/index.ts` y confirmar los nombres y props exactos que este change consume. **Resultado**: coincide exactamente con `design.md` §Context — `LoginForm({ onSuccess, onSwitchToRegister })`, `RegisterForm({ onSuccess, onSwitchToLogin })`, `ScanForm()` sin props, `useAuthStore` exportado desde `@entities/user`. Sin cambios al design.
- [x] 1.4 Confirmar por inspección que `src/widgets/` contiene únicamente `.gitkeep` y que `tests/structure.test.ts` no afirma nada sobre esa capa todavía. **Resultado**: confirmado. Único otro `.gitkeep` bajo `src/`: `src/app/stores/.gitkeep` (queda tras borrar el de `widgets/`).

## 2. Máquina de estado de los modales (D-1)

- [x] 2.1 **RED**: en `tests/use-auth-modal.test.tsx`, escribir que `useAuthModal` importado de `@widgets/auth-modal` arranca con `mode === null`. Confirmado RED por módulo inexistente (`Failed to resolve import "@widgets/auth-modal"`).
- [x] 2.2 **GREEN**: creado `src/widgets/auth-modal/model/useAuthModal.ts` y `src/widgets/auth-modal/index.ts`. Verde.
- [x] 2.3 **TRIANGULATE — cada apertura fija su modo**: cubierto, verde.
- [x] 2.4 **TRIANGULATE — alternar no acumula**: cubierto, verde.
- [x] 2.5 **TRIANGULATE — cerrar vuelve a ninguno, nunca al otro**: cubierto, verde (incluye idempotencia de `close()` sobre `null`).
- [x] 2.6 **REFACTOR**: el módulo no importa de `@app`/`@pages`/otra slice de `@widgets`. `tests/fsd-boundaries.test.ts` en cero violaciones. 14/14 tests verdes.

## 3. Modales de autenticación (D-3, D-4)

- [x] 3.1 **RED**: `tests/auth-modal.test.tsx` escrito completo (3.1–3.9 en un solo archivo). Confirmado RED — 18/18 tests fallando por `LoginModal`/`RegisterModal` indefinidos y archivo inexistente.
- [x] 3.2 **GREEN**: creado `src/widgets/auth-modal/ui/LoginModal.tsx` con props `{ isOpen, onClose, onSwitchToRegister, onAuthSuccess? }`.
- [x] 3.3 **TRIANGULATE — el modal de registro**: creado `RegisterModal`; nombres accesibles distintos ("Iniciar sesión" vs. "Crear cuenta") verificado.
- [x] 3.4 **TRIANGULATE — el éxito cierra**: verificado con el adaptador de mock de `loginApi`/`registerApi` (mismo patrón que `auth-login-form.test.tsx`); `isAuthenticated` ya `true` dentro del propio `onClose`.
- [x] 3.5 **TRIANGULATE — `onAuthSuccess`**: verificado orden `['onClose', 'onAuthSuccess']`; sin la prop no lanza.
- [x] 3.6 **TRIANGULATE — enlace de cambio no cierra ni dispara éxito**: verificado en ambos modales.
- [x] 3.7 **TRIANGULATE — abandonar sin autenticarse**: Escape y backdrop cierran; clic en campo no cierra; sin petición; sesión intacta.
- [x] 3.8 **TRIANGULATE — reabrir empieza limpio**: verificado vía `rerender` con `isOpen={false}` → `isOpen`; campo de email vuelve vacío.
- [x] 3.9 **REFACTOR**: `LoginModal`/`RegisterModal` exportados desde `index.ts`; verificado por test que no importan `@app`/`@pages` ni usan `useForm`/`zodResolver`. 24/24 tests verdes (18 de auth-modal + 6 de fsd-boundaries), cero violaciones FSD.

## 4. Ancla y sección del formulario de escaneo — muro (D-5, D-6, D-8, D-11)

- [x] 4.1 **RED**: `tests/scan-form-widget.test.tsx` escrito. Confirmado RED por módulo inexistente.
- [x] 4.2 **GREEN**: creado `src/widgets/scan-form/model/anchor.ts`, `src/widgets/scan-form/ui/ScanFormWidget.tsx`, `src/widgets/scan-form/index.ts`.
- [x] 4.3 **RED/GREEN — el muro sin sesión**: verificado, texto + dos acciones.
- [x] 4.4 **RED/GREEN — ningún campo sin sesión**: seis `queryBy… === null` verificadas.
- [x] 4.5 **TRIANGULATE — con sesión**: campos presentes, muro ausente, "Cerrar sesión" presente.
- [x] 4.6 **TRIANGULATE — el ancla en los dos estados**: verificado.
- [x] 4.7 **TRIANGULATE — el aviso ético en los dos estados**: verificado (copy ajustado a "autorización del propietario" para que la aserción de la spec matchee literal).
- [x] 4.8 **TRIANGULATE — transición reactiva**: `login()` revela el formulario sin remontar; "Cerrar sesión" vuelve al muro; adaptador HTTP mock confirma cero peticiones durante el cierre de sesión.
- [x] 4.9 **TRIANGULATE — control de cierre sólo con sesión**: verificado.
- [x] 4.10 **REFACTOR**: selector del store confirmado (no `getState()` para `isAuthenticated`); `tests/fsd-boundaries.test.ts` en cero violaciones. 17/17 tests verdes.

## 5. Sección de presentación y su llamado a la acción (D-2, D-7)

- [x] 5.1 **RED**: `tests/hero-widget.test.tsx` escrito. Confirmado RED por módulo inexistente.
- [x] 5.2 **GREEN**: creado `src/widgets/hero/ui/HeroWidget.tsx`, `src/widgets/hero/model/useHeroCta.ts`, `src/widgets/hero/index.ts` (extraído desde el inicio, ver 5.7).
- [x] 5.3 **RED/GREEN — sin sesión abre el login**: verificado.
- [x] 5.4 **TRIANGULATE — con sesión desplaza y no abre modal**: verificado con stub de `scrollIntoView`.
- [x] 5.5 **TRIANGULATE — rótulo estable**: verificado, mismo texto en los dos estados.
- [x] 5.6 **TRIANGULATE — entorno sin desplazamiento**: verificado, sin `scrollIntoView` y con ancla ausente, no lanza.
- [x] 5.7 **REFACTOR**: lógica del CTA vive en `useHeroCta.ts`; verificado que ni el widget ni el hook importan de otra slice de `@widgets`. 13/13 tests verdes.

## 6. Sección de herramientas (D-9, D-10)

- [x] 6.1 **RED**: `tests/features-widget.test.tsx` escrito. Confirmado RED por módulo inexistente.
- [x] 6.2 **GREEN**: creado `src/widgets/features-section/ui/FeaturesWidget.tsx` con `TOOLS` mapeado a tarjetas, y `index.ts`.
- [x] 6.3 **TRIANGULATE — cada tarjeta explica qué detecta**: verificado, 4 entradas, ninguna descripción vacía, todas renderizadas.
- [x] 6.4 **TRIANGULATE — íconos decorativos**: verificado `aria-hidden="true"` en los 4 SVG y texto accesible completo al remover decorativos.
- [x] 6.5 **REFACTOR**: clases en constantes; `TOOLS` no exportado desde `index.ts`. 12/12 tests verdes.

## 7. Sección del flujo paso a paso (D-9)

- [x] 7.1 **RED**: `tests/how-it-works-widget.test.tsx` escrito. Confirmado RED por módulo inexistente.
- [x] 7.2 **GREEN**: creado `src/widgets/how-it-works/ui/HowItWorksWidget.tsx` (usa `<ol>`) y `index.ts`.
- [x] 7.3 **TRIANGULATE — los cuatro momentos del flujo**: verificado en orden (cuenta, configurar, enviar, resultados).
- [x] 7.4 **TRIANGULATE — orden explícito**: verificado, `<ol>` + número visible por paso.
- [x] 7.5 **REFACTOR**: clases en constantes; `STEPS` no exportado desde `index.ts`. 10/10 tests verdes.

## 8. Pie de página

- [x] 8.1 **RED**: `tests/footer-widget.test.tsx` escrito. Confirmado RED por módulo inexistente.
- [x] 8.2 **GREEN**: creado `src/widgets/footer/ui/FooterWidget.tsx` y `index.ts`.
- [x] 8.3 **TRIANGULATE — sin acciones de sesión**: verificado en los dos estados, contenido idéntico.
- [x] 8.4 **REFACTOR**: clases en constantes. 9/9 tests verdes.

## 9. Composición de la Landing (D-1, D-2, D-14)

- [x] 9.1 **RED**: `tests/landing-page.test.tsx` reescrito completo. Confirmado RED — 9/10 fallando contra el placeholder (1 test de humo seguía pasando por casualidad, texto "WASA").
- [x] 9.2 **GREEN**: reescrito `src/pages/LandingPage/index.tsx` — `useAuthModal()` único llamador, composición de los seis widgets, `LoginModal`/`RegisterModal` con `isOpen` derivado de `mode`, `scrollToScanForm` como `onAuthSuccess`. `<ScanForm />` suelto y placeholder eliminados.
- [x] 9.3 **TRIANGULATE — secciones no dependen de la sesión**: verificado.
- [x] 9.4 **TRIANGULATE — un solo diálogo, extremo a extremo**: verificado (Hero → login → registro → login, siempre 1 `role="dialog"`).
- [x] 9.5 **TRIANGULATE — disparadores comparten estado**: verificado (Hero → Escape → muro, sin residuo).
- [x] 9.6 **TRIANGULATE — el éxito cierra y revela**: verificado en una sola pasada (`waitFor` con las dos aserciones).
- [x] 9.7 **TRIANGULATE — el éxito desplaza la vista, sin importar el disparador**: verificado con stub local de `Element.prototype.scrollIntoView` (restaurado en `afterEach`), Hero y muro, apuntando al nodo `id={SCAN_FORM_ANCHOR_ID}`.
- [x] 9.8 **TRIANGULATE — cerrar sesión devuelve el muro**: verificado.
- [x] 9.9 **REFACTOR**: verificado por test que `LandingPage` no importa de `@features`. 16/16 tests verdes (10 landing-page + 6 fsd-boundaries).

## 10. Guards transversales (D-12, D-14, R-2)

- [x] 10.1 Borrado `src/widgets/.gitkeep`; `tests/structure.test.ts` extendido con el inventario exacto de las seis slices. 41/41 tests verdes en ese archivo.
- [x] 10.2 **RED/GREEN — guard de anchos fijos**: creado `tests/landing-responsive.test.ts` (detector inline, guard-sobre-el-guard con 4 fixtures incluyendo un caso negativo, más la aserción sobre el árbol real). 5/5 verdes.
- [x] 10.3 **RED/GREEN — infraestructura interna no visible**: agregado a `tests/landing-page.test.tsx`, aserción sobre `container.textContent` en los dos estados de sesión (nunca sobre la fuente).
- [x] 10.4 `tests/fsd-boundaries.test.ts` completo: 6/6 verdes, cero violaciones en todo `src/` con `widgets/` poblada.
- [x] 10.5 `git status --porcelain -- src/features src/entities src/shared` → sin salida. Ningún archivo de esas capas fue tocado.

## 11. Verificación final

- [x] 11.1 **Resultado**: `npm run test:run` → 510/510 tests passing, 48/50 test files passed. Los mismos 2 test files del baseline (1.1) siguen fallando por el mismo import obsoleto preexistente, sin relación con este change. Δ vs. baseline: +81 tests (429→510), +8 test files nuevos.
- [x] 11.2 **Resultado**: `npm run build` (`tsc -b && vite build`) → limpio, sin errores. `dist/` generado (136 módulos, ~375 KB JS / ~14 KB CSS antes de gzip).
- [x] 11.3 **Resultado**: `npm run lint` (oxlint) → 0 hallazgos, igual que el baseline. (Se encontraron y corrigieron 2 warnings nuevos de `react(only-export-components)` moviendo `TOOLS`/`STEPS` a `model/tools.ts` / `model/steps.ts`, y 1 import sin usar en un test, antes de esta corrida final.)
- [x] 11.4 **Checkpoint manual de responsive — hecho con Playwright + Chromium contra `vite` real** (no había skill de "run" del proyecto; se instaló Chromium vía `npx playwright install` para esta verificación, con permiso implícito del gate MEDIO de governance). Resultado:
  - **375 px**: `document.documentElement.scrollWidth === clientWidth === 375` (sin desplazamiento horizontal). Grid de herramientas y de pasos en 1 columna. Modal de login ocupa el ancho completo sin desbordar (`boundingBox` x=0, width=375, dentro del viewport). Screenshots visuales confirman legibilidad y layout correcto.
  - **1280 px**: sin desplazamiento horizontal (`scrollWidth === clientWidth === 1280`). Grid de herramientas y de pasos en 2 columnas (`gridTemplateColumns` con 2 valores en ambos casos).
  - Verificado en los dos estados de sesión indirectamente (el guard automatizado `landing-responsive.test.ts` + `scan-form-widget.test.tsx`/`landing-page.test.tsx` cubren ambos estados; el checkpoint visual se hizo sin sesión, que es el estado con más contenido — muro + aviso — y el que más tensiona el layout angosto).
  - Servidor de dev detenido al terminar; no se dejaron procesos ni archivos nuevos en el repo (el `.env` usado ya existía de antes, gitignorado).
- [x] 11.5 **Criterios de aceptación de `CHANGES.md` §CHANGE-19 — cobertura**:
  - HeroWidget CTA abre LoginModal si no autenticado → `tests/hero-widget.test.tsx` (5.3), `tests/landing-page.test.tsx` (9.4/9.5).
  - HeroWidget CTA hace scroll a `#scan-form` si autenticado → `tests/hero-widget.test.tsx` (5.4, 5.6).
  - LoginModal/RegisterModal se alternan vía los links → `tests/auth-modal.test.tsx` (3.6), `tests/landing-page.test.tsx` (9.4).
  - Login/register exitoso cierra el modal y revela el ScanForm → `tests/auth-modal.test.tsx` (3.4/3.5), `tests/landing-page.test.tsx` (9.6, 9.7).
  - ScanFormWidget no renderiza campos sin sesión → `tests/scan-form-widget.test.tsx` (4.4).
  - "Cerrar sesión" ejecuta `logout()` y muestra el muro → `tests/scan-form-widget.test.tsx` (4.8), `tests/landing-page.test.tsx` (9.8).
  - Widgets responsive a 375/1280 px → `tests/landing-responsive.test.ts` (guard automatizado) + checkpoint manual 11.4.
  - `npm run build` sin errores → 11.2.
  - Todos cubiertos; ninguno quedó sin verificación.
- [x] 11.6 La Open Question 1 de `design.md` ya estaba resuelta al momento del apply (D-3, versión final, resuelta en la sesión previa a este apply — ver preámbulo del prompt). No requirió nueva resolución durante la implementación; se implementó tal como está documentada.

## 12. Correcciones de la auditoría previa al archive

> Hallazgos de la revisión adversarial hecha después del apply, antes de archivar. Cada uno se corrigió con el test primero (RED confirmado) y se verificó con una mutación del código de producción para descartar aserciones vacuas.

- [x] 12.1 **Las secciones no eran regiones nombrables** (`landing-composition`, requisito 1, párrafo 3). Los cinco `<section>` no tenían nombre accesible, así que **ninguno** exponía `role="region"` — el requisito "se puede alcanzar y **nombrar** sin depender de su posición visual" no se cumplía, y ningún test lo cubría. RED confirmado (`Unable to find an accessible element with the role "region"`). Corregido con `aria-labelledby` al encabezado (`useId()`) en Hero/Features/HowItWorks y `aria-label` constante en `ScanFormWidget` — ver **D-15**. Cubierto por `tests/landing-page.test.tsx` (9.10, dos casos, incluido que la región del formulario es el mismo nodo que lleva el ancla en los dos estados). Escenario agregado a la spec: "Cada sección se puede alcanzar y nombrar por su rol".
- [x] 12.2 **El escenario "Una sesión restaurada muestra el formulario desde el arranque" (`auth-wall`) no tenía ningún test.** Los casos con sesión usaban `login()` programático, no la hidratación desde `localStorage` que dispara `App`. Agregado `tests/landing-page.test.tsx` (9.11): token vigente persistido → formulario y "Cerrar sesión" presentes, sin muro ni diálogo; token expirado persistido → se queda en el muro. El comportamiento de producción ya era correcto; lo que faltaba era la verificación.
- [x] 12.3 **`tests/hero-widget.test.tsx` (5.3) afirmaba en su nombre "no desplaza la vista" sin aserción que lo sostuviera.** `landing-composition` lo exige explícitamente ("SHALL NOT desplazar la página"). Agregada la aserción con un ancla real y `scrollIntoView` espiado. Mutación (quitar el `return` temprano de `useHeroCta`) → RED.
- [x] 12.4 **El escenario "La disposición parte de una columna" (`landing-composition`) no tenía ningún test.** Agregado a `tests/landing-responsive.test.ts` un detector mobile-first (con guard-sobre-el-guard de 4 fixtures) que falla ante un `grid-cols-N` (N>1) sin prefijo de punto de corte o ante una rejilla con puntos de corte sin base `grid-cols-1`, y que además afirma **a qué archivos cubre**, para que no se vuelva vacuo si una sección deja de usar rejilla. Mutación (`grid-cols-1 sm:grid-cols-2` → `grid-cols-2`) → RED.
- [x] 12.5 **El guard de anchos fijos sólo recorría `src/widgets/`**, pero la spec dice "ninguna sección de la Landing" y el contenedor vive en `src/pages/LandingPage/`. Alcance extendido a `widgets/` + `pages/`.
- [x] 12.6 **Artefactos desactualizados por la enmienda tardía de D-3**: el §Governance de `design.md` y el preámbulo de `tasks.md` seguían diciendo "los modales no tienen prop `onSuccess`", contradiciendo a D-3, que ya declara `onAuthSuccess`. Corregidos ambos. `proposal.md` §What Changes ahora menciona el desplazamiento al autenticarse, y los listados de módulos nuevos de `proposal.md` y `tasks.md` incluyen `features-section/model/tools.ts` y `how-it-works/model/steps.ts` (movidos durante el apply por `react(only-export-components)`, y ya aseverados por `tests/structure.test.ts`).
