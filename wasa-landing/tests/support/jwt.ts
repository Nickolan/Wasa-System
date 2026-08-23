/**
 * Builds fake JWT-shaped strings for tests, entirely locally: no library, no
 * network, no token ever emitted by a real Bridge (see design.md D-13). The
 * payload is encoded as base64url (the alphabet real JWTs use), so tests can
 * exercise the `-`/`_` translation that `jwtIsExpired` must perform.
 */

function base64UrlEncode(input: string): string {
  // btoa expects standard base64 output; translate to the URL-safe alphabet
  // and drop the padding, exactly like a real JWT payload segment.
  const base64 = btoa(input)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Encodes an arbitrary payload object into a three-segment fake JWT string. */
export function makeJwt(payload: object): string {
  const header = { alg: 'HS256', typ: 'JWT' }
  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const fillerSignature = 'not-a-real-signature'
  return `${encodedHeader}.${encodedPayload}.${fillerSignature}`
}

/**
 * Builds a fake JWT whose `exp` claim sits `seconds` from the current clock —
 * relative to whatever `Date.now()` resolves to right now, so callers MUST
 * freeze the clock first (`vi.setSystemTime`) for a deterministic `exp`.
 */
export function makeJwtExpiringIn(seconds: number, extraClaims: object = {}): string {
  const nowSeconds = Math.floor(Date.now() / 1000)
  return makeJwt({
    sub: 'test-user',
    iat: nowSeconds,
    exp: nowSeconds + seconds,
    ...extraClaims,
  })
}
