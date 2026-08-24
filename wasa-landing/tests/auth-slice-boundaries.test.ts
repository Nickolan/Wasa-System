import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getImportedModules, listSourceFiles } from './support/fsd'

const projectRoot = path.resolve(__dirname, '..')
const srcRoot = path.join(projectRoot, 'src')
const authSliceFiles = listSourceFiles(srcRoot).filter((f) => f.startsWith('features/auth/'))

describe('features/auth/ no importa el cliente HTTP compartido de shared/api (D-2, R-2)', () => {
  // Motivo: cuando CHANGE-18 cree src/shared/api/axiosInstance.ts, su
  // interceptor de response hace authStore.logout() ante un 401. Pero el 401
  // de /auth/login significa "credenciales incorrectas", no "sesión
  // expirada" — enrutar estos endpoints por esa instancia desloguearía a un
  // usuario ya autenticado ante un simple error de tipeo (design.md D-2, R-2).

  it('la slice tiene al menos un archivo (guarda contra false-negative)', () => {
    expect(authSliceFiles.length).toBeGreaterThan(0)
  })

  it.each(authSliceFiles)('%s no importa @shared/api, ni por alias ni por ruta relativa', (relativeFile) => {
    const source = readFileSync(path.join(srcRoot, relativeFile), 'utf-8')
    const imports = getImportedModules(source)
    const offendingImport = imports.find(
      (specifier) => specifier.startsWith('@shared/api') || /(^|\/)shared\/api(\/|$)/.test(specifier),
    )
    expect(offendingImport).toBeUndefined()
  })

  // Guarda sobre la guarda (RED de este chequeo, D-1/9.1): la slice ya
  // cumple la regla, así que el `it.each` de arriba nunca fue rojo contra
  // código real. Esta fixture prueba que el detector SÍ atraparía la
  // violación si alguien la introdujera — el mismo patrón que
  // fsd-boundaries.test.ts usa contra sí mismo.
  it('el detector atrapa una fixture que sí importa @shared/api (guarda sobre la guarda)', () => {
    const fixtureSource = `import { axiosInstance } from '@shared/api/axiosInstance'\n`
    const imports = getImportedModules(fixtureSource)
    const offendingImport = imports.find(
      (specifier) => specifier.startsWith('@shared/api') || /(^|\/)shared\/api(\/|$)/.test(specifier),
    )
    expect(offendingImport).toBe('@shared/api/axiosInstance')
  })
})

describe('features/auth/ nunca escribe en la consola del navegador (D-7)', () => {
  // Motivo: es el borde donde la contraseña en texto plano está en memoria y
  // en el cuerpo de la request. console.error(axiosError) imprime
  // error.config.data — el cuerpo enviado, con la contraseña.

  it.each(authSliceFiles)('%s no invoca console.* en ningún camino, incluido el de error', (relativeFile) => {
    const source = readFileSync(path.join(srcRoot, relativeFile), 'utf-8')
    expect(source).not.toMatch(/console\s*\.\s*(log|error|warn|info|debug|trace)\s*\(/)
  })

  it('el detector atrapa una fixture que sí loguea (guarda sobre la guarda, 9.2)', () => {
    const fixtureSource = `catch (error) {\n  console.error('login failed', error)\n}\n`
    expect(fixtureSource).toMatch(/console\s*\.\s*(log|error|warn|info|debug|trace)\s*\(/)
  })
})
