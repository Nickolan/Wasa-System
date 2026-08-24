import { Button } from '@shared/ui/Button'
import { Input } from '@shared/ui/Input'
import { useRegister } from '@features/auth/register/model/useRegister'

/**
 * Clases Tailwind planas propias del formulario (design.md 8.8): concentradas
 * acá, un punto por componente, para que CHANGE-20 (design-system) las
 * reemplace por tokens semánticos sin tocar la lógica de arriba.
 */
const FORM_CLASSES = 'flex flex-col gap-4'
const SERVER_ERROR_CLASSES = 'text-sm text-red-500'
const SWITCH_LINK_CLASSES = 'text-sm text-sky-400 underline-offset-2 hover:text-sky-300 hover:underline'

export interface RegisterFormProps {
  /** Invocada exactamente una vez, tras establecerse la sesión (D-9). El formulario no cierra nada por su cuenta. */
  onSuccess: () => void
  /** El formulario no sabe qué hace su contenedor con esto — CHANGE-19 decide (D-13). */
  onSwitchToLogin: () => void
}

/**
 * Formulario de registro. No conoce su contenedor (D-13): no importa
 * `Modal`, no cierra nada, no navega. Toda la orquestación vive en
 * `useRegister`; este componente solo dibuja lo que el hook expone con los
 * primitivos de `shared/ui` (D-1).
 */
export function RegisterForm({ onSuccess, onSwitchToLogin }: RegisterFormProps) {
  const { register, handleSubmit, errors, isSubmitting, serverError } = useRegister({ onSuccess })

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
        autoComplete="new-password"
        error={errors.password?.message}
        {...register('password')}
      />
      <Input
        label="Confirmar contraseña"
        type="password"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register('confirmPassword')}
      />
      {serverError && (
        <p role="alert" className={SERVER_ERROR_CLASSES}>
          {serverError}
        </p>
      )}
      <Button type="submit" loading={isSubmitting}>
        Registrarme
      </Button>
      <button type="button" onClick={onSwitchToLogin} className={SWITCH_LINK_CLASSES}>
        ¿Ya tenés cuenta? Iniciá sesión
      </button>
    </form>
  )
}
