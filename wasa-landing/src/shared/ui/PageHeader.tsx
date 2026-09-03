import type { ReactNode } from 'react'
import { cn } from '@shared/lib/utils'

export interface PageHeaderProps {
  title: string
  subtitle?: ReactNode
  className?: string
}

const SECTION_CLASSES = 'flex flex-col items-center gap-4 px-6 pt-28 pb-8 text-center'
const TITLE_CLASSES = 'text-gradient text-3xl font-bold tracking-tight sm:text-4xl'
const SUBTITLE_CLASSES = 'max-w-2xl text-base leading-relaxed text-text-secondary'

/**
 * Encabezado de página (D-10): título como único `h1` de la página, con la
 * jerarquía `page-title` del sistema (D-6), subtítulo opcional, y el
 * `pt-28` que despeja el `Navbar` fijo (D-7) — hoy repetido a mano tres
 * veces y ausente en una página.
 */
export function PageHeader({ title, subtitle, className }: PageHeaderProps) {
  return (
    <section className={cn(SECTION_CLASSES, className)}>
      <h1 className={TITLE_CLASSES}>{title}</h1>
      {subtitle && <p className={SUBTITLE_CLASSES}>{subtitle}</p>}
    </section>
  )
}
