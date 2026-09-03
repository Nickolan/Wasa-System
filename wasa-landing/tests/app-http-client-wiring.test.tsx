import { StrictMode } from 'react'
import { render } from '@testing-library/react'
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '@app/App'
import { useAuthStore } from '@entities/user'
import { axiosInstance } from '@shared/api/axiosInstance'
import { listSourceFiles } from './support/fsd'
import { makeJwtExpiringIn } from './support/jwt'

const initialState = useAuthStore.getState()
const projectRoot = path.resolve(__dirname, '..')
const srcRoot = path.join(projectRoot, 'src')

function successResponse<T>(config: InternalAxiosRequestConfig, data: T): AxiosResponse<T> {
  return { data, status: 200, statusText: 'OK', headers: {}, config }
}

function unauthorizedError(config: InternalAxiosRequestConfig): AxiosError {
  const response: AxiosResponse = {
    data: { type: 'about:blank', title: 'Unauthorized', status: 401, detail: null, instance: '/x' },
    status: 401,
    statusText: 'Unauthorized',
    headers: {},
    config,
  }
  return new AxiosError('Request failed', '401', config, {}, response)
}

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState(initialState, true)
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
})

afterEach(() => {
  localStorage.clear()
  vi.useRealTimers()
})

describe('cableado app -> axiosInstance (5.1–5.4, D-1, D-2, D-3)', () => {
  it('tras montar la aplicación, una petición lleva el token del authStore', async () => {
    const token = makeJwtExpiringIn(3600)
    useAuthStore.getState().login(token, 'alice@example.com')
    let captured: InternalAxiosRequestConfig | undefined
    axiosInstance.defaults.adapter = async (config) => {
      captured = config
      return successResponse(config, {})
    }

    render(<App />)
    await axiosInstance.get('/probe')

    expect(captured?.headers.get('Authorization')).toBe(`Bearer ${token}`)
  })

  it('una respuesta 401 deja useAuthStore.getState().isAuthenticated en false', async () => {
    const token = makeJwtExpiringIn(3600)
    useAuthStore.getState().login(token, 'alice@example.com')
    axiosInstance.defaults.adapter = async (config) => {
      throw unauthorizedError(config)
    }

    render(<App />)
    await expect(axiosInstance.get('/probe')).rejects.toBeInstanceOf(AxiosError)

    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('montar bajo StrictMode sigue produciendo una sola cabecera y un solo logout ante un 401', async () => {
    const token = makeJwtExpiringIn(3600)
    useAuthStore.getState().login(token, 'alice@example.com')
    const logoutSpy = vi.spyOn(useAuthStore.getState(), 'logout')
    let capturedHeaders: string[] = []
    axiosInstance.defaults.adapter = async (config) => {
      const header = config.headers.get('Authorization')
      capturedHeaders.push(typeof header === 'string' ? header : String(header))
      throw unauthorizedError(config)
    }

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
    await expect(axiosInstance.get('/probe')).rejects.toBeInstanceOf(AxiosError)

    expect(capturedHeaders).toEqual([`Bearer ${token}`])
    expect(logoutSpy).toHaveBeenCalledTimes(1)
    logoutSpy.mockRestore()
  })

  it('configureApiClient se invoca desde un único lugar de src/', () => {
    const offenders = listSourceFiles(srcRoot)
      .filter((f) => f !== 'shared/api/axiosInstance.ts') // defines it, doesn't call it
      .filter((f) => readFileSync(path.join(srcRoot, f), 'utf-8').includes('configureApiClient('))

    expect(offenders).toHaveLength(1)
  })
})
