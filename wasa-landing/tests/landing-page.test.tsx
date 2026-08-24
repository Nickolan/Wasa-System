import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '@app/App'
import LandingPage from '@pages/LandingPage'
import { useAuthStore } from '@entities/user'
import { configureApiClient } from '@shared/api/axiosInstance'
import { SCAN_FORM_ANCHOR_ID } from '@widgets/scan-form'
import { makeJwtExpiringIn } from './support/jwt'

const { loginApiMock, registerApiMock } = vi.hoisted(() => ({
  loginApiMock: vi.fn(),
  registerApiMock: vi.fn(),
}))

vi.mock('@features/auth/login/api/loginApi', () => ({
  loginApi: loginApiMock,
}))
vi.mock('@features/auth/register/api/registerApi', () => ({
  registerApi: registerApiMock,
}))

const initialState = useAuthStore.getState()

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState(initialState, true)
  loginApiMock.mockReset()
  registerApiMock.mockReset()
  configureApiClient({ getToken: () => null, onUnauthorized: () => {} })
})

afterEach(() => {
  cleanup()
})

function isBefore(a: Element, b: Element): boolean {
  // eslint-disable-next-line no-bitwise
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
}

describe('App: renderiza la composición de la Landing (landing-bootstrap, escenario conservado)', () => {
  it('el árbol de App contiene la Landing (título WASA visible)', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: /wasa/i })).toBeInTheDocument()
  })
})

describe('LandingPage — las cinco secciones, en orden (9.1)', () => {
  it('un visitante sin sesión ve presentación, herramientas, flujo, sección del formulario y pie, en ese orden', () => {
    render(<LandingPage />)

    const hero = screen.getByRole('heading', { level: 1, name: /wasa/i })
    const features = screen.getByRole('heading', { name: /qué ejecuta wasa/i })
    const howItWorks = screen.getByRole('heading', { name: /cómo funciona/i })
    const scanFormSection = document.getElementById(SCAN_FORM_ANCHOR_ID)
    const footer = screen.getByRole('contentinfo')

    expect(scanFormSection).not.toBeNull()
    expect(isBefore(hero, features)).toBe(true)
    expect(isBefore(features, howItWorks)).toBe(true)
    expect(isBefore(howItWorks, scanFormSection as Element)).toBe(true)
    expect(isBefore(scanFormSection as Element, footer)).toBe(true)
  })
})

describe('App — una sesión restaurada muestra el formulario desde el arranque (9.11, auth-wall)', () => {
  // El escenario de `auth-wall` habla del ARRANQUE, no de un `login()`
  // programático: la sesión llega de `localStorage` vía la hidratación que
  // `App` dispara al montar. Sin este caso, nada verifica que el muro no se
  // quede pegado cuando la sesión ya existía antes de abrir la página.
  it('con un token vigente persistido, la sección muestra el formulario sin ninguna interacción y sin muro', async () => {
    localStorage.setItem(
      'wasa.auth',
      JSON.stringify({ token: makeJwtExpiringIn(3600), email: 'frank@example.com' }),
    )

    render(<App />)

    expect(await screen.findByLabelText(/URL objetivo/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^iniciar sesión$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^crear cuenta$/i })).toBeNull()
    expect(screen.getByRole('button', { name: /cerrar sesión/i })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('con un token expirado persistido, la sección se queda en el muro', async () => {
    localStorage.setItem(
      'wasa.auth',
      JSON.stringify({ token: makeJwtExpiringIn(-10), email: 'frank@example.com' }),
    )

    render(<App />)

    expect(await screen.findByRole('button', { name: /^iniciar sesión$/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(/URL objetivo/i)).toBeNull()
  })
})

describe('LandingPage — cada sección es una región identificable y con nombre (9.10, landing-composition)', () => {
  // "Cada sección SHALL ser una región identificable del documento, de modo
  // que se pueda alcanzar y nombrar sin depender de su posición visual."
  // Un <section> sin nombre accesible NO expone `role="region"`: no se puede
  // nombrar ni alcanzar por rol, sólo por posición. Esta aserción es sobre el
  // árbol de accesibilidad real, no sobre la etiqueta HTML.
  it('sin sesión: cuatro regiones con nombre accesible distinto, más el pie como contentinfo', () => {
    render(<LandingPage />)

    expect(screen.getAllByRole('region')).toHaveLength(4)
    expect(screen.getByRole('region', { name: 'WASA' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Qué ejecuta WASA' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Cómo funciona' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Formulario de escaneo' })).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
  })

  it('la región de la sección del formulario es el mismo nodo que lleva el ancla, con y sin sesión', () => {
    const { unmount } = render(<LandingPage />)
    expect(screen.getByRole('region', { name: 'Formulario de escaneo' })).toBe(
      document.getElementById(SCAN_FORM_ANCHOR_ID),
    )
    unmount()

    useAuthStore.getState().login('tok', 'a@b.com')
    render(<LandingPage />)
    expect(screen.getByRole('region', { name: 'Formulario de escaneo' })).toBe(
      document.getElementById(SCAN_FORM_ANCHOR_ID),
    )
  })
})

describe('LandingPage — las secciones no dependen de la sesión (9.3)', () => {
  it('con sesión activa siguen presentes las mismas cinco secciones', () => {
    useAuthStore.getState().login('tok', 'a@b.com')
    render(<LandingPage />)

    expect(screen.getByRole('heading', { level: 1, name: /wasa/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /qué ejecuta wasa/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /cómo funciona/i })).toBeInTheDocument()
    expect(document.getElementById(SCAN_FORM_ANCHOR_ID)).not.toBeNull()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
    // Lo único que cambia es el contenido de la sección del formulario:
    expect(screen.getByLabelText(/URL objetivo/i)).toBeInTheDocument()
  })
})

describe('LandingPage — un solo diálogo a la vez, extremo a extremo (9.4)', () => {
  it('abrir login desde el Hero, alternar a registro, volver a login: siempre a lo sumo un role="dialog"', async () => {
    const user = userEvent.setup()
    render(<LandingPage />)

    await user.click(screen.getByRole('button', { name: /comenzar/i }))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: /registrate/i }))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByLabelText(/confirmar contraseña/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /iniciá sesión/i }))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.queryByLabelText(/confirmar contraseña/i)).toBeNull()
  })
})

describe('LandingPage — los dos disparadores comparten estado (9.5, D-1)', () => {
  it('abrir desde el Hero, cerrar con Escape, reabrir desde el muro: sin residuo, exactamente uno abierto', async () => {
    const user = userEvent.setup()
    render(<LandingPage />)

    await user.click(screen.getByRole('button', { name: /comenzar/i }))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()

    await user.click(screen.getByRole('button', { name: /^iniciar sesión$/i }))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })
})

describe('LandingPage — el éxito cierra el modal y revela el formulario (9.6, criterio central)', () => {
  it('desde el muro, registrarse con éxito cierra el diálogo y revela el ScanForm en una sola pasada', async () => {
    const user = userEvent.setup()
    registerApiMock.mockResolvedValueOnce({ access_token: 'tok-x', token_type: 'bearer', expires_in: 3600 })
    render(<LandingPage />)

    await user.click(screen.getByRole('button', { name: /crear cuenta/i }))
    await user.type(screen.getByLabelText(/^email/i), 'carol@example.com')
    await user.type(screen.getByLabelText(/^contraseña/i), 'hunter22')
    await user.type(screen.getByLabelText(/confirmar contraseña/i), 'hunter22')
    await user.click(screen.getByRole('button', { name: 'Registrarme' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(screen.getByLabelText(/URL objetivo/i)).toBeInTheDocument()
    })
  })
})

describe('LandingPage — el éxito desplaza la vista al formulario, sin importar el disparador (9.7, D-3)', () => {
  const originalScrollIntoView = Element.prototype.scrollIntoView

  afterEach(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView
  })

  it('abierto desde el CTA del Hero', async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    loginApiMock.mockResolvedValueOnce({ access_token: 'tok-y', token_type: 'bearer', expires_in: 3600 })
    const user = userEvent.setup()
    render(<LandingPage />)

    await user.click(screen.getByRole('button', { name: /comenzar/i }))
    await user.type(screen.getByLabelText(/email/i), 'dave@example.com')
    await user.type(screen.getByLabelText(/contraseña/i), 'hunter22')
    await user.click(screen.getByRole('button', { name: 'Ingresar' }))

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1))
    const target = document.getElementById(SCAN_FORM_ANCHOR_ID)
    expect(scrollIntoView.mock.instances[0]).toBe(target)
  })

  it('abierto desde el muro', async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    registerApiMock.mockResolvedValueOnce({ access_token: 'tok-z', token_type: 'bearer', expires_in: 3600 })
    const user = userEvent.setup()
    render(<LandingPage />)

    await user.click(screen.getByRole('button', { name: /crear cuenta/i }))
    await user.type(screen.getByLabelText(/^email/i), 'erin@example.com')
    await user.type(screen.getByLabelText(/^contraseña/i), 'hunter22')
    await user.type(screen.getByLabelText(/confirmar contraseña/i), 'hunter22')
    await user.click(screen.getByRole('button', { name: 'Registrarme' }))

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1))
    const target = document.getElementById(SCAN_FORM_ANCHOR_ID)
    expect(scrollIntoView.mock.instances[0]).toBe(target)
  })
})

describe('LandingPage — cerrar sesión devuelve el muro (9.8)', () => {
  it('vuelve el muro, ningún campo del formulario queda en el documento, y no se abre ningún modal', async () => {
    useAuthStore.getState().login('tok', 'a@b.com')
    const user = userEvent.setup()
    render(<LandingPage />)

    await user.click(screen.getByRole('button', { name: /cerrar sesión/i }))

    expect(screen.queryByLabelText(/URL objetivo/i)).toBeNull()
    expect(screen.getByRole('button', { name: /^iniciar sesión$/i })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('LandingPage — la infraestructura interna no aparece en pantalla (10.3, R-2)', () => {
  // Aserción sobre el TEXTO RENDERIZADO, no sobre el código fuente (R-2): un
  // comentario del código que mencione n8n no debe hacer fallar este test
  // — el precedente contrario ya costó una regresión en CHANGE-18
  // (`env.test.ts` falló por un literal dentro de un comentario).
  const INTERNAL_INFRA_NAMES = [/n8n/i, /redis/i, /\bworker\b/i, /postgres/i]

  it('sin sesión activa, ningún nombre de infraestructura interna es visible', () => {
    const { container } = render(<LandingPage />)
    for (const pattern of INTERNAL_INFRA_NAMES) {
      expect(container.textContent).not.toMatch(pattern)
    }
  })

  it('con sesión activa, ningún nombre de infraestructura interna es visible', () => {
    useAuthStore.getState().login('tok', 'a@b.com')
    const { container } = render(<LandingPage />)
    for (const pattern of INTERNAL_INFRA_NAMES) {
      expect(container.textContent).not.toMatch(pattern)
    }
  })
})

describe('LandingPage — sin lógica de decisión propia más allá de lo declarado (9.9)', () => {
  it('no importa nada de @features directamente', async () => {
    const { readFileSync } = await import('node:fs')
    const path = await import('node:path')
    const source = readFileSync(path.resolve(__dirname, '../src/pages/LandingPage/index.tsx'), 'utf-8')
    expect(source).not.toMatch(/@features\//)
  })
})
