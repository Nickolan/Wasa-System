import { describe, expect, it } from 'vitest'
import type { DashboardResponse } from '@entities/dashboard'
import {
  UNKNOWN_SEVERITY_LABEL,
  deriveKpis,
  deriveSeverityDistribution,
  deriveTopEndpoints,
  deriveTrend,
  formatScanDateLabel,
  normalizeSeverity,
} from '@entities/dashboard'

/** Spec de referencia: `dashboard-metrics`. Comportamiento puro, sin React, sin red. */

describe('normalizeSeverity — capitalización inicial (task 2.2, D-4.2)', () => {
  it('severidad en minúsculas se normaliza a capitalizada', () => {
    expect(normalizeSeverity('critical')).toBe('Critical')
  })

  it('severidad ya capitalizada es idempotente', () => {
    expect(normalizeSeverity('Critical')).toBe(normalizeSeverity(normalizeSeverity('Critical')))
    expect(normalizeSeverity('Critical')).toBe('Critical')
  })

  it('severidad desconocida para el sistema conserva su propia etiqueta normalizada', () => {
    expect(normalizeSeverity('informational')).toBe('Informational')
  })

  it('severidad ausente o nula se agrupa bajo una categoría explícita de desconocida', () => {
    expect(normalizeSeverity(null)).toBe(UNKNOWN_SEVERITY_LABEL)
    expect(normalizeSeverity(undefined)).toBe(UNKNOWN_SEVERITY_LABEL)
    expect(() => normalizeSeverity(null)).not.toThrow()
  })
})

function buildResponse(overrides: Partial<DashboardResponse> = {}): DashboardResponse {
  return {
    scans: [
      { id: 1, target_url: 'http://a.local', scan_date: '2026-01-01T10:00:00Z' },
      { id: 2, target_url: 'http://b.local', scan_date: '2026-01-02T10:00:00Z' },
    ],
    vulnerabilities: [
      { id: 1, scan_id: 1, severity: 'critical', url: 'http://a.local/x' },
      { id: 2, scan_id: 1, severity: 'high', url: 'http://a.local/y' },
      { id: 3, scan_id: 2, severity: 'critical', url: 'http://b.local/z' },
    ],
    ...overrides,
  }
}

describe('deriveKpis — escaneos / total / críticas (task 2.3)', () => {
  it('sin escaneo seleccionado: el indicador de escaneos vale la cantidad de escaneos devueltos', () => {
    const kpis = deriveKpis(buildResponse(), null)
    expect(kpis.scanCountValue).toBe(2)
    expect(kpis.scanCountLabel).toMatch(/realizados/i)
  })

  it('con un escaneo seleccionado: el indicador identifica a ese escaneo, con otro rótulo', () => {
    const kpis = deriveKpis(buildResponse(), 1)
    expect(kpis.scanCountValue).toBe(1)
    expect(kpis.scanCountLabel).toMatch(/analizado/i)
    expect(kpis.scanCountLabel).not.toBe(deriveKpis(buildResponse(), null).scanCountLabel)
  })

  it('total de vulnerabilidades del conjunto vigente', () => {
    const kpis = deriveKpis(buildResponse(), null)
    expect(kpis.totalVulnerabilities).toBe(3)
  })

  it('conteo de críticas: sólo cuenta severidad normalizada Critical', () => {
    const kpis = deriveKpis(buildResponse(), null)
    expect(kpis.criticalVulnerabilities).toBe(2)
  })

  it('conjunto vacío: total y críticas valen cero, no falla', () => {
    const kpis = deriveKpis(buildResponse({ vulnerabilities: [] }), null)
    expect(kpis.totalVulnerabilities).toBe(0)
    expect(kpis.criticalVulnerabilities).toBe(0)
  })
})

describe('deriveSeverityDistribution (task 2.4)', () => {
  it('una entrada por severidad presente', () => {
    const response = buildResponse({
      vulnerabilities: [
        { id: 1, scan_id: 1, severity: 'critical' },
        { id: 2, scan_id: 1, severity: 'high' },
        { id: 3, scan_id: 1, severity: 'medium' },
      ],
    })
    const distribution = deriveSeverityDistribution(response)
    expect(distribution).toHaveLength(3)
  })

  it('la suma de las cantidades iguala el total', () => {
    const response = buildResponse()
    const distribution = deriveSeverityDistribution(response)
    const sum = distribution.reduce((acc, entry) => acc + entry.count, 0)
    expect(sum).toBe(response.vulnerabilities.length)
  })

  it('una severidad sin ocurrencias no aparece con valor cero', () => {
    const response = buildResponse({
      vulnerabilities: [{ id: 1, scan_id: 1, severity: 'critical' }],
    })
    const distribution = deriveSeverityDistribution(response)
    expect(distribution.find((entry) => entry.severity === 'Low')).toBeUndefined()
  })

  it('conjunto vacío: distribución vacía', () => {
    const distribution = deriveSeverityDistribution(buildResponse({ vulnerabilities: [] }))
    expect(distribution).toEqual([])
  })
})

describe('formatScanDateLabel (task 2.5, D-8)', () => {
  it('fecha con offset produce una etiqueta legible', () => {
    const label = formatScanDateLabel('2026-08-31T14:00:00Z')
    expect(label).not.toMatch(/NaN/)
    expect(label.length).toBeGreaterThan(0)
  })

  it('fecha sin offset produce una etiqueta legible', () => {
    const label = formatScanDateLabel('2026-08-31T14:00:00')
    expect(label).not.toMatch(/NaN/)
    expect(label.length).toBeGreaterThan(0)
  })

  it('valor nulo produce un marcador explícito, no NaN', () => {
    expect(formatScanDateLabel(null)).not.toMatch(/NaN/)
    expect(formatScanDateLabel(undefined)).not.toMatch(/NaN/)
  })

  it('valor no interpretable no produce NaN ni lanza', () => {
    expect(() => formatScanDateLabel('no-es-una-fecha')).not.toThrow()
    expect(formatScanDateLabel('no-es-una-fecha')).not.toMatch(/NaN/)
  })
})

describe('deriveTrend (task 2.6)', () => {
  it('un punto por escaneo, ordenados de más antiguo a más reciente', () => {
    const response = buildResponse({
      scans: [
        { id: 2, target_url: 'http://b.local', scan_date: '2026-01-02T10:00:00Z' },
        { id: 1, target_url: 'http://a.local', scan_date: '2026-01-01T10:00:00Z' },
      ],
    })
    const trend = deriveTrend(response)
    expect(trend).toHaveLength(2)
    expect(trend[0]?.scanId).toBe(1)
    expect(trend[1]?.scanId).toBe(2)
  })

  it('un escaneo sin vulnerabilidades en el conjunto vigente figura igual, con valor cero', () => {
    const response = buildResponse({
      scans: [
        { id: 1, target_url: 'http://a.local', scan_date: '2026-01-01T10:00:00Z' },
        { id: 3, target_url: 'http://c.local', scan_date: '2026-01-03T10:00:00Z' },
      ],
      vulnerabilities: [{ id: 1, scan_id: 1, severity: 'critical' }],
    })
    const trend = deriveTrend(response)
    const emptyPoint = trend.find((point) => point.scanId === 3)
    expect(emptyPoint?.count).toBe(0)
  })

  it('la suma de todos los puntos iguala el total del conjunto (sin huérfanas)', () => {
    const response = buildResponse()
    const trend = deriveTrend(response)
    const sum = trend.reduce((acc, point) => acc + point.count, 0)
    expect(sum).toBe(response.vulnerabilities.length)
  })

  it('dos escaneos con la misma fecha nominal pero distinta hora producen etiquetas distinguibles', () => {
    const response = buildResponse({
      scans: [
        { id: 1, target_url: 'http://a.local', scan_date: '2026-01-01T08:00:00Z' },
        { id: 2, target_url: 'http://a.local', scan_date: '2026-01-01T20:00:00Z' },
      ],
    })
    const trend = deriveTrend(response)
    expect(trend[0]?.label).not.toBe(trend[1]?.label)
  })

  it('sin escaneos: la serie viene vacía y no falla', () => {
    expect(() => deriveTrend(buildResponse({ scans: [] }))).not.toThrow()
    expect(deriveTrend(buildResponse({ scans: [] }))).toEqual([])
  })
})

describe('deriveTopEndpoints (task 2.7)', () => {
  it('ordena de mayor a menor cantidad de hallazgos', () => {
    const response = buildResponse({
      vulnerabilities: [
        { id: 1, scan_id: 1, url: 'http://a.local/x' },
        { id: 2, scan_id: 1, url: 'http://a.local/y' },
        { id: 3, scan_id: 1, url: 'http://a.local/y' },
      ],
    })
    const ranking = deriveTopEndpoints(response)
    expect(ranking[0]?.url).toBe('http://a.local/y')
    expect(ranking[0]?.count).toBe(2)
  })

  it('la suma de las cantidades iguala el total', () => {
    const response = buildResponse()
    const ranking = deriveTopEndpoints(response)
    const sum = ranking.reduce((acc, entry) => acc + entry.count, 0)
    expect(sum).toBe(response.vulnerabilities.length)
  })

  it('dos rutas distintas del mismo host no se agrupan', () => {
    const response = buildResponse({
      vulnerabilities: [
        { id: 1, scan_id: 1, url: 'http://a.local/x' },
        { id: 2, scan_id: 1, url: 'http://a.local/y' },
      ],
    })
    const ranking = deriveTopEndpoints(response)
    expect(ranking).toHaveLength(2)
  })

  it('conjunto vacío: ranking vacío', () => {
    expect(deriveTopEndpoints(buildResponse({ vulnerabilities: [] }))).toEqual([])
  })

  it('vulnerabilidades sin url (nula, ausente o vacía) se excluyen del ranking, no se agrupan bajo una entrada fantasma', () => {
    const response = buildResponse({
      vulnerabilities: [
        { id: 1, scan_id: 1, url: 'http://a.local/x' },
        { id: 2, scan_id: 1, url: null },
        { id: 3, scan_id: 1 },
        { id: 4, scan_id: 1, url: '' },
      ],
    })
    const ranking = deriveTopEndpoints(response)
    expect(ranking).toEqual([{ url: 'http://a.local/x', count: 1 }])
  })
})

describe('Pureza y tolerancia (task 2.8)', () => {
  it('no muta su entrada', () => {
    const response = buildResponse()
    const before = JSON.parse(JSON.stringify(response))
    deriveKpis(response, null)
    deriveSeverityDistribution(response)
    deriveTrend(response)
    deriveTopEndpoints(response)
    expect(response).toEqual(before)
  })

  it('es determinista', () => {
    const response = buildResponse()
    expect(deriveKpis(response, null)).toEqual(deriveKpis(response, null))
    expect(deriveSeverityDistribution(response)).toEqual(deriveSeverityDistribution(response))
    expect(deriveTrend(response)).toEqual(deriveTrend(response))
    expect(deriveTopEndpoints(response)).toEqual(deriveTopEndpoints(response))
  })

  it('tolera una vulnerabilidad huérfana (scan_id que no figura entre los escaneos)', () => {
    const response = buildResponse({
      vulnerabilities: [
        { id: 1, scan_id: 1, severity: 'critical', url: 'http://a.local/x' },
        { id: 99, scan_id: 999, severity: 'high', url: 'http://orphan.local' },
      ],
    })
    expect(() => {
      deriveKpis(response, null)
      deriveSeverityDistribution(response)
      deriveTrend(response)
      deriveTopEndpoints(response)
    }).not.toThrow()
    expect(deriveKpis(response, null).totalVulnerabilities).toBe(2)
  })

  it('tolera campos adicionales no enumerados', () => {
    const response: DashboardResponse = {
      scans: [{ id: 1, target_url: 'http://a.local', scan_date: '2026-01-01T10:00:00Z', extra: 'x' }],
      vulnerabilities: [{ id: 1, scan_id: 1, severity: 'critical', extra: 'y' }],
    }
    expect(() => {
      deriveKpis(response, null)
      deriveSeverityDistribution(response)
      deriveTrend(response)
      deriveTopEndpoints(response)
    }).not.toThrow()
  })

  it('tolera ambas colecciones vacías', () => {
    const response: DashboardResponse = { scans: [], vulnerabilities: [] }
    expect(deriveKpis(response, null)).toEqual({
      scanCountLabel: expect.any(String),
      scanCountValue: 0,
      totalVulnerabilities: 0,
      criticalVulnerabilities: 0,
    })
    expect(deriveSeverityDistribution(response)).toEqual([])
    expect(deriveTrend(response)).toEqual([])
    expect(deriveTopEndpoints(response)).toEqual([])
  })
})
