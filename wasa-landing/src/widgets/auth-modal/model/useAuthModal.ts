import { useCallback, useState } from 'react'

/**
 * D-1: el estado de los modales de autenticación es una unión de tres
 * situaciones, no dos booleanos independientes. "Los dos abiertos" es
 * irrepresentable en el tipo, no evitado por disciplina.
 */
export type AuthModalMode = 'login' | 'register' | null

export interface AuthModalState {
  mode: AuthModalMode
  openLogin: () => void
  openRegister: () => void
  close: () => void
}

/**
 * Único dueño del estado "qué modal está abierto" en toda la Landing
 * (D-1). Su único llamador SHALL ser `pages/LandingPage` — los widgets que
 * disparan una apertura reciben `openLogin`/`openRegister` por prop, nunca
 * llaman a este hook ellos mismos.
 */
export function useAuthModal(): AuthModalState {
  const [mode, setMode] = useState<AuthModalMode>(null)

  const openLogin = useCallback(() => setMode('login'), [])
  const openRegister = useCallback(() => setMode('register'), [])
  const close = useCallback(() => setMode(null), [])

  return { mode, openLogin, openRegister, close }
}
