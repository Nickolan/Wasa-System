import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { colorTokens } from '@shared/ui/tokens'

const projectRoot = path.resolve(__dirname, '..')
const indexCssPath = path.join(projectRoot, 'src/app/index.css')

/**
 * Los 18 roles semánticos de D-2 (design.md): 5 ya existían en `@theme`
 * antes de este change (surface-base, surface-elevated, brand, danger,
 * success) y 13 se agregan (task 1.3). `tokens.ts` es la única fuente que
 * debe declarar exactamente este conjunto — ni de más, ni de menos.
 */
const EXPECTED_ROLES = [
  'surface-base',
  'surface-elevated',
  'surface-sunken',
  'border-subtle',
  'border-strong',
  'brand',
  'brand-hover',
  'brand-accent',
  'text-emphasis',
  'text-primary',
  'text-secondary',
  'text-muted',
  'danger',
  'warning',
  'caution',
  'info',
  'success',
  'neutral',
] as const

/**
 * Tailwind palette entry → hex, sólo para las entradas que este change usa
 * (D-2 de design.md documenta el mismo mapeo). Vive acá, no en producción:
 * es exclusivamente para que el guard antideriva (1.4) pueda resolver el
 * alias `var(--color-<entry>)` que `@theme` declara y compararlo contra el
 * literal de `tokens.ts`, sin duplicar la paleta completa de Tailwind.
 */
const TAILWIND_PALETTE_HEX: Record<string, string> = {
  'slate-950': '#020617',
  'slate-900': '#0f172a',
  'slate-800': '#1e293b',
  'slate-700': '#334155',
  'slate-500': '#64748b',
  'slate-400': '#94a3b8',
  'slate-100': '#f1f5f9',
  'sky-600': '#0284c7',
  'sky-500': '#0ea5e9',
  'sky-400': '#38bdf8',
  'red-500': '#ef4444',
  'orange-500': '#f97316',
  'yellow-500': '#eab308',
  'green-500': '#22c55e',
  white: '#ffffff',
}

function readThemeBlock(): string {
  const content = readFileSync(indexCssPath, 'utf-8')
  const match = content.match(/@theme(?:\s+static)?\s*\{([\s\S]*?)\n\}/)
  expect(match, 'src/app/index.css no declara un bloque @theme').not.toBeNull()
  return match?.[1] ?? ''
}

/** Resuelve `--color-<role>: var(--color-<paletteEntry>);` a su hex, o null si no está declarado así. */
function resolveThemeRoleHex(themeBlock: string, role: string): string | null {
  const pattern = new RegExp(`--color-${role}\\s*:\\s*var\\(\\s*--color-([a-z]+(?:-\\d{2,3})?)\\s*\\)\\s*;`)
  const match = themeBlock.match(pattern)
  if (!match) return null
  const entry = match[1]
  return TAILWIND_PALETTE_HEX[entry] ?? null
}

describe('tokens.ts declara exactamente los 18 roles semánticos de D-2', () => {
  it('exporta colorTokens con las 18 claves esperadas, sin de más ni de menos', () => {
    expect(Object.keys(colorTokens).sort()).toEqual([...EXPECTED_ROLES].sort())
  })

  it.each(EXPECTED_ROLES)('declara un valor de color no vacío para el rol %s', (role) => {
    expect(colorTokens[role]).toBeTruthy()
    expect(typeof colorTokens[role]).toBe('string')
  })
})

describe('tokens.ts y el @theme de index.css no divergen (D-5, guard antideriva)', () => {
  it.each(EXPECTED_ROLES)('el rol %s tiene el mismo valor en tokens.ts y en @theme', (role) => {
    const themeBlock = readThemeBlock()
    const resolvedHex = resolveThemeRoleHex(themeBlock, role)
    expect(resolvedHex, `@theme no declara --color-${role} como alias var() de una entrada conocida de la paleta`).not.toBeNull()
    expect(resolvedHex?.toLowerCase()).toBe(colorTokens[role].toLowerCase())
  })

  it('el detector de deriva se prueba a sí mismo: un valor alterado en un solo lado no pasa desapercibido (guard sobre el guard)', () => {
    const fixtureThemeBlock = '--color-brand: var(--color-sky-600);'
    const sabotagedTokens: Record<string, string> = { ...colorTokens, brand: '#000000' }
    const resolvedHex = resolveThemeRoleHex(fixtureThemeBlock, 'brand')
    expect(resolvedHex).not.toBeNull()
    expect(resolvedHex?.toLowerCase()).not.toBe(sabotagedTokens.brand.toLowerCase())
  })
})
