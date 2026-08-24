import { useState } from 'react'
import { useForm, type FieldValues } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { ZodType } from 'zod'
import { useAuthStore, type TokenResponse } from '@entities/user'
import { AuthRequestError } from './authErrors'

interface UseAuthFormSubmitOptions<TValues extends FieldValues> {
  schema: ZodType<TValues>
  apiCall: (values: TValues) => Promise<TokenResponse>
  resolveErrorMessage: (status: number | null) => string
  /** Invocada exactamente una vez, después de que la sesión ya figura autenticada (D-9). */
  onSuccess: () => void
}

/**
 * Orquestación compartida entre `useLogin` y `useRegister` (grupo 7.6,
 * refactor tras confirmar duplicación literal): validación local →
 * `apiCall` → sesión establecida en `authStore` (D-9: primero la sesión,
 * después `onSuccess`, y con el email *parseado*) → aviso al contenedor. El
 * `serverError` del intento anterior se limpia al comenzar cada envío
 * (D-11), y `isSubmitting` sale de `formState` de RHF, no de un `useState`
 * paralelo (D-10). Lo único que varía entre login y registro —el schema, la
 * llamada de red y la resolución de mensaje— se inyecta por parámetro,
 * porque el mismo status HTTP significa cosas distintas según la operación
 * (D-5).
 */
export function useAuthFormSubmit<TValues extends FieldValues & { email: string }>({
  schema,
  apiCall,
  resolveErrorMessage,
  onSuccess,
}: UseAuthFormSubmitOptions<TValues>) {
  const form = useForm<TValues>({ resolver: zodResolver(schema) })
  const [serverError, setServerError] = useState<string | null>(null)
  const login = useAuthStore((state) => state.login)

  const handleSubmit = form.handleSubmit(async (values) => {
    setServerError(null)

    try {
      const response = await apiCall(values)
      login(response.access_token, values.email)
      onSuccess()
    } catch (error) {
      const status = error instanceof AuthRequestError ? error.status : null
      setServerError(resolveErrorMessage(status))
    }
  })

  return {
    register: form.register,
    handleSubmit,
    errors: form.formState.errors,
    isSubmitting: form.formState.isSubmitting,
    serverError,
  }
}
