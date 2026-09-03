import { useCallback, useState } from 'react'
import type { ScanResponse } from '@entities/scan'
import { ScanFormWidget } from '@widgets/scan-form'
import { ScanPendingWidget } from '@widgets/scan-pending'
import { FooterWidget } from '@widgets/footer'
import { LoginModal, RegisterModal, useAuthModal } from '@widgets/auth-modal'
import { PageShell } from '@shared/ui/PageShell'
import { PageHeader } from '@shared/ui/PageHeader'

/**
 * Página de escaneo: sostiene el estado de aceptación (design.md D-1) y
 * decide qué widget renderizar en su lugar —el formulario con auth wall, o
 * la pantalla de espera una vez aceptado el escaneo. Es estado en memoria
 * (`useState`, D-5): un remontaje de la página vuelve al formulario.
 */
function ScanPage() {
  const { mode, openLogin, openRegister, close } = useAuthModal()
  const [acceptedScan, setAcceptedScan] = useState<ScanResponse | null>(null)

  // `useCallback`: identidad estable para que el `useEffect` de `ScanForm`
  // (dependencia `[scanResponse, onAccepted]`) se dispare una sola vez.
  const handleScanAccepted = useCallback((response: ScanResponse) => {
    setAcceptedScan(response)
  }, [])

  return (
    <PageShell>
      {acceptedScan ? (
        <>
          {/* Encabezado de página: cambia con el estado (D-1) — no tiene
              sentido anunciar "Iniciar Escaneo" sobre una pantalla que dice
              que el escaneo ya arrancó. */}
          <PageHeader title="Escaneo en curso" />
          <ScanPendingWidget scan={acceptedScan} />
        </>
      ) : (
        <>
          <PageHeader
            title="Iniciar Escaneo"
            subtitle="Configurá los parámetros del análisis y lanzá un escaneo de vulnerabilidades sobre tu aplicación web objetivo."
          />
          <ScanFormWidget
            onRequestLogin={openLogin}
            onRequestRegister={openRegister}
            onScanAccepted={handleScanAccepted}
          />
        </>
      )}

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
    </PageShell>
  )
}

export default ScanPage
