import { MemoryRouter } from 'react-router-dom'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@entities/user'
import { axiosInstance } from '@shared/api/axiosInstance'
import { ABOUT_SECTIONS } from '@widgets/about/model/sections'
import AboutPage from '@pages/AboutPage'

const initialState = useAuthStore.getState()

function renderAboutPage() {
  return render(
    <MemoryRouter>
      <AboutPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState(initialState, true)
})

afterEach(() => {
  cleanup()
})

describe('AboutPage — compone PageHeader + AboutWidget + FooterWidget (task 6.4, spec about-page)', () => {
  it('se renderiza completa sin sesión activa, sin muro de autenticación', () => {
    renderAboutPage()

    for (const section of ABOUT_SECTIONS) {
      expect(screen.getByRole('heading', { name: section.title })).toBeInTheDocument()
    }
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /iniciar sesión/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /crear cuenta/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/necesitás una sesión activa/i)).not.toBeInTheDocument()
  })

  it('tiene exactamente un encabezado de primer nivel, "Acerca de WASA" (P-2, unified-design-system)', () => {
    renderAboutPage()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Acerca de WASA' })).toBeInTheDocument()
  })

  it('no emite ninguna solicitud HTTP', () => {
    const adapter = vi.fn()
    axiosInstance.defaults.adapter = adapter
    renderAboutPage()
    expect(adapter).not.toHaveBeenCalled()
  })
})

describe('AboutPage — el contenido es idéntico con sesión activa y sin ella (task 6.5, spec about-page)', () => {
  it('la sesión no cambia el contenido', () => {
    const { container: withoutSession } = renderAboutPage()
    const withoutSessionText = withoutSession.textContent
    cleanup()

    useAuthStore.getState().login('tok', 'a@b.com')
    const { container: withSession } = renderAboutPage()
    expect(withSession.textContent).toBe(withoutSessionText)
  })
})
