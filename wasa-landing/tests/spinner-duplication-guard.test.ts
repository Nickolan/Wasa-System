import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { listSourceFiles } from './support/fsd'

const projectRoot = path.resolve(__dirname, '..')
const srcRoot = path.join(projectRoot, 'src')

/**
 * Fix de code-review, hallazgo #3: `ScanPendingWidget.tsx` reimplementaba un
 * spinner a mano (`div` con `border-4 ... border-t-transparent
 * animate-spin`) en vez de reusar `shared/ui/Spinner.tsx`, que ya existe y
 * ya lo usa `ScanFormWidget`/`Button`. Ningún módulo debería volver a
 * declarar ese truco CSS de borde giratorio: el único spinner de la app es
 * el SVG de `shared/ui/Spinner.tsx`.
 */
const HAND_ROLLED_SPINNER_PATTERN = /border-t-transparent/

describe('ningún módulo reimplementa el spinner a mano con el truco de borde giratorio (fix code-review #3)', () => {
  it('ningún archivo de src/ contiene la clase border-t-transparent (spinner CSS hecho a mano)', () => {
    const offenders: string[] = []
    for (const file of listSourceFiles(srcRoot)) {
      const source = readFileSync(path.join(srcRoot, file), 'utf-8')
      if (HAND_ROLLED_SPINNER_PATTERN.test(source)) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })

  it('el detector se prueba a sí mismo: la clase del spinner hecho a mano no pasa desapercibida (guard sobre el guard)', () => {
    const fixtureSource = "const SPINNER_CLASSES = 'h-10 w-10 animate-spin rounded-full border-4 border-sky-600 border-t-transparent'"
    expect(HAND_ROLLED_SPINNER_PATTERN.test(fixtureSource)).toBe(true)
  })
})
