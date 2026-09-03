import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DASHBOARD_VIEW_LABELS, DashboardViewSwitcher } from '@widgets/dashboard-view-switcher'

afterEach(() => {
  cleanup()
})

describe('DashboardViewSwitcher (task 5.2, D-5)', () => {
  it('vista inicial: el botón de panel general está marcado como activo cuando activeView="overview"', () => {
    render(<DashboardViewSwitcher activeView="overview" onSelectView={() => {}} />)
    const button = screen.getByRole('button', { name: DASHBOARD_VIEW_LABELS.overview })
    expect(button).toHaveAttribute('aria-pressed', 'true')
  })

  it('conmutar invoca onSelectView con la vista seleccionada', async () => {
    const user = userEvent.setup()
    const onSelectView = vi.fn()
    render(<DashboardViewSwitcher activeView="overview" onSelectView={onSelectView} />)

    await user.click(screen.getByRole('button', { name: DASHBOARD_VIEW_LABELS.endpoints }))

    expect(onSelectView).toHaveBeenCalledWith('endpoints')
  })

  it('exactamente una vista está activa a la vez', () => {
    render(<DashboardViewSwitcher activeView="details" onSelectView={() => {}} />)
    const pressed = screen.getAllByRole('button').filter((btn) => btn.getAttribute('aria-pressed') === 'true')
    expect(pressed).toHaveLength(1)
    expect(pressed[0]).toHaveTextContent(DASHBOARD_VIEW_LABELS.details)
  })

  it('el control indica cuál vista está activa (aria-pressed en las inactivas es false)', () => {
    render(<DashboardViewSwitcher activeView="overview" onSelectView={() => {}} />)
    expect(screen.getByRole('button', { name: DASHBOARD_VIEW_LABELS.endpoints })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByRole('button', { name: DASHBOARD_VIEW_LABELS.details })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })
})
