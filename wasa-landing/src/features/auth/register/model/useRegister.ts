import { registerSchema, type UserRegister } from '@entities/user'
import { registerApi } from '@features/auth/register/api/registerApi'
import { resolveRegisterErrorMessage } from '@features/auth/lib/authMessages'
import { useAuthFormSubmit } from '@features/auth/lib/useAuthFormSubmit'

export interface UseRegisterOptions {
  /** Invocada exactamente una vez, después de que la sesión ya figura autenticada (D-9). */
  onSuccess: () => void
}

/**
 * Orquesta el registro: validación local → `registerApi` → sesión
 * establecida en `authStore` (sin requerir un login posterior) → aviso al
 * contenedor. Mismo contrato de éxito que `useLogin`, vía la orquestación
 * compartida de `lib/useAuthFormSubmit` (grupo 7.6, refactor); el mensaje de
 * fallo se resuelve con el mapa propio de registro porque un mismo status
 * significa cosas distintas por operación (D-5).
 */
export function useRegister({ onSuccess }: UseRegisterOptions) {
  return useAuthFormSubmit<UserRegister>({
    schema: registerSchema,
    apiCall: registerApi,
    resolveErrorMessage: resolveRegisterErrorMessage,
    onSuccess,
  })
}
