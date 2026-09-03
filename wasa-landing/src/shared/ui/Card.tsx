import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react'
import { cn } from '@shared/lib/utils'

export interface CardProps extends ComponentPropsWithoutRef<'div'> {
  /** Elemento semántico raíz (D-3): `section` cuando la tarjeta es además una región identificable. */
  as?: ElementType
  /** Título opcional, con la jerarquía tipográfica `card-title` del sistema (D-6). Sin título, la tarjeta es un contenedor puro. */
  title?: string
  /** `false` = variante sin `backdrop-filter` (D-4): misma superficie, mismo borde, mismo radio, sin blur. */
  blur?: boolean
  children: ReactNode
}

const TITLE_CLASSES = 'mb-4 text-lg font-bold text-text-primary'

/**
 * Superficie elevada única del sistema (D-4): el tratamiento glassmorphism
 * que la landing ya usa (`.glass-card` + `rounded-2xl`), ahora compartido
 * por cualquier pantalla que necesite una tarjeta de contenido. Contenedor
 * opaco: recibe su contenido por `children` y no lo interpreta.
 */
export function Card({ as: Component = 'div', title, blur = true, className, children, ...rest }: CardProps) {
  return (
    <Component
      className={cn('rounded-2xl p-6', blur ? 'glass-card' : 'glass-card-flat', className)}
      {...rest}
    >
      {title && <h3 className={TITLE_CLASSES}>{title}</h3>}
      {children}
    </Component>
  )
}
