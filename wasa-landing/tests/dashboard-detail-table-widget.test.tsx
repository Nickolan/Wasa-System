import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DashboardVulnerabilityRow } from '@entities/dashboard'
import { DASHBOARD_DETAIL_TABLE, DashboardDetailTableWidget } from '@widgets/dashboard-detail-table'

afterEach(() => {
  cleanup()
})

describe('DashboardDetailTableWidget (task 5.7, spec dashboard-screen)', () => {
  it('la fila expone las seis columnas: fuente, tipo, severidad, CWE, evidencia y URL', () => {
    const vuln: DashboardVulnerabilityRow = {
      id: 1,
      source: 'OWASP ZAP',
      type: 'XSS',
      severity: 'critical',
      cweid: 'CWE-79',
      evidence: '<script>',
      url: 'http://a.local/x',
    }
    render(<DashboardDetailTableWidget vulnerabilities={[vuln]} onSelectVulnerability={() => {}} />)

    const row = screen.getAllByRole('row')[1]
    expect(row).toHaveTextContent('OWASP ZAP')
    expect(row).toHaveTextContent('XSS')
    expect(row).toHaveTextContent('Critical')
    expect(row).toHaveTextContent('CWE-79')
    expect(row).toHaveTextContent('<script>')
    expect(row).toHaveTextContent('http://a.local/x')
  })

  it('un campo ausente (sin CWE ni evidencia) muestra el marcador explícito, no una celda vacía', () => {
    const vuln: DashboardVulnerabilityRow = { id: 1, source: 'Nuclei', type: 'Misconfig', severity: 'low' }
    render(<DashboardDetailTableWidget vulnerabilities={[vuln]} onSelectVulnerability={() => {}} />)

    const row = screen.getAllByRole('row')[1]
    const markerCount = (row?.textContent?.match(new RegExp(DASHBOARD_DETAIL_TABLE.missingFieldMarker, 'g')) ?? [])
      .length
    expect(markerCount).toBeGreaterThanOrEqual(2)
  })

  it('activar una fila invoca onSelectVulnerability con la vulnerabilidad de esa fila', async () => {
    const user = userEvent.setup()
    const onSelectVulnerability = vi.fn()
    const vuln: DashboardVulnerabilityRow = { id: 7, source: 'ffuf', type: 'Path', severity: 'medium' }
    render(<DashboardDetailTableWidget vulnerabilities={[vuln]} onSelectVulnerability={onSelectVulnerability} />)

    await user.click(screen.getAllByRole('row')[1]!)

    expect(onSelectVulnerability).toHaveBeenCalledWith(vuln)
  })

  it('filas sin id no reciclan el nodo DOM de otra fila al reordenar (key compuesta, no sólo índice)', () => {
    const vulnA: DashboardVulnerabilityRow = { scan_id: 1, url: 'http://a.local', type: 'XSS', severity: 'low' }
    const vulnB: DashboardVulnerabilityRow = { scan_id: 1, url: 'http://b.local', type: 'SQLi', severity: 'low' }

    const { container, rerender } = render(
      <DashboardDetailTableWidget vulnerabilities={[vulnA, vulnB]} onSelectVulnerability={() => {}} />,
    )
    const firstRowBefore = container.querySelectorAll('tbody tr')[0]

    rerender(<DashboardDetailTableWidget vulnerabilities={[vulnB, vulnA]} onSelectVulnerability={() => {}} />)
    const firstRowAfter = container.querySelectorAll('tbody tr')[0]

    expect(firstRowAfter).not.toBe(firstRowBefore)
  })
})
