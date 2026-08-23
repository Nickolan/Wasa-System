import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@app/stores/authStore'
import { makeJwtExpiringIn } from './support/jwt'
import { withThrowingStorage } from './support/storage'

const initialState = useAuthStore.getState()

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState(initialState, true)
})

afterEach(() => {
  localStorage.clear()
})

/** Asserts the D-8 invariant: isAuthenticated === (token !== null). */
function expectInvariant() {
  const state = useAuthStore.getState()
  expect(state.isAuthenticated).toBe(state.token !== null)
}

describe('useAuthStore: estado inicial e invariante (D-8)', () => {
  it('starts with token null, email null and isAuthenticated false', () => {
    const state = useAuthStore.getState()
    expect(state.token).toBeNull()
    expect(state.email).toBeNull()
    expect(state.isAuthenticated).toBe(false)
  })

  it('exposes exactly token, email, isAuthenticated, login, logout, hydrate — no separate setter', () => {
    const keys = Object.keys(useAuthStore.getState()).sort()
    expect(keys).toEqual(
      ['email', 'hydrate', 'isAuthenticated', 'login', 'logout', 'token'].sort(),
    )
  })
})

describe('test isolation across auth-store tests (D-13, scaffolding proof — not the store itself)', () => {
  it('writes state in the first test', () => {
    useAuthStore.setState({ token: 'leftover-token', email: 'leftover@example.com', isAuthenticated: true })
    expect(useAuthStore.getState().token).toBe('leftover-token')
  })

  it('starts clean in the second test, proving beforeEach resets the singleton store', () => {
    expect(useAuthStore.getState().token).toBeNull()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })
})

describe('useAuthStore.login: establecer y recordar', () => {
  it('establishes the session in memory', () => {
    useAuthStore.getState().login('token-abc', 'alice@example.com')

    const state = useAuthStore.getState()
    expect(state.token).toBe('token-abc')
    expect(state.email).toBe('alice@example.com')
    expect(state.isAuthenticated).toBe(true)
    expectInvariant()
  })

  it('persists the session under the single wasa.auth key as JSON (D-3)', () => {
    useAuthStore.getState().login('token-abc', 'alice@example.com')

    const raw = localStorage.getItem('wasa.auth')
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw as string)).toEqual({ token: 'token-abc', email: 'alice@example.com' })
  })

  it('a second login replaces the first, leaving no trace in state or storage', () => {
    useAuthStore.getState().login('token-first', 'first@example.com')
    useAuthStore.getState().login('token-second', 'second@example.com')

    const state = useAuthStore.getState()
    expect(state.token).toBe('token-second')
    expect(state.email).toBe('second@example.com')

    const stored = JSON.parse(localStorage.getItem('wasa.auth') as string)
    expect(stored).toEqual({ token: 'token-second', email: 'second@example.com' })
  })

  it('writes exactly one localStorage key, with exactly token and email inside', () => {
    useAuthStore.getState().login('token-abc', 'alice@example.com')

    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      keys.push(localStorage.key(i) as string)
    }
    expect(keys).toEqual(['wasa.auth'])

    const stored = JSON.parse(localStorage.getItem('wasa.auth') as string)
    expect(Object.keys(stored).sort()).toEqual(['email', 'token'])
  })

  it('never persists the password used to authenticate', () => {
    const password = 'super-secret-password'
    // The password is only ever known to the caller of login (e.g. the login
    // form of CHANGE-16); login() itself never receives it.
    useAuthStore.getState().login('token-abc', 'alice@example.com')

    const allStoredValues: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      allStoredValues.push(localStorage.getItem(localStorage.key(i) as string) as string)
    }
    expect(allStoredValues.some((value) => value.includes(password))).toBe(false)
  })
})

describe('useAuthStore.logout: borrado local y completo', () => {
  it('returns the state to not-authenticated', () => {
    useAuthStore.getState().login('token-abc', 'alice@example.com')

    useAuthStore.getState().logout()

    const state = useAuthStore.getState()
    expect(state.token).toBeNull()
    expect(state.email).toBeNull()
    expect(state.isAuthenticated).toBe(false)
    expectInvariant()
  })

  it('leaves nothing stored after logout', () => {
    useAuthStore.getState().login('token-abc', 'alice@example.com')

    useAuthStore.getState().logout()

    expect(localStorage.getItem('wasa.auth')).toBeNull()
  })

  it('emits no network request', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    useAuthStore.getState().login('token-abc', 'alice@example.com')

    useAuthStore.getState().logout()

    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('is a no-op (idempotent) when already logged out', () => {
    expect(() => useAuthStore.getState().logout()).not.toThrow()

    const state = useAuthStore.getState()
    expect(state.token).toBeNull()
    expect(state.isAuthenticated).toBe(false)
  })

  it('a closed session does not reappear on the next hydrate (login -> logout -> hydrate)', () => {
    useAuthStore.getState().login('token-abc', 'alice@example.com')
    useAuthStore.getState().logout()

    useAuthStore.getState().hydrate()

    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })
})

describe('useAuthStore.hydrate: restaurar sólo lo vigente', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('restores an authenticated session from a valid stored token', () => {
    const token = makeJwtExpiringIn(3600)
    localStorage.setItem('wasa.auth', JSON.stringify({ token, email: 'alice@example.com' }))

    useAuthStore.getState().hydrate()

    const state = useAuthStore.getState()
    expect(state.token).toBe(token)
    expect(state.email).toBe('alice@example.com')
    expect(state.isAuthenticated).toBe(true)
    expectInvariant()
  })

  it('with no persisted session, hydrating leaves the app not-authenticated without an error', () => {
    expect(() => useAuthStore.getState().hydrate()).not.toThrow()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('the same persisted session hydrates authenticated while valid and not-authenticated once the clock passes exp', () => {
    const token = makeJwtExpiringIn(60)
    localStorage.setItem('wasa.auth', JSON.stringify({ token, email: 'alice@example.com' }))

    useAuthStore.getState().hydrate()
    expect(useAuthStore.getState().isAuthenticated).toBe(true)

    vi.setSystemTime(new Date(Date.now() + 61_000))
    // Re-seed: the first hydrate did not purge (token was valid), but move
    // the clock and hydrate again to observe the verdict flip.
    useAuthStore.getState().hydrate()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('hydrate defers to jwtIsExpired rather than re-implementing the exp comparison', async () => {
    const utils = await import('@shared/lib/utils')
    const spy = vi.spyOn(utils, 'jwtIsExpired')
    const token = makeJwtExpiringIn(3600)
    localStorage.setItem('wasa.auth', JSON.stringify({ token, email: 'alice@example.com' }))

    useAuthStore.getState().hydrate()

    expect(spy).toHaveBeenCalledWith(token)
    spy.mockRestore()
  })
})

describe('useAuthStore.hydrate: sesión inválida, purga y almacenamiento hostil (D-2, D-4)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('an expired stored session leaves the app not-authenticated', () => {
    const token = makeJwtExpiringIn(-3600)
    localStorage.setItem('wasa.auth', JSON.stringify({ token, email: 'alice@example.com' }))

    useAuthStore.getState().hydrate()

    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('purges the expired session from storage (D-2)', () => {
    const token = makeJwtExpiringIn(-3600)
    localStorage.setItem('wasa.auth', JSON.stringify({ token, email: 'alice@example.com' }))

    useAuthStore.getState().hydrate()

    expect(localStorage.getItem('wasa.auth')).toBeNull()
  })

  it('unreadable stored content is purged and leaves the app not-authenticated without an error', () => {
    localStorage.setItem('wasa.auth', 'this is not json')

    expect(() => useAuthStore.getState().hydrate()).not.toThrow()

    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(localStorage.getItem('wasa.auth')).toBeNull()
  })

  it.each([
    ['missing token', { email: 'alice@example.com' }],
    ['missing email', { token: makeJwtExpiringIn(3600) }],
    ['token is a number', { token: 12345, email: 'alice@example.com' }],
    ['email is null', { token: makeJwtExpiringIn(3600), email: null }],
  ])('an incomplete session (%s) is purged and leaves the app not-authenticated', (_label, stored) => {
    localStorage.setItem('wasa.auth', JSON.stringify(stored))

    useAuthStore.getState().hydrate()

    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(localStorage.getItem('wasa.auth')).toBeNull()
  })

  it('hydrating twice on a valid session is idempotent, with no extra writes (D-6/StrictMode)', () => {
    const token = makeJwtExpiringIn(3600)
    localStorage.setItem('wasa.auth', JSON.stringify({ token, email: 'alice@example.com' }))
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')

    useAuthStore.getState().hydrate()
    const afterFirst = { ...useAuthStore.getState() }
    useAuthStore.getState().hydrate()
    const afterSecond = { ...useAuthStore.getState() }

    expect(afterSecond.token).toBe(afterFirst.token)
    expect(afterSecond.email).toBe(afterFirst.email)
    expect(afterSecond.isAuthenticated).toBe(afterFirst.isAuthenticated)
    expect(setItemSpy).not.toHaveBeenCalled()
    setItemSpy.mockRestore()
  })

  it('hydrating twice on an expired session is idempotent, with no extra writes after the first purge', () => {
    const token = makeJwtExpiringIn(-3600)
    localStorage.setItem('wasa.auth', JSON.stringify({ token, email: 'alice@example.com' }))

    useAuthStore.getState().hydrate()
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
    const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem')

    useAuthStore.getState().hydrate()

    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(setItemSpy).not.toHaveBeenCalled()
    expect(removeItemSpy).not.toHaveBeenCalled()
    setItemSpy.mockRestore()
    removeItemSpy.mockRestore()
  })

  it('login with a throwing setItem still authenticates in memory, without an error propagating (D-4)', () => {
    let thrown = false
    withThrowingStorage('setItem', () => {
      try {
        useAuthStore.getState().login('token-abc', 'alice@example.com')
      } catch {
        thrown = true
      }
    })

    expect(thrown).toBe(false)
    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.token).toBe('token-abc')
  })

  it('hydrate with a throwing getItem leaves the app not-authenticated, without an error propagating', () => {
    let thrown = false
    withThrowingStorage('getItem', () => {
      try {
        useAuthStore.getState().hydrate()
      } catch {
        thrown = true
      }
    })

    expect(thrown).toBe(false)
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('logout with a throwing removeItem still clears in-memory state, without an error propagating', () => {
    useAuthStore.getState().login('token-abc', 'alice@example.com')

    let thrown = false
    withThrowingStorage('removeItem', () => {
      try {
        useAuthStore.getState().logout()
      } catch {
        thrown = true
      }
    })

    expect(thrown).toBe(false)
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })
})
