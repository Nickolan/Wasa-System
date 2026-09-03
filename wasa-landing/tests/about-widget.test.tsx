import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ABOUT_SECTIONS } from '@widgets/about/model/sections'
import { AboutWidget } from '@widgets/about'

afterEach(() => {
  cleanup()
})

describe('AboutWidget — cada sección es una región identificable con su propio encabezado (task 6.3, spec about-page)', () => {
  it('renderiza un encabezado por cada sección de ABOUT_SECTIONS', () => {
    render(<AboutWidget />)
    for (const section of ABOUT_SECTIONS) {
      expect(screen.getByRole('heading', { name: section.title })).toBeInTheDocument()
    }
  })

  it('renderiza el contenido de cada sección, iterando sobre los datos (sin literales en el JSX)', () => {
    render(<AboutWidget />)
    for (const section of ABOUT_SECTIONS) {
      for (const paragraph of section.body) {
        expect(screen.getByText(paragraph)).toBeInTheDocument()
      }
    }
  })

  it('cada sección es una región identificable (elemento <section>)', () => {
    const { container } = render(<AboutWidget />)
    expect(container.querySelectorAll('section')).toHaveLength(ABOUT_SECTIONS.length)
  })
})
