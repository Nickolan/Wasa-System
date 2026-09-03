import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { EndpointRankingEntry } from '@entities/dashboard'
import { DashboardEndpointsWidget } from '@widgets/dashboard-endpoints'

afterEach(() => {
  cleanup()
})

describe('DashboardEndpointsWidget (task 5.6)', () => {
  it('una fila por entrada del ranking, en el orden recibido (ya descendente, D-3)', () => {
    const ranking: EndpointRankingEntry[] = [
      { url: 'http://a.local/x', count: 5 },
      { url: 'http://a.local/y', count: 2 },
    ]
    render(<DashboardEndpointsWidget ranking={ranking} />)

    const rows = screen.getAllByRole('row').slice(1) // sin el encabezado
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('http://a.local/x')
    expect(rows[0]).toHaveTextContent('5')
    expect(rows[1]).toHaveTextContent('http://a.local/y')
  })
})
