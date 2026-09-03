/**
 * API pública de la slice `features/dashboard` (D-8, FSD). Los consumidores
 * importan de acá, nunca de una ruta interna de `api/` o `model/`.
 */
export { fetchDashboard, DashboardFetchError, DASHBOARD_PATH } from './api/fetchDashboard'
export type { DashboardQueryFilters } from './api/fetchDashboard'
export { useDashboard } from './model/useDashboard'
export type { DashboardFilterKey, DashboardFilters, UseDashboardResult } from './model/useDashboard'
