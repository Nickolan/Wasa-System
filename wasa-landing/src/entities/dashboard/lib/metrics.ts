/**
 * Derivación de indicadores sobre la respuesta de `GET /api/v1/dashboard`
 * (D-3 de design.md, spec `dashboard-metrics`, tasks 2.3/2.4/2.6/2.7).
 * Funciones puras: no importan React, no leen estado, no hacen red, no
 * mutan su entrada y son deterministas (task 2.8).
 *
 * Reemplazan a las siete derivaciones que `dashboard-fuzzing/src/App.jsx`
 * calculaba inline en el cuerpo del render.
 */
import type { DashboardResponse } from '../model/types'
import { formatScanDateLabel } from './dateLabel'
import { normalizeSeverity } from './severity'

export interface KpiSummary {
  scanCountLabel: string
  scanCountValue: number
  totalVulnerabilities: number
  criticalVulnerabilities: number
}

export interface SeverityDistributionEntry {
  severity: string
  count: number
}

export interface TrendPoint {
  scanId: number | null
  label: string
  count: number
}

export interface EndpointRankingEntry {
  url: string
  count: number
}

const SCAN_COUNT_LABEL_ALL = 'Escaneos Realizados'
const SCAN_COUNT_LABEL_SELECTED = 'Escaneo Analizado'

/**
 * Task 2.3: los tres indicadores principales. `selectedScanId` distingue
 * el rótulo y el valor del indicador de escaneos — "contar todos los
 * escaneos mientras se mira uno solo describiría un conjunto distinto del
 * que la pantalla muestra".
 */
export function deriveKpis(response: DashboardResponse, selectedScanId: number | null): KpiSummary {
  const vulnerabilities = response.vulnerabilities

  const scanCountLabel = selectedScanId != null ? SCAN_COUNT_LABEL_SELECTED : SCAN_COUNT_LABEL_ALL
  const scanCountValue = selectedScanId != null ? selectedScanId : response.scans.length

  const totalVulnerabilities = vulnerabilities.length
  const criticalVulnerabilities = vulnerabilities.filter(
    (vuln) => normalizeSeverity(vuln.severity) === 'Critical',
  ).length

  return { scanCountLabel, scanCountValue, totalVulnerabilities, criticalVulnerabilities }
}

/**
 * Task 2.4: una entrada por severidad efectivamente presente — nunca una
 * entrada con valor cero para una severidad sin ocurrencias, porque la
 * distribución describe lo que hay, no el catálogo de severidades
 * posibles.
 */
export function deriveSeverityDistribution(response: DashboardResponse): SeverityDistributionEntry[] {
  const counts = new Map<string, number>()
  for (const vuln of response.vulnerabilities) {
    const severity = normalizeSeverity(vuln.severity)
    counts.set(severity, (counts.get(severity) ?? 0) + 1)
  }
  return Array.from(counts.entries()).map(([severity, count]) => ({ severity, count }))
}

/**
 * Task 2.6: un punto por escaneo devuelto (incluidos los que no aportan
 * ninguna vulnerabilidad al conjunto vigente, con valor cero), ordenados
 * de más antiguo a más reciente. La etiqueta de cada punto sale de
 * `formatScanDateLabel` (D-8): dos escaneos del mismo día son
 * distinguibles porque la etiqueta incluye la hora.
 */
export function deriveTrend(response: DashboardResponse): TrendPoint[] {
  const scansByDate = [...response.scans].sort((a, b) => {
    const timeA = a.scan_date ? new Date(a.scan_date).getTime() : Number.NaN
    const timeB = b.scan_date ? new Date(b.scan_date).getTime() : Number.NaN
    const normalizedA = Number.isNaN(timeA) ? Number.POSITIVE_INFINITY : timeA
    const normalizedB = Number.isNaN(timeB) ? Number.POSITIVE_INFINITY : timeB
    return normalizedA - normalizedB
  })

  // Una sola pasada O(V) sobre las vulnerabilidades en vez de un filter
  // anidado por escaneo (que era O(escaneos × vulnerabilidades)): el
  // backend no pagina ni limita ninguna de las dos colecciones. La clave
  // del Map es el `scan_id` tal como llega (number | null | undefined) vía
  // SameValueZero, igual que la comparación `===` original.
  const countsByScanId = new Map<number | null | undefined, number>()
  for (const vuln of response.vulnerabilities) {
    countsByScanId.set(vuln.scan_id, (countsByScanId.get(vuln.scan_id) ?? 0) + 1)
  }

  return scansByDate.map((scan) => {
    const scanId = typeof scan.id === 'number' ? scan.id : null
    const count = countsByScanId.get(scanId) ?? 0
    return { scanId, label: formatScanDateLabel(scan.scan_date), count }
  })
}

/**
 * Task 2.7: ranking de URLs por cantidad de hallazgos, de mayor a menor.
 * Las URLs se comparan tal como llegan, sin normalizar ni agrupar por
 * prefijo — agrupar dos rutas distintas del mismo host cambiaría el
 * hallazgo que el ranking reporta.
 *
 * Una vulnerabilidad sin `url` (nula, ausente o vacía — el contrato del
 * Bridge lo permite) se excluye del ranking en vez de agruparse bajo una
 * entrada fantasma `url: ''`: esa entrada mezclaría hallazgos no
 * relacionados bajo una etiqueta vacía y podría aparecer arriba del
 * ranking si son varios.
 */
export function deriveTopEndpoints(response: DashboardResponse): EndpointRankingEntry[] {
  const counts = new Map<string, number>()
  for (const vuln of response.vulnerabilities) {
    if (typeof vuln.url !== 'string' || vuln.url === '') continue
    counts.set(vuln.url, (counts.get(vuln.url) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([url, count]) => ({ url, count }))
    .sort((a, b) => b.count - a.count)
}
