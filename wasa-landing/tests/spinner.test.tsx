import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Spinner } from '@shared/ui/Spinner'

describe('Spinner: decorativo por defecto', () => {
  it('renders an svg root with animate-spin and aria-hidden="true"', () => {
    const { container } = render(<Spinner />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg).toHaveClass('animate-spin')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('Spinner: anunciado', () => {
  it('exposes a role="status" region with the given accessible name and un-hides the svg', () => {
    const { container } = render(<Spinner label="Cargando" />)
    const status = screen.getByRole('status', { name: 'Cargando' })
    expect(status).toBeInTheDocument()

    const svg = container.querySelector('svg')
    expect(svg).not.toHaveAttribute('aria-hidden', 'true')
  })
})

describe('Spinner: tamaño configurable', () => {
  it('produces a different class for size="sm" vs size="md"', () => {
    const { container: small } = render(<Spinner size="sm" />)
    const { container: medium } = render(<Spinner size="md" />)
    const smallSvg = small.querySelector('svg')
    const mediumSvg = medium.querySelector('svg')
    expect(smallSvg?.getAttribute('class')).not.toBe(mediumSvg?.getAttribute('class'))
  })
})
