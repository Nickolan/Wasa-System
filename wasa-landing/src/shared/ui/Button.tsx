import type { ComponentPropsWithoutRef, Ref } from 'react'
import { cn } from '@shared/lib/utils'
import { Spinner } from '@shared/ui/Spinner'

export type ButtonVariant = 'primary' | 'secondary'

const BASE_CLASSES =
  'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60'

/**
 * Visual classes per `ButtonVariant` (design.md D-6): centralized here so
 * CHANGE-20 can replace flat utilities with semantic tokens in one place,
 * without touching logic or tests (tests only assert the classes differ,
 * never a concrete color — R-1). Chosen to read on the current dark
 * placeholder background (`bg-slate-950`).
 */
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-hover',
  secondary: 'border border-slate-600 bg-transparent text-slate-100 hover:bg-slate-800',
}

/**
 * Clases del `Button` sin renderizar un `<button>` (task 6.2,
 * unified-design-system): para el único caso legítimo de un consumidor que
 * necesita el mismo tratamiento visual sobre un elemento distinto —un
 * `<Link>` de navegación, que no puede ser un `<button>`—. Single source
 * para las dos apariencias, sin duplicar `PRIMARY_ACTION_CLASSES`/
 * `SECONDARY_ACTION_CLASSES` verbatim entre módulos (D-11.5).
 */
export function buttonClasses(variant: ButtonVariant = 'primary'): string {
  return cn(BASE_CLASSES, VARIANT_CLASSES[variant])
}

export interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  variant?: ButtonVariant
  loading?: boolean
  ref?: Ref<HTMLButtonElement>
}

/**
 * `loading` disables the button (`disabled={disabled || loading}`) and sets
 * `aria-busy` so a second click during an in-flight request is impossible at
 * the DOM level, not by convention (D-10). The label stays visible next to
 * the spinner to avoid a layout jump and keep the accessible name stable.
 */
export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  className,
  children,
  ref,
  ...rest
}: ButtonProps) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading}
      className={cn(BASE_CLASSES, VARIANT_CLASSES[variant], className)}
      {...rest}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  )
}
