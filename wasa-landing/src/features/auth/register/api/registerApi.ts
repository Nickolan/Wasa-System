import type { TokenResponse, UserRegister, UserRegisterRequest } from '@entities/user'
import { authHttp } from '@features/auth/lib/authHttp'
import { toAuthRequestError } from '@features/auth/lib/authErrors'

/**
 * Transporte puro del registro. El cuerpo se proyecta campo por campo como
 * `UserRegisterRequest` — nunca con un spread (`{ ...values }`) ni con
 * `delete` (D-8): el Bridge rechaza con 422 cualquier campo extra
 * (`extra="forbid"`), y una allowlist explícita es la única forma de
 * garantizar que un campo agregado al formulario el mes que viene no viaje
 * en silencio. `confirmPassword` es un control de la interfaz, no un dato
 * del dominio, y por eso nunca sale de acá.
 */
export async function registerApi(values: UserRegister): Promise<TokenResponse> {
  const body: UserRegisterRequest = {
    email: values.email,
    password: values.password,
  }

  try {
    const response = await authHttp.post<TokenResponse>('/register', body)
    return response.data
  } catch (error) {
    throw toAuthRequestError(error as Parameters<typeof toAuthRequestError>[0])
  }
}
