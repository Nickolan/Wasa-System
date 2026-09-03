import { colorTokens } from '@shared/ui/tokens'

/**
 * Fuente única de verdad para el mapeo severidad → color de gráfico
 * (fix de code-review sobre CHANGE-26 `dashboard-frontend-migration`,
 * hallazgo #7, y unified-design-system D-2/D-9). `widgets/dashboard-charts`
 * codificaba este mapeo en un módulo independiente, sin ninguna relación
 * forzada por el compilador con la lista canónica de severidades
 * normalizadas de `./severity.ts` — agregar o renombrar una severidad
 * requería tocar el mapa a mano, sin garantía de que quedara consistente.
 *
 * Los colores del gráfico no son literales hexadecimales propios: se
 * derivan de `shared/ui/tokens` (D-5), la misma fuente que alimenta el
 * `@theme` de `index.css`. Es el único punto donde el mapeo cambia de
 * verdad respecto de lo que existía antes de este change: "Low" pasa de
 * blue-500 (un azul que no es el de marca) a `colorTokens.info` (sky-500)
 * — la misma familia que ya usaba el badge, unificando los dos azules
 * distintos que representaban el mismo dato (D-2). Sin literal
 * hexadecimal en este archivo, ni siquiera en comentario (D-11.1,
 * `tests/design-system-single-source.test.ts`).
 *
 * Las clases Tailwind concretas del badge de severidad (presentación, no
 * dominio) viven en `shared/ui/severityBadgeClasses.ts` — no acá (fix de
 * code-review, hallazgo #1: `entities/` no declara clases de presentación).
 */

/** Color por severidad para el gráfico de torta (`dashboard-charts`). */
export const SEVERITY_CHART_COLORS: Record<string, string> = {
  Critical: colorTokens.danger,
  High: colorTokens.warning,
  Medium: colorTokens.caution,
  Low: colorTokens.info,
}

/** Color de una severidad que el sistema no enumera (D-2: la respuesta es abierta). */
export const SEVERITY_CHART_FALLBACK_COLOR = colorTokens.neutral
