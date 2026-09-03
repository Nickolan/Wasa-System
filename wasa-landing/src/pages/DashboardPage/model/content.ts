/**
 * Contenido fijo propio de `DashboardPage` (task 6.2, spec `dashboard-screen`
 * "La pantalla comunica su estado de carga, de fallo y de conjunto vacío").
 * Portado del encabezado de `Sidebar.jsx` (D-5 de design.md).
 *
 * El mensaje de error es deliberadamente genérico (task 6.2): nunca expone
 * la dirección del servicio, el texto de la consulta ni el mensaje crudo
 * del cliente HTTP — mismo criterio que `SCAN_SUBMIT_MESSAGES` de
 * `features/scan-form`.
 */
export const DASHBOARD_PAGE_CONTENT = {
  heading: 'Dashboard de Seguridad Web',
  subheading: 'Equipo Bot Azul - Monitoreo de Vulnerabilidades',
  loading: 'Cargando datos del dashboard…',
  error: 'No pudimos cargar los datos del dashboard. Intentá de nuevo más tarde.',
  /**
   * Aviso no bloqueante (fix code-review #1): cuando un refetch por cambio
   * de filtro falla DESPUÉS de una carga previa exitosa, `useDashboard`
   * preserva `data` a propósito. El error de página completa (arriba) sólo
   * corresponde cuando no hay ningún dato para mostrar — con datos previos
   * visibles, este banner chico informa la falla sin ocultar el contenido.
   */
  filterError: 'No pudimos actualizar los datos con el filtro seleccionado. Mostrando los últimos datos cargados.',
} as const
