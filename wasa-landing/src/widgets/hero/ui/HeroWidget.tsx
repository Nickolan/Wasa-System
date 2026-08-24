import { useNavigate } from 'react-router-dom'

/**
 * Sección hero de presentación: título, tagline y CTA que navega a /scan.
 * Diseño premium con gradientes, grid pattern y animaciones de entrada.
 */
export function HeroWidget() {
  const navigate = useNavigate()

  return (
    <section className="relative flex min-h-[90vh] w-full flex-col items-center justify-center overflow-hidden px-6 py-32 text-center text-slate-100">
      {/* Background layers */}
      <div className="absolute inset-0 bg-grid-pattern" />
      <div className="absolute inset-0 bg-gradient-to-b from-sky-900/20 via-transparent to-slate-950" />
      <div className="animate-glow-pulse absolute top-1/4 left-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-500/10 blur-[120px]" />

      {/* Content */}
      <div className="relative z-10 flex max-w-3xl flex-col items-center gap-8">
        <div className="animate-fade-in-up inline-flex items-center gap-2 rounded-full border border-sky-500/20 bg-sky-500/10 px-4 py-1.5 text-sm font-medium text-sky-300">
          <span className="inline-block h-2 w-2 rounded-full bg-sky-400 animate-[glow-pulse_2s_ease-in-out_infinite]" />
          Web Application Security Assessment
        </div>

        <h1 className="animate-fade-in-up animation-delay-100 text-5xl leading-tight font-extrabold tracking-tight sm:text-6xl lg:text-7xl">
          Escaneá vulnerabilidades con{' '}
          <span className="text-gradient">WASA</span>
        </h1>

        <p className="animate-fade-in-up animation-delay-200 max-w-xl text-lg leading-relaxed text-slate-400">
          Automatizá el análisis de seguridad de tus aplicaciones web con un flujo guiado,
          pensado para pentesting académico y ético. Detectá, analizá y reportá —
          todo desde un solo lugar.
        </p>

        <div className="animate-fade-in-up animation-delay-300 flex flex-col items-center gap-4 sm:flex-row">
          <button
            type="button"
            onClick={() => navigate('/scan')}
            className="glow-brand rounded-xl bg-sky-600 px-8 py-3.5 text-base font-semibold text-white transition-all duration-300 hover:bg-sky-500 hover:scale-[1.02] active:scale-[0.98]"
          >
            Comenzar Escaneo
          </button>
          <a
            href="#features"
            className="rounded-xl border border-slate-700 px-8 py-3.5 text-base font-semibold text-slate-300 transition-all duration-200 hover:border-slate-500 hover:text-white"
          >
            Ver herramientas
          </a>
        </div>

        {/* Stats */}
        <div className="animate-fade-in-up animation-delay-400 mt-8 flex gap-8 text-center sm:gap-16">
          <div>
            <span className="text-2xl font-bold text-white">4</span>
            <p className="text-xs text-slate-500">Herramientas</p>
          </div>
          <div className="h-10 w-px bg-slate-800" />
          <div>
            <span className="text-2xl font-bold text-white">OWASP</span>
            <p className="text-xs text-slate-500">Top 10 Coverage</p>
          </div>
          <div className="h-10 w-px bg-slate-800" />
          <div>
            <span className="text-2xl font-bold text-white">100%</span>
            <p className="text-xs text-slate-500">Automatizado</p>
          </div>
        </div>
      </div>
    </section>
  )
}

export interface HeroWidgetProps {}
