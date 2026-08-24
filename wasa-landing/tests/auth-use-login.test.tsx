import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@entities/user'
import { AuthRequestError } from '@features/auth/lib/authErrors'

const loginApiMock = vi.fn()

vi.mock('@features/auth/login/api/loginApi', () => ({
  loginApi: loginApiMock,
}))

const initialState = useAuthStore.getState()

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState(initialState, true)
  loginApiMock.mockReset()
})

/** Escribe email/password en el hook y dispara el submit, esperando a que termine. */
async function fillAndSubmit(
  result: { current: ReturnType<typeof import('@features/auth/login/model/useLogin').useLogin> },
  values: { email: string; password: string },
) {
  act(() => {
    result.current.register('email').onChange({ target: { value: values.email, name: 'email' } })
    result.current.register('password').onChange({ target: { value: values.password, name: 'password' } })
  })
  await act(async () => {
    await result.current.handleSubmit()
  })
}

describe('useLogin: orquestación del inicio de sesión', () => {
  it('un envío válido llama a loginApi con los valores del formulario', async () => {
    const { useLogin } = await import('@features/auth/login/model/useLogin')
    loginApiMock.mockResolvedValueOnce({ access_token: 'token-abc', token_type: 'bearer', expires_in: 3600 })
    const onSuccess = vi.fn()

    const { result } = renderHook(() => useLogin({ onSuccess }))

    act(() => {
      result.current.register('email').onChange({ target: { value: 'alice@example.com', name: 'email' } })
      result.current.register('password').onChange({ target: { value: 'hunter22', name: 'password' } })
    })

    await act(async () => {
      await result.current.handleSubmit()
    })

    await waitFor(() => {
      expect(loginApiMock).toHaveBeenCalledWith({ email: 'alice@example.com', password: 'hunter22' })
    })
  })

  describe('camino feliz', () => {
    it('en éxito, el store queda autenticado con el token recibido', async () => {
      const { useLogin } = await import('@features/auth/login/model/useLogin')
      loginApiMock.mockResolvedValueOnce({ access_token: 'token-abc', token_type: 'bearer', expires_in: 3600 })
      const onSuccess = vi.fn()
      const { result } = renderHook(() => useLogin({ onSuccess }))

      await fillAndSubmit(result, { email: 'alice@example.com', password: 'hunter22' })

      await waitFor(() => {
        expect(useAuthStore.getState().isAuthenticated).toBe(true)
        expect(useAuthStore.getState().token).toBe('token-abc')
      })
    })

    it('onSuccess se invoca exactamente una vez', async () => {
      const { useLogin } = await import('@features/auth/login/model/useLogin')
      loginApiMock.mockResolvedValueOnce({ access_token: 'token-abc', token_type: 'bearer', expires_in: 3600 })
      const onSuccess = vi.fn()
      const { result } = renderHook(() => useLogin({ onSuccess }))

      await fillAndSubmit(result, { email: 'alice@example.com', password: 'hunter22' })

      await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    })

    it('la sesión ya figura autenticada en el instante en que se invoca onSuccess (D-9, orden verificado)', async () => {
      const { useLogin } = await import('@features/auth/login/model/useLogin')
      loginApiMock.mockResolvedValueOnce({ access_token: 'token-abc', token_type: 'bearer', expires_in: 3600 })
      let wasAuthenticatedAtCallTime: boolean | null = null
      const onSuccess = vi.fn(() => {
        wasAuthenticatedAtCallTime = useAuthStore.getState().isAuthenticated
      })
      const { result } = renderHook(() => useLogin({ onSuccess }))

      await fillAndSubmit(result, { email: 'alice@example.com', password: 'hunter22' })

      await waitFor(() => expect(onSuccess).toHaveBeenCalled())
      expect(wasAuthenticatedAtCallTime).toBe(true)
    })

    it('el email guardado es el normalizado por el schema, no el crudo con espacios', async () => {
      const { useLogin } = await import('@features/auth/login/model/useLogin')
      loginApiMock.mockResolvedValueOnce({ access_token: 'token-abc', token_type: 'bearer', expires_in: 3600 })
      const onSuccess = vi.fn()
      const { result } = renderHook(() => useLogin({ onSuccess }))

      await fillAndSubmit(result, { email: '  alice@example.com  ', password: 'hunter22' })

      await waitFor(() => {
        expect(useAuthStore.getState().email).toBe('alice@example.com')
      })
    })
  })

  describe('camino de fallo', () => {
    it('un 401 deja serverError en "Credenciales incorrectas.", el store sin autenticar y onSuccess sin invocar', async () => {
      const { useLogin } = await import('@features/auth/login/model/useLogin')
      loginApiMock.mockRejectedValueOnce(new AuthRequestError({ status: 401, problem: null }))
      const onSuccess = vi.fn()
      const { result } = renderHook(() => useLogin({ onSuccess }))

      await fillAndSubmit(result, { email: 'alice@example.com', password: 'wrong' })

      await waitFor(() => {
        expect(result.current.serverError).toBe('Credenciales incorrectas.')
      })
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
      expect(onSuccess).not.toHaveBeenCalled()
    })

    it('un 500 deja el mensaje genérico', async () => {
      const { useLogin } = await import('@features/auth/login/model/useLogin')
      loginApiMock.mockRejectedValueOnce(new AuthRequestError({ status: 500, problem: null }))
      const { result } = renderHook(() => useLogin({ onSuccess: vi.fn() }))

      await fillAndSubmit(result, { email: 'alice@example.com', password: 'hunter22' })

      await waitFor(() => {
        expect(result.current.serverError).toBe(
          'No pudimos completar la operación. Intentá de nuevo en unos minutos.',
        )
      })
    })

    it('un fallo de red (status null) deja el mensaje genérico', async () => {
      const { useLogin } = await import('@features/auth/login/model/useLogin')
      loginApiMock.mockRejectedValueOnce(new AuthRequestError({ status: null, problem: null }))
      const { result } = renderHook(() => useLogin({ onSuccess: vi.fn() }))

      await fillAndSubmit(result, { email: 'alice@example.com', password: 'hunter22' })

      await waitFor(() => {
        expect(result.current.serverError).toBe(
          'No pudimos completar la operación. Intentá de nuevo en unos minutos.',
        )
      })
    })

    it('un 409 (sin lectura en login) también cae al genérico', async () => {
      const { useLogin } = await import('@features/auth/login/model/useLogin')
      loginApiMock.mockRejectedValueOnce(new AuthRequestError({ status: 409, problem: null }))
      const { result } = renderHook(() => useLogin({ onSuccess: vi.fn() }))

      await fillAndSubmit(result, { email: 'alice@example.com', password: 'hunter22' })

      await waitFor(() => {
        expect(result.current.serverError).toBe(
          'No pudimos completar la operación. Intentá de nuevo en unos minutos.',
        )
      })
    })
  })

  describe('validación como puerta', () => {
    it('con email malformado no se emite ninguna llamada a loginApi y el error queda asociado al campo', async () => {
      const { useLogin } = await import('@features/auth/login/model/useLogin')
      const { result } = renderHook(() => useLogin({ onSuccess: vi.fn() }))

      await fillAndSubmit(result, { email: 'no-es-un-email', password: 'hunter22' })

      await waitFor(() => {
        expect(result.current.errors.email).toBeDefined()
      })
      expect(loginApiMock).not.toHaveBeenCalled()
    })

    it('con contraseña vacía no se emite ninguna llamada a loginApi y el error queda asociado al campo', async () => {
      const { useLogin } = await import('@features/auth/login/model/useLogin')
      const { result } = renderHook(() => useLogin({ onSuccess: vi.fn() }))

      await fillAndSubmit(result, { email: 'alice@example.com', password: '' })

      await waitFor(() => {
        expect(result.current.errors.password).toBeDefined()
      })
      expect(loginApiMock).not.toHaveBeenCalled()
    })
  })

  describe('estado de envío (D-10, D-11)', () => {
    it('isSubmitting se desactiva tras éxito', async () => {
      const { useLogin } = await import('@features/auth/login/model/useLogin')
      loginApiMock.mockResolvedValueOnce({ access_token: 'token-abc', token_type: 'bearer', expires_in: 3600 })
      const { result } = renderHook(() => useLogin({ onSuccess: vi.fn() }))

      await fillAndSubmit(result, { email: 'alice@example.com', password: 'hunter22' })

      await waitFor(() => expect(result.current.isSubmitting).toBe(false))
    })

    it('isSubmitting se desactiva tras fallo', async () => {
      const { useLogin } = await import('@features/auth/login/model/useLogin')
      loginApiMock.mockRejectedValueOnce(new AuthRequestError({ status: 401, problem: null }))
      const { result } = renderHook(() => useLogin({ onSuccess: vi.fn() }))

      await fillAndSubmit(result, { email: 'alice@example.com', password: 'wrong' })

      await waitFor(() => expect(result.current.isSubmitting).toBe(false))
    })

    it('el serverError del intento anterior se limpia al comenzar el siguiente', async () => {
      const { useLogin } = await import('@features/auth/login/model/useLogin')
      loginApiMock.mockRejectedValueOnce(new AuthRequestError({ status: 401, problem: null }))
      const { result } = renderHook(() => useLogin({ onSuccess: vi.fn() }))

      await fillAndSubmit(result, { email: 'alice@example.com', password: 'wrong' })
      await waitFor(() => expect(result.current.serverError).toBe('Credenciales incorrectas.'))

      loginApiMock.mockResolvedValueOnce({ access_token: 'token-abc', token_type: 'bearer', expires_in: 3600 })
      await fillAndSubmit(result, { email: 'alice@example.com', password: 'correct-pass' })

      await waitFor(() => expect(result.current.serverError).toBeNull())
    })
  })

  describe('R-4: un login fallido no cierra una sesión ya establecida', () => {
    it('con una sesión ya establecida, un login que recibe 401 no la cierra', async () => {
      useAuthStore.getState().login('previous-token', 'bob@example.com')
      const { useLogin } = await import('@features/auth/login/model/useLogin')
      loginApiMock.mockRejectedValueOnce(new AuthRequestError({ status: 401, problem: null }))
      const { result } = renderHook(() => useLogin({ onSuccess: vi.fn() }))

      await fillAndSubmit(result, { email: 'alice@example.com', password: 'wrong' })

      await waitFor(() => expect(result.current.serverError).toBe('Credenciales incorrectas.'))
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
      expect(useAuthStore.getState().token).toBe('previous-token')
    })
  })
})
