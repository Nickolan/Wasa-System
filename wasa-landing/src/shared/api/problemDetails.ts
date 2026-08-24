/**
 * Contrato de error RFC 7807 (Problem Details) del FastAPI Bridge,
 * declarado una única vez para todo el frontend (D-4 de design.md,
 * `http-client`). Las slices de dominio (`entities/scan`, `entities/user`)
 * lo alias-exportan bajo su propio nombre; ninguna vuelve a enumerar sus
 * cinco miembros.
 *
 * Los nombres de los miembros son exactamente los que usa el Bridge en el
 * cable, sin renombrar a la convención de TypeScript.
 */
export interface ProblemDetails {
  type: string
  title: string
  status: number
  detail: string | null
  instance: string
}

/**
 * Guard de runtime: decide si un cuerpo de error recibido tiene la forma
 * RFC 7807 (D-5). Por el camino del rechazo llega cualquier cosa — un `502`
 * de un proxy, una página HTML, un cuerpo vacío — y asumir la forma sin
 * verificarla produce un mensaje construido sobre valores ausentes.
 *
 * `detail: null` es válido (el Bridge lo emite nulo cuando el estado y el
 * título alcanzan); `detail` ausente no lo es, porque el Bridge siempre
 * emite la clave. Nunca lanza, cualquiera sea la entrada.
 */
export function isProblemDetails(value: unknown): value is ProblemDetails {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false

  const candidate = value as Record<string, unknown>

  return (
    typeof candidate.type === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.status === 'number' &&
    (typeof candidate.detail === 'string' || candidate.detail === null) &&
    typeof candidate.instance === 'string'
  )
}
