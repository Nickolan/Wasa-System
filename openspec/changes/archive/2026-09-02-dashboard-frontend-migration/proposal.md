## Why

Hoy ver los resultados de un escaneo obliga a levantar dos backends y dos frontends: el FastAPI Bridge + `wasa-landing` por un lado, y `dashboard/server-fuzzing` (Express, puerto 5000, credenciales de PostgreSQL hardcodeadas) + `dashboard/dashboard-fuzzing` (React JS, puerto propio) por el otro. El usuario que dispara un escaneo desde la Landing termina expulsado a otra aplicación, con otro tema visual, otra barra de navegación y sin sesión — y quien opera el sistema tiene que arrancar y mantener cuatro procesos para una sola funcionalidad.

CHANGE-25 ya eliminó la mitad backend del problema: `GET /api/v1/dashboard` vive en el Bridge, replicando el contrato de `server-fuzzing` y leyendo `db_fuzzing` con `settings.DB_URL` en vez de credenciales embebidas. Falta la mitad frontend: mientras la UI siga viviendo en `dashboard-fuzzing`, el endpoint nuevo no tiene consumidor y los dos proyectos standalone siguen siendo obligatorios. Este change cierra la unificación y permite retirarlos.

## What Changes

- **Nueva pantalla `/dashboard` dentro de `wasa-landing`**: se porta la UI completa de `dashboard/dashboard-fuzzing/src/App.jsx` + `src/components/Sidebar.jsx` a TypeScript bajo FSD — `pages/DashboardPage` componiendo widgets nuevos. Mismo comportamiento funcional que hoy: tres vistas conmutables (panel general, endpoints vulnerables, reporte detallado), tres filtros (escaneo, severidad, herramienta), KPIs, gráfico de severidad, gráfico de evolución histórica, tabla de endpoints, tabla de detalle y modal de detalle de vulnerabilidad.
- **La pantalla consume `GET /api/v1/dashboard` del Bridge vía `axiosInstance`**, en lugar del `fetch('http://localhost:5000/api/dashboard')` hardcodeado. La URL sale de `VITE_API_BASE_URL` como el resto de la aplicación: el Dashboard deja de ser un origen aparte.
- **La derivación de métricas se separa de la presentación**: los KPIs, la distribución por severidad, la serie de evolución y el ranking de endpoints pasan a ser funciones puras sobre la respuesta del Bridge, en vez de cálculos inline dentro del render.
- **`recharts` se incorpora como dependencia de runtime de `wasa-landing`** — es la librería que ya usa `dashboard-fuzzing`, y adoptarla minimiza el diff funcional de la migración.
- **La navegación al Dashboard pasa a ser interna**: el botón "Dashboard" del `Navbar` y la salida secundaria "Ver el Dashboard" de la pantalla de espera dejan de ser `<a href={dashboardUrl} target="_blank">` y pasan a ser navegación dentro de la aplicación.
- **BREAKING (configuración)**: `VITE_DASHBOARD_URL` se da de baja. Deja de ser una variable requerida, desaparece de la puerta única de configuración (`shared/config/env.ts`), de `vite-env.d.ts`, de `.env.example` y de la documentación. Un despliegue que la siga definiendo no falla, pero deja de tener efecto; un despliegue que la omitía y fallaba al arrancar, ahora arranca.
- **Retiro del dashboard standalone del flujo de arranque**: `dashboard/dashboard-fuzzing` y `dashboard/server-fuzzing` dejan de ser parte de las instrucciones de puesta en marcha del repositorio (README, tabla de variables de entorno, diagrama de capas). El destino físico de esas carpetas — mover a un directorio de legado o eliminar — queda como decisión abierta a resolver con el usuario durante el `apply`.

**Sin autenticación, sin filtrado por usuario.** La pantalla se comporta exactamente igual que el dashboard actual: muestra todos los escaneos de todos los usuarios, sin login. Es la misma decisión de producto ya confirmada dos veces (propose de CHANGE-25 y checkpoint del usuario) y ya codificada en el spec `dashboard-endpoint`. Este change la respeta; no agrega un muro de autenticación por iniciativa propia.

## Capabilities

### New Capabilities

- `dashboard-screen`: la pantalla de resultados dentro de la Landing — su ruta pública, cómo se llega a ella desde la navegación de la aplicación, las tres vistas que ofrece, los tres filtros, el detalle de una vulnerabilidad, y qué muestra mientras carga, cuando falla y cuando no hay datos.
- `dashboard-metrics`: la derivación de los indicadores a partir de la respuesta del Bridge — conteo de escaneos, total y críticas, distribución por severidad, evolución histórica por escaneo y ranking de endpoints, más la normalización de la capitalización de severidad que hoy hace el dashboard standalone. Comportamiento puro, sin red ni presentación.
- `dashboard-client-requests`: cómo la Landing le pide los datos al Bridge — ruta, traducción de los filtros de la interfaz a parámetros de consulta, tolerancia al esquema abierto de la respuesta, y qué ocurre ante un rechazo.

### Modified Capabilities

- `runtime-configuration`: baja de `VITE_DASHBOARD_URL`. La puerta única de configuración del frontend pasa a exponer una sola variable (`VITE_API_BASE_URL`); deja de existir el requisito de que el Dashboard sea un destino distinto del Bridge, porque pasa a ser una ruta del mismo origen.
- `landing-bootstrap`: el manifiesto de dependencias de runtime del frontend incorpora `recharts`.

## Impact

**Código nuevo (`wasa-landing/src/`)**
- `pages/DashboardPage/` — composición de la pantalla.
- `widgets/dashboard-*/` — barra de vistas, filtros, KPIs, gráficos, tablas, modal de detalle.
- `features/dashboard/` — carga de datos y estado de filtros.
- `entities/dashboard/` — tipos de la respuesta del Bridge y funciones puras de derivación de métricas.

**Código modificado**
- `src/app/App.tsx` — ruta `/dashboard`.
- `src/widgets/navbar/ui/Navbar.tsx` — el botón "Dashboard" pasa a `<Link>` interno.
- `src/widgets/scan-pending/ui/ScanPendingWidget.tsx` — la salida secundaria pasa a `<Link to="/dashboard">`.
- `src/shared/config/env.ts` y `src/vite-env.d.ts` — baja de `VITE_DASHBOARD_URL`.
- `package.json` — alta de `recharts`.

**Tests existentes afectados**
- `tests/env.test.ts` — sus casos giran alrededor de `VITE_DASHBOARD_URL`.
- `tests/navbar.test.tsx`, `tests/scan-pending-widget.test.tsx` — afirman sobre el enlace externo.
- Toda suite que hoy hace `vi.stubEnv('VITE_DASHBOARD_URL', …)` (`tests/setup.ts` y varios archivos de auth/scan).
- `tests/manifest.test.ts` — lista de dependencias de runtime esperadas.

**Sistemas y operación**
- `dashboard/dashboard-fuzzing` y `dashboard/server-fuzzing` salen del flujo de arranque; el puerto 5000 queda libre.
- `README.md` — sección de puesta en marcha, tabla de variables de entorno de `wasa-landing`, diagrama de capas y estructura del repositorio.
- `docs/e2e-smoke-test-runbook.md` menciona `VITE_DASHBOARD_URL`.
- Sin impacto en el backend: `GET /api/v1/dashboard` ya existe y no se toca. Sin impacto en `db_fuzzing`, n8n ni el Worker.

**Fuera de alcance**
- Armonizar el tema visual del dashboard portado con el resto de la aplicación — es CHANGE-27 (`unified-design-system`).
- Agregar autenticación, paginación, límites o caché sobre la consulta de resultados.
- Modificar el contrato de `GET /api/v1/dashboard`.
