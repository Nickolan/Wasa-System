## Why

Las pantallas de WASA se construyeron en tandas (landing en CHANGE-17/19, scan en CHANGE-18, info y espera en CHANGE-24, dashboard en CHANGE-26) y cada tanda estableció su propio lenguaje visual sobre la marcha. El resultado es un sistema que **no se ve como un solo producto**: la landing usa tarjetas glassmorphism (`rounded-2xl`, gradiente, `backdrop-blur`, borde que reacciona al hover) y el dashboard —portado apenas en CHANGE-26— usa tarjetas planas (`rounded-lg border border-slate-800 bg-slate-900/60`); la landing acentúa en `sky`, y los gráficos del dashboard dibujan la línea de tendencia en `#3b82f6` (blue-500, que no es el color de marca); la misma severidad "Low" se pinta azul en el gráfico de torta y celeste en el badge de la tabla.

Al mismo tiempo, la infraestructura para evitar esto ya existe pero está **muerta**: `src/app/index.css` declara cinco tokens semánticos (`--color-surface-base`, `--color-surface-elevated`, `--color-brand`, `--color-danger`, `--color-success`) que **ningún archivo del proyecto consume** — todo el código usa utilidades literales de Tailwind. Y hay duplicación estructural ya identificada y diferida explícitamente a este change por el `/code-review` posterior a CHANGE-26.

Este es el Fix 4 de los cuatro fixes finales del usuario, y su alcance está acotado por una instrucción textual suya: *"solo hablo de diseño, nada más"*.

## What Changes

**Tokens de diseño (revive la capa muerta)**

- Se completa y se pone en uso el bloque `@theme` de `src/app/index.css`: los cinco tokens actuales pasan de declaración inerte a fuente real de los utilities semánticos, y se suman los roles que hoy faltan (texto primario/secundario/terciario, borde sutil, acento de marca en sus tres intensidades, radios y colores de severidad).
- Los colores de severidad dejan de estar duplicados entre gráfico y badge: `entities/dashboard/lib/severityVisuals.ts` pasa a derivar ambos del mismo token, de modo que "Low" no pueda volver a ser azul en un lado y celeste en el otro.
- Recharts deja de recibir hexadecimales sueltos escritos en el JSX (`#334155`, `#94a3b8`, `#3b82f6`) y pasa a leerlos de un único módulo de tokens.

**Primitivos compartidos nuevos en `shared/ui/`**

- `Card`: colapsa las tres definiciones verbatim de `CARD_CLASSES` repartidas entre `dashboard-charts`, `dashboard-kpis`, `dashboard-detail-table` y `dashboard-endpoints`, y adopta el tratamiento glassmorphism que la landing ya usa.
- `Table`: colapsa `TABLE_CLASSES` / `HEAD_CLASSES` / `CELL_CLASSES`, hoy redeclarados idénticos en `dashboard-detail-table` y `dashboard-endpoints`.
- `PageShell` + `PageHeader`: colapsan el `flex min-h-screen w-full flex-col bg-slate-950` repetido en las cuatro páginas y el encabezado `px-6 pt-28 pb-8` + `h1.text-gradient` repetido tres veces (y ausente en `AboutPage`, que hoy arranca sin encabezado y rompe el patrón).

**Modal: se colapsa la duplicación diferida (D-6 de CHANGE-26)**

- `shared/ui/Modal.tsx` gana ancho parametrizable. `DashboardVulnerabilityModal` deja de reimplementar el primitivo —con sus tres trampas copiadas a mano (listener sólo mientras está abierto, `target === currentTarget`, restaurar el `overflow` previo)— y pasa a consumirlo. Esto es exactamente lo que la nota de D-6 dejó agendado para este change.

**Armonización de las superficies existentes**

- Dashboard: tarjetas, títulos, tablas, filtros, conmutador de vistas, estado vacío y modal adoptan el lenguaje de la landing (superficie, radio, tipografía, animación de entrada).
- Landing, auth, scan-form, pantalla de espera e info page: pasada de consistencia sobre la escala tipográfica y los espaciados, para que las mismas jerarquías usen las mismas clases en todas las pantallas.

**Fuera de alcance (explícito)**

- Ningún cambio de lógica, de datos, de contratos HTTP, de hooks ni de estado. El diff no toca `api/`, `model/` (salvo constantes puramente visuales), `entities/*/model/`, ni nada del backend.
- No se introduce una identidad visual nueva: el criterio es **consolidar** lo que la landing y el scan-form ya establecieron, no rediseñar.
- El punto de `CHANGES.md` sobre "reemplazar el tema oscuro ad hoc de `dashboard-fuzzing` (`App.css`/`Sidebar.css`)" **ya quedó resuelto por CHANGE-26**: el directorio `dashboard/` no existe más en el repo. No hay nada que hacer ahí.

## Capabilities

### New Capabilities

- `design-system`: el contrato visual único del frontend — dónde viven los tokens de diseño, qué roles semánticos definen, y la obligación de que toda superficie de la aplicación (landing, auth, scan, espera, info, dashboard) derive su apariencia de esa fuente única en lugar de redeclararla.

### Modified Capabilities

- `shared-ui-kit`: el requisito "Los primitivos de UI viven en `shared/` y son agnósticos del dominio" enumera hoy exactamente cinco componentes (`Button`, `Input`, `Checkbox`, `Spinner`, `Modal`); se amplía para incluir los primitivos de composición nuevos (`Card`, `Table`, `PageShell`, `PageHeader`). El requisito "Modal es un contenedor controlado con backdrop y cierre por Escape" se amplía: el ancho del diálogo pasa a ser configurable por el consumidor, con el ancho actual como valor por defecto.

## Impact

**Código afectado** (todo en `wasa-landing/`):

- `src/app/index.css` — bloque `@theme`, utilidades de composición.
- `src/shared/ui/` — `Modal.tsx` (ancho parametrizable) + `Card.tsx`, `Table.tsx`, `PageShell.tsx`, `PageHeader.tsx` nuevos.
- `src/pages/` — las cuatro páginas (`HomePage`, `ScanPage`, `AboutPage`, `DashboardPage`) pasan a componer sobre `PageShell`/`PageHeader`.
- `src/widgets/dashboard-*/` — los nueve widgets del dashboard: es donde se concentra el grueso del diff.
- `src/widgets/` (landing/scan/about) — ajustes puntuales de escala tipográfica y espaciado.
- `src/entities/dashboard/lib/severityVisuals.ts` — pasa a derivar del token único (sin cambiar el mapeo de dominio).

**Riesgo de regresión**

- Los tests existentes son casi todos de comportamiento, no de apariencia; los que sí miran clases son cuatro (`input`, `spinner`, `navbar`, `landing-responsive`) y ninguno afirma un color concreto. `landing-responsive.test.ts` impone dos guardas estructurales que este change debe respetar: sin anchos fijos en píxeles bajo `widgets/`+`pages/`, y toda rejilla multi-columna con base `grid-cols-1`.
- `tests/structure.test.ts` afirma que `src/App.css` y `src/index.css` no existen: la hoja global sigue siendo `src/app/index.css`, no se agregan hojas sueltas.

**Sin impacto**: backend (`fastapi_bridge`), n8n, base de datos, contratos de API.
