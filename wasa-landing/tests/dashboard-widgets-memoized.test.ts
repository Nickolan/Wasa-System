import { describe, expect, it } from 'vitest'
import { DashboardChartsWidget } from '@widgets/dashboard-charts'
import { DashboardDetailTableWidget } from '@widgets/dashboard-detail-table'

/**
 * Fix de code-review, hallazgo #4: `DashboardPage` ya memoiza sus
 * derivaciones (`useMemo`) para evitar recalcularlas en un re-render no
 * relacionado (p. ej. abrir/cerrar el modal de detalle), pero
 * `DashboardChartsWidget`/`DashboardDetailTableWidget` no estaban envueltos
 * en `React.memo`, así que igual re-renderizaban completo ante cualquier
 * re-render del padre. `React.memo` marca el componente resultante con
 * `$$typeof === Symbol.for('react.memo')` — la forma estándar de verificar
 * que un componente está memoizado sin depender de un spy de renders.
 */
const REACT_MEMO_TYPE = Symbol.for('react.memo')

describe('los widgets consumidos por DashboardPage están memoizados con React.memo (fix code-review #4)', () => {
  it('DashboardChartsWidget está envuelto en React.memo', () => {
    expect((DashboardChartsWidget as unknown as { $$typeof?: symbol }).$$typeof).toBe(REACT_MEMO_TYPE)
  })

  it('DashboardDetailTableWidget está envuelto en React.memo', () => {
    expect((DashboardDetailTableWidget as unknown as { $$typeof?: symbol }).$$typeof).toBe(REACT_MEMO_TYPE)
  })
})
