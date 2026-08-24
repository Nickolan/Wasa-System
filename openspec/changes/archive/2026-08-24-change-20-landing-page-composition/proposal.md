## Why

CHANGE-20 cierra la Landing pública: es el último change de la FASE 4 y una de las tres dependencias de CHANGE-22 (`e2e-smoke-test`). Su propósito original en el roadmap era componer la página y arrancar la sesión, pero **la mayor parte de ese trabajo ya quedó hecha en CHANGE-19** (ver "Estado previo verificado"). Lo que queda sin hacer es lo que ningún change anterior tocó: la Landing no tiene identidad tipográfica propia, no declara tokens de diseño globales, pinta su fondo oscuro sólo dentro de `<main>` (el documento debajo sigue en blanco) y declara `lang="en"` sobre contenido íntegramente en español. Además, dos de sus cuatro Criterios de Aceptación son criterios de **runtime** que hasta hoy nadie verificó en ningún sentido.

### Estado previo verificado (lo que CHANGE-19 ya dejó hecho)

El scope nominal de CHANGE-20 en `CHANGES.md` lista tres ítems. Dos ya están satisfechos, como efecto colateral de que CHANGE-19 tuvo que componer los widgets para poder probarlos:

| Ítem del scope nominal | Estado real | Evidencia |
|---|---|---|
| 1. `src/pages/LandingPage/index.tsx`: Hero → Features → HowItWorks → ScanForm (con auth gate) → Footer | **Ya hecho** | El archivo compone las cinco secciones en ese orden exacto, más los dos modales de autenticación gobernados por `useAuthModal`. Cubierto por la spec `landing-composition` (requirement "La Landing se compone de secciones fijas y en un orden fijo"), ya vigente en `openspec/specs/`. |
| 2. `src/app/App.tsx`: renderiza LandingPage + `authStore.hydrate()` en `useEffect` | **Ya hecho** | `App.tsx` toma `hydrate` del `authStore` y lo invoca en un `useEffect` de montaje junto a `wireHttpClient()`. Cubierto por la spec `auth-session-state` (requirements "La sesión se restaura al recargar sólo si el token sigue vigente" y "La restauración ocurre al montar la aplicación y es idempotente"), con sus escenarios ya verificados. |
| 3. `src/app/index.css`: fuentes Google + variables CSS globales | **NO hecho** | El archivo contiene exactamente una línea: `@import "tailwindcss";`. Sin tipografía, sin tokens. |

En consecuencia, **este change NO reescribe la composición ni el cableado de hidratación**. Reabrirlos sería trabajo redundante sobre código ya specificado, ya implementado y ya cubierto por tests. El Criterio de Aceptación 1 (orden de las secciones) y el 2 (hidratación) se **verifican como regresión**, no se reimplementan.

El trabajo real que queda es:

- **(a)** El ítem 3 del scope: tipografía e identidad visual global en `src/app/index.css`.
- **(b)** La verificación de los dos Criterios de Aceptación de runtime que nadie comprobó todavía: consola del navegador sin errores, y Lighthouse Performance > 80 en desktop.

## What Changes

- **Identidad tipográfica global.** La Landing pasa a renderizarse con una tipografía elegida por el proyecto en lugar de la pila `sans-serif` que herede el navegador, declarada una sola vez para todo el documento. La elección concreta de familia y su mecanismo de carga son decisiones de `design.md` (D-1, D-2) — la KB no las especifica.
- **Tokens de diseño globales.** Los valores de la paleta que hoy están repetidos como literales de Tailwind a lo largo de los seis widgets (`slate` como neutro, `sky` como color de marca, `red`/`green` como estados) pasan a tener un punto único de declaración, consumible por los changes futuros. Sin cambio visual: los tokens se declaran con los valores que la interfaz ya usa.
- **Superficie base del documento.** El fondo oscuro deja de vivir sólo en `<main>` y pasa al documento, eliminando el destello blanco previo al primer pintado y la franja blanca del área de sobre-desplazamiento.
- **Metadatos del documento.** `index.html` pasa a declarar el idioma real del contenido (español, hoy dice `en`) y un título propio en lugar del `wasa-landing` que dejó el template de Vite. **Ampliación deliberada** respecto de la lista literal de archivos de `CHANGES.md` — ver "Impact".
- **Verificación de los criterios de runtime.** Se incorpora una comprobación automatizada de que montar la aplicación no emite errores ni advertencias en consola, y una medición registrada de Lighthouse Performance sobre el build de producción.
- **NO cambia**: `src/pages/LandingPage/index.tsx`, `src/app/App.tsx`, ningún widget, ningún feature, ninguna entity. Ningún archivo de CHANGE-19 se reabre.

Sin cambios breaking: nada de lo anterior altera un contrato existente.

## Capabilities

### New Capabilities

- `landing-shell`: la envoltura del documento que rodea a la composición — idioma y título declarados, superficie base, tipografía global y tokens de diseño como punto único de verdad — junto con el presupuesto de rendimiento que esa envoltura no puede exceder al cargar una tipografía remota.

### Modified Capabilities

- `landing-composition`: se agrega el requisito de que montar la Landing completa no emita errores ni advertencias en consola. Es la formalización del tercer Criterio de Aceptación de CHANGE-20, que hasta ahora no estaba escrito como requisito en ninguna spec.

## Impact

**Código afectado**

- `wasa-landing/src/app/index.css` — el ítem 3 del scope: tipografía, tokens y superficie base. Único archivo de `src/` que se modifica.
- `wasa-landing/index.html` — idioma, título y, según la decisión D-2 de `design.md`, las etiquetas de carga de la tipografía. **Este archivo no figura en la lista de scope de `CHANGES.md`**; se incluye deliberadamente y se declara acá para que quede revisable: (i) `lang="en"` sobre contenido en español es un defecto real que penaliza la auditoría de accesibilidad y contradice a los lectores de pantalla; (ii) el título de la pestaña es contenido visible para el usuario, del mismo orden que el nombre y el tagline de HU-01-01; (iii) si la tipografía se carga por `<link>` en lugar de por `@import` — que es lo que exige el presupuesto de rendimiento — no hay otro lugar donde ponerla. Si el usuario prefiere dejar `index.html` fuera, se puede recortar esta parte sin afectar al resto del change.
- `wasa-landing/src/**/__tests__/` (o la convención de tests vigente) — nueva verificación de consola limpia y de regresión de composición/hidratación.

**Dependencias**

- Sin dependencias nuevas de runtime si la tipografía se carga desde Google Fonts por `<link>` (D-2). Si en cambio se resuelve auto-hospedarla, entra una dependencia de desarrollo — la disyuntiva queda planteada en `design.md` D-2 para decisión del usuario.

**Sistemas**

- Ninguno. Change íntegramente frontend y estático: no toca el FastAPI Bridge, ni PostgreSQL `db_fuzzing`, ni n8n. Sin variables de entorno involucradas.

**Aguas abajo**

- CHANGE-22 (`e2e-smoke-test`) depende de este change; al cerrarlo, la FASE 4 queda completa y CHANGE-22 pasa a estar desbloqueado por el lado del frontend.
