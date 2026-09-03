/**
 * API pública de la slice `entities/dashboard` (task 2.9, D-8 de
 * design.md CHANGE-19, patrón de `entities/scan/index.ts`). Los
 * consumidores importan de acá, nunca de una ruta interna de `model/` o
 * `lib/`.
 */
export type { DashboardResponse, DashboardScanRow, DashboardVulnerabilityRow } from './model/types'
export { UNKNOWN_SEVERITY_LABEL, normalizeSeverity } from './lib/severity'
export { SEVERITY_CHART_COLORS, SEVERITY_CHART_FALLBACK_COLOR } from './lib/severityVisuals'
export { NO_DATE_LABEL, formatScanDateLabel } from './lib/dateLabel'
export { deriveKpis, deriveSeverityDistribution, deriveTopEndpoints, deriveTrend } from './lib/metrics'
export type {
  EndpointRankingEntry,
  KpiSummary,
  SeverityDistributionEntry,
  TrendPoint,
} from './lib/metrics'
