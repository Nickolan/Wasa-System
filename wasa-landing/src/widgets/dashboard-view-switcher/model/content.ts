/**
 * Contenido fijo del conmutador de vistas (task 5.1/5.2, D-5 de design.md).
 * Portado de `Sidebar.jsx` del dashboard standalone: los tres rótulos de
 * botón, ahora como datos y no como JSX repetido.
 */
export type DashboardView = 'overview' | 'endpoints' | 'details'

export const DASHBOARD_VIEW_ORDER: readonly DashboardView[] = ['overview', 'endpoints', 'details']

export const DASHBOARD_VIEW_LABELS: Record<DashboardView, string> = {
  overview: 'Panel General',
  endpoints: 'Endpoints Vulnerables',
  details: 'Reporte Detallado',
}

/** Vista inicial de la pantalla (spec `dashboard-screen`: "el panel general SHALL ser la vista inicial"). */
export const DASHBOARD_INITIAL_VIEW: DashboardView = 'overview'
