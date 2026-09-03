import type { KpiSummary } from '@entities/dashboard'
import { Card } from '@shared/ui/Card'
import { DASHBOARD_KPI_LABELS } from '../model/content'

const GRID_CLASSES = 'grid grid-cols-1 gap-4 sm:grid-cols-3'
const LABEL_CLASSES = 'text-sm font-medium text-text-secondary'
const VALUE_CLASSES = 'mt-2 text-3xl font-bold text-text-primary'
const CRITICAL_VALUE_CLASSES = 'mt-2 text-3xl font-bold text-danger'

export interface DashboardKpisWidgetProps {
  kpis: KpiSummary
}

/**
 * Tres indicadores principales (task 5.4, D-4/D-6 de design.md
 * unified-design-system): sobre `Card` — la misma superficie elevada que
 * el resto del sistema — con las derivaciones de `entities/dashboard`
 * (D-3).
 */
export function DashboardKpisWidget({ kpis }: DashboardKpisWidgetProps) {
  return (
    <section aria-label="Indicadores principales" className={GRID_CLASSES}>
      <Card className="animate-fade-in-up text-center">
        <h3 className={LABEL_CLASSES}>{kpis.scanCountLabel}</h3>
        <p className={VALUE_CLASSES}>{kpis.scanCountValue}</p>
      </Card>
      <Card className="animate-fade-in-up animation-delay-100 text-center">
        <h3 className={LABEL_CLASSES}>{DASHBOARD_KPI_LABELS.total}</h3>
        <p className={VALUE_CLASSES}>{kpis.totalVulnerabilities}</p>
      </Card>
      <Card className="animate-fade-in-up animation-delay-200 text-center">
        <h3 className={LABEL_CLASSES}>{DASHBOARD_KPI_LABELS.critical}</h3>
        <p className={CRITICAL_VALUE_CLASSES}>{kpis.criticalVulnerabilities}</p>
      </Card>
    </section>
  )
}
