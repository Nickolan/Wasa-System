import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '@entities/user'
import { FooterWidget } from '@widgets/footer'

const initialState = useAuthStore.getState()

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState(initialState, true)
})

afterEach(() => {
  cleanup()
})

describe('FooterWidget — presente con la identidad del proyecto (8.1)', () => {
  it('renderiza un elemento contentinfo con "WASA"', () => {
    render(<FooterWidget />)

    const footer = screen.getByRole('contentinfo')
    expect(footer).toBeInTheDocument()
    expect(footer.textContent).toMatch(/WASA/)
  })
})

describe('FooterWidget — no ofrece acciones de sesión (8.3)', () => {
  it('sin sesión: no hay controles de login/registro/logout', () => {
    render(<FooterWidget />)

    expect(screen.queryByRole('button', { name: /iniciar sesión/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /crear cuenta/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /cerrar sesión/i })).toBeNull()
  })

  it('con sesión: el contenido es idéntico, sigue sin controles de sesión', () => {
    useAuthStore.getState().login('tok', 'a@b.com')
    const { container: withSession } = render(<FooterWidget />)
    const withSessionText = withSession.textContent
    cleanup()

    const { container: withoutSession } = render(<FooterWidget />)
    expect(withSessionText).toBe(withoutSession.textContent)
    expect(screen.queryByRole('button', { name: /cerrar sesión/i })).toBeNull()
  })
})
