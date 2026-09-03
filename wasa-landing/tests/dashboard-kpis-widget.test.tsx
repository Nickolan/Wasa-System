import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { KpiSummary } from '@entities/dashboard'
import { DashboardKpisWidget } from '@widgets/dashboard-kpis'

afterEach(() => {
  cleanup()
})

describe('DashboardKpisWidget (task 5.4)', () => {
  it('muestra los tres valores', () => {
    const kpis: KpiSummary = {
      scanCountLabel: 'Escaneos Realizados',
      scanCountValue: 4,
      totalVulnerabilities: 12,
      criticalVulnerabilities: 3,
    }
    render(<DashboardKpisWidget kpis={kpis} />)

    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('el rótulo del indicador de escaneos cambia según haya o no un escaneo seleccionado', () => {
    const withoutSelection: KpiSummary = {
      scanCountLabel: 'Escaneos Realizados',
      scanCountValue: 4,
      totalVulnerabilities: 0,
      criticalVulnerabilities: 0,
    }
    const { rerender } = render(<DashboardKpisWidget kpis={withoutSelection} />)
    expect(screen.getByText('Escaneos Realizados')).toBeInTheDocument()

    const withSelection: KpiSummary = {
      scanCountLabel: 'Escaneo Analizado',
      scanCountValue: 1,
      totalVulnerabilities: 0,
      criticalVulnerabilities: 0,
    }
    rerender(<DashboardKpisWidget kpis={withSelection} />)
    expect(screen.getByText('Escaneo Analizado')).toBeInTheDocument()
  })
})
