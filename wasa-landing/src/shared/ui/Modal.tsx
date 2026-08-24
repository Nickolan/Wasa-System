import type { MouseEvent, ReactNode } from 'react'
import { useEffect, useId } from 'react'

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}

/**
 * Fully controlled: `isOpen` + `onClose` are the only source of truth.
 * Unmounts (`return null`) instead of hiding when closed (D-11) — this
 * resets `children`'s state for free (a reopened auth modal starts with a
 * clean form) and avoids leaving hidden-but-focusable inputs reachable by
 * Tab. `children` is an opaque slot: the Modal has no idea whether it holds
 * an auth form or a scan form.
 */
export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  const titleId = useId()

  // Escape listener lives on `document` only while open, and its cleanup
  // removes it on close/unmount (D-12) — an orphaned listener would close a
  // modal that's no longer there, or call onClose on an unmounted component.
  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Blocks page scroll while open; restores whatever `overflow` the body
  // had before (not an assumed `""`), so this composes with any other code
  // that might also set body overflow (D-13).
  useEffect(() => {
    if (!isOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  if (!isOpen) return null

  // Closes only when the click lands on the backdrop itself, not when it
  // bubbles up from content — `target === currentTarget`, not
  // `stopPropagation()` in the content, so ancestor click handlers and
  // click-outside patterns from the consumer keep working (D-12).
  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose()
  }

  return (
    <div
      data-testid="modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={handleBackdropClick}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className="w-full max-w-md rounded-lg bg-slate-900 p-6 text-slate-100"
      >
        {title && (
          <h2 id={titleId} className="mb-4 text-lg font-semibold">
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>
  )
}
