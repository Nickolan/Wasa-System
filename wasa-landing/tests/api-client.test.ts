import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axiosInstance, configureApiClient } from '@shared/api/axiosInstance'
import { apiBaseUrl } from '@shared/config/env'

/** Builds a fake successful response for a captured request config. */
function successResponse<T>(config: InternalAxiosRequestConfig, data: T): AxiosResponse<T> {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  }
}

/** Builds an AxiosError carrying a response with the given status (a server rejection). */
function rejectionError(config: InternalAxiosRequestConfig, status: number, data: unknown = null): AxiosError {
  const response: AxiosResponse = { data, status, statusText: '', headers: {}, config }
  return new AxiosError('Request failed', String(status), config, {}, response)
}

/** Builds an AxiosError with no response at all (a network failure). */
function networkError(config: InternalAxiosRequestConfig): AxiosError {
  return new AxiosError('Network Error', 'ERR_NETWORK', config, {})
}

function installAdapter(handler: (config: InternalAxiosRequestConfig) => Promise<AxiosResponse>) {
  axiosInstance.defaults.adapter = handler
}

beforeEach(() => {
  configureApiClient({ getToken: () => null, onUnauthorized: () => {} })
})

describe('axiosInstance — destino (3.1, 3.2)', () => {
  it('la baseURL de la instancia es exactamente apiBaseUrl de @shared/config/env', () => {
    expect(axiosInstance.defaults.baseURL).toBe(apiBaseUrl)
  })
})

describe('axiosInstance — credencial saliente (3.3–3.8, D-1, D-2, D-3)', () => {
  it('adjunta Authorization: Bearer <token> cuando hay un proveedor configurado', async () => {
    let capturedConfig: InternalAxiosRequestConfig | undefined
    installAdapter(async (config) => {
      capturedConfig = config
      return successResponse(config, {})
    })
    configureApiClient({ getToken: () => 'tok', onUnauthorized: () => {} })

    await axiosInstance.get('/probe')

    expect(capturedConfig?.headers.get('Authorization')).toBe('Bearer tok')
  })

  it('sin sesión (getToken devuelve null), la petición sale sin cabecera de autorización', async () => {
    let capturedConfig: InternalAxiosRequestConfig | undefined
    installAdapter(async (config) => {
      capturedConfig = config
      return successResponse(config, {})
    })
    configureApiClient({ getToken: () => null, onUnauthorized: () => {} })

    await axiosInstance.get('/probe')

    expect(capturedConfig?.headers.get('Authorization')).toBeFalsy()
  })

  it('sin haber llamado nunca a configureApiClient, la petición sale sin cabecera y no propaga ningún error de configuración', async () => {
    // Escenario "Sin cableado, el cliente sigue siendo usable" (`http-client`).
    // Se carga una **instancia fresca del módulo** con vi.resetModules(): el
    // estado de módulo (getToken/onUnauthorized) arranca en null, sin que
    // ningún beforeEach ni test previo lo haya asignado. Afirmar sobre la
    // instancia compartida no probaría esto: para cuando corre este test ya
    // fue configurada.
    vi.resetModules()
    const fresh = await import('@shared/api/axiosInstance')

    let capturedConfig: InternalAxiosRequestConfig | undefined
    fresh.axiosInstance.defaults.adapter = async (config) => {
      capturedConfig = config
      return successResponse(config, {})
    }

    await expect(fresh.axiosInstance.get('/probe')).resolves.toBeTruthy()
    expect(capturedConfig?.headers.get('Authorization')).toBeFalsy()
  })

  it('sin cablear, un 401 tampoco propaga un error de configuración: la promesa rechaza con el error del servidor', async () => {
    vi.resetModules()
    const fresh = await import('@shared/api/axiosInstance')

    fresh.axiosInstance.defaults.adapter = async (config) => {
      throw rejectionError(config, 401)
    }

    await expect(fresh.axiosInstance.get('/probe')).rejects.toBeInstanceOf(AxiosError)
  })

  it('la credencial se lee en cada petición, no se captura al configurar (D-3)', async () => {
    const captured: (InternalAxiosRequestConfig | undefined)[] = []
    installAdapter(async (config) => {
      captured.push(config)
      return successResponse(config, {})
    })

    let current = 'a'
    configureApiClient({ getToken: () => current, onUnauthorized: () => {} })
    await axiosInstance.get('/probe')

    current = 'b'
    await axiosInstance.get('/probe')

    expect(captured[0]?.headers.get('Authorization')).toBe('Bearer a')
    expect(captured[1]?.headers.get('Authorization')).toBe('Bearer b')
  })

  it('configurar dos veces no duplica la cabecera de autorización (idempotencia, D-2)', async () => {
    let capturedConfig: InternalAxiosRequestConfig | undefined
    installAdapter(async (config) => {
      capturedConfig = config
      return successResponse(config, {})
    })

    configureApiClient({ getToken: () => 'tok', onUnauthorized: () => {} })
    configureApiClient({ getToken: () => 'tok', onUnauthorized: () => {} })
    await axiosInstance.get('/probe')

    const authHeaders = capturedConfig?.headers.get('Authorization')
    expect(authHeaders).toBe('Bearer tok')
    expect(Array.isArray(authHeaders)).toBe(false)
  })
})

describe('axiosInstance — reacción al 401 (4.1–4.6, D-6, D-8)', () => {
  it('un 401 invoca onUnauthorized exactamente una vez y la promesa rechaza igual', async () => {
    const onUnauthorized = vi.fn()
    installAdapter(async (config) => {
      throw rejectionError(config, 401, { type: 'about:blank', title: 'Unauthorized', status: 401, detail: null, instance: '/x' })
    })
    configureApiClient({ getToken: () => 'tok', onUnauthorized })

    await expect(axiosInstance.get('/probe')).rejects.toBeInstanceOf(AxiosError)
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it.each([400, 422, 429, 502, 500])(
    'un rechazo %i NO invoca onUnauthorized, y la promesa rechaza igual',
    async (status) => {
      const onUnauthorized = vi.fn()
      installAdapter(async (config) => {
        throw rejectionError(config, status)
      })
      configureApiClient({ getToken: () => 'tok', onUnauthorized })

      await expect(axiosInstance.get('/probe')).rejects.toBeInstanceOf(AxiosError)
      expect(onUnauthorized).not.toHaveBeenCalled()
    },
  )

  it('una respuesta 202 exitosa no invoca onUnauthorized y resuelve con su cuerpo', async () => {
    const onUnauthorized = vi.fn()
    const body = { scan_id: '1', status: 'queued', message: 'ok' }
    installAdapter(async (config) => ({ data: body, status: 202, statusText: 'Accepted', headers: {}, config }))
    configureApiClient({ getToken: () => 'tok', onUnauthorized })

    const response = await axiosInstance.get('/probe')

    expect(onUnauthorized).not.toHaveBeenCalled()
    expect(response.data).toEqual(body)
  })

  it('un fallo de red (sin response) no invoca onUnauthorized y es distinguible de un rechazo con estado', async () => {
    const onUnauthorized = vi.fn()
    installAdapter(async (config) => {
      throw networkError(config)
    })
    configureApiClient({ getToken: () => 'tok', onUnauthorized })

    let caught: unknown
    try {
      await axiosInstance.get('/probe')
    } catch (error) {
      caught = error
    }

    expect(onUnauthorized).not.toHaveBeenCalled()
    expect(axios.isAxiosError(caught)).toBe(true)
    expect((caught as AxiosError).response).toBeUndefined()
  })
})

describe('axiosInstance — fronteras del módulo (4.6, REFACTOR)', () => {
  it('el módulo del cliente HTTP no importa de capas superiores ni menciona localStorage', async () => {
    const { readFileSync } = await import('node:fs')
    const path = await import('node:path')
    const source = readFileSync(
      path.resolve(__dirname, '../src/shared/api/axiosInstance.ts'),
      'utf-8',
    )
    expect(source).not.toMatch(/@app|@pages|@widgets|@features|@entities/)
    expect(source).not.toMatch(/localStorage/)
  })
})
