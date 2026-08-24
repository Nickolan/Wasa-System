import { describe, expect, it } from 'vitest'
import { isProblemDetails } from '@shared/api/problemDetails'

const validProblem = {
  type: 'about:blank',
  title: 'Unauthorized',
  status: 401,
  detail: 'Credencial ausente o inválida',
  instance: '/api/v1/scan/start',
}

describe('isProblemDetails — cuerpo RFC 7807 legítimo', () => {
  it('reconoce un cuerpo con los cinco miembros bien tipados', () => {
    expect(isProblemDetails(validProblem)).toBe(true)
  })

  it('reconoce un cuerpo por lo demás válido con detail nulo', () => {
    expect(isProblemDetails({ ...validProblem, detail: null })).toBe(true)
  })
})

describe('isProblemDetails — cuerpos que no son Problem Details', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['una cadena', 'not an object'],
    ['un arreglo', ['type', 'title']],
    ['un objeto sin status', { type: 'about:blank', title: 'Bad Request', detail: null, instance: '/x' }],
    [
      'un objeto con status en string',
      { type: 'about:blank', title: 'Bad Request', status: '401', detail: null, instance: '/x' },
    ],
  ])('devuelve false para %s, sin lanzar', (_label, value) => {
    expect(() => isProblemDetails(value)).not.toThrow()
    expect(isProblemDetails(value)).toBe(false)
  })
})
