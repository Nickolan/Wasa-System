import { describe, expect, it } from 'vitest'
import { registerSchema } from '@entities/user'
import { expectZodError, issuePaths } from './support/zod'

const validEmail = 'user@test.com'
const validPassword = 'pass1234'

describe('registerSchema: los tres criterios de aceptación del roadmap', () => {
  it('rechaza una contraseña de 7 caracteres e identifica el campo password', () => {
    const error = expectZodError(() =>
      registerSchema.parse({ email: validEmail, password: '1234567', confirmPassword: '1234567' }),
    )
    expect(issuePaths(error)).toContain('password')
  })

  it('rechaza una confirmación distinta e identifica el campo confirmPassword', () => {
    const error = expectZodError(() =>
      registerSchema.parse({ email: validEmail, password: 'pass1234', confirmPassword: 'diferente' }),
    )
    expect(issuePaths(error)).toContain('confirmPassword')
  })

  it('rechaza un email inválido e identifica el campo email', () => {
    const error = expectZodError(() =>
      registerSchema.parse({ email: 'not-an-email', password: validPassword, confirmPassword: validPassword }),
    )
    expect(issuePaths(error)).toContain('email')
  })
})

describe('registerSchema: fronteras de longitud de contraseña', () => {
  it('acepta exactamente 8 caracteres — el mínimo es el primero aceptado, no el primero rechazado', () => {
    const password = '12345678'
    const result = registerSchema.parse({ email: validEmail, password, confirmPassword: password })
    expect(result.password).toBe(password)
  })

  it('rechaza 7 caracteres', () => {
    const password = '1234567'
    const error = expectZodError(() =>
      registerSchema.parse({ email: validEmail, password, confirmPassword: password }),
    )
    expect(issuePaths(error)).toContain('password')
  })

  it('rechaza una contraseña ASCII de 73 caracteres', () => {
    const password = 'a'.repeat(73)
    const error = expectZodError(() =>
      registerSchema.parse({ email: validEmail, password, confirmPassword: password }),
    )
    expect(issuePaths(error)).toContain('password')
  })

  it('acepta una contraseña de exactamente 72 bytes', () => {
    const password = 'a'.repeat(72)
    const result = registerSchema.parse({ email: validEmail, password, confirmPassword: password })
    expect(result.password).toBe(password)
  })
})

describe('registerSchema: bytes vs caracteres (D-1, paridad con el Bridge)', () => {
  it('rechaza "🔒".repeat(19) — 38 caracteres pero 76 bytes UTF-8, algo que un .max(72) dejaría pasar', () => {
    const password = '🔒'.repeat(19)
    expect(password.length).toBe(38)

    const error = expectZodError(() =>
      registerSchema.parse({ email: validEmail, password, confirmPassword: password }),
    )
    expect(issuePaths(error)).toContain('password')
  })
})

describe('registerSchema: confirmación de contraseña', () => {
  it('rechaza confirmación vacía e identifica el campo confirmPassword', () => {
    const error = expectZodError(() =>
      registerSchema.parse({ email: validEmail, password: validPassword, confirmPassword: '' }),
    )
    expect(issuePaths(error)).toContain('confirmPassword')
  })

  it('acepta una confirmación idéntica a una contraseña válida', () => {
    const result = registerSchema.parse({
      email: validEmail,
      password: validPassword,
      confirmPassword: validPassword,
    })
    expect(result.confirmPassword).toBe(validPassword)
  })

  it('reporta password y confirmPassword en la misma pasada cuando ambos fallan (Zod v3, D-4)', () => {
    const error = expectZodError(() =>
      registerSchema.parse({ email: validEmail, password: '1234567', confirmPassword: 'diferente' }),
    )
    const paths = issuePaths(error)
    expect(paths).toContain('password')
    expect(paths).toContain('confirmPassword')
  })
})

describe('registerSchema: claves desconocidas (D-5)', () => {
  it('parsea un objeto con una clave extra y la descarta de la salida', () => {
    const result = registerSchema.parse({
      email: validEmail,
      password: validPassword,
      confirmPassword: validPassword,
      extraField: 'should not survive',
    })
    expect(Object.keys(result).sort()).toEqual(['confirmPassword', 'email', 'password'])
    expect('extraField' in result).toBe(false)
  })
})
