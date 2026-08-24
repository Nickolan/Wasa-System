/**
 * API pública de la slice `widgets/auth-modal` (FSD). Los consumidores
 * importan de acá, nunca de una ruta interna de `model/` o `ui/`.
 */
export { useAuthModal } from './model/useAuthModal'
export type { AuthModalMode, AuthModalState } from './model/useAuthModal'
export { LoginModal } from './ui/LoginModal'
export type { LoginModalProps } from './ui/LoginModal'
export { RegisterModal } from './ui/RegisterModal'
export type { RegisterModalProps } from './ui/RegisterModal'
