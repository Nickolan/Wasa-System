import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH } from '@entities/user'
import { extractPythonIntConstant } from './support/pythonConstants'

const bridgeSchemasPath = path.resolve(__dirname, '../../fastapi_bridge/schemas/auth_schemas.py')

describe('paridad de la política de contraseña con el Bridge (D-7)', () => {
  it('PASSWORD_MIN_LENGTH coincide con REGISTER_PASSWORD_MIN_LENGTH del Bridge', () => {
    const source = readFileSync(bridgeSchemasPath, 'utf-8')
    const backendValue = extractPythonIntConstant(source, 'REGISTER_PASSWORD_MIN_LENGTH')
    expect(PASSWORD_MIN_LENGTH).toBe(backendValue)
  })

  it('PASSWORD_MAX_BYTES coincide con _BCRYPT_MAX_PASSWORD_BYTES del Bridge', () => {
    const source = readFileSync(bridgeSchemasPath, 'utf-8')
    const backendValue = extractPythonIntConstant(source, '_BCRYPT_MAX_PASSWORD_BYTES')
    expect(PASSWORD_MAX_BYTES).toBe(backendValue)
  })
})

describe('extractPythonIntConstant: modo de fallo (D-7)', () => {
  it('lanza un error que nombra la constante cuando no aparece en el texto', () => {
    const sourceWithoutConstant = 'OTHER_CONSTANT = 42\n'

    expect(() => extractPythonIntConstant(sourceWithoutConstant, 'REGISTER_PASSWORD_MIN_LENGTH')).toThrow(
      /REGISTER_PASSWORD_MIN_LENGTH/,
    )
  })

  it('lee un archivo del Bridge inexistente y falla al intentar leerlo, no en silencio', () => {
    const missingPath = path.resolve(__dirname, '../../fastapi_bridge/schemas/does-not-exist.py')

    expect(() => readFileSync(missingPath, 'utf-8')).toThrow()
  })
})
