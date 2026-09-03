import { MemoryRouter } from 'react-router-dom'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Navbar } from '@widgets/navbar'

function renderNavbar(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Navbar />
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
})

describe('Navbar — entrada a la página de información (task 7.3, D-8, spec about-page)', () => {
  it('existe una entrada "Acerca de" en la presentación de escritorio y en la de móvil', () => {
    renderNavbar()
    const desktopLinks = screen.getAllByRole('link', { name: /acerca de/i })
    // Dos presentaciones (desktop + mobile) renderizan cada una su propio
    // <Link>: el Navbar itera NAV_LINKS dos veces (52-66 y 100-112).
    expect(desktopLinks.length).toBe(2)
    for (const link of desktopLinks) {
      expect(link).toHaveAttribute('href', '/about')
    }
  })

  it('navega internamente: sin recarga, sin abrir ventana nueva', () => {
    renderNavbar()
    const links = screen.getAllByRole('link', { name: /acerca de/i })
    for (const link of links) {
      expect(link).not.toHaveAttribute('target')
      expect(link.tagName).toBe('A')
    }
  })

  it('se marca como activa cuando la ruta actual es /about', () => {
    renderNavbar('/about')
    const links = screen.getAllByRole('link', { name: /acerca de/i })
    for (const link of links) {
      expect(link.className).toMatch(/bg-white\/10/)
    }
  })

  it('no está activa cuando la ruta actual es otra', () => {
    renderNavbar('/')
    const links = screen.getAllByRole('link', { name: /acerca de/i })
    for (const link of links) {
      expect(link.className).not.toMatch(/bg-white\/10/)
    }
  })
})

describe('Navbar — las entradas existentes conservan su comportamiento (task 7.4, TRIANGULATE)', () => {
  it('"Inicio" y "Escanear" siguen presentes y navegan a / y /scan', () => {
    renderNavbar()
    const home = screen.getAllByRole('link', { name: /^inicio$/i })
    const scan = screen.getAllByRole('link', { name: /^escanear$/i })
    expect(home.length).toBe(2)
    expect(scan.length).toBe(2)
    for (const link of home) expect(link).toHaveAttribute('href', '/')
    for (const link of scan) expect(link).toHaveAttribute('href', '/scan')
  })

  it('el botón al Dashboard es navegación interna, en la misma pestaña (CHANGE-26, D-9)', () => {
    renderNavbar()
    const dashboardLinks = screen.getAllByRole('link', { name: /dashboard/i })
    expect(dashboardLinks.length).toBeGreaterThan(0)
    for (const link of dashboardLinks) {
      expect(link).toHaveAttribute('href', '/dashboard')
      expect(link).not.toHaveAttribute('target')
    }
  })
})
