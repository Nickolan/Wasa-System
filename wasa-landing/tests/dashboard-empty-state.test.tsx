import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DASHBOARD_EMPTY_STATE_MESSAGE, DashboardEmptyState } from '@widgets/dashboard-empty-state'

afterEach(() => {
  cleanup()
})

describe('DashboardEmptyState (task 5.8, spec dashboard-screen)', () => {
  it('muestra el aviso explícito de conjunto vacío', () => {
    render(<DashboardEmptyState />)
    expect(screen.getByText(DASHBOARD_EMPTY_STATE_MESSAGE)).toBeInTheDocument()
  })

  it('el aviso es un role="status", no una alerta de error', () => {
    render(<DashboardEmptyState />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
