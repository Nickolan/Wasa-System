import { useId } from 'react'
import { TOOLS } from '../model/tools'

const SECTION_CLASSES = 'flex w-full flex-col items-center gap-8 px-6 py-16 text-slate-100'
const HEADING_CLASSES = 'text-2xl font-bold tracking-tight sm:text-3xl'
const GRID_CLASSES = 'grid w-full max-w-4xl grid-cols-1 gap-6 sm:grid-cols-2'
const CARD_CLASSES = 'flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900 p-6'
const CARD_NAME_CLASSES = 'text-lg font-semibold'
const CARD_DESCRIPTION_CLASSES = 'text-sm text-slate-400'
const ICON_CLASSES = 'h-8 w-8 text-sky-500'

/** Ícono decorativo (D-10): no aporta el nombre accesible, que sale del texto. */
function ToolIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={ICON_CLASSES}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

/**
 * Sección de herramientas (HU-01-02): una tarjeta por herramienta que
 * ejecuta el orquestador, con nombre, ícono decorativo y qué detecta.
 */
export function FeaturesWidget() {
  // `landing-composition`: cada sección es una región identificable y con
  // nombre. Un <section> sin nombre accesible no expone `role="region"`.
  const headingId = useId()

  return (
    <section className={SECTION_CLASSES} aria-labelledby={headingId}>
      <h2 id={headingId} className={HEADING_CLASSES}>
        Qué ejecuta WASA
      </h2>
      <div className={GRID_CLASSES}>
        {TOOLS.map((tool) => (
          <div key={tool.name} className={CARD_CLASSES}>
            <ToolIcon />
            <h3 className={CARD_NAME_CLASSES}>{tool.name}</h3>
            <p className={CARD_DESCRIPTION_CLASSES}>{tool.description}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
