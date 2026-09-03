/** Contenido fijo de la tabla de detalle completo (task 5.1/5.7, spec `dashboard-screen`). */
export const DASHBOARD_DETAIL_TABLE = {
  title: 'Detalle Completo de Vulnerabilidades',
  headers: {
    source: 'Fuente',
    type: 'Tipo',
    severity: 'Severidad',
    cwe: 'CWE ID',
    evidence: 'Evidencia',
    url: 'URL Afectada',
  },
  /** Marcador explícito para un campo ausente o vacío (spec: "nunca con un hueco que el usuario no pueda interpretar"). */
  missingFieldMarker: 'N/D',
} as const
