import { useId } from 'react'
import { TOOLS } from '../model/tools'

const ANIMATION_DELAYS = [
  'animation-delay-100',
  'animation-delay-200',
  'animation-delay-300',
  'animation-delay-400',
] as const

/**
 * Sección de herramientas que ejecuta WASA: tarjetas glassmorphism con
 * íconos únicos por herramienta y animaciones de entrada escalonadas.
 */
export function FeaturesWidget() {
  const headingId = useId()

  return (
    <section
      id="features"
      className="relative flex w-full flex-col items-center gap-12 px-6 py-24 text-slate-100"
      aria-labelledby={headingId}
    >
      {/* Subtle gradient backdrop */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900/50 to-slate-950" />

      <div className="relative z-10 flex flex-col items-center gap-3">
        <span className="text-sm font-semibold tracking-wider text-sky-400 uppercase">
          Arsenal de Seguridad
        </span>
        <h2 id={headingId} className="text-3xl font-bold tracking-tight sm:text-4xl">
          Qué ejecuta <span className="text-gradient">WASA</span>
        </h2>
        <p className="max-w-lg text-center text-base text-slate-400">
          Cuatro herramientas líderes en seguridad ofensiva, orquestadas automáticamente
          para un análisis integral de vulnerabilidades.
        </p>
      </div>

      <div className="relative z-10 grid w-full max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {TOOLS.map((tool, index) => (
          <div
            key={tool.name}
            className={`glass-card animate-fade-in-up group flex flex-col gap-4 rounded-2xl p-6 transition-all duration-300 hover:scale-[1.02] ${ANIMATION_DELAYS[index] ?? ''}`}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400 transition-colors group-hover:bg-sky-500/20">
              <ToolIcon name={tool.name} />
            </div>
            <h3 className="text-lg font-bold">{tool.name}</h3>
            <p className="text-sm leading-relaxed text-slate-400">{tool.description}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── Íconos SVG únicos por herramienta ────────────────────────────── */

function ToolIcon({ name }: { name: string }) {
  switch (name) {
    case 'ZAP':
      return <ZapIcon />
    case 'Nuclei':
      return <NucleiIcon />
    case 'ffuf':
      return <FfufIcon />
    case 'SQLMap':
      return <SqlMapIcon />
    default:
      return <DefaultIcon />
  }
}

/** ZAP — lightning bolt / proxy scanner */
function ZapIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  )
}

/** Nuclei — atom / target detection */
function NucleiIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
      <circle cx="12" cy="12" r="3" />
      <ellipse cx="12" cy="12" rx="9" ry="4" />
      <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(60 12 12)" />
      <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(120 12 12)" />
    </svg>
  )
}

/** ffuf — search/fuzzing discovery */
function FfufIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      <circle cx="13" cy="13" r="2.5" />
      <path strokeLinecap="round" d="M15 15l2 2" />
    </svg>
  )
}

/** SQLMap — database injection */
function SqlMapIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v6c0 1.657 3.582 3 8 3s8-1.343 8-3V6" />
      <path d="M4 12v6c0 1.657 3.582 3 8 3s8-1.343 8-3v-6" />
    </svg>
  )
}

function DefaultIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
      <circle cx="12" cy="12" r="9" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}
