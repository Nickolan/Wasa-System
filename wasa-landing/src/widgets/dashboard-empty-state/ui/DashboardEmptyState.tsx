import { DASHBOARD_EMPTY_STATE_MESSAGE } from '../model/content'

/**
 * Radio de "contenedor chico" (D-7: rounded-lg), tokens de
 * superficie/borde/texto compartidos (D-3), y la animación de entrada
 * escalonada del canon (D-4).
 */
const CONTAINER_CLASSES =
  'flex w-full animate-fade-in-up items-center justify-center rounded-lg border border-border-subtle bg-surface-elevated/40 px-6 py-16 text-center text-text-secondary'

/**
 * Aviso de conjunto vacío (task 5.8, spec `dashboard-screen`): explícito, y
 * NO un error — se usa dentro de las tres vistas cuando los filtros vigentes
 * no dejan ninguna vulnerabilidad, en vez de un gráfico vacío o una tabla sin
 * filas. Los controles de filtrado siguen operables porque viven en un
 * widget hermano (`dashboard-filters`), no acá.
 */
export function DashboardEmptyState() {
  return (
    <p role="status" className={CONTAINER_CLASSES}>
      {DASHBOARD_EMPTY_STATE_MESSAGE}
    </p>
  )
}
