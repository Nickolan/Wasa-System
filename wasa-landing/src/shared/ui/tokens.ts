/**
 * Espejo en TypeScript de los roles de color declarados en el bloque
 * `@theme` de `src/app/index.css` (D-5, design.md): existe únicamente para
 * el consumidor que no puede leer una clase CSS — Recharts, que recibe
 * `stroke`/`fill` como strings literales. Sin JSX, sin lógica: sólo
 * constantes tipadas.
 *
 * El valor de cada rol es el mismo que `@theme` declara (vía alias
 * `var(--color-<paleta>)`); `tests/design-tokens.test.ts` falla si alguna
 * de las dos sedes cambia sin la otra.
 */
export const colorTokens = {
  'surface-base': '#020617',
  'surface-elevated': '#0f172a',
  'surface-sunken': '#020617',
  'border-subtle': '#1e293b',
  'border-strong': '#334155',
  brand: '#0284c7',
  'brand-hover': '#0ea5e9',
  'brand-accent': '#38bdf8',
  'text-emphasis': '#ffffff',
  'text-primary': '#f1f5f9',
  'text-secondary': '#94a3b8',
  'text-muted': '#64748b',
  danger: '#ef4444',
  warning: '#f97316',
  caution: '#eab308',
  info: '#0ea5e9',
  success: '#22c55e',
  neutral: '#64748b',
} as const

export type ColorTokenRole = keyof typeof colorTokens
