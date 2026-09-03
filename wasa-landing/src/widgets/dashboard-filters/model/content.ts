/**
 * Contenido fijo de los tres filtros (task 5.1/5.3, spec `dashboard-screen`
 * "La pantalla ofrece tres filtros que acotan los datos consultados").
 * Portado de los `<select>` de `App.jsx` del dashboard standalone.
 */
export const SEVERITY_OPTIONS: readonly string[] = ['Critical', 'High', 'Medium', 'Low']

export const SOURCE_OPTIONS: readonly { readonly value: string; readonly label: string }[] = [
  { value: 'OWASP ZAP', label: 'OWASP ZAP' },
  { value: 'Nuclei', label: 'Nuclei' },
  { value: 'SQLMap (Worker)', label: 'SQLMap' },
  { value: 'ffuf', label: 'ffuf' },
]

export const DASHBOARD_FILTERS_LABELS = {
  scan: 'Escaneo',
  severity: 'Severidad',
  source: 'Herramienta',
  scanUnfiltered: 'Todos los escaneos históricos',
  severityUnfiltered: 'Todas',
  sourceUnfiltered: 'Todas',
} as const
