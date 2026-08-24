import type { AuthApiError } from '@entities/user'

interface AuthRequestErrorInit {
  status: number | null
  problem: AuthApiError | null
}

/**
 * Error de una *petición* de autenticación fallida — no confundir con
 * `AuthApiError`, que describe el *cuerpo* RFC 7807 que puede venir adentro
 * de este error (D-4). `status: null` representa un fallo sin respuesta
 * (red caída, timeout); `problem: null` representa un cuerpo ausente o sin
 * la forma del contrato de error del Bridge.
 */
export class AuthRequestError extends Error {
  readonly status: number | null
  readonly problem: AuthApiError | null

  constructor({ status, problem }: AuthRequestErrorInit) {
    super('Auth request failed')
    this.name = 'AuthRequestError'
    this.status = status
    this.problem = problem
  }
}

const AUTH_API_ERROR_MEMBERS = ['type', 'title', 'status', 'detail', 'instance'] as const

/**
 * Chequeo de forma (D-15), no un schema: la respuesta 2xx se tipa sin
 * re-validar (D-15 en design.md), y el cuerpo de error se acepta solo si
 * trae efectivamente los cinco miembros del contrato del Bridge. Un cuerpo
 * ajeno (p. ej. el HTML de un proxy intermedio) nunca lanza — se rechaza en
 * silencio, y queda como `problem: null`.
 */
export function isAuthApiErrorShape(body: unknown): body is AuthApiError {
  if (typeof body !== 'object' || body === null) return false
  const record = body as Record<string, unknown>
  return AUTH_API_ERROR_MEMBERS.every((member) => member in record)
}

/** Forma mínima de un error de axios que interesa acá — sin depender del tipo de axios. */
interface AxiosLikeError {
  response?: {
    status: number
    data?: unknown
  }
}

/**
 * Traduce un error de axios (con o sin respuesta) al error de cliente de la
 * slice. Cubre las tres ramas de D-14/D-15: con respuesta y cuerpo válido,
 * con respuesta y cuerpo ajeno al contrato, y sin respuesta (red caída,
 * timeout, origen inalcanzable).
 */
export function toAuthRequestError(error: AxiosLikeError): AuthRequestError {
  const response = error.response
  if (!response) {
    return new AuthRequestError({ status: null, problem: null })
  }

  const problem = isAuthApiErrorShape(response.data) ? response.data : null
  return new AuthRequestError({ status: response.status, problem })
}
