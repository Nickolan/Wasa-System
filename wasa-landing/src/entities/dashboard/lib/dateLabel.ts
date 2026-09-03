/**
 * Etiqueta de fecha de escaneo (task 2.5, D-8 de design.md). Una única
 * función produce las etiquetas tanto para las opciones del filtro de
 * escaneo como para los puntos de la serie de evolución histórica (task
 * 2.6) — así, si el smoke manual de la task 9.4 detecta el desfase horario
 * de R-1 (CHANGE-25 R-4: Pydantic puede emitir ISO-8601 sin offset y
 * `new Date(...)` lo interpreta como hora local), la corrección es de un
 * solo punto.
 *
 * Recibe el valor tal como el servicio lo emite (`string | null |
 * undefined`) y nunca lanza ni produce `NaN`: un valor ausente o no
 * interpretable produce un marcador explícito, nunca
 * `NaN/NaN - NaN:NaN:NaN` (el defecto del original ante `scan_date: null`,
 * que el contrato del Bridge permite).
 */
export const NO_DATE_LABEL = 'Fecha no disponible'

export function formatScanDateLabel(scanDate: string | null | undefined): string {
  if (!scanDate) return NO_DATE_LABEL

  const date = new Date(scanDate)
  if (Number.isNaN(date.getTime())) return NO_DATE_LABEL

  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `${day}/${month}/${year} ${hours}:${minutes}`
}
