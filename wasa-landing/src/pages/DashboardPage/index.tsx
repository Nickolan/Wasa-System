import { useCallback, useMemo, useState } from 'react'
import type { DashboardVulnerabilityRow } from '@entities/dashboard'
import { deriveKpis, deriveSeverityDistribution, deriveTopEndpoints, deriveTrend } from '@entities/dashboard'
import { useDashboard } from '@features/dashboard'
import { FooterWidget } from '@widgets/footer'
import { DashboardFiltersWidget } from '@widgets/dashboard-filters'
import { DashboardViewSwitcher, DASHBOARD_INITIAL_VIEW, type DashboardView } from '@widgets/dashboard-view-switcher'
import { DashboardKpisWidget } from '@widgets/dashboard-kpis'
import { DashboardChartsWidget } from '@widgets/dashboard-charts'
import { DashboardEndpointsWidget } from '@widgets/dashboard-endpoints'
import { DashboardDetailTableWidget } from '@widgets/dashboard-detail-table'
import { DashboardEmptyState } from '@widgets/dashboard-empty-state'
import { DashboardVulnerabilityModal } from '@widgets/dashboard-vulnerability-modal'
import { PageShell } from '@shared/ui/PageShell'
import { PageHeader } from '@shared/ui/PageHeader'
import { DASHBOARD_PAGE_CONTENT } from './model/content'

const EMPTY_RESPONSE = { scans: [], vulnerabilities: [] }

/**
 * Pantalla de resultados (`dashboard-screen`, CHANGE-26). Reemplaza al
 * dashboard standalone (`dashboard/dashboard-fuzzing`): pública, sin muro de
 * autenticación, sin lectura de sesión (spec: "La pantalla de resultados es
 * pública y no distingue entre usuarios").
 *
 * `useDashboard` (`features/dashboard`) posee filtros y datos; esta página
 * sólo compone y deriva (D-3: `entities/dashboard` hace el cálculo, nunca
 * la página). El conmutador de vistas es estado local (D-5) — conmutar no
 * reconsulta ni pierde filtros.
 */
function DashboardPage() {
  const { data, isLoading, error, filters, setFilter } = useDashboard()
  const [activeView, setActiveView] = useState<DashboardView>(DASHBOARD_INITIAL_VIEW)
  const [selectedVulnerability, setSelectedVulnerability] = useState<DashboardVulnerabilityRow | null>(null)

  const response = data ?? EMPTY_RESPONSE
  const hasData = response.vulnerabilities.length > 0

  // Memoizado (task 4 del fix de code-review): sin esto, las cuatro pasadas
  // completas sobre `response` se recalculaban en cualquier re-render no
  // relacionado (cambiar de vista, abrir/cerrar el modal).
  const kpis = useMemo(() => deriveKpis(response, filters.scanId), [response, filters.scanId])
  const distribution = useMemo(() => deriveSeverityDistribution(response), [response])
  const trend = useMemo(() => deriveTrend(response), [response])
  const ranking = useMemo(() => deriveTopEndpoints(response), [response])

  // Referencia estable (fix code-review #6): `setSelectedVulnerability` de
  // `useState` es estable, así que este handler nunca cambia de identidad.
  // El modal depende de `onClose` en su `useEffect` de `keydown`; con una
  // closure inline nueva en cada render, cualquier re-render del padre
  // mientras el modal está abierto desmontaba y remontaba ese listener.
  const handleCloseVulnerabilityModal = useCallback(() => setSelectedVulnerability(null), [])

  return (
    <PageShell>
      <PageHeader title={DASHBOARD_PAGE_CONTENT.heading} subtitle={DASHBOARD_PAGE_CONTENT.subheading} />

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 pb-16">
        {isLoading && !data ? (
          <p role="status" className="py-16 text-center text-slate-400">
            {DASHBOARD_PAGE_CONTENT.loading}
          </p>
        ) : !data && error ? (
          <p role="alert" className="py-16 text-center text-red-400">
            {DASHBOARD_PAGE_CONTENT.error}
          </p>
        ) : (
          <>
            {error && (
              <p role="alert" className="rounded-md border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-300">
                {DASHBOARD_PAGE_CONTENT.filterError}
              </p>
            )}
            <DashboardFiltersWidget scans={response.scans} filters={filters} onChangeFilter={setFilter} />
            <DashboardViewSwitcher activeView={activeView} onSelectView={setActiveView} />

            {activeView === 'overview' && (
              <div className="flex flex-col gap-6">
                <DashboardKpisWidget kpis={kpis} />
                {hasData ? (
                  <DashboardChartsWidget distribution={distribution} trend={trend} />
                ) : (
                  <DashboardEmptyState />
                )}
              </div>
            )}

            {activeView === 'endpoints' &&
              (hasData ? <DashboardEndpointsWidget ranking={ranking} /> : <DashboardEmptyState />)}

            {activeView === 'details' &&
              (hasData ? (
                <DashboardDetailTableWidget
                  vulnerabilities={response.vulnerabilities}
                  onSelectVulnerability={setSelectedVulnerability}
                />
              ) : (
                <DashboardEmptyState />
              ))}
          </>
        )}
      </div>

      <FooterWidget />

      <DashboardVulnerabilityModal vulnerability={selectedVulnerability} onClose={handleCloseVulnerabilityModal} />
    </PageShell>
  )
}

export default DashboardPage
