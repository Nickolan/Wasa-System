import { useId } from 'react'
import { STEPS } from '../model/steps'

const ANIMATION_DELAYS = [
  'animation-delay-100',
  'animation-delay-200',
  'animation-delay-300',
  'animation-delay-400',
] as const

/**
 * Sección del flujo paso a paso: pasos numerados con diseño de timeline,
 * gradientes en los badges y animaciones de entrada escalonadas.
 */
export function HowItWorksWidget() {
  const headingId = useId()

  return (
    <section
      className="relative flex w-full flex-col items-center gap-12 px-6 py-24 text-slate-100"
      aria-labelledby={headingId}
    >
      <div className="flex flex-col items-center gap-3">
        <span className="text-sm font-semibold tracking-wider text-sky-400 uppercase">
          Proceso
        </span>
        <h2 id={headingId} className="text-3xl font-bold tracking-tight sm:text-4xl">
          Cómo funciona
        </h2>
        <p className="max-w-lg text-center text-base text-slate-400">
          Cuatro pasos simples para analizar la seguridad de tu aplicación web.
        </p>
      </div>

      <ol className="relative flex w-full max-w-4xl flex-col gap-0 sm:gap-0">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className={`animate-fade-in-up relative flex gap-6 pb-12 last:pb-0 ${ANIMATION_DELAYS[index] ?? ''}`}
          >
            {/* Timeline line */}
            {index < STEPS.length - 1 && (
              <div className="absolute top-12 left-5 h-[calc(100%-2rem)] w-px bg-gradient-to-b from-sky-500/40 to-transparent" />
            )}

            {/* Step number badge */}
            <div className="relative z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-sky-700 text-sm font-bold text-white shadow-lg shadow-sky-500/20">
              {index + 1}
            </div>

            {/* Content card */}
            <div className="glass-card flex-1 rounded-2xl p-6 transition-all duration-300 hover:scale-[1.01]">
              <h3 className="text-lg font-bold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
