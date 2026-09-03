import { memo } from 'react'
import type { DashboardVulnerabilityRow } from '@entities/dashboard'
import { normalizeSeverity } from '@entities/dashboard'
import { orFallback } from '@shared/lib/utils'
import { Card } from '@shared/ui/Card'
import { SEVERITY_BADGE_CLASSES, SEVERITY_BADGE_FALLBACK_CLASSES } from '@shared/ui/severityBadgeClasses'
import { Table } from '@shared/ui/Table'
import { DASHBOARD_DETAIL_TABLE } from '../model/content'

const TABLE_WRAPPER_CLASSES = 'max-h-[32rem] overflow-auto'
const ROW_CLASSES = 'cursor-pointer hover:bg-slate-800/40'
const BADGE_CLASSES = 'rounded-full px-2 py-0.5 text-xs font-semibold'

export interface DashboardDetailTableWidgetProps {
  vulnerabilities: DashboardVulnerabilityRow[]
  onSelectVulnerability: (vulnerability: DashboardVulnerabilityRow) => void
}

/**
 * Detalle completo de vulnerabilidades (task 5.7, spec `dashboard-screen`):
 * seis columnas, marcador explícito en campo ausente. Migrada a `Card`
 * (variante `blur={false}`, D-4 trade-off: misma superficie que el resto
 * del dashboard sin el costo de composición de `backdrop-filter` sobre una
 * tabla larga con scroll interno) + `Table`. Activar una fila abre el
 * modal de detalle (`dashboard-vulnerability-modal`, D-6/D-9) — este
 * widget no lo monta, sólo notifica al padre vía `onSelectVulnerability`.
 *
 * Envuelto en `React.memo` (fix de code-review, hallazgo #4): `DashboardPage`
 * ya memoiza `vulnerabilities` con `useMemo`/deriva su referencia de
 * `response` (estable entre renders no relacionados, p. ej. abrir/cerrar el
 * modal de detalle) y `onSelectVulnerability` es el setter de `useState`
 * (estable por contrato de React) — sin `memo` acá, este widget igual
 * recalculaba su `.map()` completo en cada uno de esos re-renders.
 */
export const DashboardDetailTableWidget = memo(function DashboardDetailTableWidget({
  vulnerabilities,
  onSelectVulnerability,
}: DashboardDetailTableWidgetProps) {
  return (
    <Card
      as="section"
      blur={false}
      title={DASHBOARD_DETAIL_TABLE.title}
      aria-label={DASHBOARD_DETAIL_TABLE.title}
      className="animate-fade-in-up"
    >
      <Table className={TABLE_WRAPPER_CLASSES}>
        <thead>
          <tr>
            <th scope="col">{DASHBOARD_DETAIL_TABLE.headers.source}</th>
            <th scope="col">{DASHBOARD_DETAIL_TABLE.headers.type}</th>
            <th scope="col">{DASHBOARD_DETAIL_TABLE.headers.severity}</th>
            <th scope="col">{DASHBOARD_DETAIL_TABLE.headers.cwe}</th>
            <th scope="col">{DASHBOARD_DETAIL_TABLE.headers.evidence}</th>
            <th scope="col">{DASHBOARD_DETAIL_TABLE.headers.url}</th>
          </tr>
        </thead>
        <tbody>
          {vulnerabilities.map((vuln, index) => {
            const severity = normalizeSeverity(vuln.severity)
            const key =
              typeof vuln.id === 'number'
                ? vuln.id
                : `${vuln.scan_id ?? ''}-${vuln.url ?? ''}-${vuln.type ?? ''}-${index}`
            return (
              <tr
                key={key}
                className={ROW_CLASSES}
                tabIndex={0}
                onClick={() => onSelectVulnerability(vuln)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') onSelectVulnerability(vuln)
                }}
              >
                <td>{orFallback(vuln.source, DASHBOARD_DETAIL_TABLE.missingFieldMarker)}</td>
                <td>{orFallback(vuln.type, DASHBOARD_DETAIL_TABLE.missingFieldMarker)}</td>
                <td>
                  <span className={`${BADGE_CLASSES} ${SEVERITY_BADGE_CLASSES[severity] ?? SEVERITY_BADGE_FALLBACK_CLASSES}`}>
                    {severity}
                  </span>
                </td>
                <td>{orFallback(vuln.cweid, DASHBOARD_DETAIL_TABLE.missingFieldMarker)}</td>
                <td>{orFallback(vuln.evidence, DASHBOARD_DETAIL_TABLE.missingFieldMarker)}</td>
                <td>{orFallback(vuln.url, DASHBOARD_DETAIL_TABLE.missingFieldMarker)}</td>
              </tr>
            )
          })}
        </tbody>
      </Table>
    </Card>
  )
})
