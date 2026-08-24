import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * D-16: stubea el entorno en vez de depender del `.env` del disco — mismo
 * patrón que `tests/env.test.ts`, porque `authHttp.ts` importa
 * `@shared/config/env`, que lanza al cargar el módulo si falta la variable.
 */
afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('authHttp: instancia de axios propia de la slice (D-1, D-2, R-6)', () => {
  it('baseURL se deriva de apiBaseUrl con el prefijo /api/v1/auth', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://bridge.local')
    vi.stubEnv('VITE_DASHBOARD_URL', 'http://localhost:5174')
    vi.resetModules()

    const { authHttp } = await import('@features/auth/lib/authHttp')

    expect(authHttp.defaults.baseURL).toBe('http://bridge.local/api/v1/auth')
  })

  it('el timeout está configurado explícitamente (~15s, D-14)', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://bridge.local')
    vi.stubEnv('VITE_DASHBOARD_URL', 'http://localhost:5174')
    vi.resetModules()

    const { authHttp } = await import('@features/auth/lib/authHttp')

    expect(authHttp.defaults.timeout).toBe(15_000)
  })

  it('no tiene ningún interceptor de request ni de response (D-2)', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://bridge.local')
    vi.stubEnv('VITE_DASHBOARD_URL', 'http://localhost:5174')
    vi.resetModules()

    const { authHttp } = await import('@features/auth/lib/authHttp')

    // axios expone los handlers de interceptores en un array interno privado
    // por convención (`.handlers`); si está vacío o es undefined, no hay
    // interceptores registrados.
    const requestHandlers = (authHttp.interceptors.request as unknown as { handlers: unknown[] }).handlers
    const responseHandlers = (authHttp.interceptors.response as unknown as { handlers: unknown[] }).handlers

    expect(requestHandlers.filter(Boolean)).toEqual([])
    expect(responseHandlers.filter(Boolean)).toEqual([])
  })
})
