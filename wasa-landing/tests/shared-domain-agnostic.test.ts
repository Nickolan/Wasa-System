import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Bounded, explicit list of WASA-domain terms (D-16): what the generic FSD
 * boundary guard (`fsd-boundaries.test.ts`) cannot see — a file can pass
 * every import check and still leak domain semantics as hardcoded text
 * (e.g. a Modal whose body literally says "Iniciar sesión").
 */
const DOMAIN_TERMS = [
  'sesión',
  'sesion',
  'login',
  'contraseña',
  'escaneo',
  'sqlmap',
  'phpsessid',
  'target_url',
  'wasa',
]

/** Recursively lists every .ts/.tsx file under `dir`, as absolute paths. */
function listFiles(dir: string): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      results.push(...listFiles(full))
    } else if (/\.(ts|tsx)$/.test(entry)) {
      results.push(full)
    }
  }
  return results
}

/** Finds every domain-term hit in `text`, case-insensitive. */
function findDomainHits(text: string): string[] {
  const lower = text.toLowerCase()
  return DOMAIN_TERMS.filter((term) => lower.includes(term))
}

describe('the detector itself catches a deliberately violating fixture (guard on the guard)', () => {
  it('flags a fixture string containing hardcoded domain text', () => {
    const fixtureSource = 'export const label = "Iniciar sesión"'
    expect(findDomainHits(fixtureSource)).toEqual(['sesión'])
  })

  it('does not flag domain-agnostic text', () => {
    const fixtureSource = 'export const label = "Submit"'
    expect(findDomainHits(fixtureSource)).toEqual([])
  })
})

describe('shared/ui and shared/lib contain no hardcoded WASA-domain text', () => {
  const projectRoot = path.resolve(__dirname, '..')
  const scannedDirs = ['src/shared/ui', 'src/shared/lib']

  it.each(scannedDirs)('%s has no file with hardcoded domain text', (relativeDir) => {
    const dir = path.join(projectRoot, relativeDir)
    const violations: string[] = []

    for (const file of listFiles(dir)) {
      const source = readFileSync(file, 'utf-8')
      const hits = findDomainHits(source)
      if (hits.length > 0) {
        violations.push(`${path.relative(projectRoot, file)}: ${hits.join(', ')}`)
      }
    }

    expect(violations).toEqual([])
  })
})
