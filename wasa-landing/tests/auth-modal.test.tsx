import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@entities/user'
import { LoginModal, RegisterModal } from '@widgets/auth-modal'

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
})

afterEach(() => {
  cleanup()
})

async function loginSuccessfully(user: ReturnType<typeof userEvent.setup>) {
  loginApiMock.mockResolvedValueOnce({ access_token: 'tok-1', token_type: 'bearer', expires_in: 3600 })
  await user.type(screen.getByLabelText(/email/i), 'alice@example.com')
  await user.type(screen.getByLabelText(/contraseña/i), 'hunter22')
  await user.click(screen.getByRole('button', { name: 'Ingresar' }))
}

async function registerSuccessfully(user: ReturnType<typeof userEvent.setup>) {
  registerApiMock.mockResolvedValueOnce({ access_token: 'tok-2', token_type: 'bearer', expires_in: 3600 })
  await user.type(screen.getByLabelText(/^email/i), 'bob@example.com')
  await user.type(screen.getByLabelText(/^contraseña/i), 'hunter22')
  await user.type(screen.getByLabelText(/confirmar contraseña/i), 'hunter22')
  await user.click(screen.getByRole('button', { name: 'Registrarme' }))
}

describe('LoginModal — cerrado no renderiza nada (3.1)', () => {
  it('isOpen=false no deja ningún nodo en el documento', () => {
    const { container } = render(
      <LoginModal isOpen={false} onClose={vi.fn()} onSwitchToRegister={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe('LoginModal — abierto muestra el diálogo con el LoginForm (3.1, 3.2)', () => {
  it('renderiza role="dialog" con los campos de email y contraseña', () => {
    render(<LoginModal isOpen onClose={vi.fn()} onSwitchToRegister={vi.fn()} />)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument()
  })
})

describe('RegisterModal — cerrado y abierto (3.3)', () => {
  it('isOpen=false no deja ningún nodo en el documento', () => {
    const { container } = render(
      <RegisterModal isOpen={false} onClose={vi.fn()} onSwitchToLogin={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('abierto renderiza role="dialog" con email, contraseña y confirmación de contraseña', () => {
    render(<RegisterModal isOpen onClose={vi.fn()} onSwitchToLogin={vi.fn()} />)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText(/^email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^contraseña/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirmar contraseña/i)).toBeInTheDocument()
  })

  it('los dos diálogos tienen nombres accesibles distintos', () => {
    const { unmount } = render(<LoginModal isOpen onClose={vi.fn()} onSwitchToRegister={vi.fn()} />)
    const loginDialogName = screen.getByRole('dialog').getAttribute('aria-labelledby')
    const loginTitle = loginDialogName ? document.getElementById(loginDialogName)?.textContent : null
    unmount()

    render(<RegisterModal isOpen onClose={vi.fn()} onSwitchToLogin={vi.fn()} />)
    const registerDialogName = screen.getByRole('dialog').getAttribute('aria-labelledby')
    const registerTitle = registerDialogName
      ? document.getElementById(registerDialogName)?.textContent
      : null

    expect(loginTitle).toBeTruthy()
    expect(registerTitle).toBeTruthy()
    expect(loginTitle).not.toBe(registerTitle)
  })
})

describe('LoginModal / RegisterModal — el éxito cierra (3.4)', () => {
  it('LoginModal: onClose se invoca exactamente una vez, y en ese instante la sesión ya está autenticada', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn(() => {
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
    })
    render(<LoginModal isOpen onClose={onClose} onSwitchToRegister={vi.fn()} />)

    await loginSuccessfully(user)

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('RegisterModal: onClose se invoca exactamente una vez, y en ese instante la sesión ya está autenticada', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn(() => {
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
    })
    render(<RegisterModal isOpen onClose={onClose} onSwitchToLogin={vi.fn()} />)

    await registerSuccessfully(user)

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })
})

describe('LoginModal / RegisterModal — el éxito además llama a onAuthSuccess (3.5, D-3)', () => {
  it('LoginModal: onAuthSuccess se invoca una vez, después de onClose', async () => {
    const user = userEvent.setup()
    const calls: string[] = []
    const onClose = vi.fn(() => calls.push('onClose'))
    const onAuthSuccess = vi.fn(() => calls.push('onAuthSuccess'))
    render(<LoginModal isOpen onClose={onClose} onSwitchToRegister={vi.fn()} onAuthSuccess={onAuthSuccess} />)

    await loginSuccessfully(user)

    await waitFor(() => expect(onAuthSuccess).toHaveBeenCalledTimes(1))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(calls).toEqual(['onClose', 'onAuthSuccess'])
  })

  it('LoginModal: sin onAuthSuccess, el envío exitoso sigue cerrando sin lanzar', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<LoginModal isOpen onClose={onClose} onSwitchToRegister={vi.fn()} />)

    await expect(loginSuccessfully(user)).resolves.not.toThrow()

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('RegisterModal: onAuthSuccess se invoca una vez, después de onClose', async () => {
    const user = userEvent.setup()
    const calls: string[] = []
    const onClose = vi.fn(() => calls.push('onClose'))
    const onAuthSuccess = vi.fn(() => calls.push('onAuthSuccess'))
    render(<RegisterModal isOpen onClose={onClose} onSwitchToLogin={vi.fn()} onAuthSuccess={onAuthSuccess} />)

    await registerSuccessfully(user)

    await waitFor(() => expect(onAuthSuccess).toHaveBeenCalledTimes(1))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(calls).toEqual(['onClose', 'onAuthSuccess'])
  })

  it('RegisterModal: sin onAuthSuccess, el envío exitoso sigue cerrando sin lanzar', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<RegisterModal isOpen onClose={onClose} onSwitchToLogin={vi.fn()} />)

    await expect(registerSuccessfully(user)).resolves.not.toThrow()

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })
})

describe('LoginModal / RegisterModal — el enlace de cambio no cierra ni dispara éxito (3.6)', () => {
  it('LoginModal: "¿No tenés cuenta?" invoca onSwitchToRegister una vez, y no invoca onClose ni onAuthSuccess', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onAuthSuccess = vi.fn()
    const onSwitchToRegister = vi.fn()
    render(
      <LoginModal
        isOpen
        onClose={onClose}
        onSwitchToRegister={onSwitchToRegister}
        onAuthSuccess={onAuthSuccess}
      />,
    )

    await user.click(screen.getByRole('button', { name: /registrate/i }))

    expect(onSwitchToRegister).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
    expect(onAuthSuccess).not.toHaveBeenCalled()
  })

  it('RegisterModal: "¿Ya tenés cuenta?" invoca onSwitchToLogin una vez, y no invoca onClose ni onAuthSuccess', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onAuthSuccess = vi.fn()
    const onSwitchToLogin = vi.fn()
    render(
      <RegisterModal isOpen onClose={onClose} onSwitchToLogin={onSwitchToLogin} onAuthSuccess={onAuthSuccess} />,
    )

    await user.click(screen.getByRole('button', { name: /iniciá sesión/i }))

    expect(onSwitchToLogin).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
    expect(onAuthSuccess).not.toHaveBeenCalled()
  })
})

describe('LoginModal — abandonar sin autenticarse (3.7)', () => {
  it('Escape invoca onClose una vez, sin onAuthSuccess, sin petición y sin tocar la sesión; backdrop igual; clic en un campo no cierra', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onAuthSuccess = vi.fn()
    render(<LoginModal isOpen onClose={onClose} onSwitchToRegister={vi.fn()} onAuthSuccess={onAuthSuccess} />)

    // Un clic sobre un campo dentro del diálogo no cierra.
    await user.click(screen.getByLabelText(/email/i))
    expect(onClose).not.toHaveBeenCalled()

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onAuthSuccess).not.toHaveBeenCalled()
    expect(loginApiMock).not.toHaveBeenCalled()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('clic en el backdrop invoca onClose una vez', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<LoginModal isOpen onClose={onClose} onSwitchToRegister={vi.fn()} />)

    await user.click(screen.getByTestId('modal-backdrop'))

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('LoginModal — reabrir empieza limpio (3.8, D-4)', () => {
  it('escribir en el campo de email, remontar cerrado y volver a abrir deja el campo vacío', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<LoginModal isOpen onClose={vi.fn()} onSwitchToRegister={vi.fn()} />)

    await user.type(screen.getByLabelText(/email/i), 'alice@example.com')
    expect(screen.getByLabelText(/email/i)).toHaveValue('alice@example.com')

    rerender(<LoginModal isOpen={false} onClose={vi.fn()} onSwitchToRegister={vi.fn()} />)
    rerender(<LoginModal isOpen onClose={vi.fn()} onSwitchToRegister={vi.fn()} />)

    expect(screen.getByLabelText(/email/i)).toHaveValue('')
  })
})

describe('LoginModal / RegisterModal — API pública y límites de la cáscara (3.9)', () => {
  it('ambos se exportan desde src/widgets/auth-modal/index.ts', async () => {
    const widgetIndex = await import('@widgets/auth-modal')
    expect(widgetIndex.LoginModal).toBeDefined()
    expect(widgetIndex.RegisterModal).toBeDefined()
  })

  it('ninguno de los dos redefine campos, validación ni mensajes propios', async () => {
    const { readFileSync } = await import('node:fs')
    const path = await import('node:path')
    const loginSource = readFileSync(
      path.resolve(__dirname, '../src/widgets/auth-modal/ui/LoginModal.tsx'),
      'utf-8',
    )
    const registerSource = readFileSync(
      path.resolve(__dirname, '../src/widgets/auth-modal/ui/RegisterModal.tsx'),
      'utf-8',
    )

    for (const source of [loginSource, registerSource]) {
      expect(source).not.toMatch(/useForm/)
      expect(source).not.toMatch(/zodResolver/)
      expect(source).not.toMatch(/@app\//)
      expect(source).not.toMatch(/@pages\//)
    }
  })
})
