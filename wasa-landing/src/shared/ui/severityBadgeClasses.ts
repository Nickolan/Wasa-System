/**
 * Clases Tailwind del badge de severidad (presentación pura). Vivía en
 * `entities/dashboard/lib/severityVisuals.ts`, lo que violaba la regla dura
 * del proyecto (CLAUDE.md): "`entities/` define tipos, schemas Zod y estado
 * de dominio compartido entre features... sin lógica de UI ni de
 * presentación" (fix de code-review, hallazgo #1). El dato de dominio puro
 * — qué severidades existen, su color semántico como token abstracto — sigue
 * en `entities/dashboard` (`SEVERITY_CHART_COLORS`, vía `colorTokens`); sólo
 * la clase Tailwind concreta se movió acá.
 */
export const SEVERITY_BADGE_CLASSES: Record<string, string> = {
  Critical: 'bg-red-500/20 text-red-300',
  High: 'bg-orange-500/20 text-orange-300',
  Medium: 'bg-yellow-500/20 text-yellow-300',
  Low: 'bg-sky-500/20 text-sky-300',
}

/** Clases del badge para una severidad que el sistema no enumera. */
export const SEVERITY_BADGE_FALLBACK_CLASSES = 'bg-slate-500/20 text-slate-300'
