import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ScanRequest } from '@entities/scan'
import { axiosInstance, configureApiClient } from '@shared/api/axiosInstance'
import { SCAN_START_PATH, ScanSubmitError, submitScan } from '@features/scan-form/api/submitScan'

const validRequest: ScanRequest = {
  target_url: 'http://dvwa.local',
  phpsessid: 'a1b2c3',
  sqlmap_level: 1,
  sqlmap_risk: 1,
}

function successResponse<T>(config: InternalAxiosRequestConfig, data: T, status = 202): AxiosResponse<T> {
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

describe('submitScan — despacho y aceptación (6.1, 6.2)', () => {
  it('emite POST a /api/v1/scan/start con el cuerpo recibido y devuelve el ScanResponse en un 202', async () => {
    let capturedConfig: InternalAxiosRequestConfig | undefined
    const scanResponse = { scan_id: 'abc-123', status: 'queued' as const, message: 'Escaneo encolado' }
    installAdapter(async (config) => {
      capturedConfig = config
      return successResponse(config, scanResponse)
    })

    const result = await submitScan(validRequest)

    expect(capturedConfig?.method?.toLowerCase()).toBe('post')
    expect(capturedConfig?.url).toBe(SCAN_START_PATH)
    expect(JSON.parse(capturedConfig?.data as string)).toEqual(validRequest)
    expect(result).toEqual(scanResponse)
  })
})

describe('submitScan — ScanSubmitError por código (6.3, 6.4)', () => {
  const problem = {
    type: 'about:blank',
    title: 'Unauthorized',
    status: 401,
    detail: 'Credencial ausente o inválida',
    instance: SCAN_START_PATH,
  }

  it('un 401 con cuerpo RFC 7807 lanza ScanSubmitError transportando status y problem', async () => {
    installAdapter(async (config) => {
      throw rejectionError(config, 401, problem)
    })

    const error = await submitScan(validRequest).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ScanSubmitError)
    expect((error as ScanSubmitError).status).toBe(401)
    expect((error as ScanSubmitError).problem).toEqual(problem)
  })

  it.each([400, 422, 429, 502, 500])('un %i con cuerpo RFC 7807 lanza ScanSubmitError con ese status y el problem parseado', async (status) => {
    const body = { ...problem, status, title: `status-${status}` }
    installAdapter(async (config) => {
      throw rejectionError(config, status, body)
    })

    const error = await submitScan(validRequest).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ScanSubmitError)
    expect((error as ScanSubmitError).status).toBe(status)
    expect((error as ScanSubmitError).problem).toEqual(body)
  })
})

describe('submitScan — cuerpo que no es Problem Details (6.5, D-5)', () => {
  it.each([
    ['vacío', undefined],
    ['texto plano', 'internal server error'],
    ['HTML', '<html><body>Bad Gateway</body></html>'],
  ])('un rechazo con cuerpo %s lanza ScanSubmitError con el status correcto y problem: null', async (_label, body) => {
    installAdapter(async (config) => {
      throw rejectionError(config, 502, body)
    })

    const error = await submitScan(validRequest).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ScanSubmitError)
    expect((error as ScanSubmitError).status).toBe(502)
    expect((error as ScanSubmitError).problem).toBeNull()
  })
})

describe('submitScan — fallo de red (6.6, D-6)', () => {
  it('un fallo sin respuesta lanza ScanSubmitError con status: null', async () => {
    installAdapter(async (config) => {
      throw networkError(config)
    })

    const error = await submitScan(validRequest).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ScanSubmitError)
    expect((error as ScanSubmitError).status).toBeNull()
    expect((error as ScanSubmitError).problem).toBeNull()
  })
})

describe('submitScan — la credencial no se adjunta a mano (6.7)', () => {
  it('el módulo no menciona Authorization, no lee el token ni importa authStore', () => {
    const source = readFileSync(
      path.resolve(__dirname, '../src/features/scan-form/api/submitScan.ts'),
      'utf-8',
    )
    expect(source).not.toMatch(/Authorization/)
    expect(source).not.toMatch(/authStore/i)
    expect(source).not.toMatch(/getToken/)
  })

  it('aun sin adjuntar nada a mano, la solicitud emitida lleva la cabecera cuando hay sesión (via interceptor)', async () => {
    configureApiClient({ getToken: () => 'tok', onUnauthorized: () => {} })
    let capturedConfig: InternalAxiosRequestConfig | undefined
    installAdapter(async (config) => {
      capturedConfig = config
      return successResponse(config, { scan_id: '1', status: 'queued' as const, message: 'ok' })
    })

    await submitScan(validRequest)

    expect(capturedConfig?.headers.get('Authorization')).toBe('Bearer tok')
  })
})
