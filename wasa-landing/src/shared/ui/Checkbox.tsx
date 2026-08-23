import type { ComponentPropsWithoutRef, Ref } from 'react'
import { useId } from 'react'
import { cn, resolveFieldMessage } from '@shared/lib/utils'

const BASE_CLASSES = 'h-4 w-4 rounded border bg-slate-900 text-sky-600 focus:outline-none focus:ring-2'

/** Border classes per state (design.md D-6), same map shape as `Input`'s. */
const STATE_CLASSES = {
  rest: 'border-slate-700 focus:ring-sky-600',
  error: 'border-red-500 focus:ring-red-500',
} as const

export interface CheckboxProps extends ComponentPropsWithoutRef<'input'> {
  label: string
  error?: string
  ref?: Ref<HTMLInputElement>
}

/**
 * The label wraps the control so a click anywhere on its text toggles the
 * checkbox — no separate click handler needed, the browser does this for
 * `<label>` elements that contain their control.
 */
export function Checkbox({ label, error, id, className, ref, ...rest }: CheckboxProps) {
  const generatedId = useId()
  const checkboxId = id ?? generatedId
  const { text: message, id: messageId, isError } = resolveFieldMessage(checkboxId, error, undefined)
  const stateClass = isError ? STATE_CLASSES.error : STATE_CLASSES.rest

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={checkboxId} className="flex items-center gap-2 text-sm text-slate-200">
        <input
          ref={ref}
          type="checkbox"
          id={checkboxId}
          aria-invalid={isError ? 'true' : undefined}
          aria-describedby={messageId}
          className={cn(BASE_CLASSES, stateClass, className)}
          {...rest}
        />
        {label}
      </label>
      {message && (
        <p id={messageId} className="text-sm text-red-500">
          {message}
        </p>
      )}
    </div>
  )
}
