import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@entities/user'
import { AuthRequestError } from '@features/auth/lib/authErrors'
import { LoginForm } from '@features/auth/login/ui/LoginForm'

const { loginApiMock } = vi.hoisted(() => ({ loginApiMock: vi.fn() }))

vi.mock('@features/auth/login/api/loginApi', () => ({
  loginApi: loginApiMock,
}))

const initialState = useAuthStore.getState()

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState(initialState, true)
  loginApiMock.mockReset()
})

describe('LoginForm: campos y botón', () => {
  it('renderiza un campo de email y uno de contraseña localizables por su etiqueta, y un botón Ingresar', () => {
    render(<LoginForm onSuccess={vi.fn()} onSwitchToRegister={vi.fn()} />)

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ingresar' })).toBeInTheDocument()
  })

  it('el campo de contraseña oculta lo escrito (type="password")', () => {
    render(<LoginForm onSuccess={vi.fn()} onSwitchToRegister={vi.fn()} />)

    expect(screen.getByLabelText(/contraseña/i)).toHaveAttribute('type', 'password')
  })
})

describe('LoginForm: comportamiento', () => {
  it('escribir credenciales y enviar produce la llamada esperada a loginApi', async () => {
    const user = userEvent.setup()
    loginApiMock.mockResolvedValueOnce({ access_token: 'token-abc', token_type: 'bearer', expires_in: 3600 })
    render(<LoginForm onSuccess={vi.fn()} onSwitchToRegister={vi.fn()} />)

    await user.type(screen.getByLabelText(/email/i), 'alice@example.com')
    await user.type(screen.getByLabelText(/contraseña/i), 'hunter22')
    await user.click(screen.getByRole('button', { name: 'Ingresar' }))

    await waitFor(() => {
      expect(loginApiMock).toHaveBeenCalledWith({ email: 'alice@example.com', password: 'hunter22' })
    })
  })

  it('un 401 muestra "Credenciales incorrectas." visible en el formulario', async () => {
    const user = userEvent.setup()
    loginApiMock.mockRejectedValueOnce(new AuthRequestError({ status: 401, problem: null }))
    render(<LoginForm onSuccess={vi.fn()} onSwitchToRegister={vi.fn()} />)

    await user.type(screen.getByLabelText(/email/i), 'alice@example.com')
    await user.type(screen.getByLabelText(/contraseña/i), 'wrong-pass')
    await user.click(screen.getByRole('button', { name: 'Ingresar' }))

    expect(await screen.findByText('Credenciales incorrectas.')).toBeVisible()
  })

  it('los errores por campo aparecen asociados a su campo', async () => {
    const user = userEvent.setup()
    render(<LoginForm onSuccess={vi.fn()} onSwitchToRegister={vi.fn()} />)

    await user.type(screen.getByLabelText(/email/i), 'no-es-un-email')
    await user.click(screen.getByRole('button', { name: 'Ingresar' }))

    const emailInput = await screen.findByLabelText(/email/i)
    await waitFor(() => expect(emailInput).toHaveAttribute('aria-invalid', 'true'))
    expect(loginApiMock).not.toHaveBeenCalled()
  })
})

describe('LoginForm: doble envío (D-12)', () => {
  it('durante un envío en curso el botón está deshabilitado y muestra el indicador de carga, y dos clicks producen exactamente una petición', async () => {
    const user = userEvent.setup()
    let resolveLogin: (value: { access_token: string; token_type: string; expires_in: number }) => void = () => {}
    loginApiMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLogin = resolve
        }),
    )
    render(<LoginForm onSuccess={vi.fn()} onSwitchToRegister={vi.fn()} />)

    await user.type(screen.getByLabelText(/email/i), 'alice@example.com')
    await user.type(screen.getByLabelText(/contraseña/i), 'hunter22')
    const submitButton = screen.getByRole('button', { name: 'Ingresar' })

    await user.click(submitButton)
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Ingresar' })).toBeDisabled()
    })
    expect(screen.getByRole('button', { name: 'Ingresar' })).toHaveAttribute('aria-busy', 'true')
    expect(loginApiMock).toHaveBeenCalledTimes(1)

    resolveLogin({ access_token: 'token-abc', token_type: 'bearer', expires_in: 3600 })
  })
})

describe('LoginForm: D-13, control de cambio de flujo', () => {
  it('el control "¿No tenés cuenta? Registrate" es un button type="button", invoca onSwitchToRegister y no envía el formulario', async () => {
    const user = userEvent.setup()
    const onSwitchToRegister = vi.fn()
    render(<LoginForm onSuccess={vi.fn()} onSwitchToRegister={onSwitchToRegister} />)

    const switchControl = screen.getByRole('button', { name: /registrate/i })
    expect(switchControl).toHaveAttribute('type', 'button')

    await user.click(switchControl)

    expect(onSwitchToRegister).toHaveBeenCalledTimes(1)
    expect(loginApiMock).not.toHaveBeenCalled()
  })

  it('el componente no importa Modal ni llama a nada llamado onClose', async () => {
    const { readFileSync } = await import('node:fs')
    const path = await import('node:path')
    const source = readFileSync(
      path.resolve(__dirname, '../src/features/auth/login/ui/LoginForm.tsx'),
      'utf-8',
    )
    expect(source).not.toMatch(/@shared\/ui\/Modal/)
    expect(source).not.toMatch(/onClose/)
  })
})
