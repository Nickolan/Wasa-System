import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeJwt, makeJwtExpiringIn } from './support/jwt'
import { withThrowingStorage } from './support/storage'

describe('makeJwt (test scaffolding, D-13)', () => {
  it('produces a three-segment string whose middle segment round-trips to the original payload', () => {
    const token = makeJwt({ sub: 'alice', exp: 123 })
    const segments = token.split('.')
    expect(segments).toHaveLength(3)

    const decoded = JSON.parse(atob(segments[1].replace(/-/g, '+').replace(/_/g, '/')))
    expect(decoded).toEqual({ sub: 'alice', exp: 123 })
  })
})

describe('makeJwtExpiringIn (test scaffolding, D-13)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('produces the same exp claim every time against a frozen clock', () => {
    const tokenA = makeJwtExpiringIn(60)
    const tokenB = makeJwtExpiringIn(60)

    const payloadOf = (token: string) =>
      JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))

    expect(payloadOf(tokenA).exp).toBe(payloadOf(tokenB).exp)
    expect(payloadOf(tokenA).exp).toBe(Math.floor(Date.now() / 1000) + 60)
  })
})

describe('withThrowingStorage (test scaffolding, D-13)', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('makes the targeted method throw only inside the callback, and restores it afterwards', () => {
    let threwInside = false
    withThrowingStorage('setItem', () => {
      try {
        localStorage.setItem('probe', 'value')
      } catch {
        threwInside = true
      }
    })
    expect(threwInside).toBe(true)

    expect(() => localStorage.setItem('probe', 'value')).not.toThrow()
    expect(localStorage.getItem('probe')).toBe('value')
  })
})
