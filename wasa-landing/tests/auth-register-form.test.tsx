import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@entities/user'
import { AuthRequestError } from '@features/auth/lib/authErrors'
import { RegisterForm } from '@features/auth/register/ui/RegisterForm'

const { registerApiMock } = vi.hoisted(() => ({ registerApiMock: vi.fn() }))

vi.mock('@features/auth/register/api/registerApi', () => ({
  registerApi: registerApiMock,
}))

const initialState = useAuthStore.getState()

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState(initialState, true)
  registerApiMock.mockReset()
})

describe('RegisterForm: campos y botón', () => {
  it('renderiza email, contraseña y confirmación localizables por su etiqueta, y un botón Registrarme', () => {
    render(<RegisterForm onSuccess={vi.fn()} onSwitchToLogin={vi.fn()} />)

    expect(screen.getByLabelText(/^email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^contraseña/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirmar contraseña/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrarme' })).toBeInTheDocument()
  })

  it('los campos de contraseña ocultan lo escrito (type="password")', () => {
    render(<RegisterForm onSuccess={vi.fn()} onSwitchToLogin={vi.fn()} />)

    expect(screen.getByLabelText(/^contraseña/i)).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText(/confirmar contraseña/i)).toHaveAttribute('type', 'password')
  })
})

describe('RegisterForm: comportamiento', () => {
  it('escribir credenciales válidas y enviar produce la llamada esperada a registerApi', async () => {
    const user = userEvent.setup()
    registerApiMock.mockResolvedValueOnce({ access_token: 'token-xyz', token_type: 'bearer', expires_in: 3600 })
    render(<RegisterForm onSuccess={vi.fn()} onSwitchToLogin={vi.fn()} />)

    await user.type(screen.getByLabelText(/^email/i), 'alice@example.com')
    await user.type(screen.getByLabelText(/^contraseña/i), 'hunter22')
    await user.type(screen.getByLabelText(/confirmar contraseña/i), 'hunter22')
    await user.click(screen.getByRole('button', { name: 'Registrarme' }))

    await waitFor(() => {
      expect(registerApiMock).toHaveBeenCalledWith({
        email: 'alice@example.com',
        password: 'hunter22',
        confirmPassword: 'hunter22',
      })
    })
  })

  it('un 409 muestra "Este email ya está registrado." visible en el formulario', async () => {
    const user = userEvent.setup()
    registerApiMock.mockRejectedValueOnce(new AuthRequestError({ status: 409, problem: null }))
    render(<RegisterForm onSuccess={vi.fn()} onSwitchToLogin={vi.fn()} />)

    await user.type(screen.getByLabelText(/^email/i), 'alice@example.com')
    await user.type(screen.getByLabelText(/^contraseña/i), 'hunter22')
    await user.type(screen.getByLabelText(/confirmar contraseña/i), 'hunter22')
    await user.click(screen.getByRole('button', { name: 'Registrarme' }))

    expect(await screen.findByText('Este email ya está registrado.')).toBeVisible()
  })

  it('error inline de contraseña corta', async () => {
    const user = userEvent.setup()
    render(<RegisterForm onSuccess={vi.fn()} onSwitchToLogin={vi.fn()} />)

    await user.type(screen.getByLabelText(/^email/i), 'alice@example.com')
    await user.type(screen.getByLabelText(/^contraseña/i), 'short')
    await user.type(screen.getByLabelText(/confirmar contraseña/i), 'short')
    await user.click(screen.getByRole('button', { name: 'Registrarme' }))

    const passwordInput = await screen.findByLabelText(/^contraseña/i)
    await waitFor(() => expect(passwordInput).toHaveAttribute('aria-invalid', 'true'))
    expect(registerApiMock).not.toHaveBeenCalled()
  })

  it('error inline de confirmación distinta', async () => {
    const user = userEvent.setup()
    render(<RegisterForm onSuccess={vi.fn()} onSwitchToLogin={vi.fn()} />)

    await user.type(screen.getByLabelText(/^email/i), 'alice@example.com')
    await user.type(screen.getByLabelText(/^contraseña/i), 'hunter22')
    await user.type(screen.getByLabelText(/confirmar contraseña/i), 'different1')
    await user.click(screen.getByRole('button', { name: 'Registrarme' }))

    const confirmInput = await screen.findByLabelText(/confirmar contraseña/i)
    await waitFor(() => expect(confirmInput).toHaveAttribute('aria-invalid', 'true'))
    expect(registerApiMock).not.toHaveBeenCalled()
  })
})

describe('RegisterForm: doble envío (D-12)', () => {
  it('durante un envío en curso el botón está deshabilitado y muestra el indicador de carga, y dos clicks producen exactamente una petición', async () => {
    const user = userEvent.setup()
    let resolveRegister: (value: { access_token: string; token_type: string; expires_in: number }) => void = () => {}
    registerApiMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRegister = resolve
        }),
    )
    render(<RegisterForm onSuccess={vi.fn()} onSwitchToLogin={vi.fn()} />)

    await user.type(screen.getByLabelText(/^email/i), 'alice@example.com')
    await user.type(screen.getByLabelText(/^contraseña/i), 'hunter22')
    await user.type(screen.getByLabelText(/confirmar contraseña/i), 'hunter22')
    const submitButton = screen.getByRole('button', { name: 'Registrarme' })

    await user.click(submitButton)
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Registrarme' })).toBeDisabled()
    })
    expect(screen.getByRole('button', { name: 'Registrarme' })).toHaveAttribute('aria-busy', 'true')
    expect(registerApiMock).toHaveBeenCalledTimes(1)

    resolveRegister({ access_token: 'token-xyz', token_type: 'bearer', expires_in: 3600 })
  })
})

describe('RegisterForm: D-13, control de cambio de flujo', () => {
  it('el control "¿Ya tenés cuenta? Iniciá sesión" es un button type="button", invoca onSwitchToLogin y no envía el formulario', async () => {
    const user = userEvent.setup()
    const onSwitchToLogin = vi.fn()
    render(<RegisterForm onSuccess={vi.fn()} onSwitchToLogin={onSwitchToLogin} />)

    const switchControl = screen.getByRole('button', { name: /iniciá sesión/i })
    expect(switchControl).toHaveAttribute('type', 'button')

    await user.click(switchControl)

    expect(onSwitchToLogin).toHaveBeenCalledTimes(1)
    expect(registerApiMock).not.toHaveBeenCalled()
  })

  it('el componente no importa Modal ni llama a nada llamado onClose', async () => {
    const { readFileSync } = await import('node:fs')
    const path = await import('node:path')
    const source = readFileSync(
      path.resolve(__dirname, '../src/features/auth/register/ui/RegisterForm.tsx'),
      'utf-8',
    )
    expect(source).not.toMatch(/@shared\/ui\/Modal/)
    expect(source).not.toMatch(/onClose/)
  })
})
