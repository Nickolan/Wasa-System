import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@entities/user'
import { HeroWidget } from '@widgets/hero'

const initialState = useAuthStore.getState()

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState(initialState, true)
})

afterEach(() => {
  cleanup()
})

describe('HeroWidget — contenido mínimo (5.1)', () => {
  it('renderiza el título del producto, un tagline y un solo CTA', () => {
    render(<HeroWidget scanFormAnchorId="scan-form" onRequestLogin={vi.fn()} />)

    expect(screen.getByText(/WASA/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /comenzar/i })).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
})

describe('HeroWidget — sin sesión el CTA abre el login (5.3)', () => {
  // `landing-composition`: "Sin sesión, SHALL abrir el modal de inicio de
  // sesión y SHALL NOT desplazar la página". La mitad negativa exige un
  // ancla real con `scrollIntoView` observable: sin ella la aserción sería
  // vacua (jsdom deja el método `undefined` y nadie llamaría a nada).
  it('invoca onRequestLogin exactamente una vez y no desplaza la vista', async () => {
    const user = userEvent.setup()
    const onRequestLogin = vi.fn()
    const anchor = document.createElement('div')
    anchor.id = 'scan-form'
    const scrollIntoView = vi.fn()
    anchor.scrollIntoView = scrollIntoView
    document.body.appendChild(anchor)

    render(<HeroWidget scanFormAnchorId="scan-form" onRequestLogin={onRequestLogin} />)

    await user.click(screen.getByRole('button', { name: /comenzar/i }))

    expect(onRequestLogin).toHaveBeenCalledTimes(1)
    expect(scrollIntoView).not.toHaveBeenCalled()

    document.body.removeChild(anchor)
  })
})

describe('HeroWidget — con sesión el CTA desplaza y no abre modal (5.4)', () => {
  it('llama a scrollIntoView del ancla y no invoca onRequestLogin', async () => {
    useAuthStore.getState().login('tok', 'a@b.com')
    const user = userEvent.setup()
    const onRequestLogin = vi.fn()
    const anchor = document.createElement('div')
    anchor.id = 'scan-form'
    const scrollIntoView = vi.fn()
    anchor.scrollIntoView = scrollIntoView
    document.body.appendChild(anchor)

    render(<HeroWidget scanFormAnchorId="scan-form" onRequestLogin={onRequestLogin} />)
    await user.click(screen.getByRole('button', { name: /comenzar/i }))

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(onRequestLogin).not.toHaveBeenCalled()

    document.body.removeChild(anchor)
  })
})

describe('HeroWidget — el rótulo no cambia con la sesión (5.5)', () => {
  it('el mismo texto en los dos estados', () => {
    const { unmount } = render(<HeroWidget scanFormAnchorId="scan-form" onRequestLogin={vi.fn()} />)
    const withoutSession = screen.getByRole('button').textContent
    unmount()

    useAuthStore.getState().login('tok', 'a@b.com')
    render(<HeroWidget scanFormAnchorId="scan-form" onRequestLogin={vi.fn()} />)
    const withSession = screen.getByRole('button').textContent

    expect(withoutSession).toBe(withSession)
  })
})

describe('HeroWidget — entorno sin desplazamiento no rompe la acción (5.6, D-7)', () => {
  it('con sesión y un elemento destino sin scrollIntoView, no lanza', async () => {
    useAuthStore.getState().login('tok', 'a@b.com')
    const user = userEvent.setup()
    const anchor = document.createElement('div')
    anchor.id = 'scan-form'
    // jsdom no implementa scrollIntoView: es undefined, no un no-op (D-7).
    document.body.appendChild(anchor)

    render(<HeroWidget scanFormAnchorId="scan-form" onRequestLogin={vi.fn()} />)

    await expect(user.click(screen.getByRole('button', { name: /comenzar/i }))).resolves.not.toThrow()

    document.body.removeChild(anchor)
  })

  it('con sesión y el ancla ausente del documento, tampoco lanza', async () => {
    useAuthStore.getState().login('tok', 'a@b.com')
    const user = userEvent.setup()
    render(<HeroWidget scanFormAnchorId="scan-form-not-present" onRequestLogin={vi.fn()} />)

    await expect(user.click(screen.getByRole('button', { name: /comenzar/i }))).resolves.not.toThrow()
  })
})

describe('HeroWidget — límites de la slice (5.7, D-2)', () => {
  it('no importa de @widgets/scan-form ni de otra slice de widgets', async () => {
    const { readFileSync } = await import('node:fs')
    const path = await import('node:path')
    const widgetSource = readFileSync(
      path.resolve(__dirname, '../src/widgets/hero/ui/HeroWidget.tsx'),
      'utf-8',
    )
    const hookSource = readFileSync(
      path.resolve(__dirname, '../src/widgets/hero/model/useHeroCta.ts'),
      'utf-8',
    )
    for (const source of [widgetSource, hookSource]) {
      expect(source).not.toMatch(/@widgets\//)
    }
  })
})
