import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from '@app/App'
import { useAuthStore } from '@entities/user'

const initialState = useAuthStore.getState()

function navigateTo(path: string) {
  window.history.pushState({}, '', path)
}

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState(initialState, true)
})

afterEach(() => {
  cleanup()
  navigateTo('/')
})

describe('App — la ruta /about renderiza la página informativa (task 7.1/7.2, spec about-page)', () => {
  it('navegar a /about renderiza la página de información y no HomePage ni ScanPage', () => {
    navigateTo('/about')
    render(<App />)

    expect(screen.getByRole('heading', { name: /qué es wasa/i })).toBeInTheDocument()
    // No es HomePage: el heading distintivo del Hero no está.
    expect(screen.queryByText(/web application security assessment/i)).not.toBeInTheDocument()
    // No es ScanPage: ni su heading ni los campos del formulario están.
    expect(screen.queryByRole('heading', { name: /iniciar escaneo/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/URL objetivo/i)).not.toBeInTheDocument()
  })
})
