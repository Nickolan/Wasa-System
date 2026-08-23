import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import { jwtIsExpired } from '@shared/lib/utils'
import { makeJwt, makeJwtExpiringIn } from './support/jwt'

const FROZEN_NOW = new Date('2026-01-01T00:00:00.000Z')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FROZEN_NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('jwtIsExpired: vigente vs. vencido (requirements 1 y 2)', () => {
  it('a token expiring 24 hours in the future is not expired', () => {
    const token = makeJwtExpiringIn(24 * 60 * 60)
    expect(jwtIsExpired(token)).toBe(false)
  })

  it('a token that expired 1 hour ago is expired', () => {
    const token = makeJwtExpiringIn(-60 * 60)
    expect(jwtIsExpired(token)).toBe(true)
  })

  it('a token expiring 1 second in the future is not expired', () => {
    const token = makeJwtExpiringIn(1)
    expect(jwtIsExpired(token)).toBe(false)
  })

  it('a token whose exp equals the current second is expired (closed bound, D-5)', () => {
    const token = makeJwtExpiringIn(0)
    expect(jwtIsExpired(token)).toBe(true)
  })

  it('the same token flips from not-expired to expired as the clock advances past exp', () => {
    const token = makeJwtExpiringIn(60)
    expect(jwtIsExpired(token)).toBe(false)

    vi.setSystemTime(new Date(FROZEN_NOW.getTime() + 61_000))
    expect(jwtIsExpired(token)).toBe(true)
  })

  it('two tokens with the same future exp but different sub/iat/unknown claims get the same verdict', () => {
    const tokenA = makeJwtExpiringIn(3600, { sub: 'alice', unknownClaim: 'x' })
    const tokenB = makeJwtExpiringIn(3600, { sub: 'bob', role: 'admin' })
    expect(jwtIsExpired(tokenA)).toBe(jwtIsExpired(tokenB))
    expect(jwtIsExpired(tokenA)).toBe(false)
  })
})

describe('jwtIsExpired: falla cerrada (D-1)', () => {
  it('the empty string is expired and does not throw', () => {
    expect(() => jwtIsExpired('')).not.toThrow()
    expect(jwtIsExpired('')).toBe(true)
  })

  it('a string without three dot-separated segments is expired and does not throw', () => {
    expect(() => jwtIsExpired('no-soy-un-token')).not.toThrow()
    expect(jwtIsExpired('no-soy-un-token')).toBe(true)
  })

  it('a middle segment with characters outside the base64 alphabet is expired and does not throw', () => {
    const token = 'header.!!!not-decodable!!!.signature'
    expect(() => jwtIsExpired(token)).not.toThrow()
    expect(jwtIsExpired(token)).toBe(true)
  })

  it('a middle segment that decodes to non-JSON text is expired and does not throw', () => {
    const notJson = btoa('this is not json')
    const token = `header.${notJson}.signature`
    expect(() => jwtIsExpired(token)).not.toThrow()
    expect(jwtIsExpired(token)).toBe(true)
  })

  it('a valid JSON payload without an exp claim is expired', () => {
    const token = makeJwt({ sub: 'no-exp-here' })
    expect(() => jwtIsExpired(token)).not.toThrow()
    expect(jwtIsExpired(token)).toBe(true)
  })

  it.each([
    ['a string', 'soon'],
    ['null', null],
    ['an object', { at: 123 }],
    ['NaN', NaN],
    ['Infinity', Infinity],
  ])('a non-numeric-or-non-finite exp claim (%s) is expired and does not throw', (_label, expValue) => {
    const token = makeJwt({ sub: 'x', exp: expValue })
    expect(() => jwtIsExpired(token)).not.toThrow()
    expect(jwtIsExpired(token)).toBe(true)
  })
})

describe('jwtIsExpired: base64url y sin dependencias externas (requirements 4 y 5, D-10)', () => {
  it('a payload whose base64url encoding contains - and _ decodes correctly (not expired)', () => {
    // sub: '~~??1' is chosen so its base64 encoding contains BOTH '+' and '/',
    // which base64url translates to '-' and '_'. A naive atob() without that
    // translation either throws or misdecodes — the classic base64url bug.
    const token = makeJwt({ sub: '~~??1', exp: Math.floor(Date.now() / 1000) + 3600 })
    expect(token.split('.')[1]).toMatch(/[-_]/)
    expect(jwtIsExpired(token)).toBe(false)
  })

  it('a payload whose encoded length is not a multiple of four (no padding) decodes correctly', () => {
    // sub chosen so JSON.stringify(...) base64-encodes to a length that is
    // not already a multiple of 4, exercising the padEnd() restoration.
    const token = makeJwt({ sub: 'ab', exp: Math.floor(Date.now() / 1000) + 3600 })
    expect(token.split('.')[1].length % 4).not.toBe(0)
    expect(jwtIsExpired(token)).toBe(false)
  })

  it('an invalid signature does not affect the verdict when exp is in the future (inspection does not authenticate)', () => {
    const validToken = makeJwtExpiringIn(3600)
    const [header, payload] = validToken.split('.')
    const tokenWithBogusSignature = `${header}.${payload}.this-is-not-a-real-signature-at-all`
    expect(jwtIsExpired(tokenWithBogusSignature)).toBe(false)
  })

  it('inspecting a token never emits a network request', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    jwtIsExpired(makeJwtExpiringIn(3600))
    jwtIsExpired(makeJwtExpiringIn(-3600))
    jwtIsExpired('not-a-token')
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})

describe('jwtIsExpired: pureza (Requirement: la inspección es una función pura y sin efectos)', () => {
  it('repeated calls with a frozen clock produce the same verdict and leave localStorage untouched', () => {
    localStorage.setItem('unrelated-probe', 'unchanged')
    const token = makeJwtExpiringIn(3600)

    const first = jwtIsExpired(token)
    const second = jwtIsExpired(token)
    const third = jwtIsExpired(token)

    expect(first).toBe(second)
    expect(second).toBe(third)
    expect(localStorage.getItem('unrelated-probe')).toBe('unchanged')
    localStorage.removeItem('unrelated-probe')
  })
})
