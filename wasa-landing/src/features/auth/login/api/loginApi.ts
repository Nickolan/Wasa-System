import type { TokenResponse, UserLogin } from '@entities/user'
import { authHttp } from '@features/auth/lib/authHttp'
import { toAuthRequestError } from '@features/auth/lib/authErrors'

/**
 * Transporte puro (D-5, D-15): emite el `POST` de inicio de sesión y
 * devuelve el cuerpo de la respuesta tal como lo emite el Bridge, sin
 * decidir mensajes de usuario ni tocar el store de sesión. Ante cualquier
 * respuesta no exitosa lanza `AuthRequestError` — nunca un `try/catch` que
 * trague el fallo.
 */
export async function loginApi(values: UserLogin): Promise<TokenResponse> {
  try {
    const response = await authHttp.post<TokenResponse>('/login', {
      email: values.email,
      password: values.password,
    })
    return response.data
  } catch (error) {
    throw toAuthRequestError(error as Parameters<typeof toAuthRequestError>[0])
  }
}
