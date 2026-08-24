import { describe, expect, it } from 'vitest'
import { AuthRequestError, isAuthApiErrorShape, toAuthRequestError } from '@features/auth/lib/authErrors'

describe('AuthRequestError: construcción básica (D-4)', () => {
  it('se construye con un status y es capturable por instanceof Error', () => {
    const error = new AuthRequestError({ status: 401, problem: null })

    expect(error).toBeInstanceOf(Error)
    expect(error.status).toBe(401)
  })

  it('instanceof AuthRequestError distingue de un Error común', () => {
    const plainError = new Error('otro error cualquiera')
    const authError = new AuthRequestError({ status: 500, problem: null })

    expect(plainError).not.toBeInstanceOf(AuthRequestError)
    expect(authError).toBeInstanceOf(AuthRequestError)
  })

  it('status: null representa el fallo sin respuesta', () => {
    const error = new AuthRequestError({ status: null, problem: null })

    expect(error.status).toBeNull()
  })

  it('problem: null representa el cuerpo ausente o con forma ajena al contrato RFC 7807', () => {
    const error = new AuthRequestError({ status: 502, problem: null })

    expect(error.problem).toBeNull()
  })

  it('problem expone el cuerpo RFC 7807 cuando se provee', () => {
    const problem = {
      type: 'about:blank',
      title: 'Unauthorized',
      status: 401,
      detail: 'Credenciales inválidas',
      instance: '/api/v1/auth/login',
    }
    const error = new AuthRequestError({ status: 401, problem })

    expect(error.problem).toEqual(problem)
  })
})

describe('isAuthApiErrorShape: reconocedor de forma del contrato de error (D-15)', () => {
  it('acepta un cuerpo con los cinco miembros del contrato', () => {
    const body = {
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      detail: 'El email ya está registrado.',
      instance: '/api/v1/auth/register',
    }

    expect(isAuthApiErrorShape(body)).toBe(true)
  })

  it('rechaza un cuerpo al que le falta un miembro, sin lanzar', () => {
    const body = {
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      // falta "detail" e "instance"
    }

    expect(() => isAuthApiErrorShape(body)).not.toThrow()
    expect(isAuthApiErrorShape(body)).toBe(false)
  })

  it('rechaza un cuerpo que no es un objeto (p. ej. el HTML de un proxy), sin lanzar', () => {
    const body = '<html><body>502 Bad Gateway</body></html>'

    expect(() => isAuthApiErrorShape(body)).not.toThrow()
    expect(isAuthApiErrorShape(body)).toBe(false)
  })

  it('rechaza null y undefined sin lanzar', () => {
    expect(isAuthApiErrorShape(null)).toBe(false)
    expect(isAuthApiErrorShape(undefined)).toBe(false)
  })
})

describe('toAuthRequestError: construye AuthRequestError a partir de un error de axios (D-4, D-14, D-15)', () => {
  it('con respuesta y cuerpo válido: status y problem quedan poblados', () => {
    const axiosError = {
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
    }

    const error = toAuthRequestError(axiosError)

    expect(error).toBeInstanceOf(AuthRequestError)
    expect(error.status).toBe(401)
    expect(error.problem).toEqual(axiosError.response.data)
  })

  it('con respuesta y cuerpo ajeno al contrato: status queda poblado, problem queda null', () => {
    const axiosError = {
      response: {
        status: 502,
        data: '<html>Bad Gateway</html>',
      },
    }

    const error = toAuthRequestError(axiosError)

    expect(error.status).toBe(502)
    expect(error.problem).toBeNull()
  })

  it('sin respuesta (red caída): status y problem quedan null', () => {
    const axiosError = { response: undefined }

    const error = toAuthRequestError(axiosError)

    expect(error.status).toBeNull()
    expect(error.problem).toBeNull()
  })
})
