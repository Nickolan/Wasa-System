import { loginSchema, type UserLogin } from '@entities/user'
import { loginApi } from '@features/auth/login/api/loginApi'
import { resolveLoginErrorMessage } from '@features/auth/lib/authMessages'
import { useAuthFormSubmit } from '@features/auth/lib/useAuthFormSubmit'

export interface UseLoginOptions {
  /** Invocada exactamente una vez, después de que la sesión ya figura autenticada (D-9). */
  onSuccess: () => void
}

/**
 * Orquesta el inicio de sesión: validación local (puerta previa a la red) →
 * `loginApi` → sesión establecida en `authStore` → aviso al contenedor. La
 * orquestación común con `useRegister` vive en `lib/useAuthFormSubmit`
 * (grupo 7.6, refactor); lo único propio de login es el schema, la llamada
 * de red y la resolución de mensaje — el mismo 401 que acá significa
 * "credenciales incorrectas" no tiene la misma lectura en `useRegister`
 * (D-5).
 */
export function useLogin({ onSuccess }: UseLoginOptions) {
  return useAuthFormSubmit<UserLogin>({
    schema: loginSchema,
    apiCall: loginApi,
    resolveErrorMessage: resolveLoginErrorMessage,
    onSuccess,
  })
}
