import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { colorTokens } from '@shared/ui/tokens'

const projectRoot = path.resolve(__dirname, '..')
const srcRoot = path.join(projectRoot, 'src')

/**
 * Los dos únicos archivos donde un literal de color es la fuente de verdad
 * (D-5, D-11.1 de design.md unified-design-system): el espejo TypeScript de
 * los tokens, y la hoja global donde vive el `@theme` que los declara para
 * Tailwind. En cualquier otro archivo de `src/`, un literal de color es la
 * capa muerta o la deriva que este change vino a cerrar.
 */
const EXCLUDED_FILES = new Set(['shared/ui/tokens.ts', 'app/index.css'])

/** Lista TODO archivo bajo `dir` (no sólo .ts/.tsx: también .css), relativo a `dir`, con `/` como separador. */
function listAllSourceFiles(dir: string): string[] {
  const results: string[] = []
  function walk(current: string) {
    for (const entry of readdirSync(current)) {
      const full = path.join(current, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
      } else {
        results.push(path.relative(dir, full).split(path.sep).join('/'))
      }
    }
  }
  walk(dir)
  return results
}

function scannedFiles(): string[] {
  return listAllSourceFiles(srcRoot).filter((f) => !EXCLUDED_FILES.has(f))
}

/**
 * Un hex de 3, 4, 6 u 8 dígitos, o una llamada a `rgb(`/`rgba(`. El escaneo
 * es sobre el texto completo del archivo — comentarios incluidos — porque
 * un comentario que documenta "de #3b82f6 a sky-500" reintroduce la misma
 * deriva que el guard existe para impedir: la próxima persona que lea el
 * comentario puede copiarlo a código sin darse cuenta de que ya no es la
 * fuente de verdad.
 */
const HEX_OR_RGB_PATTERN = /#[0-9a-fA-F]{3,8}\b|\brgba?\(/

describe('D-11.1 — ningún literal hexadecimal ni rgb()/rgba() fuera del módulo de tokens y de la hoja global (spec design-system)', () => {
  it('ningún archivo de src/, salvo shared/ui/tokens.ts y app/index.css, contiene un hex o un rgb()/rgba()', () => {
    const offenders: string[] = []
    for (const file of scannedFiles()) {
      const source = readFileSync(path.join(srcRoot, file), 'utf-8')
      if (HEX_OR_RGB_PATTERN.test(source)) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })

  it('el escaneo excluye explícitamente a tokens.ts y a index.css, que sí declaran color literal (D-5)', () => {
    expect(scannedFiles()).not.toContain('shared/ui/tokens.ts')
    expect(scannedFiles()).not.toContain('app/index.css')
  })

  it('el escaneo cubre efectivamente el árbol de widgets y entidades del dashboard, donde vivían los hexadecimales antes de este change', () => {
    expect(scannedFiles()).toEqual(
      expect.arrayContaining([
        'widgets/dashboard-charts/ui/DashboardChartsWidget.tsx',
        'entities/dashboard/lib/severityVisuals.ts',
      ]),
    )
  })

  it('el detector se prueba a sí mismo: un hex fuera de las sedes permitidas no pasa desapercibido (guard sobre el guard)', () => {
    const hexFixture = "const oops = '#ff00ff'"
    const rgbFixture = 'background: rgba(2, 6, 23, 0.7);'
    const cleanFixture = "const ok = 'bg-surface-elevated text-brand'"
    expect(HEX_OR_RGB_PATTERN.test(hexFixture)).toBe(true)
    expect(HEX_OR_RGB_PATTERN.test(rgbFixture)).toBe(true)
    expect(HEX_OR_RGB_PATTERN.test(cleanFixture)).toBe(false)
  })
})

/**
 * D-11.2: la capa de tokens existía "muerta" antes de este change — cero
 * archivos consumían las utilidades que `@theme` generaba. Este guard
 * impide que un rol vuelva a quedar declarado sin ningún consumidor real.
 */
describe('D-11.2 — todo token declarado en @theme tiene al menos un consumidor en src/ (spec design-system)', () => {
  const themeRoles = Object.keys(colorTokens)

  /** Utilidades Tailwind que el rol `role` puede generar (las que este sistema efectivamente usa). */
  function utilitiesFor(role: string): string[] {
    return [
      `bg-${role}`,
      `text-${role}`,
      `border-${role}`,
      `ring-${role}`,
      `fill-${role}`,
      `stroke-${role}`,
      `from-${role}`,
      `to-${role}`,
      `via-${role}`,
    ]
  }

  it.each(themeRoles)('el rol %s tiene al menos un consumidor (utilidad Tailwind o colorTokens[...])', (role) => {
    const consumers: string[] = []
    const utilities = utilitiesFor(role)
    const tokensAccessPattern = new RegExp(`colorTokens(?:\\.${role.replace(/-/g, '')}|\\[['"]${role}['"]\\])`)

    for (const file of scannedFiles()) {
      const source = readFileSync(path.join(srcRoot, file), 'utf-8')
      if (utilities.some((utility) => source.includes(utility)) || tokensAccessPattern.test(source)) {
        consumers.push(file)
      }
    }

    expect(consumers.length, `${role} no tiene ningún consumidor en src/ (capa muerta)`).toBeGreaterThan(0)
  })

  it('el detector se prueba a sí mismo: un rol inventado sin consumidor no pasa desapercibido (guard sobre el guard)', () => {
    const consumers: string[] = []
    const utilities = utilitiesFor('invented-role-nobody-uses')
    for (const file of scannedFiles()) {
      const source = readFileSync(path.join(srcRoot, file), 'utf-8')
      if (utilities.some((utility) => source.includes(utility))) consumers.push(file)
    }
    expect(consumers).toEqual([])
  })
})

/**
 * D-11.5: el antipatrón que el `/code-review` de CHANGE-26 marcó — dos
 * módulos declarando la misma cadena de clases Tailwind verbatim para una
 * de las cuatro superficies que la spec `design-system` nombra
 * explícitamente ("el contenedor de página, el encabezado de página, la
 * tarjeta de contenido y la tabla de datos") — es exactamente la
 * duplicación que los primitivos de `shared/ui/` vinieron a absorber (D-3).
 *
 * El escaneo se limita a constantes cuyo NOMBRE indica que describen una de
 * esas cuatro superficies (`*CARD*`, `*TABLE*`, `*CONTAINER*`, `*SHELL*`,
 * `*_HEADER_*`), no a cualquier cadena de clases idéntica: D-6 nombra una
 * escala tipográfica precisamente para que dos módulos la declaren
 * verbatim (`HEADING_CLASSES` de `AboutWidget` y de `ScanPendingWidget`
 * coinciden a propósito, ambos son `subsection-title`), y D-3 permite
 * explícitamente la utilidad Tailwind literal fuera de la frontera de los
 * primitivos. Ampliar el escaneo a cualquier constante convertiría esa
 * consistencia deseada en un falso positivo (`tests/dashboard-widgets-no-
 * local-card-classes.test.ts` ya cubre `CARD_CLASSES`/`TABLE_CLASSES`
 * dentro de `widgets/dashboard-*`; este guard generaliza la misma idea a
 * todo `src/`).
 */
describe('D-11.5 — ningún par de módulos declara la misma cadena de clases para una superficie compartida (spec design-system)', () => {
  /** `const NOMBRE_CLASSES = '...clases...'` o con comillas dobles. */
  const CLASS_CONSTANT_PATTERN = /const\s+([A-Z][A-Z0-9_]*)\s*=\s*(['"])((?:(?!\2).)*)\2/g
  const SURFACE_CONSTANT_NAME_PATTERN = /(CARD|TABLE|CONTAINER|SHELL|_HEADER_|_HEADER$)/

  function surfaceClassConstantsByFile(): Map<string, string[]> {
    const byFile = new Map<string, string[]>()
    for (const file of scannedFiles()) {
      if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue
      const source = readFileSync(path.join(srcRoot, file), 'utf-8')
      const values: string[] = []
      for (const match of source.matchAll(CLASS_CONSTANT_PATTERN)) {
        const [, name, , value] = match
        if (SURFACE_CONSTANT_NAME_PATTERN.test(name)) values.push(value.trim())
      }
      if (values.length > 0) byFile.set(file, values)
    }
    return byFile
  }

  it('ninguna cadena de clases de una constante *CARD*/*TABLE*/*CONTAINER*/*SHELL*/*_HEADER* aparece verbatim en más de un archivo', () => {
    const byFile = surfaceClassConstantsByFile()
    const owners = new Map<string, Set<string>>()

    for (const [file, values] of byFile) {
      for (const value of values) {
        if (!owners.has(value)) owners.set(value, new Set())
        owners.get(value)!.add(file)
      }
    }

    const duplicated = [...owners.entries()]
      .filter(([, files]) => files.size > 1)
      .map(([value, files]) => `"${value}" en ${[...files].join(', ')}`)

    expect(duplicated).toEqual([])
  })

  it('el detector se prueba a sí mismo: la misma cadena de una constante de superficie en dos archivos no pasa desapercibida (guard sobre el guard)', () => {
    const fixtureA = "const CARD_CLASSES = 'rounded-lg border border-slate-800 bg-slate-900/60 p-6'"
    const fixtureB = "const CRITICAL_CARD_CLASSES = 'rounded-lg border border-slate-800 bg-slate-900/60 p-6'"
    const matchA = [...fixtureA.matchAll(CLASS_CONSTANT_PATTERN)][0]
    const matchB = [...fixtureB.matchAll(CLASS_CONSTANT_PATTERN)][0]
    expect(SURFACE_CONSTANT_NAME_PATTERN.test(matchA[1])).toBe(true)
    expect(SURFACE_CONSTANT_NAME_PATTERN.test(matchB[1])).toBe(true)
    expect(matchA[3].trim()).toBe(matchB[3].trim())
  })

  it('el filtro de nombre ignora una convergencia tipográfica deseada (D-6): HEADING_CLASSES no es una constante de superficie', () => {
    expect(SURFACE_CONSTANT_NAME_PATTERN.test('HEADING_CLASSES')).toBe(false)
    expect(SURFACE_CONSTANT_NAME_PATTERN.test('SECTION_CLASSES')).toBe(false)
  })
})
