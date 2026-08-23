import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { utf8ByteLength } from '@entities/user'
import type { UserRegister, UserRegisterRequest } from '@entities/user'
import { getImportedModules } from './support/fsd'

describe('utf8ByteLength (D-1): mide bytes UTF-8, no unidades de código UTF-16', () => {
  it('"abc" (ASCII puro) tiene 3 bytes', () => {
    expect(utf8ByteLength('abc')).toBe(3)
  })

  it('"é" (2 bytes en UTF-8, 1 unidad de código) tiene 2 bytes', () => {
    expect(utf8ByteLength('é')).toBe(2)
  })

  it('"🔒" (4 bytes en UTF-8, 2 unidades de código) tiene 4 bytes', () => {
    expect(utf8ByteLength('🔒')).toBe(4)
  })

  it('la cadena vacía tiene 0 bytes', () => {
    expect(utf8ByteLength('')).toBe(0)
  })

  it('separa bytes de caracteres: "🔒".repeat(19) tiene .length === 38 pero 76 bytes UTF-8', () => {
    const value = '🔒'.repeat(19)
    // Una implementación con `.length` reportaría 38, no 76 — este test
    // fallaría contra esa implementación incorrecta.
    expect(value.length).toBe(38)
    expect(utf8ByteLength(value)).toBe(76)
  })

  it('una cadena ASCII de exactamente 72 caracteres tiene exactamente 72 bytes (frontera)', () => {
    const value = 'a'.repeat(72)
    expect(utf8ByteLength(value)).toBe(72)
  })
})

/** Recursively lists every regular file under `dir`, relative to `dir`. */
function listFilesRecursively(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry)
    if (statSync(fullPath).isDirectory()) {
      return listFilesRecursively(fullPath).map((f) => path.join(entry, f))
    }
    return [entry]
  })
}

describe('entities/user es modelo puro: sin UI ni entrada/salida (requerimiento de pureza de la spec)', () => {
  const userSliceRoot = path.resolve(__dirname, '../src/entities/user')
  const files = listFilesRecursively(userSliceRoot)

  // Imports reales (no comentarios): un import de "react-hook-form" no debe
  // confundirse con un import de "react". Se resuelve con el parser de TS
  // que ya usa fsd-boundaries.test.ts, no con una búsqueda de texto libre.
  const forbiddenImportPatterns: Array<{ label: string; pattern: RegExp }> = [
    { label: 'React', pattern: /^react$/i },
    { label: 'cliente HTTP (axios)', pattern: /^axios$/i },
    { label: 'store de sesión (authStore)', pattern: /authStore/i },
  ]

  it('la slice tiene al menos un archivo (guarda contra un false-negative por directorio vacío)', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files)('%s no importa React, un cliente HTTP ni el store de sesión', (relativeFile) => {
    const source = readFileSync(path.join(userSliceRoot, relativeFile), 'utf-8')
    const imports = getImportedModules(source)
    const hits = forbiddenImportPatterns.filter(({ pattern }) =>
      imports.some((specifier) => pattern.test(specifier)),
    )
    expect(hits.map((h) => h.label)).toEqual([])
  })

  it.each(files)('%s no menciona localStorage', (relativeFile) => {
    const source = readFileSync(path.join(userSliceRoot, relativeFile), 'utf-8')
    expect(source).not.toMatch(/localStorage/)
  })
})

describe('UserRegisterRequest: la confirmación no viaja al Bridge (extra="forbid")', () => {
  it('descartar confirmPassword de un UserRegister deja exactamente email y password', () => {
    const formValues: UserRegister = {
      email: 'user@test.com',
      password: 'pass1234',
      confirmPassword: 'pass1234',
    }
    const { confirmPassword: _confirmPassword, ...request } = formValues
    const requestBody: UserRegisterRequest = request

    expect(Object.keys(requestBody).sort()).toEqual(['email', 'password'])
    expect('confirmPassword' in requestBody).toBe(false)
  })
})
