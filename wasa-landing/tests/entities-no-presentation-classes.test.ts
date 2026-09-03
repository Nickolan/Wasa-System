import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { listSourceFiles } from './support/fsd'

const projectRoot = path.resolve(__dirname, '..')
const srcRoot = path.join(projectRoot, 'src')

/**
 * Regla dura del proyecto (CLAUDE.md): "`entities/` define tipos, schemas
 * Zod y estado de dominio compartido entre features... sin lógica de UI ni
 * de presentación". Un módulo de `entities/` puede exportar un token de
 * dominio ABSTRACTO (p. ej. `'danger' | 'warning'`), pero nunca una cadena
 * de clases Tailwind concreta (`'bg-red-500/20 text-red-300'`) — eso es
 * presentación y pertenece a `shared/ui/` o a un widget (fix de code-review,
 * hallazgo #1 sobre `entities/dashboard/lib/severityVisuals.ts`).
 *
 * El patrón busca una utilidad Tailwind de color con escala numérica
 * (`bg-red-500`, `text-sky-300`, etc.) — lo bastante específico para no
 * disparar sobre nombres de rol semántico (`colorTokens.danger`) ni sobre
 * prosa de comentarios que sólo mencionan un color por nombre.
 */
const TAILWIND_COLOR_UTILITY_PATTERN =
  /\b(?:bg|text|border|ring|fill|stroke|from|via|to)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}\b/

function entitiesFiles(): string[] {
  return listSourceFiles(srcRoot).filter((f) => f.startsWith('entities/'))
}

describe('ningún módulo de entities/ declara una clase Tailwind concreta de color (regla dura CLAUDE.md, fix code-review #1)', () => {
  it('ningún archivo bajo entities/ contiene una utilidad Tailwind de color con escala numérica', () => {
    const offenders: string[] = []
    for (const file of entitiesFiles()) {
      const source = readFileSync(path.join(srcRoot, file), 'utf-8')
      if (TAILWIND_COLOR_UTILITY_PATTERN.test(source)) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })

  it('el escaneo cubre efectivamente entities/dashboard, donde vivía la clase Tailwind antes del fix', () => {
    expect(entitiesFiles()).toEqual(expect.arrayContaining(['entities/dashboard/lib/severityVisuals.ts']))
  })

  it('el detector se prueba a sí mismo: una clase Tailwind de color no pasa desapercibida (guard sobre el guard)', () => {
    const fixtureSource = "export const BADGE_CLASSES = 'bg-red-500/20 text-red-300'"
    expect(TAILWIND_COLOR_UTILITY_PATTERN.test(fixtureSource)).toBe(true)
  })

  it('el filtro no dispara sobre un token de dominio semántico (colorTokens.danger, un identificador sin escala numérica)', () => {
    const fixtureSource = "export const SEVERITY_CHART_COLORS = { Critical: colorTokens.danger }"
    expect(TAILWIND_COLOR_UTILITY_PATTERN.test(fixtureSource)).toBe(false)
  })
})
