import { useId } from 'react'
import { STEPS } from '../model/steps'

const SECTION_CLASSES = 'flex w-full flex-col items-center gap-8 px-6 py-16 text-slate-100'
const HEADING_CLASSES = 'text-2xl font-bold tracking-tight sm:text-3xl'
const LIST_CLASSES = 'grid w-full max-w-4xl list-none grid-cols-1 gap-6 sm:grid-cols-2'
const STEP_CLASSES = 'flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900 p-6'
const STEP_NUMBER_CLASSES = 'text-sm font-semibold text-sky-500'
const STEP_TITLE_CLASSES = 'text-lg font-semibold'
const STEP_DESCRIPTION_CLASSES = 'text-sm text-slate-400'

/**
 * Sección del flujo paso a paso (HU-01-03): pasos numerados, en orden
 * explícito, sin nombrar el orquestador, la cola ni el worker.
 */
export function HowItWorksWidget() {
  // `landing-composition`: cada sección es una región identificable y con
  // nombre. Un <section> sin nombre accesible no expone `role="region"`.
  const headingId = useId()

  return (
    <section className={SECTION_CLASSES} aria-labelledby={headingId}>
      <h2 id={headingId} className={HEADING_CLASSES}>
        Cómo funciona
      </h2>
      <ol className={LIST_CLASSES}>
        {STEPS.map((step, index) => (
          <li key={step.title} className={STEP_CLASSES}>
            <span className={STEP_NUMBER_CLASSES}>Paso {index + 1}</span>
            <h3 className={STEP_TITLE_CLASSES}>{step.title}</h3>
            <p className={STEP_DESCRIPTION_CLASSES}>{step.description}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
