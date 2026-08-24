import { Modal } from '@shared/ui/Modal'
import { LoginForm } from '@features/auth'

export interface LoginModalProps {
  isOpen: boolean
  onClose: () => void
  onSwitchToRegister: () => void
  /** Invocada, además de `onClose`, tras un inicio de sesión exitoso (D-3). Opcional: el cierre no depende de esto. */
  onAuthSuccess?: () => void
}

/**
 * Cáscara sobre `shared/ui/Modal` que hospeda el `LoginForm` existente sin
 * reimplementarlo (D-4, `auth-modal-flow`). No gestiona su propia
 * visibilidad: `isOpen`/`onClose` vienen de afuera, del único dueño del
 * estado de los modales (`useAuthModal`, D-1).
 */
export function LoginModal({ isOpen, onClose, onSwitchToRegister, onAuthSuccess }: LoginModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Iniciar sesión">
      <LoginForm
        onSuccess={() => {
          onClose()
          onAuthSuccess?.()
        }}
        onSwitchToRegister={onSwitchToRegister}
      />
    </Modal>
  )
}
