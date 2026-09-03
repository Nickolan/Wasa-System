import type { DashboardScanRow } from '@entities/dashboard'
import { formatScanDateLabel } from '@entities/dashboard'
import type { DashboardFilterKey, DashboardFilters } from '@features/dashboard'
import { DASHBOARD_FILTERS_LABELS, SEVERITY_OPTIONS, SOURCE_OPTIONS } from '../model/content'

const SECTION_CLASSES = 'grid grid-cols-1 gap-4 sm:grid-cols-3'
const FIELD_CLASSES = 'flex flex-col gap-1'
const LABEL_CLASSES = 'text-sm font-medium text-slate-200'
/**
 * Misma superficie, borde y anillo de foco que `shared/ui/Input` (task
 * 4.6, unified-design-system): un solo lugar donde cambiar el tratamiento
 * de un control de formulario, aunque este `<select>` nativo no reutilice
 * el componente `Input` (que no cubre `<select>`).
 */
const SELECT_CLASSES =
  'w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-600'

export interface DashboardFiltersWidgetProps {
  /** Escaneos devueltos por el servicio: fuente de las opciones del filtro de escaneo (spec, "las opciones salen de los datos"). */
  scans: DashboardScanRow[]
  filters: DashboardFilters
  onChangeFilter: (key: DashboardFilterKey, value: DashboardFilters[DashboardFilterKey]) => void
}

/**
 * Tres controles de filtrado (task 5.3, spec `dashboard-screen`): escaneo,
 * severidad, herramienta de origen. Cada uno con una opción "sin filtrar"
 * como selección inicial. Las opciones de escaneo se derivan de `scans`, no
 * de una lista fija, y cada una identifica su escaneo por fecha + hora + URL
 * objetivo (vía `formatScanDateLabel`, D-8) para que dos escaneos del mismo
 * objetivo sean distinguibles.
 */
export function DashboardFiltersWidget({ scans, filters, onChangeFilter }: DashboardFiltersWidgetProps) {
  return (
    <section aria-label="Filtros de resultados" className={SECTION_CLASSES}>
      <div className={FIELD_CLASSES}>
        <label htmlFor="dashboard-filter-scan" className={LABEL_CLASSES}>
          {DASHBOARD_FILTERS_LABELS.scan}
        </label>
        <select
          id="dashboard-filter-scan"
          className={SELECT_CLASSES}
          value={filters.scanId === null ? '' : String(filters.scanId)}
          onChange={(event) =>
            onChangeFilter('scanId', event.target.value === '' ? null : Number(event.target.value))
          }
        >
          <option value="">{DASHBOARD_FILTERS_LABELS.scanUnfiltered}</option>
          {scans.map((scan) => {
            if (typeof scan.id !== 'number') return null
            const label = `${formatScanDateLabel(scan.scan_date)} - ${scan.target_url ?? ''}`
            return (
              <option key={scan.id} value={scan.id}>
                {label}
              </option>
            )
          })}
        </select>
      </div>

      <div className={FIELD_CLASSES}>
        <label htmlFor="dashboard-filter-severity" className={LABEL_CLASSES}>
          {DASHBOARD_FILTERS_LABELS.severity}
        </label>
        <select
          id="dashboard-filter-severity"
          className={SELECT_CLASSES}
          value={filters.severity ?? ''}
          onChange={(event) => onChangeFilter('severity', event.target.value === '' ? null : event.target.value)}
        >
          <option value="">{DASHBOARD_FILTERS_LABELS.severityUnfiltered}</option>
          {SEVERITY_OPTIONS.map((severity) => (
            <option key={severity} value={severity}>
              {severity}
            </option>
          ))}
        </select>
      </div>

      <div className={FIELD_CLASSES}>
        <label htmlFor="dashboard-filter-source" className={LABEL_CLASSES}>
          {DASHBOARD_FILTERS_LABELS.source}
        </label>
        <select
          id="dashboard-filter-source"
          className={SELECT_CLASSES}
          value={filters.source ?? ''}
          onChange={(event) => onChangeFilter('source', event.target.value === '' ? null : event.target.value)}
        >
          <option value="">{DASHBOARD_FILTERS_LABELS.sourceUnfiltered}</option>
          {SOURCE_OPTIONS.map((source) => (
            <option key={source.value} value={source.value}>
              {source.label}
            </option>
          ))}
        </select>
      </div>
    </section>
  )
}
