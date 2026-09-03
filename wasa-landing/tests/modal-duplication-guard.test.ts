import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { listSourceFiles } from './support/fsd'

const projectRoot = path.resolve(__dirname, '..')
const srcRoot = path.join(projectRoot, 'src')
const MODAL_FILE = 'shared/ui/Modal.tsx'

/**
 * D-9 de design.md: `DashboardVulnerabilityModal` dejó de reimplementar las
 * tres trampas del Modal compartido (listener de Escape, bloqueo de scroll,
 * cierre por backdrop). Este guard impide que la duplicación reaparezca en
 * cualquier otro módulo, no sólo en el que este change corrigió.
 */
const ESCAPE_LISTENER_PATTERN = /addEventListener\(\s*['"]keydown['"]/
const BODY_OVERFLOW_WRITE_PATTERN = /document\.body\.style\.overflow\s*=/

function findViolations(pattern: RegExp): string[] {
  const violations: string[] = []
  for (const file of listSourceFiles(srcRoot)) {
    if (file === MODAL_FILE) continue
    const source = readFileSync(path.join(srcRoot, file), 'utf-8')
    if (pattern.test(source)) violations.push(file)
  }
  return violations
}

describe('ningún módulo fuera de shared/ui/Modal.tsx reimplementa sus trampas (D-9)', () => {
  it('ningún otro archivo registra un listener de keydown para Escape', () => {
    expect(findViolations(ESCAPE_LISTENER_PATTERN)).toEqual([])
  })

  it('ningún otro archivo escribe document.body.style.overflow', () => {
    expect(findViolations(BODY_OVERFLOW_WRITE_PATTERN)).toEqual([])
  })

  it('el propio Modal compartido sigue implementando las dos trampas (guard sobre el guard)', () => {
    const modalSource = readFileSync(path.join(srcRoot, MODAL_FILE), 'utf-8')
    expect(ESCAPE_LISTENER_PATTERN.test(modalSource)).toBe(true)
    expect(BODY_OVERFLOW_WRITE_PATTERN.test(modalSource)).toBe(true)
  })
})
