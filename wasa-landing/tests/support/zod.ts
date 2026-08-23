import { z } from 'zod'
import { expect } from 'vitest'

/**
 * Ejecuta `run()`, espera que lance un `ZodError` y lo devuelve para que el
 * test pueda inspeccionar sus `issues` (por ejemplo, el `path` que falló).
 * Falla el test si `run()` no lanza, o si lanza algo que no es `ZodError`.
 */
export function expectZodError(run: () => void): z.ZodError {
  try {
    run()
  } catch (error) {
    expect(error).toBeInstanceOf(z.ZodError)
    return error as z.ZodError
  }
  throw new Error('expected run() to throw a ZodError, but it did not throw')
}

/** Extrae los `path` (unidos con `.`) de todos los issues de un ZodError. */
export function issuePaths(error: z.ZodError): string[] {
  return error.issues.map((issue) => issue.path.join('.'))
}
