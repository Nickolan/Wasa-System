import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * D-16: stubea el entorno (no depende del `.env` del disco) y dobla la
 * instancia de axios de la slice (`authHttp`) con `vi.mock`, para no emitir
 * tráfico de red real ni depender de su configuración real (eso ya lo cubre
 * `tests/auth-http.test.ts`).
 */
const postMock = vi.fn()

vi.mock('@features/auth/lib/authHttp', () => ({
  authHttp: { post: postMock },
}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  postMock.mockReset()
})

function stubEnv() {
  vi.stubEnv('VITE_API_BASE_URL', 'http://bridge.local')
  vi.resetModules()
}

describe('loginApi: transporte del inicio de sesión', () => {
  it('un 200 con cuerpo de token devuelve ese cuerpo sin transformarlo', async () => {
    stubEnv()
    const tokenResponse = { access_token: 'abc123', token_type: 'bearer', expires_in: 3600 }
    postMock.mockResolvedValueOnce({ status: 200, data: tokenResponse })

    const { loginApi } = await import('@features/auth/login/api/loginApi')
    const result = await loginApi({ email: 'alice@example.com', password: 'hunter2' })

    expect(result).toEqual(tokenResponse)
  })

  it('la petición es POST y su ruta termina en /api/v1/auth/login (a través de authHttp)', async () => {
    stubEnv()
    postMock.mockResolvedValueOnce({
      status: 200,
      data: { access_token: 'abc123', token_type: 'bearer', expires_in: 3600 },
    })

    const { loginApi } = await import('@features/auth/login/api/loginApi')
    await loginApi({ email: 'alice@example.com', password: 'hunter2' })

    expect(postMock).toHaveBeenCalledTimes(1)
    const [calledPath] = postMock.mock.calls[0] as [string, unknown]
    expect(calledPath).toBe('/login')
  })

  it('el cuerpo enviado es exactamente { email, password }', async () => {
    stubEnv()
    postMock.mockResolvedValueOnce({
      status: 200,
      data: { access_token: 'abc123', token_type: 'bearer', expires_in: 3600 },
    })

    const { loginApi } = await import('@features/auth/login/api/loginApi')
    await loginApi({ email: 'alice@example.com', password: 'hunter2' })

    const [, calledBody] = postMock.mock.calls[0] as [string, unknown]
    expect(calledBody).toEqual({ email: 'alice@example.com', password: 'hunter2' })
  })

  it('un 401 lanza AuthRequestError con status 401', async () => {
    stubEnv()
    postMock.mockRejectedValueOnce({
      response: {
        status: 401,
        data: {
          type: 'about:blank',
          title: 'Unauthorized',
          status: 401,
          detail: 'Credenciales inválidas',
          instance: '/api/v1/auth/login',
        },
      },
    })

    // Import dinámico de ambos: D-16 usa vi.resetModules(), así que la clase
    // AuthRequestError importada estáticamente arriba del archivo (antes de
    // cualquier resetModules) sería una identidad distinta de la que usa
    // loginApi internamente — instanceof fallaría por eso, no por un bug real.
    const { loginApi } = await import('@features/auth/login/api/loginApi')
    const { AuthRequestError } = await import('@features/auth/lib/authErrors')

    await expect(loginApi({ email: 'alice@example.com', password: 'wrong' })).rejects.toMatchObject({
      status: 401,
    })

    postMock.mockRejectedValueOnce({
      response: {
        status: 401,
        data: {
          type: 'about:blank',
          title: 'Unauthorized',
          status: 401,
          detail: 'Credenciales inválidas',
          instance: '/api/v1/auth/login',
        },
      },
    })
    await expect(
      loginApi({ email: 'alice@example.com', password: 'wrong' }),
    ).rejects.toBeInstanceOf(AuthRequestError)
  })

  it('un 500 lanza AuthRequestError con status 500', async () => {
    stubEnv()
    postMock.mockRejectedValueOnce({ response: { status: 500, data: null } })

    const { loginApi } = await import('@features/auth/login/api/loginApi')

    await expect(loginApi({ email: 'alice@example.com', password: 'hunter2' })).rejects.toMatchObject({
      status: 500,
    })
  })

  it('un fallo sin respuesta lanza AuthRequestError con status null', async () => {
    stubEnv()
    postMock.mockRejectedValueOnce({ response: undefined })

    const { loginApi } = await import('@features/auth/login/api/loginApi')

    await expect(loginApi({ email: 'alice@example.com', password: 'hunter2' })).rejects.toMatchObject({
      status: null,
    })
  })

  it('un cuerpo de error con forma RFC 7807 queda accesible en problem', async () => {
    stubEnv()
    const problem = {
      type: 'about:blank',
      title: 'Unauthorized',
      status: 401,
      detail: 'Credenciales inválidas',
      instance: '/api/v1/auth/login',
    }
    postMock.mockRejectedValueOnce({ response: { status: 401, data: problem } })

    const { loginApi } = await import('@features/auth/login/api/loginApi')

    await expect(loginApi({ email: 'alice@example.com', password: 'wrong' })).rejects.toMatchObject({
      problem,
    })
  })

  it('un cuerpo sin esa forma deja problem: null', async () => {
    stubEnv()
    postMock.mockRejectedValueOnce({ response: { status: 502, data: '<html>Bad Gateway</html>' } })

    const { loginApi } = await import('@features/auth/login/api/loginApi')

    await expect(loginApi({ email: 'alice@example.com', password: 'hunter2' })).rejects.toMatchObject({
      problem: null,
    })
  })
})
