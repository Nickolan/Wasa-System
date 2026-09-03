import { Modal } from '@shared/ui/Modal'
import { RegisterForm } from '@features/auth'

export interface RegisterModalProps {
  isOpen: boolean
  onClose: () => void
  onSwitchToLogin: () => void
  /** Invocada, además de `onClose`, tras un registro exitoso (D-3). Opcional: el cierre no depende de esto. */
  onAuthSuccess?: () => void
}

/**
 * Cáscara sobre `shared/ui/Modal` que hospeda el `RegisterForm` existente
 * sin reimplementarlo (D-4, `auth-modal-flow`). No gestiona su propia
 * visibilidad: `isOpen`/`onClose` vienen de afuera, del único dueño del
 * estado de los modales (`useAuthModal`, D-1).
 */
export function RegisterModal({ isOpen, onClose, onSwitchToLogin, onAuthSuccess }: RegisterModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Crear cuenta" closeLabel="Cerrar">
      <RegisterForm
        onSuccess={() => {
          onClose()
          onAuthSuccess?.()
        }}
        onSwitchToLogin={onSwitchToLogin}
      />
    </Modal>
  )
}
