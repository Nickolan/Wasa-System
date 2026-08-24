import { describe, expect, it } from 'vitest'
import { GENERIC_AUTH_ERROR_MESSAGE, resolveLoginErrorMessage, resolveRegisterErrorMessage } from '@features/auth/lib/authMessages'

describe('authMessages: resolución de mensaje por operación (D-5)', () => {
  it('login con 401 devuelve el mensaje específico de credenciales incorrectas', () => {
    expect(resolveLoginErrorMessage(401)).toBe('Credenciales incorrectas.')
  })

  it('registro con 409 devuelve el mensaje específico de email duplicado', () => {
    expect(resolveRegisterErrorMessage(409)).toBe('Este email ya está registrado.')
  })

  it('login con 409 (sin lectura en login) cae al genérico', () => {
    expect(resolveLoginErrorMessage(409)).toBe(GENERIC_AUTH_ERROR_MESSAGE)
  })

  it('registro con 401 (sin lectura en registro) cae al genérico', () => {
    expect(resolveRegisterErrorMessage(401)).toBe(GENERIC_AUTH_ERROR_MESSAGE)
  })

  it('500 cae al genérico en ambas operaciones', () => {
    expect(resolveLoginErrorMessage(500)).toBe(GENERIC_AUTH_ERROR_MESSAGE)
    expect(resolveRegisterErrorMessage(500)).toBe(GENERIC_AUTH_ERROR_MESSAGE)
  })

  it('status null (fallo sin respuesta) cae al genérico en ambas operaciones', () => {
    expect(resolveLoginErrorMessage(null)).toBe(GENERIC_AUTH_ERROR_MESSAGE)
    expect(resolveRegisterErrorMessage(null)).toBe(GENERIC_AUTH_ERROR_MESSAGE)
  })

  it('el mensaje genérico es el literal aprobado en el checkpoint 2026-08-23', () => {
    expect(GENERIC_AUTH_ERROR_MESSAGE).toBe('No pudimos completar la operación. Intentá de nuevo en unos minutos.')
  })
})
