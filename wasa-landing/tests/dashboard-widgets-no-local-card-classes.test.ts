import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { listSourceFiles } from './support/fsd'

const projectRoot = path.resolve(__dirname, '..')
const srcRoot = path.join(projectRoot, 'src')

/**
 * Spec `design-system`, escenario "Las tarjetas del panel de resultados no
 * redeclaran su apariencia": ningún widget bajo `widgets/dashboard-*`
 * declara una constante propia de clases de tarjeta o de tabla — todos
 * componen sobre `Card`/`Table` (D-3, D-9 de design.md
 * unified-design-system).
 */
const LOCAL_CARD_OR_TABLE_CONSTANT_PATTERN =
  /\b(?:CARD_CLASSES|CRITICAL_CARD_CLASSES|TABLE_CLASSES|HEAD_CLASSES|CELL_CLASSES)\s*=/

function dashboardWidgetFiles(): string[] {
  return listSourceFiles(srcRoot).filter((f) => /^widgets\/dashboard-/.test(f) && f.endsWith('.tsx'))
}

describe('ningún widget de dashboard-* declara clases locales de tarjeta o de tabla (spec design-system)', () => {
  it('ningún archivo de widgets/dashboard-*/ui declara CARD_CLASSES, TABLE_CLASSES, HEAD_CLASSES ni CELL_CLASSES', () => {
    const offenders: string[] = []
    for (const file of dashboardWidgetFiles()) {
      const source = readFileSync(path.join(srcRoot, file), 'utf-8')
      if (LOCAL_CARD_OR_TABLE_CONSTANT_PATTERN.test(source)) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })

  it('el escaneo cubre efectivamente los widgets migrados (kpis, charts, endpoints, detail-table)', () => {
    expect(dashboardWidgetFiles()).toEqual(
      expect.arrayContaining([
        'widgets/dashboard-kpis/ui/DashboardKpisWidget.tsx',
        'widgets/dashboard-charts/ui/DashboardChartsWidget.tsx',
        'widgets/dashboard-endpoints/ui/DashboardEndpointsWidget.tsx',
        'widgets/dashboard-detail-table/ui/DashboardDetailTableWidget.tsx',
      ]),
    )
  })

  it('el detector se prueba a sí mismo: una constante local de tarjeta no pasa desapercibida (guard sobre el guard)', () => {
    const fixtureSource = "const CARD_CLASSES = 'rounded-lg border border-slate-800 bg-slate-900/60 p-6'"
    expect(LOCAL_CARD_OR_TABLE_CONSTANT_PATTERN.test(fixtureSource)).toBe(true)
  })
})
