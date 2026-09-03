/**
 * Contenido fijo de los dos gráficos (task 5.1/5.5): títulos, portados de
 * `App.jsx` del dashboard standalone.
 */
export const DASHBOARD_CHART_TITLES = {
  severity: 'Vulnerabilidades por Severidad',
  trend: 'Evolución Histórica (Vulnerabilidades por Escaneo)',
} as const

/**
 * Paleta de colores por severidad: reexportada desde `entities/dashboard`
 * (fuente única de verdad, fix de code-review #7) en vez de declarada acá.
 * Se mantiene el re-export para no romper `@widgets/dashboard-charts` como
 * API pública de esta slice.
 */
export { SEVERITY_CHART_COLORS, SEVERITY_CHART_FALLBACK_COLOR } from '@entities/dashboard'
