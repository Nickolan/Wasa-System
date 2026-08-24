import { HeroWidget } from '@widgets/hero'
import { FeaturesWidget } from '@widgets/features-section'
import { HowItWorksWidget } from '@widgets/how-it-works'
import { ScanFormWidget, SCAN_FORM_ANCHOR_ID } from '@widgets/scan-form'
import { FooterWidget } from '@widgets/footer'
import { LoginModal, RegisterModal, useAuthModal } from '@widgets/auth-modal'

const MAIN_CLASSES = 'flex min-h-screen w-full flex-col bg-slate-950'

/**
 * La Landing pública de WASA: composición de sus seis widgets, en el orden
 * de la KB (`landing-composition`). Único dueño del estado "qué modal está
 * abierto" (D-1, `useAuthModal`), que reparte a los widgets que lo
 * disparan por callback (D-2) — ningún widget importa de otro.
 */
function LandingPage() {
  const { mode, openLogin, openRegister, close } = useAuthModal()

  // D-3: el éxito de la autenticación, sin importar desde qué disparador se
  // abrió el modal, además de cerrar el diálogo desplaza la vista hasta la
  // sección del formulario recién revelado. `?.()` es defensivo (D-7): un
  // entorno sin `scrollIntoView` (jsdom) no debe romper la acción.
  function scrollToScanForm() {
    document.getElementById(SCAN_FORM_ANCHOR_ID)?.scrollIntoView?.({ behavior: 'smooth' })
  }

  return (
    <main className={MAIN_CLASSES}>
      <HeroWidget scanFormAnchorId={SCAN_FORM_ANCHOR_ID} onRequestLogin={openLogin} />
      <FeaturesWidget />
      <HowItWorksWidget />
      <ScanFormWidget onRequestLogin={openLogin} onRequestRegister={openRegister} />
      <FooterWidget />
      <LoginModal
        isOpen={mode === 'login'}
        onClose={close}
        onSwitchToRegister={openRegister}
        onAuthSuccess={scrollToScanForm}
      />
      <RegisterModal
        isOpen={mode === 'register'}
        onClose={close}
        onSwitchToLogin={openLogin}
        onAuthSuccess={scrollToScanForm}
      />
    </main>
  )
}

export default LandingPage
