import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { listSourceFiles } from './support/fsd'

const projectRoot = path.resolve(__dirname, '..')
const srcRoot = path.join(projectRoot, 'src')

/**
 * D-12: jsdom no aplica CSS ni calcula geometría, así que ningún test puede
 * afirmar honestamente "esto es responsive". Lo único verificable sin
 * mentir es la ausencia de la construcción que rompe una pantalla angosta:
 * un ancho o ancho mínimo fijo en píxeles.
 */
const FIXED_WIDTH_PATTERN = /\b(?:w|min-w)-\[[^\]]*px\]/
const INLINE_WIDTH_STYLE_PATTERN = /style\s*=\s*\{\{[^}]*\bwidth\s*:/

function findFixedWidthViolations(sourceText: string): string[] {
  const violations: string[] = []
  if (FIXED_WIDTH_PATTERN.test(sourceText)) violations.push('fixed-width utility class')
  if (INLINE_WIDTH_STYLE_PATTERN.test(sourceText)) violations.push('inline width style')
  return violations
}

/**
 * "Las disposiciones en varias columnas SHALL partir de una sola columna y
 * ampliarse a partir de puntos de corte, no al revés"
 * (`landing-composition`). Verificable sin medir layout: una rejilla de
 * varias columnas es correcta sólo si su estado **base** (sin prefijo de
 * punto de corte) es `grid-cols-1` y todo `grid-cols-N` con N > 1 llega
 * prefijado (`sm:`, `md:`, `lg:`…).
 */
const GRID_COLS_PATTERN = /(?:^|[\s"'`])((?:[a-z0-9]+:)*)grid-cols-(\d+)/g

function findMobileFirstGridViolations(sourceText: string): string[] {
  const matches = [...sourceText.matchAll(GRID_COLS_PATTERN)]
  if (matches.length === 0) return []

  const violations: string[] = []
  const hasSingleColumnBase = matches.some(([, prefix, count]) => prefix === '' && count === '1')
  const unprefixedMultiColumn = matches.filter(
    ([, prefix, count]) => prefix === '' && Number(count) > 1,
  )
  const breakpointMultiColumn = matches.filter(
    ([, prefix, count]) => prefix !== '' && Number(count) > 1,
  )

  for (const [, , count] of unprefixedMultiColumn) {
    violations.push(`multi-column base without a breakpoint: grid-cols-${count}`)
  }
  if (breakpointMultiColumn.length > 0 && !hasSingleColumnBase) {
    violations.push('breakpoint multi-column grid without a grid-cols-1 base')
  }
  return violations
}

describe('el detector de anchos fijos detecta una violación deliberada (guard sobre el guard)', () => {
  it('flags a fixture string using a fixed-width Tailwind utility', () => {
    const fixture = '<div className="w-[320px] flex flex-col">hi</div>'
    expect(findFixedWidthViolations(fixture)).toEqual(['fixed-width utility class'])
  })

  it('flags a fixture string using a fixed min-width Tailwind utility', () => {
    const fixture = '<div className="min-w-[400px]">hi</div>'
    expect(findFixedWidthViolations(fixture)).toEqual(['fixed-width utility class'])
  })

  it('flags a fixture string using an inline width style', () => {
    const fixture = '<div style={{ width: "320px" }}>hi</div>'
    expect(findFixedWidthViolations(fixture)).toEqual(['inline width style'])
  })

  it('does not flag a responsive, non-pixel-fixed fixture', () => {
    const fixture = '<div className="w-full max-w-md grid grid-cols-1 sm:grid-cols-2">hi</div>'
    expect(findFixedWidthViolations(fixture)).toEqual([])
  })
})

describe('el detector de rejillas no mobile-first detecta violaciones deliberadas (guard sobre el guard)', () => {
  it('flags an unprefixed multi-column grid', () => {
    const fixture = '<div className="grid grid-cols-2 gap-6">hi</div>'
    expect(findMobileFirstGridViolations(fixture)).toEqual([
      'multi-column base without a breakpoint: grid-cols-2',
    ])
  })

  it('flags a breakpoint multi-column grid with no single-column base', () => {
    const fixture = '<div className="grid sm:grid-cols-3 gap-6">hi</div>'
    expect(findMobileFirstGridViolations(fixture)).toEqual([
      'breakpoint multi-column grid without a grid-cols-1 base',
    ])
  })

  it('does not flag a mobile-first grid', () => {
    const fixture = '<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">hi</div>'
    expect(findMobileFirstGridViolations(fixture)).toEqual([])
  })

  it('does not flag a file with no grid at all', () => {
    const fixture = '<div className="flex flex-col gap-6">hi</div>'
    expect(findMobileFirstGridViolations(fixture)).toEqual([])
  })
})

/**
 * El alcance es toda la Landing —`widgets/` y las páginas que los
 * componen (`HomePage`, `ScanPage`)—, no sólo `widgets/`: la spec dice
 * "ninguna sección de la Landing", y esos contenedores son parte de esa
 * disposición.
 */
function landingSourceFiles(): string[] {
  return listSourceFiles(srcRoot).filter((f) => f.startsWith('widgets/') || f.startsWith('pages/'))
}

describe('la Landing no fija anchos ni anchos mínimos en píxeles (D-12, R-3)', () => {
  it('ningún archivo de src/widgets/ ni de src/pages/ usa w-[…px], min-w-[…px] ni un width en estilo en línea', () => {
    const offenders: string[] = []
    for (const file of landingSourceFiles()) {
      const sourceText = readFileSync(path.join(srcRoot, file), 'utf-8')
      const violations = findFixedWidthViolations(sourceText)
      if (violations.length > 0) {
        offenders.push(`${file}: ${violations.join(', ')}`)
      }
    }
    expect(offenders).toEqual([])
  })

  // task 6.6 (`about-page`): el guard de arriba escanea todo `widgets/` y
  // `pages/` genéricamente, así que ya cubre `/about` sin cambios — esta
  // aserción hace explícito que la cobertura no es vacua: si algún día
  // alguien excluye estos archivos del escaneo, este test lo nota.
  it('el escaneo incluye a AboutWidget y AboutPage', () => {
    expect(landingSourceFiles()).toEqual(
      expect.arrayContaining(['widgets/about/ui/AboutWidget.tsx', 'pages/AboutPage/index.tsx']),
    )
  })

  // task 7.4 (unified-design-system, D-11.9): el panel de resultados
  // (CHANGE-26) quedaba fuera del alcance verificado por este guard hasta
  // este change — la spec `design-system` extiende explícitamente la
  // garantía de adaptabilidad a sus superficies. Como el guard de arriba ya
  // escanea todo `widgets/` y `pages/` genéricamente, ya cubre a
  // `dashboard-*` y a sus dos tablas de datos sin cambios; esta aserción
  // hace explícita esa cobertura, para que no quede vacua.
  it('el escaneo cubre a los widgets dashboard-* y a sus dos tablas de datos', () => {
    expect(landingSourceFiles()).toEqual(
      expect.arrayContaining([
        'widgets/dashboard-kpis/ui/DashboardKpisWidget.tsx',
        'widgets/dashboard-charts/ui/DashboardChartsWidget.tsx',
        'widgets/dashboard-filters/ui/DashboardFiltersWidget.tsx',
        'widgets/dashboard-endpoints/ui/DashboardEndpointsWidget.tsx',
        'widgets/dashboard-detail-table/ui/DashboardDetailTableWidget.tsx',
        'pages/DashboardPage/index.tsx',
      ]),
    )
  })
})

describe('las rejillas de la Landing parten de una sola columna (landing-composition)', () => {
  // CHANGE-19 ("Estilos de frontend afinados", commit a799400) migró
  // `HowItWorksWidget` de una rejilla a un timeline vertical (`<ol>` con
  // `flex flex-col`, sin ningún `grid-cols-*`): no es una rotura, es un
  // layout de una sola columna por construcción, fuera del alcance de este
  // guard. `FeaturesWidget` sigue siendo la sección de la Landing que
  // declara una rejilla multi-columna.
  it('la sección de herramientas declara grid-cols-1 como base y amplía por punto de corte', () => {
    const gridded: string[] = []
    const offenders: string[] = []

    for (const file of landingSourceFiles()) {
      const sourceText = readFileSync(path.join(srcRoot, file), 'utf-8')
      if (!/grid-cols-/.test(sourceText)) continue
      gridded.push(file)
      const violations = findMobileFirstGridViolations(sourceText)
      if (violations.length > 0) offenders.push(`${file}: ${violations.join(', ')}`)
    }

    // Si la sección dejara de usar una rejilla, este guard se volvería
    // vacuo sin avisar: se afirma también a quién cubre.
    expect(gridded).toEqual(
      expect.arrayContaining(['widgets/features-section/ui/FeaturesWidget.tsx']),
    )
    expect(offenders).toEqual([])
  })
})
