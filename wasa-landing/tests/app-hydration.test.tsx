import { StrictMode } from 'react'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '@app/App'
import { useAuthStore } from '@entities/user'
import { makeJwtExpiringIn } from './support/jwt'

const initialState = useAuthStore.getState()

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState(initialState, true)
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
})

afterEach(() => {
  localStorage.clear()
  vi.useRealTimers()
})

// Rescatada de `landing-page.test.tsx` (pre-CHANGE-19): App ya no monta
// `LandingPage` directamente — la ruta `/` renderiza `HomePage`, que
// incluye `HeroWidget` con el título del producto — pero la aserción de
// que `App` sigue mostrando el contenido de presentación en `/` sigue
// siendo una regresión real a cubrir.
describe('App: renderiza el contenido de presentación en / (regresión de landing-page.test.tsx)', () => {
  it('el árbol de App contiene el título WASA', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: /wasa/i })).toBeInTheDocument()
  })
})

describe('App: la hidratación se dispara al montar (D-6)', () => {
  it('mounting App with a valid persisted session leaves the store authenticated', () => {
    const token = makeJwtExpiringIn(3600)
    localStorage.setItem('wasa.auth', JSON.stringify({ token, email: 'alice@example.com' }))

    render(<App />)

    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(useAuthStore.getState().token).toBe(token)
  })

  it('mounting under StrictMode (double-invoked effects) yields the same final state and no extra storage writes', () => {
    const token = makeJwtExpiringIn(3600)
    localStorage.setItem('wasa.auth', JSON.stringify({ token, email: 'alice@example.com' }))
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(useAuthStore.getState().token).toBe(token)
    expect(setItemSpy).not.toHaveBeenCalled()
    setItemSpy.mockRestore()
  })

  it('mounting with corrupt persisted storage still renders the UI, not-authenticated, without an uncaught error', () => {
    localStorage.setItem('wasa.auth', 'this is not json')

    const { container } = render(<App />)

    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(container.textContent).not.toBe('')
  })
})
