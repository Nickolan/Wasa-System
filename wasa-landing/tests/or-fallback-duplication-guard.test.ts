import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { listSourceFiles } from './support/fsd'

const projectRoot = path.resolve(__dirname, '..')
const srcRoot = path.join(projectRoot, 'src')
const UTILS_FILE = 'shared/lib/utils.ts'

/**
 * Fix de code-review, hallazgo #2: `DashboardVulnerabilityModal.tsx`
 * (`orFallback`) y `DashboardDetailTableWidget.tsx` (`orMarker`) declaraban,
 * cada uno por su cuenta, la misma lógica de coalescencia
 * `value == null || value === '' ? fallback : value`. Ahora vive una sola
 * vez en `shared/lib/utils.ts` (`orFallback`, exportado). Este guard impide
 * que la duplicación reaparezca en cualquier otro módulo.
 */
const COALESCE_PATTERN = /value\s*==\s*null\s*\|\|\s*value\s*===\s*['"]{2}/

function findViolations(): string[] {
  const violations: string[] = []
  for (const file of listSourceFiles(srcRoot)) {
    if (file === UTILS_FILE) continue
    const source = readFileSync(path.join(srcRoot, file), 'utf-8')
    if (COALESCE_PATTERN.test(source)) violations.push(file)
  }
  return violations
}

describe('ningún módulo fuera de shared/lib/utils.ts reimplementa la coalescencia null/vacío→fallback (fix code-review #2)', () => {
  it('ningún otro archivo declara su propia lógica de "value == null || value === \'\'"', () => {
    expect(findViolations()).toEqual([])
  })

  it('shared/lib/utils.ts sigue implementando la lógica compartida (guard sobre el guard)', () => {
    const utilsSource = readFileSync(path.join(srcRoot, UTILS_FILE), 'utf-8')
    expect(COALESCE_PATTERN.test(utilsSource)).toBe(true)
  })
})
