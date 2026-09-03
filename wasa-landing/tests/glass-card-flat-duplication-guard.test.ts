import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = path.resolve(__dirname, '..')
const cssPath = path.join(projectRoot, 'src', 'app', 'index.css')

/**
 * Fix de code-review, hallazgo #6: `.glass-card-flat` copiaba a mano el
 * mismo `background` (gradiente) y `border` que `.glass-card`, sólo
 * omitiendo `backdrop-filter` — dos reglas que había que mantener
 * byte-idénticas manualmente. El gradiente y el borde ahora se declaran una
 * sola vez, en un selector agrupado (`.glass-card, .glass-card-flat { ... }`),
 * y `backdrop-filter` queda como declaración exclusiva de `.glass-card`.
 */
function readCss(): string {
  return readFileSync(cssPath, 'utf-8')
}

describe('.glass-card y .glass-card-flat no duplican su declaración de fondo/borde (fix code-review #6)', () => {
  it('el gradiente compartido aparece exactamente una vez en el archivo (antes: dos, una por selector)', () => {
    const css = readCss()
    // Tolerante a CRLF/LF (el archivo fuente usa CRLF en Windows).
    const GRADIENT_PATTERN =
      /linear-gradient\(\s*135deg,\s*rgba\(15, 23, 42, 0\.8\) 0%,\s*rgba\(30, 41, 59, 0\.6\) 100%\s*\)/g
    const occurrences = (css.match(GRADIENT_PATTERN) ?? []).length
    expect(occurrences).toBe(1)
  })

  it('existe un selector agrupado que cubre ambas clases', () => {
    const css = readCss()
    expect(css).toMatch(/\.glass-card\s*,\s*\.glass-card-flat\s*\{/)
  })

  it('backdrop-filter sigue siendo exclusivo de .glass-card (no aparece dentro de un bloque .glass-card-flat propio)', () => {
    const css = readCss()
    const flatOwnBlockMatch = css.match(/\.glass-card-flat\s*\{([^}]*)\}/)
    if (flatOwnBlockMatch) {
      expect(flatOwnBlockMatch[1]).not.toMatch(/backdrop-filter/)
    }
  })

  it('mantiene el resultado visual: ambas clases siguen resolviendo el mismo gradiente y borde (guard sobre el guard con un fixture roto)', () => {
    const brokenCss = `
      .glass-card { background: linear-gradient(135deg, a, b); border: 1px solid c; backdrop-filter: blur(12px); }
      .glass-card-flat { background: linear-gradient(135deg, a, b); border: 1px solid c; }
    `
    const gradientOccurrences = brokenCss.split('linear-gradient(135deg, a, b)').length - 1
    expect(gradientOccurrences).toBe(2)
  })
})
