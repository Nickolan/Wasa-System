import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getImportedModules, listSourceFiles } from './support/fsd'

/**
 * Test de no-regresión estructural (D-9): la redirección al Dashboard que
 * `useScanForm.ts` disparaba en un `useEffect` tras la aceptación (`202`)
 * fue retirada como parte de este change (`scan-pending-screen` reemplaza
 * la navegación por una pantalla de espera dentro de la misma página).
 * Este test es la garantía de que no vuelve por descuido — patrón AST
 * ligero, igual que `tests/fsd-boundaries.test.ts`.
 */

const projectRoot = path.resolve(__dirname, '..')
const srcRoot = path.join(projectRoot, 'src')
const SCAN_FORM_FEATURE_ROOT = 'features/scan-form'

function importsDashboardUrl(sourceText: string): boolean {
  const specifiers = getImportedModules(sourceText)
  if (!specifiers.includes('@shared/config/env')) return false
  return /\bdashboardUrl\b/.test(sourceText)
}

function assignsWindowLocation(sourceText: string): boolean {
  return /window\.location(\.href)?\s*=/.test(sourceText)
}

describe('el detector de la regla en sí (guard on the guard)', () => {
  it('marca un fixture que simula el código pre-2.2 (import de dashboardUrl + asignación a window.location)', () => {
    const fixtureSource = [
      "import { dashboardUrl } from '@shared/config/env'",
      '',
      'window.location.href = dashboardUrl',
      '',
    ].join('\n')

    expect(importsDashboardUrl(fixtureSource)).toBe(true)
    expect(assignsWindowLocation(fixtureSource)).toBe(true)
  })

  it('no marca código que sólo importa dashboardUrl sin navegar, ni código que navega sin dashboardUrl', () => {
    expect(importsDashboardUrl("import { dashboardUrl } from '@shared/config/env'\nconsole.log(dashboardUrl)\n")).toBe(
      true,
    )
    expect(assignsWindowLocation("import { dashboardUrl } from '@shared/config/env'\nconsole.log(dashboardUrl)\n")).toBe(
      false,
    )
    expect(assignsWindowLocation('window.location.href = "/otra-pagina"\n')).toBe(true)
  })
})

describe('scan-form no redirect (D-9): la redirección al Dashboard no vuelve por descuido', () => {
  it('ningún archivo bajo src/features/scan-form/ importa dashboardUrl desde @shared/config/env', () => {
    const violations: string[] = []
    for (const file of listSourceFiles(srcRoot).filter((f) => f.startsWith(`${SCAN_FORM_FEATURE_ROOT}/`))) {
      const sourceText = readFileSync(path.join(srcRoot, file), 'utf-8')
      if (importsDashboardUrl(sourceText)) {
        violations.push(`${file} importa dashboardUrl desde @shared/config/env`)
      }
    }
    expect(violations).toEqual([])
  })

  it('ningún archivo bajo src/features/scan-form/ asigna a window.location', () => {
    const violations: string[] = []
    for (const file of listSourceFiles(srcRoot).filter((f) => f.startsWith(`${SCAN_FORM_FEATURE_ROOT}/`))) {
      const sourceText = readFileSync(path.join(srcRoot, file), 'utf-8')
      if (assignsWindowLocation(sourceText)) {
        violations.push(`${file} asigna a window.location`)
      }
    }
    expect(violations).toEqual([])
  })
})
