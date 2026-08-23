import type { SVGProps } from 'react'
import { cn } from '@shared/lib/utils'

export type SpinnerSize = 'sm' | 'md'

/**
 * Tailwind size classes per `SpinnerSize` (design.md D-6): kept in one map
 * so CHANGE-20 can swap raw utilities for tokens without touching the JSX
 * or breaking the tests that only assert the classes differ (R-1).
 */
const SIZE_CLASSES: Record<SpinnerSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
}

export interface SpinnerProps extends Omit<SVGProps<SVGSVGElement>, 'className'> {
  /** Visual size, read from `SIZE_CLASSES` (D-6). */
  size?: SpinnerSize
  /**
   * Accessible label. Omitted (default): the spinner is purely decorative
   * (`aria-hidden`), which is correct when it lives inside a control that
   * already announces its own busy state (e.g. `Button loading`, D-14).
   * Provided: the spinner announces itself via `role="status"`.
   */
  label?: string
  className?: string
}

/**
 * SVG loading indicator, inline (no icon library) so it inherits color via
 * `currentColor` from whatever styles its container (D-14).
 */
export function Spinner({ size = 'md', label, className, ...rest }: SpinnerProps) {
  const svg = (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden={label ? undefined : 'true'}
      className={cn('animate-spin', SIZE_CLASSES[size], className)}
      {...rest}
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )

  if (!label) return svg

  // role="status" takes its accessible name from an author-supplied
  // attribute, not from content (WAI-ARIA "Name from: author") — aria-label
  // is what getByRole('status', { name }) resolves against.
  return (
    <span role="status" aria-label={label}>
      {svg}
    </span>
  )
}
