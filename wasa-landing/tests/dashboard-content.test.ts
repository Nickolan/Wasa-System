import { describe, expect, it } from 'vitest'
import { SEVERITY_CHART_COLORS as ENTITY_SEVERITY_CHART_COLORS } from '@entities/dashboard'
import { DASHBOARD_EMPTY_STATE_MESSAGE } from '@widgets/dashboard-empty-state'
import { DASHBOARD_VIEW_LABELS, DASHBOARD_VIEW_ORDER } from '@widgets/dashboard-view-switcher'
import { DASHBOARD_FILTERS_LABELS, SEVERITY_OPTIONS, SOURCE_OPTIONS } from '@widgets/dashboard-filters'
import { DASHBOARD_KPI_LABELS } from '@widgets/dashboard-kpis'
import { DASHBOARD_CHART_TITLES, SEVERITY_CHART_COLORS } from '@widgets/dashboard-charts'
import { DASHBOARD_ENDPOINTS_TABLE } from '@widgets/dashboard-endpoints'
import { DASHBOARD_DETAIL_TABLE } from '@widgets/dashboard-detail-table'
import { DASHBOARD_VULN_MODAL } from '@widgets/dashboard-vulnerability-modal'

/**
 * Task 5.1: el contenido fijo de la pantalla existe como datos declarados,
 * no vacío. El resto de la verificación de 5.1 ("el marcado no contiene
 * literales de texto de usuario") se cubre en los tests de cada widget, que
 * afirman el texto renderizado contra estas mismas constantes.
 */
describe('Contenido fijo de la pantalla de resultados (task 5.1)', () => {
  it('rótulos de las tres vistas', () => {
    expect(DASHBOARD_VIEW_ORDER.length).toBe(3)
    for (const view of DASHBOARD_VIEW_ORDER) {
      expect(DASHBOARD_VIEW_LABELS[view]).toBeTruthy()
    }
  })

  it('opciones de filtro de severidad y herramienta', () => {
    expect(SEVERITY_OPTIONS.length).toBeGreaterThan(0)
    expect(SOURCE_OPTIONS.length).toBeGreaterThan(0)
    expect(DASHBOARD_FILTERS_LABELS.scan).toBeTruthy()
  })

  it('títulos de KPIs y gráficos', () => {
    expect(DASHBOARD_KPI_LABELS.total).toBeTruthy()
    expect(DASHBOARD_KPI_LABELS.critical).toBeTruthy()
    expect(DASHBOARD_CHART_TITLES.severity).toBeTruthy()
    expect(DASHBOARD_CHART_TITLES.trend).toBeTruthy()
  })

  it('encabezados de las dos tablas', () => {
    expect(Object.values(DASHBOARD_ENDPOINTS_TABLE).every(Boolean)).toBe(true)
    expect(Object.values(DASHBOARD_DETAIL_TABLE.headers).every(Boolean)).toBe(true)
    expect(DASHBOARD_DETAIL_TABLE.missingFieldMarker).toBeTruthy()
  })

  it('mensaje de conjunto vacío y contenido del modal de detalle', () => {
    expect(DASHBOARD_EMPTY_STATE_MESSAGE).toBeTruthy()
    expect(DASHBOARD_VULN_MODAL.title).toBeTruthy()
    expect(Object.values(DASHBOARD_VULN_MODAL.labels).every(Boolean)).toBe(true)
  })

  it('la paleta de color por severidad tiene una única fuente de verdad en entities/dashboard (fix code-review #7)', () => {
    // dashboard-charts reexporta la MISMA referencia que entities/dashboard,
    // en vez de declarar su propia copia independiente del mapeo.
    expect(SEVERITY_CHART_COLORS).toBe(ENTITY_SEVERITY_CHART_COLORS)
  })
})
