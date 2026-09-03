import type { EndpointRankingEntry } from '@entities/dashboard'
import { Card } from '@shared/ui/Card'
import { Table } from '@shared/ui/Table'
import { DASHBOARD_ENDPOINTS_TABLE } from '../model/content'

export interface DashboardEndpointsWidgetProps {
  ranking: EndpointRankingEntry[]
}

/**
 * Tabla de endpoints más vulnerables (task 5.6), una fila por entrada del
 * ranking, orden ya descendente (D-3). Migrada a `Card` + `Table` (D-3 de
 * unified-design-system): ya no declara sus propias constantes de clase
 * de tarjeta ni de tabla, las obtiene de los primitivos compartidos.
 */
export function DashboardEndpointsWidget({ ranking }: DashboardEndpointsWidgetProps) {
  return (
    <Card as="section" title={DASHBOARD_ENDPOINTS_TABLE.title} aria-label={DASHBOARD_ENDPOINTS_TABLE.title} className="animate-fade-in-up">
      <Table>
        <thead>
          <tr>
            <th scope="col">{DASHBOARD_ENDPOINTS_TABLE.urlHeader}</th>
            <th scope="col">{DASHBOARD_ENDPOINTS_TABLE.countHeader}</th>
          </tr>
        </thead>
        <tbody>
          {ranking.map((entry) => (
            <tr key={entry.url}>
              <td>{entry.url}</td>
              <td>{entry.count}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  )
}
