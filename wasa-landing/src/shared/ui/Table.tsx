import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { cn } from '@shared/lib/utils'

export interface TableProps extends ComponentPropsWithoutRef<'div'> {
  children: ReactNode
}

/**
 * Encabezado y celdas estilados por selector de descendiente, no por que el
 * primitivo interprete filas o columnas (D-3, spec `shared-ui-kit`): las
 * columnas, filas y su contenido llegan íntegros por `children`; `Table`
 * nunca declara una prop que describa su forma.
 */
const TABLE_CLASSES =
  'w-full text-left text-sm text-slate-200 [&_thead_tr]:border-b [&_thead_tr]:border-border-subtle [&_th]:py-2 [&_th]:pr-4 [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-text-secondary [&_td]:border-b [&_td]:border-border-subtle/60 [&_td]:py-2 [&_td]:pr-4'

/**
 * Estructura visual compartida de una tabla de datos (D-3): el contenedor
 * que absorbe el desbordamiento horizontal, el `<table>`, y la apariencia
 * de encabezado y celdas — para que una tabla ancha nunca desplace el
 * documento entero.
 */
export function Table({ children, className, ...rest }: TableProps) {
  return (
    <div className={cn('overflow-x-auto', className)} {...rest}>
      <table className={TABLE_CLASSES}>{children}</table>
    </div>
  )
}
