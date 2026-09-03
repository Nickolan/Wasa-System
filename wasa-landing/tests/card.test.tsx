import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Card } from '@shared/ui/Card'

describe('Card sin título es un contenedor puro', () => {
  it('el contenido es visible y no hay ningún encabezado en el árbol', () => {
    render(<Card>contenido</Card>)
    expect(screen.getByText('contenido')).toBeVisible()
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })
})

describe('Card con título renderiza su encabezado', () => {
  it('"Distribución" aparece como encabezado y el contenido sigue siendo visible', () => {
    render(<Card title="Distribución">contenido</Card>)
    expect(screen.getByRole('heading', { name: 'Distribución' })).toBeInTheDocument()
    expect(screen.getByText('contenido')).toBeVisible()
  })
})

describe('el elemento raíz es configurable', () => {
  it('pidiendo section como raíz y un nombre accesible, existe una región con ese nombre', () => {
    render(
      <Card as="section" aria-label="Panel de indicadores">
        contenido
      </Card>,
    )
    expect(screen.getByRole('region', { name: 'Panel de indicadores' })).toBeInTheDocument()
  })

  it('por defecto no declara un rol de región (raíz genérica div)', () => {
    render(<Card>contenido</Card>)
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })
})

describe('className del consumidor se fusiona', () => {
  it('la clase del consumidor prevalece sobre una interna del mismo grupo de utilidades, sin duplicar', () => {
    render(
      <Card className="rounded-none" data-testid="card-root">
        contenido
      </Card>,
    )
    const root = screen.getByTestId('card-root')
    expect(root.className).toContain('rounded-none')
    expect(root.className).not.toMatch(/\brounded-2xl\b/)
  })
})
