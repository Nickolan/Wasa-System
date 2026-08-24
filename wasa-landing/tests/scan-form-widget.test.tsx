import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@entities/user'
import { axiosInstance, configureApiClient } from '@shared/api/axiosInstance'
import { SCAN_FORM_ANCHOR_ID, ScanFormWidget } from '@widgets/scan-form'

const initialState = useAuthStore.getState()

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState(initialState, true)
  configureApiClient({ getToken: () => null, onUnauthorized: () => {} })
})

afterEach(() => {
  cleanup()
})

describe('SCAN_FORM_ANCHOR_ID (4.1)', () => {
  it('vale "scan-form"', () => {
    expect(SCAN_FORM_ANCHOR_ID).toBe('scan-form')
  })
})

describe('ScanFormWidget — el ancla existe siempre (4.1, 4.2, 4.6, D-5)', () => {
  it('renderiza una sección con id=SCAN_FORM_ANCHOR_ID sin sesión', () => {
    render(<ScanFormWidget onRequestLogin={vi.fn()} onRequestRegister={vi.fn()} />)
    expect(document.getElementById(SCAN_FORM_ANCHOR_ID)).toBeInTheDocument()
  })

  it('el ancla también existe con sesión', () => {
    useAuthStore.getState().login('tok', 'a@b.com')
    render(<ScanFormWidget onRequestLogin={vi.fn()} onRequestRegister={vi.fn()} />)
    expect(document.getElementById(SCAN_FORM_ANCHOR_ID)).toBeInTheDocument()
  })
})

describe('ScanFormWidget — el muro sin sesión (4.3)', () => {
  it('muestra el texto explicativo y exactamente dos acciones que invocan los callbacks', async () => {
    const user = userEvent.setup()
    const onRequestLogin = vi.fn()
    const onRequestRegister = vi.fn()
    render(<ScanFormWidget onRequestLogin={onRequestLogin} onRequestRegister={onRequestRegister} />)

    expect(screen.getByText(/sesión activa/i)).toBeInTheDocument()
    const loginButton = screen.getByRole('button', { name: /iniciar sesión/i })
    const registerButton = screen.getByRole('button', { name: /crear cuenta/i })

    await user.click(loginButton)
    expect(onRequestLogin).toHaveBeenCalledTimes(1)
    expect(onRequestRegister).not.toHaveBeenCalled()

    await user.click(registerButton)
    expect(onRequestRegister).toHaveBeenCalledTimes(1)
    expect(onRequestLogin).toHaveBeenCalledTimes(1)
  })
})

describe('ScanFormWidget — ningún campo del formulario existe sin sesión (4.4, D-6)', () => {
  it('ninguno de los seis controles del ScanForm está en el documento', () => {
    render(<ScanFormWidget onRequestLogin={vi.fn()} onRequestRegister={vi.fn()} />)

    expect(screen.queryByLabelText(/URL objetivo/i)).toBeNull()
    expect(screen.queryByLabelText(/PHPSESSID/i)).toBeNull()
    expect(screen.queryByLabelText(/Nivel de SQLMap/i)).toBeNull()
    expect(screen.queryByLabelText(/Riesgo de SQLMap/i)).toBeNull()
    expect(screen.queryByLabelText(/declaración ética|autorización/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /iniciar escaneo/i })).toBeNull()
  })
})

describe('ScanFormWidget — con sesión aparece el formulario y desaparece el muro (4.5)', () => {
  it('los campos del ScanForm están presentes, los botones del muro no, y hay control de cierre de sesión', () => {
    useAuthStore.getState().login('tok', 'a@b.com')
    render(<ScanFormWidget onRequestLogin={vi.fn()} onRequestRegister={vi.fn()} />)

    expect(screen.getByLabelText(/URL objetivo/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /iniciar sesión/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /crear cuenta/i })).toBeNull()
    expect(screen.getByRole('button', { name: /cerrar sesión/i })).toBeInTheDocument()
  })
})

describe('ScanFormWidget — el aviso ético se ve en los dos estados (4.7, D-8)', () => {
  it('sin sesión', () => {
    render(<ScanFormWidget onRequestLogin={vi.fn()} onRequestRegister={vi.fn()} />)
    expect(screen.getByText(/autorización del propietario/i)).toBeInTheDocument()
  })

  it('con sesión', () => {
    useAuthStore.getState().login('tok', 'a@b.com')
    render(<ScanFormWidget onRequestLogin={vi.fn()} onRequestRegister={vi.fn()} />)
    expect(screen.getByText(/autorización del propietario/i)).toBeInTheDocument()
  })
})

describe('ScanFormWidget — la transición es reactiva (4.8, D-6, D-11)', () => {
  it('login() revela el formulario sin remontar; cerrar sesión vuelve al muro sin red', async () => {
    const user = userEvent.setup()
    const adapter = vi.fn()
    axiosInstance.defaults.adapter = adapter

    render(<ScanFormWidget onRequestLogin={vi.fn()} onRequestRegister={vi.fn()} />)
    expect(screen.queryByLabelText(/URL objetivo/i)).toBeNull()

    useAuthStore.getState().login('tok', 'a@b.com')
    expect(await screen.findByLabelText(/URL objetivo/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /cerrar sesión/i }))

    expect(screen.queryByLabelText(/URL objetivo/i)).toBeNull()
    expect(screen.getByRole('button', { name: /iniciar sesión/i })).toBeInTheDocument()
    expect(adapter).not.toHaveBeenCalled()
  })
})

describe('ScanFormWidget — el control de cierre sólo existe con sesión (4.9)', () => {
  it('sin sesión no está en el documento', () => {
    render(<ScanFormWidget onRequestLogin={vi.fn()} onRequestRegister={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /cerrar sesión/i })).toBeNull()
  })
})

describe('ScanFormWidget — límites de la cáscara (4.10)', () => {
  it('el módulo lee isAuthenticated con un selector, no con getState()', async () => {
    const { readFileSync } = await import('node:fs')
    const path = await import('node:path')
    const source = readFileSync(
      path.resolve(__dirname, '../src/widgets/scan-form/ui/ScanFormWidget.tsx'),
      'utf-8',
    )
    expect(source).toMatch(/useAuthStore\(\s*\(?\s*\w*\s*\)?\s*=>/)
    expect(source).not.toMatch(/useAuthStore\.getState\(\)\.isAuthenticated/)
  })
})
