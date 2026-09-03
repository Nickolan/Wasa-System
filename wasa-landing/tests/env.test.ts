import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { listSourceFiles } from './support/fsd'

/**
 * `@shared/config/env` is the single gate onto `import.meta.env` for the
 * whole frontend (D-5, D-7). These tests exercise it purely through
 * `vi.stubEnv`, never through a real `.env` file on disk.
 *
 * CHANGE-26 (D-9): `VITE_DASHBOARD_URL` was retired — the results screen is
 * now a route of this same application (`/dashboard`), not an external
 * destination to configure. The gate exposes a single variable.
 */

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('env.ts fails loudly when a required variable is missing', () => {
  it('throws naming VITE_API_BASE_URL when it is absent', async () => {
    vi.stubEnv('VITE_API_BASE_URL', undefined as unknown as string)
    vi.resetModules()

    await expect(import('@shared/config/env')).rejects.toThrow(/VITE_API_BASE_URL/)
  })

  it('treats an empty or whitespace-only VITE_API_BASE_URL as absent', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '   ')
    vi.resetModules()

    await expect(import('@shared/config/env')).rejects.toThrow(/VITE_API_BASE_URL/)
  })

  it('returns exactly the configured value when VITE_API_BASE_URL is present', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
    vi.resetModules()

    const { apiBaseUrl } = await import('@shared/config/env')

    expect(apiBaseUrl).toBe('http://localhost:8000')
  })
})

describe('la superficie exportada expone una sola variable (task 7.3, D-9)', () => {
  it('el módulo no exporta ninguna dirección de Dashboard', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
    vi.resetModules()

    const env = await import('@shared/config/env')

    expect(Object.keys(env)).toEqual(['apiBaseUrl'])
  })

  it('una variable dada de baja (VITE_DASHBOARD_URL) no bloquea el arranque: su ausencia no lanza', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
    vi.resetModules()

    await expect(import('@shared/config/env')).resolves.toBeDefined()
  })

  it('una variable dada de baja (VITE_DASHBOARD_URL), si está presente, no tiene ningún efecto', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
    vi.stubEnv('VITE_DASHBOARD_URL', 'http://localhost:5174')
    vi.resetModules()

    const { apiBaseUrl } = await import('@shared/config/env')

    expect(apiBaseUrl).toBe('http://localhost:8000')
  })
})

describe('single gate onto import.meta.env (D-7, replica of the backend os.environ gate)', () => {
  it('import.meta.env is referenced only inside src/shared/config/env.ts', () => {
    const projectRoot = path.resolve(__dirname, '..')
    const srcRoot = path.join(projectRoot, 'src')
    const gateFile = 'shared/config/env.ts'

    const offenders: string[] = []
    for (const file of listSourceFiles(srcRoot)) {
      if (file === gateFile) continue
      const sourceText = readFileSync(path.join(srcRoot, file), 'utf-8')
      if (sourceText.includes('import.meta.env')) {
        offenders.push(file)
      }
    }

    expect(offenders).toEqual([])
  })
})
