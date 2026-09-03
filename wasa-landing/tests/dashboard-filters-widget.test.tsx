import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DashboardScanRow } from '@entities/dashboard'
import type { DashboardFilters } from '@features/dashboard'
import { DashboardFiltersWidget } from '@widgets/dashboard-filters'

const UNFILTERED: DashboardFilters = { scanId: null, severity: null, source: null }

const SCANS: DashboardScanRow[] = [
  { id: 1, target_url: 'http://a.local', scan_date: '2026-01-01T08:00:00Z' },
  { id: 2, target_url: 'http://a.local', scan_date: '2026-01-02T20:00:00Z' },
]

afterEach(() => {
  cleanup()
})

describe('DashboardFiltersWidget (task 5.3, spec dashboard-screen)', () => {
  it('selección inicial: los tres controles muestran "sin filtrar"', () => {
    render(<DashboardFiltersWidget scans={SCANS} filters={UNFILTERED} onChangeFilter={() => {}} />)

    expect(screen.getByLabelText('Escaneo')).toHaveValue('')
    expect(screen.getByLabelText('Severidad')).toHaveValue('')
    expect(screen.getByLabelText('Herramienta')).toHaveValue('')
  })

  it('las opciones de escaneo derivan de los datos: una por escaneo devuelto, ninguna inventada', () => {
    render(<DashboardFiltersWidget scans={SCANS} filters={UNFILTERED} onChangeFilter={() => {}} />)

    const select = screen.getByLabelText('Escaneo')
    const options = within(select).getAllByRole('option')
    // 2 escaneos + la opción "sin filtrar"
    expect(options).toHaveLength(3)
  })

  it('dos escaneos del mismo objetivo son distinguibles entre sí (fecha + hora)', () => {
    render(<DashboardFiltersWidget scans={SCANS} filters={UNFILTERED} onChangeFilter={() => {}} />)

    const select = screen.getByLabelText('Escaneo')
    const optionTexts = within(select)
      .getAllByRole('option')
      .map((option) => option.textContent)
    expect(new Set(optionTexts).size).toBe(optionTexts.length)
  })

  it('cambiar la severidad invoca onChangeFilter con la clave y el valor', async () => {
    const user = userEvent.setup()
    const onChangeFilter = vi.fn()
    render(<DashboardFiltersWidget scans={SCANS} filters={UNFILTERED} onChangeFilter={onChangeFilter} />)

    await user.selectOptions(screen.getByLabelText('Severidad'), 'Critical')

    expect(onChangeFilter).toHaveBeenCalledWith('severity', 'Critical')
  })

  it('cambiar el escaneo invoca onChangeFilter con el identificador numérico', async () => {
    const user = userEvent.setup()
    const onChangeFilter = vi.fn()
    render(<DashboardFiltersWidget scans={SCANS} filters={UNFILTERED} onChangeFilter={onChangeFilter} />)

    await user.selectOptions(screen.getByLabelText('Escaneo'), '1')

    expect(onChangeFilter).toHaveBeenCalledWith('scanId', 1)
  })
})
