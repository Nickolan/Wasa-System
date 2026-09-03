import type { ReactNode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SeverityDistributionEntry, TrendPoint } from '@entities/dashboard'
import { DASHBOARD_CHART_TITLES, DashboardChartsWidget } from '@widgets/dashboard-charts'

/**
 * D-11 de design.md: se afirma sobre las estructuras que se le pasan a
 * `recharts`, no sobre los nodos SVG que renderiza — en jsdom
 * `ResponsiveContainer` mide 0×0 y no dibuja nada real.
 */
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PieChart: ({ children }: { children: ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  Pie: (props: { data: unknown }) => <div data-testid="pie-data">{JSON.stringify(props.data)}</div>,
  Cell: () => null,
  LineChart: (props: { children: ReactNode; data: unknown }) => (
    <div data-testid="line-chart">
      <div data-testid="line-data">{JSON.stringify(props.data)}</div>
      {props.children}
    </div>
  ),
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}))

afterEach(() => {
  cleanup()
})

describe('DashboardChartsWidget (task 5.5, D-11)', () => {
  it('pasa la distribución de severidad al gráfico de torta', () => {
    const distribution: SeverityDistributionEntry[] = [
      { severity: 'Critical', count: 3 },
      { severity: 'High', count: 2 },
    ]
    render(<DashboardChartsWidget distribution={distribution} trend={[]} />)

    const pieData = JSON.parse(screen.getByTestId('pie-data').textContent ?? '[]')
    expect(pieData).toEqual([
      { name: 'Critical', value: 3 },
      { name: 'High', value: 2 },
    ])
  })

  it('pasa la serie de evolución al gráfico de línea', () => {
    const trend: TrendPoint[] = [
      { scanId: 1, label: '01/01/2026 08:00', count: 2 },
      { scanId: 2, label: '02/01/2026 20:00', count: 5 },
    ]
    render(<DashboardChartsWidget distribution={[]} trend={trend} />)

    const lineData = JSON.parse(screen.getByTestId('line-data').textContent ?? '[]')
    expect(lineData).toEqual([
      { fecha: '01/01/2026 08:00', vulnerabilidades: 2 },
      { fecha: '02/01/2026 20:00', vulnerabilidades: 5 },
    ])
  })

  it('muestra el título de cada tarjeta', () => {
    render(<DashboardChartsWidget distribution={[]} trend={[]} />)
    expect(screen.getByText(DASHBOARD_CHART_TITLES.severity)).toBeInTheDocument()
    expect(screen.getByText(DASHBOARD_CHART_TITLES.trend)).toBeInTheDocument()
  })
})
