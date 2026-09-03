/**
 * Contenido fijo de los tres indicadores principales (task 5.1/5.4). El
 * rótulo y valor del indicador de escaneos ya vienen resueltos por
 * `deriveKpis` (`entities/dashboard`, D-3) — acá sólo los dos títulos que
 * `deriveKpis` no produce.
 */
export const DASHBOARD_KPI_LABELS = {
  total: 'Total Vulnerabilidades',
  critical: 'Vulnerabilidades Críticas',
} as const
