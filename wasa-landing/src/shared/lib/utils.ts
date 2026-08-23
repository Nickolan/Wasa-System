/**
 * Decides, purely from a JWT's own `exp` claim and the local clock, whether
 * the token is still within its validity window (design.md D-1, D-5, D-10).
 * Does not verify the signature and makes no network request: the FastAPI
 * Bridge remains the authority on cryptographic validity, this is only a
 * temporal-expiry inspection. Never throws — see readExpClaim.
 */
export function jwtIsExpired(token: string): boolean {
  const exp = readExpClaim(token)
  if (exp === null) return true
  return Math.floor(Date.now() / 1000) >= exp
}

/**
 * Extracts the numeric `exp` claim from a token, or null if it cannot be
 * established with confidence (D-1, fail closed): wrong shape, undecodable
 * payload, non-JSON payload, missing `exp`, or a non-finite `exp`.
 */
function readExpClaim(token: string): number | null {
  const segments = token.split('.')
  if (segments.length !== 3) return null

  try {
    const payload = JSON.parse(decodeBase64UrlSegment(segments[1])) as unknown
    if (typeof payload !== 'object' || payload === null) return null

    const exp = (payload as Record<string, unknown>).exp
    if (typeof exp !== 'number' || !Number.isFinite(exp)) return null
    return exp
  } catch {
    return null
  }
}

/**
 * Decodes a base64url JWT segment. JWTs use base64url (`-`/`_` instead of
 * `+`/`/`, no padding) while `atob` expects standard base64 — translate the
 * alphabet and restore padding first (D-10). `atob` yields a latin1 byte
 * string rather than decoded UTF-8, which is fine here: the only claim this
 * module reads is `exp`, numeric and ASCII, so it round-trips through
 * `JSON.parse` regardless of any multibyte characters elsewhere in the
 * payload — a future change that needs a text claim verbatim would need
 * `TextDecoder` instead.
 */
function decodeBase64UrlSegment(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  return atob(padded)
}
