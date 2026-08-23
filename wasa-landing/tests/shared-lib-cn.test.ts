import { describe, expect, it } from 'vitest'
import { cn } from '@shared/lib/utils'

describe('cn: concatenación simple', () => {
  it('contains both classes when given two plain strings', () => {
    const result = cn('px-4', 'font-medium')
    expect(result).toContain('px-4')
    expect(result).toContain('font-medium')
  })
})

describe('cn: entradas condicionales', () => {
  it('keeps truthy string/object entries and drops falsy values and false object entries', () => {
    const result = cn('px-4', false, null, undefined, {
      'text-red-500': true,
      'text-green-500': false,
    })
    expect(result).toContain('px-4')
    expect(result).toContain('text-red-500')
    expect(result).not.toContain('text-green-500')
  })
})

describe('cn: el último conflicto gana (R-2: prueba que tailwind-merge está activo)', () => {
  it('collapses two paddings from the same utility group to the last one', () => {
    expect(cn('px-4', 'px-8')).toBe('px-8')
  })
})

describe('cn: sin argumentos', () => {
  it('returns an empty string', () => {
    expect(cn()).toBe('')
  })
})
