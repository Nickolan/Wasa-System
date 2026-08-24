import { create } from 'zustand'
import { jwtIsExpired } from '@shared/lib/utils'

const STORAGE_KEY = 'wasa.auth'

interface StoredSession {
  token: string
  email: string
}

interface AuthState {
  token: string | null
  email: string | null
  isAuthenticated: boolean
  login: (token: string, email: string) => void
  logout: () => void
  hydrate: () => void
}

/**
 * D-12: this module is the only one in the project that touches
 * `localStorage`. Every access is wrapped in try/catch (D-4): a storage
 * failure degrades persistence, it never breaks the app or propagates to a
 * caller — the in-memory `set()` a caller triggered already stands.
 */
export const useAuthStore = create<AuthState>()((set) => ({
  token: null,
  email: null,
  isAuthenticated: false,
  login: (token, email) => {
    set({ token, email, isAuthenticated: true })
    writeSession({ token, email })
  },
  logout: () => {
    set({ token: null, email: null, isAuthenticated: false })
    clearSession()
  },
  hydrate: () => {
    const raw = readRawSession()
    if (raw === null) {
      set({ token: null, email: null, isAuthenticated: false })
      return
    }

    const session = parseSession(raw)
    if (session && !jwtIsExpired(session.token)) {
      set({ token: session.token, email: session.email, isAuthenticated: true })
      return
    }

    clearSession()
    set({ token: null, email: null, isAuthenticated: false })
  },
}))

function readRawSession(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function writeSession(session: StoredSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    // Persistence degrades; the caller's in-memory set() already stands (D-4).
  }
}

function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // In-memory state is cleared by the caller's set() regardless (D-4).
  }
}

function parseSession(raw: string): StoredSession | null {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>).token !== 'string' ||
      typeof (parsed as Record<string, unknown>).email !== 'string'
    ) {
      return null
    }
    return parsed as StoredSession
  } catch {
    return null
  }
}
