import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Table } from '@shared/ui/Table'

describe('la tabla renderiza el contenido del consumidor', () => {
  it('existe un elemento table con el encabezado y las dos filas provistas por children', () => {
    render(
      <Table>
        <thead>
          <tr>
            <th scope="col">URL</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>fila-1</td>
          </tr>
          <tr>
            <td>fila-2</td>
          </tr>
        </tbody>
      </Table>,
    )
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText('URL')).toBeInTheDocument()
    expect(screen.getByText('fila-1')).toBeInTheDocument()
    expect(screen.getByText('fila-2')).toBeInTheDocument()
  })
})

describe('el desbordamiento queda contenido', () => {
  it('el contenedor que envuelve al table declara su propio desplazamiento horizontal', () => {
    render(
      <Table>
        <tbody>
          <tr>
            <td>x</td>
          </tr>
        </tbody>
      </Table>,
    )
    const table = screen.getByRole('table')
    const wrapper = table.parentElement
    expect(wrapper?.className).toMatch(/overflow-x-auto/)
  })
})
