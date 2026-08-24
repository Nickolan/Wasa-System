import { ScanFormWidget } from '@widgets/scan-form'
import { FooterWidget } from '@widgets/footer'
import { LoginModal, RegisterModal, useAuthModal } from '@widgets/auth-modal'

/**
 * Página de escaneo: formulario de escaneo con auth wall + modales de
 * Login/Register. Mantiene toda la funcionalidad existente del
 * ScanFormWidget sin cambios.
 */
function ScanPage() {
  const { mode, openLogin, openRegister, close } = useAuthModal()

  return (
    <main className="flex min-h-screen w-full flex-col bg-slate-950">
      {/* Header visual de la página */}
      <section className="flex flex-col items-center gap-4 px-6 pt-28 pb-8 text-center">
        <h1 className="text-gradient text-3xl font-bold tracking-tight sm:text-4xl">
          Iniciar Escaneo
        </h1>
        <p className="max-w-lg text-base text-slate-400">
          Configurá los parámetros del análisis y lanzá un escaneo de vulnerabilidades
          sobre tu aplicación web objetivo.
        </p>
      </section>

      <ScanFormWidget onRequestLogin={openLogin} onRequestRegister={openRegister} />
      <div className="flex-1" />
      <FooterWidget />

      <LoginModal
        isOpen={mode === 'login'}
        onClose={close}
        onSwitchToRegister={openRegister}
      />
      <RegisterModal
        isOpen={mode === 'register'}
        onClose={close}
        onSwitchToLogin={openLogin}
      />
    </main>
  )
}

export default ScanPage
