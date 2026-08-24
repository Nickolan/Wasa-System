const FOOTER_CLASSES = 'flex w-full flex-col items-center gap-1 border-t border-slate-800 px-6 py-8 text-center text-sm text-slate-500'

/**
 * Pie de página: identidad del proyecto y marco académico. No ofrece
 * ningún control de sesión ni acción que modifique el estado de la
 * aplicación — su contenido es idéntico en los dos estados de sesión.
 */
export function FooterWidget() {
  return (
    <footer className={FOOTER_CLASSES}>
      <p>WASA — Web Application Security Analyzer</p>
      <p>Proyecto Final de Ciberseguridad — trabajo académico.</p>
    </footer>
  )
}
