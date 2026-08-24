import { Link } from 'react-router-dom'

/**
 * Pie de página: identidad del proyecto, links de navegación y marco académico.
 */
export function FooterWidget() {
  return (
    <footer className="w-full border-t border-slate-800/50 bg-slate-950/80">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 py-10">
        <div className="flex items-center gap-6 text-sm text-slate-500">
          <Link to="/" className="transition-colors hover:text-slate-300">Inicio</Link>
          <span className="text-slate-800">·</span>
          <Link to="/scan" className="transition-colors hover:text-slate-300">Escanear</Link>
          <span className="text-slate-800">·</span>
          <span>WASA — Web Application Security Analyzer</span>
        </div>
        <p className="text-xs text-slate-600">
          Proyecto Final de Ciberseguridad — trabajo académico. Uso exclusivamente ético y autorizado.
        </p>
      </div>
    </footer>
  )
}
