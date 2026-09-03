import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import type { DashboardResponse } from '@entities/dashboard'
import { axiosInstance, configureApiClient } from '@shared/api/axiosInstance'
import { DASHBOARD_PATH, DashboardFetchError, fetchDashboard } from '@features/dashboard/api/fetchDashboard'

/** Spec de referencia: `dashboard-client-requests`. */

const EMPTY_RESPONSE: DashboardResponse = { scans: [], vulnerabilities: [] }

function successResponse<T>(config: InternalAxiosRequestConfig, data: T, status = 200): AxiosResponse<T> {
  return { data, status, statusText: '', headers: {}, config }
}

function rejectionError(config: InternalAxiosRequestConfig, status: number, data: unknown): AxiosError {
  const response: AxiosResponse = { data, status, statusText: '', headers: {}, config }
  return new AxiosError('Request failed', String(status), config, {}, response)
}

function networkError(config: InternalAxiosRequestConfig): AxiosError {
  return new AxiosError('Network Error', 'ERR_NETWORK', config, {})
}

function installAdapter(handler: (config: InternalAxiosRequestConfig) => Promise<AxiosResponse>) {
  axiosInstance.defaults.adapter = handler
}

beforeEach(() => {
  configureApiClient({ getToken: () => null, onUnauthorized: () => {} })
})

describe('fetchDashboard — verbo, ruta e instancia compartida (task 3.1)', () => {
  it('emite GET a /api/v1/dashboard por el cliente HTTP compartido', async () => {
    let capturedConfig: InternalAxiosRequestConfig | undefined
    installAdapter(async (config) => {
      capturedConfig = config
      return successResponse(config, EMPTY_RESPONSE)
    })

    const result = await fetchDashboard({})

    expect(capturedConfig?.method?.toLowerCase()).toBe('get')
    expect(capturedConfig?.url).toBe(DASHBOARD_PATH)
    expect(result).toEqual(EMPTY_RESPONSE)
  })
})

describe('fetchDashboard — traducción de filtros a params (task 3.2, D-7)', () => {
  it('cero filtros: no viaja ningún parámetro de consulta', async () => {
    let capturedConfig: InternalAxiosRequestConfig | undefined
    installAdapter(async (config) => {
      capturedConfig = config
      return successResponse(config, EMPTY_RESPONSE)
    })

    await fetchDashboard({})

    expect(capturedConfig?.params).toEqual({})
  })

  it('un solo filtro seleccionado: los otros dos no aparecen, ni siquiera vacíos', async () => {
    let capturedConfig: InternalAxiosRequestConfig | undefined
    installAdapter(async (config) => {
      capturedConfig = config
      return successResponse(config, EMPTY_RESPONSE)
    })

    await fetchDashboard({ severity: 'Critical' })

    expect(capturedConfig?.params).toEqual({ severity: 'Critical' })
  })

  it('los tres filtros seleccionados viajan con sus valores', async () => {
    let capturedConfig: InternalAxiosRequestConfig | undefined
    installAdapter(async (config) => {
      capturedConfig = config
      return successResponse(config, EMPTY_RESPONSE)
    })

    await fetchDashboard({ scanId: 7, severity: 'High', source: 'Nuclei' })

    expect(capturedConfig?.params).toEqual({ scan_id: 7, severity: 'High', source: 'Nuclei' })
  })

  it('el identificador de escaneo viaja como valor numérico', async () => {
    let capturedConfig: InternalAxiosRequestConfig | undefined
    installAdapter(async (config) => {
      capturedConfig = config
      return successResponse(config, EMPTY_RESPONSE)
    })

    await fetchDashboard({ scanId: 42 })

    expect(capturedConfig?.params.scan_id).toBe(42)
    expect(typeof capturedConfig?.params.scan_id).toBe('number')
  })

  it('severity y source viajan sin transformar', async () => {
    let capturedConfig: InternalAxiosRequestConfig | undefined
    installAdapter(async (config) => {
      capturedConfig = config
      return successResponse(config, EMPTY_RESPONSE)
    })

    await fetchDashboard({ severity: 'Critical', source: 'SQLMap (Worker)' })

    expect(capturedConfig?.params.severity).toBe('Critical')
    expect(capturedConfig?.params.source).toBe('SQLMap (Worker)')
  })
})

describe('fetchDashboard — credenciales (task 3.3)', () => {
  it('no lee el estado de sesión ni adjunta credencial a mano; la consulta se resuelve igual sin sesión', async () => {
    installAdapter(async (config) => successResponse(config, EMPTY_RESPONSE))
    configureApiClient({ getToken: () => null, onUnauthorized: () => {} })

    const result = await fetchDashboard({})

    expect(result).toEqual(EMPTY_RESPONSE)
  })

  it('el módulo no menciona Authorization, no lee el token ni importa authStore', () => {
    const source = readFileSync(
      path.resolve(__dirname, '../src/features/dashboard/api/fetchDashboard.ts'),
      'utf-8',
    )
    expect(source).not.toMatch(/Authorization/)
    expect(source).not.toMatch(/authStore/i)
    expect(source).not.toMatch(/getToken/)
  })
})

describe('fetchDashboard — rechazo tipado (task 3.4)', () => {
  const problem = {
    type: 'about:blank',
    title: 'Internal Server Error',
    status: 500,
    detail: 'fallo de la base compartida',
    instance: DASHBOARD_PATH,
  }

  it('cuerpo RFC 7807 reconocido: DashboardFetchError transporta status y problem', async () => {
    installAdapter(async (config) => {
      throw rejectionError(config, 500, problem)
    })

    const error = await fetchDashboard({}).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(DashboardFetchError)
    expect((error as DashboardFetchError).status).toBe(500)
    expect((error as DashboardFetchError).problem).toEqual(problem)
  })

  it('cuerpo ajeno al contrato: problem viene null, status se conserva', async () => {
    installAdapter(async (config) => {
      throw rejectionError(config, 502, '<html>Bad Gateway</html>')
    })

    const error = await fetchDashboard({}).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(DashboardFetchError)
    expect((error as DashboardFetchError).status).toBe(502)
    expect((error as DashboardFetchError).problem).toBeNull()
  })

  it('fallo de red sin respuesta: status es null', async () => {
    installAdapter(async (config) => {
      throw networkError(config)
    })

    const error = await fetchDashboard({}).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(DashboardFetchError)
    expect((error as DashboardFetchError).status).toBeNull()
    expect((error as DashboardFetchError).problem).toBeNull()
  })

  it('el error crudo de axios nunca se propaga', async () => {
    installAdapter(async (config) => {
      throw rejectionError(config, 500, problem)
    })

    const error = await fetchDashboard({}).catch((e: unknown) => e)

    expect(error).not.toBeInstanceOf(AxiosError)
  })
})

describe('fetchDashboard — tolerancia a la respuesta abierta (task 3.5)', () => {
  it('campo adicional no enumerado no produce fallo', async () => {
    const openResponse = {
      scans: [{ id: 1, target_url: 'http://a.local', scan_date: '2026-01-01T00:00:00Z', unexpected: 'x' }],
      vulnerabilities: [],
    }
    installAdapter(async (config) => successResponse(config, openResponse))

    const result = await fetchDashboard({})

    expect(result).toEqual(openResponse)
  })

  it('campo esperado ausente no produce fallo', async () => {
    const partialResponse = { scans: [{ id: 1 }], vulnerabilities: [{ id: 1 }] }
    installAdapter(async (config) => successResponse(config, partialResponse))

    const result = await fetchDashboard({})

    expect(result).toEqual(partialResponse)
  })

  it('ambas colecciones vacías dan éxito, no fallo', async () => {
    installAdapter(async (config) => successResponse(config, EMPTY_RESPONSE))

    await expect(fetchDashboard({})).resolves.toEqual(EMPTY_RESPONSE)
  })
})

describe('fetchDashboard — sin direcciones escritas en el código (task 3.6)', () => {
  it('el módulo no contiene host/puerto/origen literal ni lee import.meta.env', () => {
    const source = readFileSync(
      path.resolve(__dirname, '../src/features/dashboard/api/fetchDashboard.ts'),
      'utf-8',
    )
    expect(source).not.toMatch(/https?:\/\//)
    expect(source).not.toMatch(/localhost/)
    expect(source).not.toMatch(/import\.meta\.env/)
  })
})
