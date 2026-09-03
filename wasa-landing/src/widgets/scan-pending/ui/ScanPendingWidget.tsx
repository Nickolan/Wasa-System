import { useId } from 'react'
import { Link } from 'react-router-dom'
import type { ScanResponse } from '@entities/scan'
import { buttonClasses } from '@shared/ui/Button'
import { Spinner } from '@shared/ui/Spinner'
import { SCAN_PENDING_COPY } from '../model/copy'

/**
 * Clases Tailwind planas concentradas acá (D-13 de CHANGE-19, mismo patrón
 * que `ScanFormWidget.tsx`), un punto por componente. Las dos salidas
 * consumen `buttonClasses` de `shared/ui/Button` (task 6.2,
 * unified-design-system D-3): son `<Link>`, no `<button>`, así que toman
 * sólo las clases del primitivo en vez de duplicarlas a mano —
 * `PRIMARY_ACTION_CLASSES`/`SECONDARY_ACTION_CLASSES` eran idénticas,
 * verbatim, a las de `ScanFormWidget.tsx` (D-11.5).
 *
 * El indicador de progreso reusa `shared/ui/Spinner` (fix de code-review,
 * hallazgo #3) en vez de un `div` con el truco de borde giratorio hecho a
 * mano — mismo primitivo que ya usan `ScanFormWidget` y `Button`. Tamaño y
 * color (`h-10 w-10 text-sky-600`) igualan el aspecto visual anterior;
 * `Spinner` ya es `aria-hidden` por defecto sin `label`.
 */
const SECTION_CLASSES = 'flex w-full flex-col items-center gap-6 px-6 py-16 text-center text-slate-100'
const SPINNER_CLASSES = 'h-10 w-10 text-sky-600'
const HEADING_CLASSES = 'text-2xl font-bold tracking-tight sm:text-3xl'
const FACTS_CLASSES = 'flex max-w-xl flex-col gap-3 text-base text-slate-300'
const REFERENCE_CLASSES = 'text-xs text-text-muted'
const ACTIONS_CLASSES = 'flex gap-3'

export interface ScanPendingWidgetProps {
  /** La respuesta de aceptación (`202`) del Bridge (design.md D-1). */
  scan: ScanResponse
}

/**
 * Pantalla de espera post-escaneo (`scan-pending-screen`). Reemplaza al
 * formulario dentro de la misma página (`ScanPage`, D-1) — no navega, no se
 * disuelve sola, no depende de ningún temporizador.
 *
 * `role="status"` (no `alert`): es un estado en curso, no un error — se
 * anuncia a las tecnologías asistivas sin interrumpir (spec: "región de
 * estado accesible"). El indicador de progreso es decorativo
 * (`aria-hidden`): el estado se entiende con el texto solo.
 */
export function ScanPendingWidget({ scan }: ScanPendingWidgetProps) {
  const headingId = useId()

  return (
    <section role="status" aria-labelledby={headingId} className={SECTION_CLASSES}>
      <Spinner className={SPINNER_CLASSES} />

      <h2 id={headingId} className={HEADING_CLASSES}>
        {SCAN_PENDING_COPY.heading}
      </h2>

      <div className={FACTS_CLASSES}>
        <p>{SCAN_PENDING_COPY.status}</p>
        <p>{SCAN_PENDING_COPY.duration}</p>
        <p>{SCAN_PENDING_COPY.email}</p>
      </div>

      {/*
        Referencia discreta para soporte y para cruzar contra el Dashboard
        (D-3). Nunca el `message` crudo del Bridge: es un registro del
        orquestador, no texto de interfaz.
      */}
      <p className={REFERENCE_CLASSES}>Referencia: {scan.scan_id}</p>

      <div className={ACTIONS_CLASSES}>
        <Link to="/" className={buttonClasses('primary')}>
          Volver al inicio
        </Link>
        {/*
          CHANGE-26: `/dashboard` ahora es una ruta de esta misma aplicación
          — navegación interna, misma pestaña, en vez del enlace externo que
          este widget tenía antes de la migración.
        */}
        <Link to="/dashboard" className={buttonClasses('secondary')}>
          Ver el Dashboard
        </Link>
      </div>
    </section>
  )
}
