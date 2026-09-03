import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PageShell } from '@shared/ui/PageShell'

describe('PageShell envuelve el contenido de la página', () => {
  it('el contenido es visible dentro de un elemento main', () => {
    render(<PageShell>contenido</PageShell>)
    const main = screen.getByRole('main')
    expect(main).toBeVisible()
    expect(main).toHaveTextContent('contenido')
  })

  it('declara alto mínimo de ventana, fondo base y disposición vertical', () => {
    render(<PageShell>contenido</PageShell>)
    const main = screen.getByRole('main')
    expect(main.className).toMatch(/min-h-screen/)
    expect(main.className).toMatch(/flex-col/)
    expect(main.className).toMatch(/bg-slate-950|bg-surface-base/)
  })
})
