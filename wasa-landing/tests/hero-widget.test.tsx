import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { HeroWidget } from '@widgets/hero'

afterEach(() => {
  cleanup()
})

/**
 * `HeroWidget` navega con `useNavigate()` (react-router-dom desde CHANGE-19
 * "Estilos de frontend afinados", commit a799400): necesita un `<Router>`
 * como ancestro incluso para un render sin interacción. `/scan` se resuelve
 * con un marcador propio en vez de montar `ScanPage` real, para mantener
 * este test acotado a lo que le compete a `HeroWidget`: que navega, no a
 * dónde lleva esa ruta en la app real.
 */
function renderHero() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HeroWidget />} />
        <Route path="/scan" element={<div>scan-page-marker</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('HeroWidget — contenido mínimo (5.1)', () => {
  it('renderiza el título del producto, un tagline y un solo CTA', () => {
    renderHero()

    expect(screen.getByText(/WASA/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /comenzar escaneo/i })).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
})

describe('HeroWidget — el CTA navega al flujo de escaneo (5.3, post-CHANGE-19)', () => {
  // El diseño previo a CHANGE-19 abría un modal de login o desplazaba la
  // vista según la sesión (D-1..D-7 de la Landing original, ver
  // git history de useHeroCta.ts). Desde el split HomePage/ScanPage esa
  // decisión vive en `ScanPage` (auth wall del `ScanFormWidget`): el CTA
  // del Hero solo navega, sin importar el estado de sesión.
  it('al hacer click navega a /scan', async () => {
    const user = userEvent.setup()
    renderHero()

    await user.click(screen.getByRole('button', { name: /comenzar escaneo/i }))

    expect(screen.getByText('scan-page-marker')).toBeInTheDocument()
  })
})

describe('HeroWidget — límites de la slice (5.7, D-2)', () => {
  it('no importa de @widgets/scan-form ni de otra slice de widgets', async () => {
    const { readFileSync } = await import('node:fs')
    const path = await import('node:path')
    const widgetSource = readFileSync(
      path.resolve(__dirname, '../src/widgets/hero/ui/HeroWidget.tsx'),
      'utf-8',
    )
    expect(widgetSource).not.toMatch(/@widgets\//)
  })
})
