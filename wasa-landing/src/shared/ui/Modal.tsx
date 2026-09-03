import type { MouseEvent, ReactNode } from 'react'
import { useEffect, useId } from 'react'
import { cn } from '@shared/lib/utils'

export type ModalMaxWidth = 'sm' | 'lg'

const MAX_WIDTH_CLASSES: Record<ModalMaxWidth, string> = {
  sm: 'max-w-md',
  lg: 'max-w-2xl',
}

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  /** Ancho máximo del diálogo (D-8): unión cerrada, no `className` libre — `'sm'` (por defecto) es el ancho estrecho actual, `'lg'` el ancho amplio que ya usaba el detalle de vulnerabilidad. */
  maxWidth?: ModalMaxWidth
  /** Etiqueta accesible del botón de cierre (P-1). Sin ella, el botón no se renderiza — el consumidor decide si lo necesita. */
  closeLabel?: string
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
export function Modal({ isOpen, onClose, title, maxWidth = 'sm', closeLabel, children }: ModalProps) {
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
        className={cn(
          'max-h-[85vh] w-full overflow-y-auto rounded-lg bg-slate-900 p-6 text-slate-100',
          MAX_WIDTH_CLASSES[maxWidth],
        )}
      >
        {/*
          Gateado sólo por `title` (fix de code-review, hallazgo #5): los
          tres consumidores reales siempre pasan `title` junto con
          `closeLabel` — un `closeLabel` sin `title` era rama muerta. Si
          aparece un consumidor real que sólo necesite el botón de cierre,
          se puede volver a abrir esa rama entonces.
        */}
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            {closeLabel && (
              <button
                type="button"
                onClick={onClose}
                aria-label={closeLabel}
                className="text-2xl leading-none text-slate-400 hover:text-slate-100"
              >
                &times;
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
