import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Fix de code-review, hallazgo #7: `AboutWidget` usaba el texto del párrafo
 * como `key` (`key={paragraph}`) en vez del índice. Es una lista estática
 * que no se reordena ni filtra, así que el índice es seguro — pero con
 * `key={paragraph}`, dos párrafos que llegaran a compartir texto producirían
 * una key de React duplicada (warning "Encountered two children with the
 * same key" en `console.error`, y riesgo real de que React confunda las
 * instancias). Se mockea `ABOUT_SECTIONS` con un párrafo repetido a
 * propósito para forzar el caso — el contenido real de hoy no lo tiene.
 */
vi.mock('@widgets/about/model/sections', () => ({
  ABOUT_SECTIONS: [
    {
      id: 'duplicated',
      title: 'Sección con párrafos repetidos',
      body: ['Mismo texto', 'Mismo texto', 'Otro texto'],
    },
  ],
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('AboutWidget — la key de cada párrafo no depende de su texto (fix code-review #7)', () => {
  it('no emite el warning de React por keys duplicadas cuando dos párrafos comparten el mismo texto', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { AboutWidget } = await import('@widgets/about')

    render(<AboutWidget />)

    const duplicateKeyWarning = errorSpy.mock.calls.some((call) =>
      call.some((arg) => typeof arg === 'string' && arg.includes('same key')),
    )
    expect(duplicateKeyWarning).toBe(false)
  })
})
