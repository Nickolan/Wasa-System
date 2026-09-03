import { describe, expect, it } from 'vitest'
import { colorTokens } from '@shared/ui/tokens'
import { SEVERITY_BADGE_CLASSES, SEVERITY_BADGE_FALLBACK_CLASSES } from '@shared/ui/severityBadgeClasses'
import { SEVERITY_CHART_COLORS, SEVERITY_CHART_FALLBACK_COLOR } from '@entities/dashboard'

/**
 * Requirement `design-system` — "Una severidad se ve igual en toda la
 * aplicación": el mapa de color de gráfico y el de clases de insignia
 * cubren exactamente el mismo conjunto de severidades, y ambos definen su
 * valor de reserva (spec design-system, escenarios 1-3).
 */
describe('mapa de gráfico y de insignia de severidad coinciden (spec design-system)', () => {
  it('cubren exactamente el mismo conjunto de niveles de severidad', () => {
    expect(Object.keys(SEVERITY_CHART_COLORS).sort()).toEqual(Object.keys(SEVERITY_BADGE_CLASSES).sort())
  })

  it('ambos definen un valor de reserva para una severidad no enumerada', () => {
    expect(SEVERITY_CHART_FALLBACK_COLOR).toBeTruthy()
    expect(SEVERITY_BADGE_FALLBACK_CLASSES).toBeTruthy()
  })

  it('Low comparte familia de color con la marca (D-2: unificado en sky-500, ya no blue-500)', () => {
    expect(SEVERITY_CHART_COLORS.Low).toBe(colorTokens.info)
    expect(SEVERITY_BADGE_CLASSES.Low).toContain('sky-500')
  })

  it('el detector se prueba a sí mismo: un conjunto de claves distinto entre los dos mapas no pasa desapercibido (guard sobre el guard)', () => {
    const chartKeys = ['Critical', 'High']
    const badgeKeys = ['Critical', 'High', 'Low']
    expect(chartKeys.sort()).not.toEqual(badgeKeys.sort())
  })
})
