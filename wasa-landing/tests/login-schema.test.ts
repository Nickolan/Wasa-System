import { describe, expect, it } from 'vitest'
import { loginSchema } from '@entities/user'
import { expectZodError, issuePaths } from './support/zod'

describe('loginSchema: email sintácticamente inválido', () => {
  it('rechaza un email sin forma de email e identifica el campo email', () => {
    const error = expectZodError(() => loginSchema.parse({ email: 'not-email', password: 'x' }))
    expect(issuePaths(error)).toContain('email')
  })
})

describe('loginSchema: contraseña vacía', () => {
  it('rechaza password vacío e identifica el campo password', () => {
    const error = expectZodError(() => loginSchema.parse({ email: 'user@test.com', password: '' }))
    expect(issuePaths(error)).toContain('password')
  })
})

describe('loginSchema: asimetría deliberada con registerSchema (D-3)', () => {
  it('acepta una contraseña de un solo carácter — el login NO exige el mínimo de 8 del registro', () => {
    const result = loginSchema.parse({ email: 'user@test.com', password: 'x' })
    expect(result.password).toBe('x')
  })

  it('rechaza una contraseña de más de 72 bytes UTF-8 — el techo también rige en el login', () => {
    const tooLong = 'a'.repeat(73)
    const error = expectZodError(() => loginSchema.parse({ email: 'user@test.com', password: tooLong }))
    expect(issuePaths(error)).toContain('password')
  })

  it('recorta los espacios alrededor del email', () => {
    const result = loginSchema.parse({ email: '  user@test.com  ', password: 'x' })
    expect(result.email).toBe('user@test.com')
  })
})
