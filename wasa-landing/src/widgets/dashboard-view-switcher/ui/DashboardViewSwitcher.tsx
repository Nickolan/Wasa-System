import { DASHBOARD_VIEW_LABELS, DASHBOARD_VIEW_ORDER, type DashboardView } from '../model/content'

/** Radio de "control" (D-7: rounded-md) y borde/superficie del token compartido (D-3). */
const NAV_CLASSES = 'flex flex-wrap gap-2 border-b border-border-subtle pb-4'
const BUTTON_BASE_CLASSES = 'rounded-md px-4 py-2 text-sm font-semibold transition-colors'
const BUTTON_ACTIVE_CLASSES = 'bg-brand text-white'
const BUTTON_INACTIVE_CLASSES = 'bg-surface-elevated text-slate-300 hover:bg-slate-800'

export interface DashboardViewSwitcherProps {
  activeView: DashboardView
  onSelectView: (view: DashboardView) => void
}

/**
 * Conmutador de vistas horizontal DENTRO de la página (task 5.2, D-5): no un
 * `aside` fijo — el `Navbar` de la aplicación ya es el cromo de navegación.
 * Conmutar sólo cambia el estado local de la vista activa; no dispara
 * ninguna consulta (spec `dashboard-screen`, "conmutar no recarga los
 * datos").
 */
export function DashboardViewSwitcher({ activeView, onSelectView }: DashboardViewSwitcherProps) {
  return (
    <nav aria-label="Vistas del panel de resultados" className={NAV_CLASSES}>
      {DASHBOARD_VIEW_ORDER.map((view) => {
        const isActive = view === activeView
        return (
          <button
            key={view}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelectView(view)}
            className={`${BUTTON_BASE_CLASSES} ${isActive ? BUTTON_ACTIVE_CLASSES : BUTTON_INACTIVE_CLASSES}`}
          >
            {DASHBOARD_VIEW_LABELS[view]}
          </button>
        )
      })}
    </nav>
  )
}
