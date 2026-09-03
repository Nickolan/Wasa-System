import type { ComponentPropsWithoutRef, Ref } from 'react'
import { useId } from 'react'
import { cn, resolveFieldMessage } from '@shared/lib/utils'

const BASE_CLASSES =
  'w-full rounded-md border bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2'

/**
 * Border classes per state (design.md D-6), kept in one map so CHANGE-20 can
 * replace them with semantic tokens without touching logic or tests — the
 * tests only assert "the error/valid border class is present", never a
 * concrete color (R-1).
 */
const STATE_CLASSES = {
  rest: 'border-slate-700 focus:ring-sky-600',
  error: 'border-red-500 focus:ring-red-500',
  valid: 'border-success focus:ring-success',
} as const

export interface InputProps extends ComponentPropsWithoutRef<'input'> {
  label: string
  error?: string
  helper?: string
  valid?: boolean
  ref?: Ref<HTMLInputElement>
}

/**
 * Label, error message and helper text are associated to the control via
 * `useId()`-derived ids (D-7): a fixed id would collide when two instances
 * of the same field render at once (e.g. two password fields in a modal).
 * `error` takes precedence over `helper` — showing both would duplicate
 * what `aria-describedby` reads and compete for the user's attention right
 * when a single instruction is needed.
 */
export function Input({
  label,
  error,
  helper,
  valid = false,
  id,
  className,
  ref,
  ...rest
}: InputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const { text: message, id: messageId, isError } = resolveFieldMessage(inputId, error, helper)

  const stateClass = isError ? STATE_CLASSES.error : valid ? STATE_CLASSES.valid : STATE_CLASSES.rest

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-medium text-slate-200">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={isError ? 'true' : undefined}
        aria-describedby={messageId}
        className={cn(BASE_CLASSES, stateClass, className)}
        {...rest}
      />
      {message && (
        <p id={messageId} className={isError ? 'text-sm text-red-500' : 'text-sm text-slate-400'}>
          {message}
        </p>
      )}
    </div>
  )
}
