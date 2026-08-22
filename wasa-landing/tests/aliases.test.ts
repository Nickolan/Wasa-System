import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = path.resolve(__dirname, '..')
const LAYERS = ['app', 'pages', 'widgets', 'features', 'entities', 'shared']

/**
 * tsconfig.*.json is JSONC (allows comments). Strips `//` and `/* *‍/` comments
 * while leaving string content untouched — naive regex stripping breaks on
 * values like "@app/*" that contain a literal `/*` sequence.
 */
function parseJsonc(raw: string): unknown {
  let result = ''
  let inString = false
  let inLineComment = false
  let inBlockComment = false

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    const next = raw[i + 1]

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false
        result += ch
      }
      continue
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false
        i++
      }
      continue
    }

    if (inString) {
      result += ch
      if (ch === '\\') {
        result += next
        i++
      } else if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      result += ch
    } else if (ch === '/' && next === '/') {
      inLineComment = true
      i++
    } else if (ch === '/' && next === '*') {
      inBlockComment = true
      i++
    } else {
      result += ch
    }
  }

  return JSON.parse(result)
}

describe('path aliases resolve for @shared', () => {
  it('imports a module through the @shared alias', async () => {
    const mod = await import('@shared/lib/aliasProbe')
    expect(mod.probeValue).toBe('shared-alias-probe')
  })
})

describe('the six aliases are declared identically in Vite and TypeScript (D-9)', () => {
  const viteConfig = readFileSync(path.join(projectRoot, 'vite.config.ts'), 'utf-8')
  const tsconfigApp = parseJsonc(
    readFileSync(path.join(projectRoot, 'tsconfig.app.json'), 'utf-8'),
  ) as { compilerOptions?: { paths?: Record<string, string[]> } }

  it.each(LAYERS)('vite.config.ts declares @%s -> src/%s', (layer) => {
    const pattern = new RegExp(
      `['"]@${layer}['"]:\\s*path\\.resolve\\([^)]*['"]src/${layer}['"]\\)`,
    )
    expect(viteConfig).toMatch(pattern)
  })

  it.each(LAYERS)('tsconfig.app.json declares @%s/* -> src/%s/*', (layer) => {
    const paths = tsconfigApp.compilerOptions?.paths ?? {}
    expect(paths[`@${layer}/*`]).toEqual([`./src/${layer}/*`])
  })
})
