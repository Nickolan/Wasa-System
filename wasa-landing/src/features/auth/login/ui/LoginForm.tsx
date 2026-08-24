import { Button } from '@shared/ui/Button'
import { Input } from '@shared/ui/Input'
import { useLogin } from '@features/auth/login/model/useLogin'

/**
 * Clases Tailwind planas propias del formulario (design.md 8.8): concentradas
 * acá, un punto por componente, para que CHANGE-20 (design-system) las
 * reemplace por tokens semánticos sin tocar la lógica de arriba.
 */
const FORM_CLASSES = 'flex flex-col gap-4'
const SERVER_ERROR_CLASSES = 'text-sm text-red-500'
const SWITCH_LINK_CLASSES = 'text-sm text-sky-400 underline-offset-2 hover:text-sky-300 hover:underline'

export interface LoginFormProps {
  /** Invocada exactamente una vez, tras establecerse la sesión (D-9). El formulario no cierra nada por su cuenta. */
  onSuccess: () => void
  /** El formulario no sabe qué hace su contenedor con esto — CHANGE-19 decide (D-13). */
  onSwitchToRegister: () => void
}

/**
 * Formulario de inicio de sesión. No conoce su contenedor (D-13): no importa
 * `Modal`, no cierra nada, no navega. Toda la orquestación —validación,
 * request, sesión, mensaje de error— vive en `useLogin`; este componente
 * solo dibuja lo que el hook expone con los primitivos de `shared/ui`
 * (D-1), sin definir controles equivalentes propios.
 */
export function LoginForm({ onSuccess, onSwitchToRegister }: LoginFormProps) {
  const { register, handleSubmit, errors, isSubmitting, serverError } = useLogin({ onSuccess })

  return (
    <form onSubmit={handleSubmit} noValidate className={FORM_CLASSES}>
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />
      <Input
        label="Contraseña"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password')}
      />
      {serverError && (
        <p role="alert" className={SERVER_ERROR_CLASSES}>
          {serverError}
        </p>
      )}
      <Button type="submit" loading={isSubmitting}>
        Ingresar
      </Button>
      <button type="button" onClick={onSwitchToRegister} className={SWITCH_LINK_CLASSES}>
        ¿No tenés cuenta? Registrate
      </button>
    </form>
  )
}
