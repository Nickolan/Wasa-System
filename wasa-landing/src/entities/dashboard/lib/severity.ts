/**
 * Normalización de severidad (task 2.2, D-4.2 de design.md). El servicio
 * devuelve la severidad tal como está almacenada — minúscula
 * (`dashboard-projection`) — y esta función la lleva a capitalización
 * inicial: primera letra en mayúscula, resto tal cual llega. Aplica a
 * cualquier valor recibido, incluidos los que el sistema no enumera.
 *
 * Corrección deliberada de paridad respecto de `dashboard-fuzzing/src/
 * App.jsx` (D-4.2): el original hace `vuln.severity.charAt(0)…` sin
 * guarda, que revienta con `severity: null` — un valor que el contrato del
 * Bridge permite explícitamente. Acá una severidad ausente o nula se
 * agrupa bajo una categoría explícita de "desconocida", nunca lanza.
 */
export const UNKNOWN_SEVERITY_LABEL = 'Desconocida'

export function normalizeSeverity(severity: string | null | undefined): string {
  if (severity == null) return UNKNOWN_SEVERITY_LABEL
  const trimmed = severity.trim()
  if (trimmed === '') return UNKNOWN_SEVERITY_LABEL
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}
