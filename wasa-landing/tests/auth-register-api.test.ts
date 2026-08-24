import { afterEach, describe, expect, it, vi } from 'vitest'

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
  vi.stubEnv('VITE_DASHBOARD_URL', 'http://localhost:5174')
  vi.resetModules()
}

describe('registerApi: transporte del registro', () => {
  it('un 201 con cuerpo de token devuelve ese cuerpo', async () => {
    stubEnv()
    const tokenResponse = { access_token: 'xyz789', token_type: 'bearer', expires_in: 3600 }
    postMock.mockResolvedValueOnce({ status: 201, data: tokenResponse })

    const { registerApi } = await import('@features/auth/register/api/registerApi')
    const result = await registerApi({
      email: 'alice@example.com',
      password: 'hunter22',
      confirmPassword: 'hunter22',
    })

    expect(result).toEqual(tokenResponse)
  })

  it('caso de seguridad, no omitible: el cuerpo enviado no contiene confirmPassword aunque el objeto de entrada lo traiga', async () => {
    stubEnv()
    postMock.mockResolvedValueOnce({
      status: 201,
      data: { access_token: 'xyz789', token_type: 'bearer', expires_in: 3600 },
    })

    const { registerApi } = await import('@features/auth/register/api/registerApi')
    await registerApi({ email: 'alice@example.com', password: 'hunter22', confirmPassword: 'hunter22' })

    const [, calledBody] = postMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(calledBody).toEqual({ email: 'alice@example.com', password: 'hunter22' })
    expect('confirmPassword' in calledBody).toBe(false)
  })

  it('caso de seguridad: un campo extra arbitrario agregado al objeto de entrada tampoco viaja (allowlist, no copia filtrada)', async () => {
    stubEnv()
    postMock.mockResolvedValueOnce({
      status: 201,
      data: { access_token: 'xyz789', token_type: 'bearer', expires_in: 3600 },
    })

    const { registerApi } = await import('@features/auth/register/api/registerApi')
    const valuesWithExtraField = {
      email: 'alice@example.com',
      password: 'hunter22',
      confirmPassword: 'hunter22',
      isAdmin: true,
    }
    // El tipo UserRegister no declara isAdmin; se fuerza para simular un
    // objeto de formulario contaminado, que es exactamente lo que D-8 debe
    // neutralizar sin que nadie tenga que acordarse de filtrarlo.
    await registerApi(valuesWithExtraField as unknown as Parameters<typeof registerApi>[0])

    const [, calledBody] = postMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(Object.keys(calledBody).sort()).toEqual(['email', 'password'])
  })

  it('la ruta termina en /api/v1/auth/register y el método es POST', async () => {
    stubEnv()
    postMock.mockResolvedValueOnce({
      status: 201,
      data: { access_token: 'xyz789', token_type: 'bearer', expires_in: 3600 },
    })

    const { registerApi } = await import('@features/auth/register/api/registerApi')
    await registerApi({ email: 'alice@example.com', password: 'hunter22', confirmPassword: 'hunter22' })

    const [calledPath] = postMock.mock.calls[0] as [string, unknown]
    expect(calledPath).toBe('/register')
  })

  it('un 409 lanza AuthRequestError con status 409', async () => {
    stubEnv()
    postMock.mockRejectedValueOnce({ response: { status: 409, data: null } })

    const { registerApi } = await import('@features/auth/register/api/registerApi')

    await expect(
      registerApi({ email: 'alice@example.com', password: 'hunter22', confirmPassword: 'hunter22' }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('un 422 lanza AuthRequestError con status 422', async () => {
    stubEnv()
    postMock.mockRejectedValueOnce({ response: { status: 422, data: null } })

    const { registerApi } = await import('@features/auth/register/api/registerApi')

    await expect(
      registerApi({ email: 'alice@example.com', password: 'hunter22', confirmPassword: 'hunter22' }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('un fallo sin respuesta lanza AuthRequestError con status null', async () => {
    stubEnv()
    postMock.mockRejectedValueOnce({ response: undefined })

    const { registerApi } = await import('@features/auth/register/api/registerApi')

    await expect(
      registerApi({ email: 'alice@example.com', password: 'hunter22', confirmPassword: 'hunter22' }),
    ).rejects.toMatchObject({ status: null })
  })
})
