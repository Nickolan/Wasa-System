import { memo } from 'react'
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { SeverityDistributionEntry, TrendPoint } from '@entities/dashboard'
import { Card } from '@shared/ui/Card'
import { colorTokens } from '@shared/ui/tokens'
import { DASHBOARD_CHART_TITLES, SEVERITY_CHART_COLORS, SEVERITY_CHART_FALLBACK_COLOR } from '../model/content'

const GRID_CLASSES = 'grid grid-cols-1 gap-6 lg:grid-cols-2'

export interface DashboardChartsWidgetProps {
  distribution: SeverityDistributionEntry[]
  trend: TrendPoint[]
}

/**
 * Donut de severidad + línea de evolución histórica (task 5.5, D-11 de
 * design.md CHANGE-26; migrado a `Card` + `tokens.ts` por
 * unified-design-system D-2/D-5). Recharts es el único consumidor que no
 * puede leer una clase CSS: sus colores llegan de `colorTokens`, nunca
 * escritos a mano en el JSX (spec `design-system`). La línea de tendencia
 * pasa de blue-500 a `colorTokens.info` (sky-500, la misma familia que la
 * marca y que el badge de severidad "Low"). El estado vacío se resuelve
 * fuera de este widget (task 5.8): quien compone decide mostrar
 * `DashboardEmptyState` en su lugar cuando no hay datos.
 *
 * (D-11.1: sin literales hexadecimales en este archivo, ni siquiera en
 * comentarios — el guard de `tests/design-system-single-source.test.ts`
 * escanea el texto completo del archivo.)
 *
 * Envuelto en `React.memo` (fix de code-review, hallazgo #4): `distribution`
 * y `trend` llegan de `useMemo` en `DashboardPage`, con referencia estable
 * entre renders no relacionados (p. ej. abrir/cerrar el modal de detalle) —
 * sin `memo` acá, este widget igual recalculaba sus transformaciones
 * `.map()` en cada uno de esos re-renders.
 */
export const DashboardChartsWidget = memo(function DashboardChartsWidget({
  distribution,
  trend,
}: DashboardChartsWidgetProps) {
  const severityData = distribution.map((entry) => ({ name: entry.severity, value: entry.count }))
  const trendData = trend.map((point) => ({ fecha: point.label, vulnerabilidades: point.count }))

  return (
    <section aria-label="Gráficos" className={GRID_CLASSES}>
      <Card title={DASHBOARD_CHART_TITLES.severity} className="animate-fade-in-up">
        <ResponsiveContainer width="100%" height={350}>
          <PieChart>
            <Pie
              data={severityData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={5}
              dataKey="value"
            >
              {severityData.map((entry) => (
                <Cell key={entry.name} fill={SEVERITY_CHART_COLORS[entry.name] ?? SEVERITY_CHART_FALLBACK_COLOR} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </Card>

      <Card title={DASHBOARD_CHART_TITLES.trend} className="animate-fade-in-up animation-delay-100">
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={trendData} margin={{ top: 20, right: 30, left: 0, bottom: 65 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colorTokens['border-strong']} />
            <XAxis
              dataKey="fecha"
              stroke={colorTokens['text-secondary']}
              angle={-45}
              textAnchor="end"
              tickMargin={10}
              tick={{ fontSize: 12 }}
            />
            <YAxis stroke={colorTokens['text-secondary']} allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="vulnerabilidades"
              stroke={colorTokens.info}
              strokeWidth={3}
              dot={{ r: 5, fill: colorTokens.info }}
            />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </section>
  )
})
