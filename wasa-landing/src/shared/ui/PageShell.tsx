import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { cn } from '@shared/lib/utils'

export interface PageShellProps extends ComponentPropsWithoutRef<'main'> {
  children: ReactNode
}

const SHELL_CLASSES = 'flex min-h-screen w-full flex-col bg-surface-base'

/** Contenedor raíz de una página (D-10): alto mínimo de ventana, fondo base y disposición vertical. */
export function PageShell({ children, className, ...rest }: PageShellProps) {
  return (
    <main className={cn(SHELL_CLASSES, className)} {...rest}>
      {children}
    </main>
  )
}
