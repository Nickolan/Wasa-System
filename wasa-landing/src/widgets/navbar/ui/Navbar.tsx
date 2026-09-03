import { useState, useEffect, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'

/**
 * D-8 de design.md: el orden refleja el embudo conocer → entender → actuar.
 * "Acerca de" queda entre "Inicio" y "Escanear" — profundiza antes de la
 * acción, sin interponerse entre "Escanear" y el botón del Dashboard.
 */
const NAV_LINKS = [
  { to: '/', label: 'Inicio' },
  { to: '/about', label: 'Acerca de' },
  { to: '/scan', label: 'Escanear' },
] as const

/**
 * Navbar fijo superior con glassmorphism: navegación interna entre páginas
 * y link externo al Dashboard. Responsive con hamburger en mobile.
 */
export function Navbar() {
  const location = useLocation()
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  useEffect(() => {
    function handleScroll() {
      setIsScrolled(window.scrollY > 20)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileOpen(false)
  }, [location.pathname])

  const toggleMobile = useCallback(() => {
    setIsMobileOpen((prev) => !prev)
  }, [])

  return (
    <nav
      className={`glass-nav fixed top-0 right-0 left-0 z-50 transition-all duration-300 ${
        isScrolled ? 'shadow-lg shadow-black/20' : ''
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        {/* Logo */}
        <Link
          to="/"
          className="group flex items-center gap-2 text-xl font-bold tracking-tight text-white"
        >
          <ShieldIcon />
          <span className="text-gradient">WASA</span>
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
                location.pathname === link.to
                  ? 'bg-white/10 text-white'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              {link.label}
            </Link>
          ))}

          <div className="mx-3 h-5 w-px bg-slate-700/50" />

          <Link
            to="/dashboard"
            className="glow-brand inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-sky-500"
          >
            Dashboard
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={toggleMobile}
          className="flex items-center justify-center rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white md:hidden"
          aria-label={isMobileOpen ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={isMobileOpen}
        >
          {isMobileOpen ? <CloseIcon /> : <MenuIcon />}
        </button>
      </div>

      {/* Mobile menu */}
      <div
        className={`overflow-hidden border-t border-slate-800/50 transition-all duration-300 md:hidden ${
          isMobileOpen ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="flex flex-col gap-1 px-6 py-4">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`rounded-lg px-4 py-3 text-sm font-medium transition-all duration-200 ${
                location.pathname === link.to
                  ? 'bg-white/10 text-white'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              {link.label}
            </Link>
          ))}
          <Link
            to="/dashboard"
            className="mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-sky-500"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </nav>
  )
}

/* ── Inline SVG icons ─────────────────────────────────────────────── */

function ShieldIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className="h-7 w-7 text-brand-accent"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3l7.5 3.5v5c0 4.7-3.2 9-7.5 10.5C7.7 20.5 4.5 16.2 4.5 11.5v-5L12 3z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6">
      <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6">
      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}
