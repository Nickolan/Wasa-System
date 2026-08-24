import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { HowItWorksWidget } from '@widgets/how-it-works'

afterEach(() => {
  cleanup()
})

describe('HowItWorksWidget — al menos cuatro pasos (7.1)', () => {
  it('renderiza al menos cuatro pasos y el primero describe crear la cuenta', () => {
    render(<HowItWorksWidget />)

    const items = screen.getAllByRole('listitem')
    expect(items.length).toBeGreaterThanOrEqual(4)
    expect(items[0].textContent).toMatch(/cuenta/i)
  })
})

describe('HowItWorksWidget — los cuatro momentos del flujo, en orden (7.3)', () => {
  it('crear cuenta, configurar, enviar y ver resultados, en ese orden', () => {
    render(<HowItWorksWidget />)
    const items = screen.getAllByRole('listitem')
    const texts = items.map((item) => item.textContent ?? '')

    expect(texts[0]).toMatch(/cuenta/i)
    expect(texts[1]).toMatch(/config/i)
    expect(texts[2]).toMatch(/env/i)
    expect(texts[3]).toMatch(/resultado/i)
  })
})

describe('HowItWorksWidget — el orden es explícito (7.4)', () => {
  it('los pasos están dentro de una lista ordenada', () => {
    const { container } = render(<HowItWorksWidget />)
    expect(container.querySelector('ol')).not.toBeNull()
  })
})

describe('HowItWorksWidget — API pública (7.5, D-9)', () => {
  it('el arreglo de pasos no sale por el index.ts de la slice', async () => {
    const widgetIndex = await import('@widgets/how-it-works')
    expect((widgetIndex as Record<string, unknown>).STEPS).toBeUndefined()
  })
})
