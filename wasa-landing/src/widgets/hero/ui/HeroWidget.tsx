import { useId } from 'react'
import { useHeroCta } from '../model/useHeroCta'

const SECTION_CLASSES =
  'flex w-full flex-col items-center gap-6 px-6 py-20 text-center text-slate-100'
const TITLE_CLASSES = 'text-4xl font-bold tracking-tight sm:text-5xl'
const TAGLINE_CLASSES = 'max-w-xl text-lg text-slate-400'
const CTA_CLASSES =
  'rounded-md bg-sky-600 px-6 py-3 text-base font-semibold text-white hover:bg-sky-500'

export interface HeroWidgetProps {
  /** Ancla de la sección del formulario de escaneo — llega por prop (D-2), este widget no importa de la slice del formulario de escaneo. */
  scanFormAnchorId: string
  /** Invocada cuando el CTA se activa sin sesión activa. */
  onRequestLogin: () => void
}

/**
 * Sección de presentación (HU-01-01): título, tagline y un único CTA cuyo
 * destino depende de la sesión (`useHeroCta`, D-2/D-7).
 */
export function HeroWidget({ scanFormAnchorId, onRequestLogin }: HeroWidgetProps) {
  const handleCtaClick = useHeroCta(scanFormAnchorId, onRequestLogin)
  // `landing-composition`: cada sección es una región identificable y con
  // nombre. Un <section> sin nombre accesible no expone `role="region"`.
  const headingId = useId()

  return (
    <section className={SECTION_CLASSES} aria-labelledby={headingId}>
      <h1 id={headingId} className={TITLE_CLASSES}>
        WASA
      </h1>
      <p className={TAGLINE_CLASSES}>
        Automatizá el escaneo de vulnerabilidades de tus aplicaciones web con un flujo guiado,
        pensado para pentesting académico y ético.
      </p>
      <button type="button" onClick={handleCtaClick} className={CTA_CLASSES}>
        Comenzar
      </button>
    </section>
  )
}
