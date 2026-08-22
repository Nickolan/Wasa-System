## Why

La Landing Page es la **capa de presentación pública** de WASA — el reemplazo del disparo manual por Schedule Trigger en n8n por un flujo web con autenticación (`knowledge-base/01_vision_y_objetivos.md`). Hoy no existe ni una línea de ella: el repo tiene el `dashboard/` heredado de la tesis, el `fastapi_bridge/` recién scaffoldeado (CHANGE-00a) y nada de frontend nuevo.

`CHANGE-00b` es el segundo nodo raíz del roadmap: **ocho changes** (00c, 13, 14, 15, 16, 17, 18, y por transitividad 19-20) declaran dependencia directa o indirecta de él. Sin el proyecto Vite creado, las capas FSD materializadas y los path aliases resueltos, ninguno de esos changes tiene dónde escribirse.

Igual que CHANGE-00a, el objetivo es **exclusivamente estructural**: dejar una app React que arranca, compila sin errores de TypeScript y expone las seis capas FSD ya materializadas en el filesystem, de modo que cada change siguiente sólo rellene carpetas que ya están en su lugar correcto. No se implementa ninguna funcionalidad de negocio, ningún widget real, ningún store.

## What Changes

- **Nuevo proyecto `wasa-landing/`** en la raíz del repo (hermano de `fastapi_bridge/` y `dashboard/`), creado con `npm create vite@latest wasa-landing -- --template react-ts` y luego ajustado al árbol FSD de `knowledge-base/08_arquitectura_propuesta.md`.
- **Dependencias de runtime** declaradas en `package.json`, con las versiones de la tabla de stack de `knowledge-base/02_descripcion_general.md` (React 19.x, TS 5.9.x, Vite 7.x, Tailwind 4.x, RHF 7.x, Zod 3.x): `react`, `react-dom`, `react-hook-form`, `zod`, `@hookform/resolvers`, `axios`, `zustand`. **Por decisión explícita del usuario no se hace downgrade** de lo que `npm create vite@latest` scaffoldea hoy — la tabla de stack de la KB fue actualizada a esas versiones como parte de esta decisión (ver `design.md`, D-2).
- **Dependencias de desarrollo**: `tailwindcss@^4`, `@tailwindcss/vite@^4`, `typescript`, `vite`, `@vitejs/plugin-react`, más el runner de tests — `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` — **adición sobre el scope literal del roadmap**, necesaria porque el proyecto opera en modo TDD estricto y los criterios de aceptación de CHANGE-13 en adelante (comportamiento de `authStore`, de `jwtIsExpired`, de los componentes de `shared/ui`) son intestables sin runner. Es el análogo frontend del `requirements-dev.txt` de CHANGE-00a. **No** se instalan `postcss` ni `autoprefixer`: Tailwind 4 no los usa.
- **Configuración de Tailwind 4**: el plugin `@tailwindcss/vite` registrado en `vite.config.ts` y la línea `@import "tailwindcss";` en `src/app/index.css` — la hoja global vive en la capa `app/`, no en `src/`, porque CHANGE-20 la referencia como `src/app/index.css`. **No hay `tailwind.config.ts` ni `postcss.config.*`**: en v4 el tema se declara con `@theme` en CSS y las fuentes se detectan automáticamente (sin campo `content`). Este change no define ningún token — deja el tema por defecto.
- **Estructura FSD completa**, con las seis capas materializadas y un `.gitkeep` anotado en cada directorio que no se puebla todavía (D-10): `src/app/` (con `stores/`, `providers/`), `src/pages/`, `src/widgets/`, `src/features/`, `src/entities/`, `src/shared/` (con `ui/`, `api/`, `config/`, `lib/`). Las carpetas intermedias quedan creadas y trazables; cada change posterior escribe dentro de la suya.
- **Punto de entrada reubicado a la capa `app/`**: `index.html` apunta a `/src/app/main.tsx`; se eliminan `src/main.tsx`, `src/App.css`, `src/index.css`, `src/assets/react.svg` y el contenido de demo del template de Vite.
- **Path aliases** `@app`, `@pages`, `@widgets`, `@features`, `@entities`, `@shared` → `src/*`, declarados en `vite.config.ts` (`resolve.alias`) y en `tsconfig.app.json` (`compilerOptions.paths`), de modo que resuelvan tanto en build como en el type-check del editor.
- **`src/app/App.tsx`** renderiza `<LandingPage />` — un placeholder en `src/pages/LandingPage/index.tsx` con clases de Tailwind aplicadas, que sirve de prueba viva de que la cadena Tailwind 4 → `@tailwindcss/vite` → Vite funciona.
- **Suite de tests inicial** en `wasa-landing/tests/`: verificación de la estructura FSD, del cableado de path aliases, de la disponibilidad de `zustand` y del renderizado del placeholder — más el **guardia de fronteras FSD**, que parsea los imports de cada archivo y falla si una capa importa de una capa superior (análogo del test `ast` de fronteras de capa del backend).
- **NO incluye**: `authStore` (CHANGE-13), schemas Zod (CHANGE-14, CHANGE-17), componentes de `shared/ui` (CHANGE-15), `axiosInstance` con interceptor Bearer (CHANGE-16), `shared/config/env.ts` ni archivos `.env` (CHANGE-00c), widgets reales (CHANGE-19), composición de la Landing (CHANGE-20), `clsx`/`tailwind-merge` para `cn()` (CHANGE-15), ni ningún tema, token de diseño o paleta.

## Capabilities

### New Capabilities
- `landing-bootstrap`: arranque y estructura de la Landing Page React — proyecto Vite operativo en dev y build, pipeline de estilos Tailwind, topología de capas Feature-Sliced Design con sus fronteras de import unidireccionales, y resolución de path aliases.

### Modified Capabilities
<!-- Ninguna. La única capability existente en `openspec/specs/` es `bridge-bootstrap` (backend), cuyos requirements no cambian: este change no toca `fastapi_bridge/`. -->

## Impact

- **Código nuevo**: todo bajo `wasa-landing/`. Directorio nuevo en la raíz, sin colisión con `dashboard/`, `fastapi_bridge/` ni `docs_wasa_sdd/`.
- **Código existente**: se agregan al `.gitignore` de la raíz las entradas de Node (`node_modules/`, `dist/`, `*.local`, logs de npm) si no están. Ningún archivo existente se modifica más allá de eso.
- **APIs**: ninguna. La app no hace una sola llamada de red en este estadio — `axios` queda instalado pero sin instancia configurada (CHANGE-16).
- **Dependencias**: se introduce el stack Node del frontend. Vite 7 requiere Node 20.19+ / 22.12+ (la máquina de desarrollo tiene Node 24.14.1, npm 11.11.0).
- **Documentación**: la tabla de stack de `knowledge-base/02_descripcion_general.md` y las tablas "Stack Tecnológico" de `CLAUDE.md` y `AGENTS.md` se actualizaron a React 19.x / TS 5.9.x / Vite 7.x / Tailwind 4.x. El scope de CHANGE-00b en `CHANGES.md` sigue describiendo la mecánica de Tailwind 3 (`tailwind.config.ts`, `postcss.config.ts`, `autoprefixer`) y queda pendiente de corrección — ver `design.md`, OQ-3.
- **Aguas abajo**: React 19 endurece la doble invocación de efectos bajo `StrictMode`. No afecta a este scaffold (no tiene efectos), pero CHANGE-13 (hidratación del `authStore`) y CHANGE-20 (composición de la Landing) deben contemplarlo al proponerse — ver `design.md`, D-16.
- **Base de datos**: **cero impacto**. Igual que CHANGE-00a, no se abre ninguna conexión a `db_fuzzing`.
- **Sistemas externos**: cero impacto sobre n8n, Redis/Memurai, el SQLMap Worker y el Dashboard existente. El Dashboard sigue corriendo en su propio proyecto.
- **Puerto**: se reserva el `5173` para el dev server de la Landing (criterio de aceptación del roadmap). No colisiona con el Bridge (Uvicorn, `8000`) ni con el Dashboard.
- **Desbloquea**: CHANGE-00c (`env-config`), CHANGE-13 (`zustand-auth-store`) y CHANGE-15 (`shared-ui-atoms`) — que a su vez destraban toda la FASE 4 del roadmap.
- **Governance**: BAJO — scaffolding sin lógica de negocio ni superficie de seguridad.
