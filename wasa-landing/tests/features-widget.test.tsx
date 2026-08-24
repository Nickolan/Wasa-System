import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FeaturesWidget } from '@widgets/features-section'

afterEach(() => {
  cleanup()
})

describe('FeaturesWidget — las cuatro herramientas (6.1)', () => {
  it('renderiza ZAP, Nuclei, ffuf y SQLMap', () => {
    render(<FeaturesWidget />)

    expect(screen.getByText('ZAP')).toBeInTheDocument()
    expect(screen.getByText('Nuclei')).toBeInTheDocument()
    expect(screen.getByText('ffuf')).toBeInTheDocument()
    expect(screen.getByText('SQLMap')).toBeInTheDocument()
  })
})

describe('FeaturesWidget — cada tarjeta explica qué detecta (6.3, D-9)', () => {
  it('la estructura de datos interna tiene al menos cuatro entradas, ninguna con descripción vacía', async () => {
    const mod = await import('../src/widgets/features-section/model/tools')
    const tools = mod.TOOLS as ReadonlyArray<{ name: string; description: string }>

    expect(tools.length).toBeGreaterThanOrEqual(4)
    for (const tool of tools) {
      expect(tool.description.trim().length).toBeGreaterThan(0)
    }
  })

  it('cada descripción aparece renderizada en el documento', async () => {
    const mod = await import('../src/widgets/features-section/model/tools')
    const tools = mod.TOOLS as ReadonlyArray<{ description: string }>
    render(<FeaturesWidget />)

    for (const tool of tools) {
      expect(screen.getByText(tool.description)).toBeInTheDocument()
    }
  })
})

describe('FeaturesWidget — los íconos son decorativos (6.4, D-10)', () => {
  it('cada SVG lleva aria-hidden="true"', () => {
    const { container } = render(<FeaturesWidget />)
    const svgs = container.querySelectorAll('svg')

    expect(svgs.length).toBeGreaterThanOrEqual(4)
    svgs.forEach((svg) => {
      expect(svg.getAttribute('aria-hidden')).toBe('true')
    })
  })

  it('el texto accesible de la sección sigue conteniendo los nombres y descripciones al ignorar decorativos', () => {
    const { container } = render(<FeaturesWidget />)
    const clone = container.cloneNode(true) as HTMLElement
    clone.querySelectorAll('[aria-hidden="true"]').forEach((node) => node.remove())

    expect(clone.textContent).toMatch(/ZAP/)
    expect(clone.textContent).toMatch(/Nuclei/)
    expect(clone.textContent).toMatch(/ffuf/)
    expect(clone.textContent).toMatch(/SQLMap/)
  })
})

describe('FeaturesWidget — API pública (6.5, D-9)', () => {
  it('TOOLS no se exporta desde el index.ts de la slice', async () => {
    const widgetIndex = await import('@widgets/features-section')
    expect((widgetIndex as Record<string, unknown>).TOOLS).toBeUndefined()
  })
})
