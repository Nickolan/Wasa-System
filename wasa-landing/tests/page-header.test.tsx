import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PageHeader } from '@shared/ui/PageHeader'

describe('PageHeader expone el encabezado de primer nivel', () => {
  it('existe un encabezado de nivel 1 cuyo texto es "Panel de resultados"', () => {
    render(<PageHeader title="Panel de resultados" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Panel de resultados' })).toBeInTheDocument()
  })
})

describe('el subtítulo es opcional', () => {
  it('sin subtítulo no agrega ningún párrafo; con subtítulo muestra su texto', () => {
    const { container, rerender } = render(<PageHeader title="Título" />)
    expect(container.querySelector('p')).not.toBeInTheDocument()

    rerender(<PageHeader title="Título" subtitle="Un subtítulo" />)
    expect(screen.getByText('Un subtítulo')).toBeVisible()
  })
})

describe('el espaciado despeja la barra de navegación fija (D-7)', () => {
  it('el contenedor del encabezado declara pt-28', () => {
    render(<PageHeader title="Título" />)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading.parentElement?.className).toMatch(/pt-28/)
  })
})
