import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@entities/user'
import { AuthRequestError } from '@features/auth/lib/authErrors'

const registerApiMock = vi.fn()

vi.mock('@features/auth/register/api/registerApi', () => ({
  registerApi: registerApiMock,
}))

const initialState = useAuthStore.getState()

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState(initialState, true)
  registerApiMock.mockReset()
})

/** Escribe email/password/confirmPassword en el hook y dispara el submit, esperando a que termine. */
async function fillAndSubmit(
  result: { current: ReturnType<typeof import('@features/auth/register/model/useRegister').useRegister> },
  values: { email: string; password: string; confirmPassword: string },
) {
  act(() => {
    result.current.register('email').onChange({ target: { value: values.email, name: 'email' } })
    result.current.register('password').onChange({ target: { value: values.password, name: 'password' } })
    result.current
      .register('confirmPassword')
      .onChange({ target: { value: values.confirmPassword, name: 'confirmPassword' } })
  })
  await act(async () => {
    await result.current.handleSubmit()
  })
}

describe('useRegister: orquestación del registro', () => {
  it('un envío válido llama a registerApi', async () => {
    const { useRegister } = await import('@features/auth/register/model/useRegister')
    registerApiMock.mockResolvedValueOnce({ access_token: 'token-xyz', token_type: 'bearer', expires_in: 3600 })
    const { result } = renderHook(() => useRegister({ onSuccess: vi.fn() }))

    await fillAndSubmit(result, { email: 'alice@example.com', password: 'hunter22', confirmPassword: 'hunter22' })

    await waitFor(() => {
      expect(registerApiMock).toHaveBeenCalledWith({
        email: 'alice@example.com',
        password: 'hunter22',
        confirmPassword: 'hunter22',
      })
    })
  })

  describe('camino feliz', () => {
    it('en éxito el store queda autenticado (sin requerir un login posterior)', async () => {
      const { useRegister } = await import('@features/auth/register/model/useRegister')
      registerApiMock.mockResolvedValueOnce({ access_token: 'token-xyz', token_type: 'bearer', expires_in: 3600 })
      const { result } = renderHook(() => useRegister({ onSuccess: vi.fn() }))

      await fillAndSubmit(result, { email: 'alice@example.com', password: 'hunter22', confirmPassword: 'hunter22' })

      await waitFor(() => {
        expect(useAuthStore.getState().isAuthenticated).toBe(true)
        expect(useAuthStore.getState().token).toBe('token-xyz')
      })
    })

    it('onSuccess se invoca una vez y después de que la sesión esté establecida', async () => {
      const { useRegister } = await import('@features/auth/register/model/useRegister')
      registerApiMock.mockResolvedValueOnce({ access_token: 'token-xyz', token_type: 'bearer', expires_in: 3600 })
      let wasAuthenticatedAtCallTime: boolean | null = null
      const onSuccess = vi.fn(() => {
        wasAuthenticatedAtCallTime = useAuthStore.getState().isAuthenticated
      })
      const { result } = renderHook(() => useRegister({ onSuccess }))

      await fillAndSubmit(result, { email: 'alice@example.com', password: 'hunter22', confirmPassword: 'hunter22' })

      await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
      expect(wasAuthenticatedAtCallTime).toBe(true)
    })
  })

  describe('camino de fallo', () => {
    it('un 409 deja "Este email ya está registrado."; store sin autenticar; onSuccess sin invocar', async () => {
      const { useRegister } = await import('@features/auth/register/model/useRegister')
      registerApiMock.mockRejectedValueOnce(new AuthRequestError({ status: 409, problem: null }))
      const onSuccess = vi.fn()
      const { result } = renderHook(() => useRegister({ onSuccess }))

      await fillAndSubmit(result, { email: 'alice@example.com', password: 'hunter22', confirmPassword: 'hunter22' })

      await waitFor(() => expect(result.current.serverError).toBe('Este email ya está registrado.'))
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
      expect(onSuccess).not.toHaveBeenCalled()
    })

    it.each([
      ['500', 500],
      ['422', 422],
      ['sin respuesta', null],
      ['401 (sin lectura en registro)', 401],
    ])('%s cae al mensaje genérico; store sin autenticar', async (_label, status) => {
      const { useRegister } = await import('@features/auth/register/model/useRegister')
      registerApiMock.mockRejectedValueOnce(new AuthRequestError({ status, problem: null }))
      const { result } = renderHook(() => useRegister({ onSuccess: vi.fn() }))

      await fillAndSubmit(result, { email: 'alice@example.com', password: 'hunter22', confirmPassword: 'hunter22' })

      await waitFor(() => {
        expect(result.current.serverError).toBe(
          'No pudimos completar la operación. Intentá de nuevo en unos minutos.',
        )
      })
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
    })
  })

  describe('validación como puerta', () => {
    it('contraseña de menos de 8 caracteres bloquea la llamada y produce error en el campo', async () => {
      const { useRegister } = await import('@features/auth/register/model/useRegister')
      const { result } = renderHook(() => useRegister({ onSuccess: vi.fn() }))

      await fillAndSubmit(result, { email: 'alice@example.com', password: 'short', confirmPassword: 'short' })

      await waitFor(() => expect(result.current.errors.password).toBeDefined())
      expect(registerApiMock).not.toHaveBeenCalled()
    })

    it('confirmación distinta bloquea la llamada y produce error en el campo de confirmación', async () => {
      const { useRegister } = await import('@features/auth/register/model/useRegister')
      const { result } = renderHook(() => useRegister({ onSuccess: vi.fn() }))

      await fillAndSubmit(result, {
        email: 'alice@example.com',
        password: 'hunter22',
        confirmPassword: 'different1',
      })

      await waitFor(() => expect(result.current.errors.confirmPassword).toBeDefined())
      expect(registerApiMock).not.toHaveBeenCalled()
    })
  })
})
