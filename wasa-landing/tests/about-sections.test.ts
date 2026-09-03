import { describe, expect, it } from 'vitest'
import { ABOUT_SECTIONS } from '@widgets/about/model/sections'

const REQUIRED_TOOLS = ['OWASP ZAP', 'Nuclei', 'ffuf', 'SQLMap']

describe('ABOUT_SECTIONS — el contenido de /about es datos (task 6.1, D-6, spec about-page)', () => {
  it('exporta exactamente las cuatro secciones obligatorias', () => {
    expect(ABOUT_SECTIONS).toHaveLength(4)
  })

  it('cada sección tiene un title no vacío y un body con al menos un párrafo no vacío', () => {
    for (const section of ABOUT_SECTIONS) {
      expect(section.title.trim().length).toBeGreaterThan(0)
      expect(section.body.length).toBeGreaterThan(0)
      for (const paragraph of section.body) {
        expect(paragraph.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('la sección de herramientas nombra OWASP ZAP, Nuclei, ffuf y SQLMap', () => {
    const toolsSection = ABOUT_SECTIONS.find((s) => s.id === 'tools')
    expect(toolsSection).toBeDefined()
    const text = toolsSection?.body.join(' ') ?? ''
    for (const tool of REQUIRED_TOOLS) {
      expect(text).toContain(tool)
    }
  })

  it('la sección del flujo menciona la duración estimada y la entrega por email', () => {
    const flowSection = ABOUT_SECTIONS.find((s) => s.id === 'flow')
    expect(flowSection).toBeDefined()
    const text = flowSection?.body.join(' ') ?? ''
    expect(text).toMatch(/diez minutos|10 minutos/i)
    expect(text).toMatch(/correo electrónico|email/i)
  })

  it('el conjunto declara el uso sobre objetivos autorizados (RN-WS-01)', () => {
    const allText = ABOUT_SECTIONS.flatMap((s) => s.body).join(' ')
    expect(allText).toMatch(/autorización del propietario|objetivos autorizados/i)
  })

  it('la sección de datos no promete garantías que el sistema no provee (D-7)', () => {
    const dataSection = ABOUT_SECTIONS.find((s) => s.id === 'data')
    expect(dataSection).toBeDefined()
    const text = dataSection?.body.join(' ') ?? ''
    // No afirma cifrado en reposo ni certificaciones, en ninguna forma.
    expect(text).not.toMatch(/cifrado en reposo/i)
    expect(text).not.toMatch(/certificaci[oó]n/i)
    // El texto puede *nombrar* la ausencia de retención/borrado a pedido
    // (D-7: "no ofrecemos todavía política de retención ni borrado a
    // pedido") — lo que no puede hacer es prometerlos como si existieran.
    expect(text).toMatch(/no ofrecemos/i)
    expect(text).not.toMatch(/garantizamos (el )?borrado a pedido/i)
  })
})
