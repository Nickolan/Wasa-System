import { describe, expect, it } from 'vitest'
import { orFallback } from '@shared/lib/utils'

/**
 * `orFallback` es la coalescencia null/string-vacío→fallback que hasta el
 * fix de code-review (hallazgo #2) vivía duplicada, idéntica, en
 * `DashboardVulnerabilityModal.tsx` (como `orFallback`) y en
 * `DashboardDetailTableWidget.tsx` (como `orMarker`). Ahora vive una sola
 * vez acá y ambos widgets la importan.
 */
describe('orFallback: valor presente', () => {
  it('returns the value unchanged when it is a non-empty string', () => {
    expect(orFallback('CWE-79', 'N/D')).toBe('CWE-79')
  })
})

describe('orFallback: valor ausente', () => {
  it('returns the fallback when the value is null', () => {
    expect(orFallback(null, 'N/D')).toBe('N/D')
  })

  it('returns the fallback when the value is undefined', () => {
    expect(orFallback(undefined, 'N/D')).toBe('N/D')
  })

  it('returns the fallback when the value is an empty string', () => {
    expect(orFallback('', 'N/D')).toBe('N/D')
  })
})

describe('orFallback: el fallback es un parámetro, no un valor fijo (dos consumidores con fallbacks distintos)', () => {
  it('honors whatever fallback each call site passes', () => {
    expect(orFallback(null, 'No disponible')).toBe('No disponible')
    expect(orFallback(null, '—')).toBe('—')
  })
})
