import { useAuthStore } from '@entities/user'

/**
 * Decide el destino del CTA principal de la presentación (D-2, D-7):
 * sin sesión abre el modal de inicio de sesión; con sesión desplaza la
 * vista hasta el ancla de la sección del formulario de escaneo. El
 * componente queda sin lógica condicional propia.
 */
export function useHeroCta(scanFormAnchorId: string, onRequestLogin: () => void) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  return function handleCtaClick() {
    if (!isAuthenticated) {
      onRequestLogin()
      return
    }

    // jsdom no implementa `scrollIntoView` (es `undefined`, no un no-op):
    // la llamada al método es opcional, no sólo el acceso al elemento
    // (D-7) — así un entorno sin desplazamiento, o un ancla ausente, no
    // rompen la acción.
    const element = document.getElementById(scanFormAnchorId)
    element?.scrollIntoView?.({ behavior: 'smooth' })
  }
}
