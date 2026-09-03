import { describe, expect, it } from 'vitest'
import type { DashboardResponse, DashboardScanRow, DashboardVulnerabilityRow } from '@entities/dashboard'

/**
 * Task 2.1 (D-2): `DashboardScanRow`/`DashboardVulnerabilityRow` son un
 * espejo abierto del backend — todos los campos conocidos opcionales y
 * nulables, más un index signature para columnas no enumeradas. Estas
 * declaraciones son, en sí mismas, la aserción: si `severity` fuera
 * `string` obligatorio, o si el index signature no existiera, este archivo
 * dejaría de compilar (contrato reforzado por `npm run build`, que
 * type-checkea todo el árbol vía `tsc -b`).
 */
describe('DashboardScanRow / DashboardVulnerabilityRow / DashboardResponse son tipos abiertos (task 2.1, D-2)', () => {
  it('una fila con un campo desconocido (no enumerado) es asignable', () => {
    const scanWithUnknownField: DashboardScanRow = {
      id: 1,
      target_url: 'http://dvwa.local',
      scan_date: '2026-01-01T00:00:00Z',
      unexpected_column: 'valor no enumerado',
    }
    const vulnWithUnknownField: DashboardVulnerabilityRow = {
      id: 1,
      scan_id: 1,
      severity: 'critical',
      another_unexpected_column: 42,
    }

    expect(scanWithUnknownField.unexpected_column).toBe('valor no enumerado')
    expect(vulnWithUnknownField.another_unexpected_column).toBe(42)
  })

  it('una fila con todos los campos conocidos ausentes es asignable', () => {
    const emptyScan: DashboardScanRow = {}
    const emptyVuln: DashboardVulnerabilityRow = {}
    const response: DashboardResponse = { scans: [emptyScan], vulnerabilities: [emptyVuln] }

    expect(response.scans).toHaveLength(1)
    expect(response.vulnerabilities).toHaveLength(1)
  })

  it('severity no es string obligatorio: null, undefined y ausente son todos asignables', () => {
    const nullSeverity: DashboardVulnerabilityRow = { severity: null }
    const undefinedSeverity: DashboardVulnerabilityRow = { severity: undefined }
    const missingSeverity: DashboardVulnerabilityRow = {}

    expect(nullSeverity.severity).toBeNull()
    expect(undefinedSeverity.severity).toBeUndefined()
    expect(missingSeverity.severity).toBeUndefined()
  })
})
