import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { InternalAxiosRequestConfig, AxiosResponse } from 'axios'
import { AxiosError } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAuthStore } from '@app/stores/authStore'
import { apiBaseUrl, dashboardUrl } from '@shared/config/env'
import { axiosInstance, configureApiClient } from '@shared/api/axiosInstance'
import { SCAN_START_PATH } from '@features/scan-form/api/submitScan'
import {
  SCAN_SUBMIT_MESSAGES,
  SUCCESS_REDIRECT_DELAY_MS,
  asOptionalNumber,
  useScanForm,
} from '@features/scan-form/model/useScanForm'

/**
 * Arnés mínimo de prueba: no es `ScanForm.tsx` (CHANGE-18, grupo 9) — usa
 * `<input>` crudos ligados con `register()` para ejercitar únicamente la
 * lógica del hook, sin depender de los primitivos de `@shared/ui`.
 */
function TestHarness() {
  const { register, onSubmit, formState, isLoading, serverError, scanResponse } = useScanForm()
  return (
    <form onSubmit={onSubmit}>
      <label htmlFor="target_url">target_url</label>
      <input id="target_url" {...register('target_url')} />
      {formState.errors.target_url && <span role="alert">{formState.errors.target_url.message}</span>}

      <label htmlFor="phpsessid">phpsessid</label>
      <input id="phpsessid" {...register('phpsessid')} />
      {formState.errors.phpsessid && <span role="alert">{formState.errors.phpsessid.message}</span>}

      <label htmlFor="sqlmap_level">sqlmap_level</label>
      <input id="sqlmap_level" type="number" {...register('sqlmap_level', { setValueAs: asOptionalNumber })} />
      {formState.errors.sqlmap_level && <span role="alert">{formState.errors.sqlmap_level.message}</span>}

      <label htmlFor="sqlmap_risk">sqlmap_risk</label>
      <input id="sqlmap_risk" type="number" {...register('sqlmap_risk', { setValueAs: asOptionalNumber })} />

      <label htmlFor="ethical_consent">ethical_consent</label>
      <input id="ethical_consent" type="checkbox" {...register('ethical_consent')} />

      <button type="submit" disabled={isLoading}>
        enviar
      </button>
      {serverError && <p role="alert" data-testid="server-error">{serverError}</p>}
      {scanResponse && <p data-testid="success">success:{scanResponse.scan_id}</p>}
    </form>
  )
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

const problem = {
  type: 'about:blank',
  title: 'Unauthorized',
  status: 401,
  detail: 'Credencial ausente o inválida',
  instance: SCAN_START_PATH,
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('target_url'), 'http://dvwa.local')
  await user.type(screen.getByLabelText('phpsessid'), 'a1b2c3')
  await user.click(screen.getByLabelText('ethical_consent'))
}

beforeEach(() => {
  configureApiClient({ getToken: () => null, onUnauthorized: () => {} })
})

describe('useScanForm — validación con zodResolver (7.1, 7.2)', () => {
  it('un submit con target_url inválida no emite ninguna solicitud y deja el error bajo el campo', async () => {
    const user = userEvent.setup()
    let requestCount = 0
    installAdapter(async (config) => {
      requestCount += 1
      return successResponse(config, { scan_id: '1', status: 'queued' as const, message: 'ok' })
    })
    render(<TestHarness />)

    await user.type(screen.getByLabelText('target_url'), 'no-es-una-url')
    await user.type(screen.getByLabelText('phpsessid'), 'a1b2c3')
    await user.click(screen.getByLabelText('ethical_consent'))
    await user.click(screen.getByRole('button', { name: 'enviar' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/URL válida/)
    })
    expect(requestCount).toBe(0)
  })
})

describe('useScanForm — multi-error (7.3)', () => {
  it('URL inválida y phpsessid vacío producen ambos mensajes en la misma pasada', async () => {
    const user = userEvent.setup()
    render(<TestHarness />)

    await user.type(screen.getByLabelText('target_url'), 'no-es-una-url')
    await user.click(screen.getByLabelText('ethical_consent'))
    await user.click(screen.getByRole('button', { name: 'enviar' }))

    await waitFor(() => {
      expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(2)
    })
  })
})

describe('useScanForm — el cuerpo despachado (7.4)', () => {
  it('un submit válido llama a submitScan con exactamente los cuatro campos del contrato, sin ethical_consent', async () => {
    const user = userEvent.setup()
    let capturedConfig: InternalAxiosRequestConfig | undefined
    installAdapter(async (config) => {
      capturedConfig = config
      return successResponse(config, { scan_id: '1', status: 'queued' as const, message: 'ok' })
    })
    render(<TestHarness />)

    await user.type(screen.getByLabelText('target_url'), '  http://dvwa.local  ')
    await user.type(screen.getByLabelText('phpsessid'), 'a1b2c3')
    await user.click(screen.getByLabelText('ethical_consent'))
    await user.click(screen.getByRole('button', { name: 'enviar' }))

    await waitFor(() => expect(capturedConfig).toBeDefined())
    const body = JSON.parse(capturedConfig?.data as string)
    expect(body).toEqual({
      target_url: 'http://dvwa.local',
      phpsessid: 'a1b2c3',
      sqlmap_level: 1,
      sqlmap_risk: 1,
    })
  })
})

describe('useScanForm — carga y doble submit (7.5)', () => {
  it('isLoading es verdadero durante la solicitud, y dos submits producen una sola llamada', async () => {
    const user = userEvent.setup()
    let callCount = 0
    let resolveRequest: (() => void) | undefined
    installAdapter(async (config) => {
      callCount += 1
      await new Promise<void>((resolve) => {
        resolveRequest = resolve
      })
      return successResponse(config, { scan_id: '1', status: 'queued' as const, message: 'ok' })
    })
    render(<TestHarness />)
    await fillValidForm(user)

    const button = screen.getByRole('button', { name: 'enviar' })
    await user.click(button)
    await user.click(button)

    await waitFor(() => expect(button).toBeDisabled())
    expect(callCount).toBe(1)

    resolveRequest?.()
    await waitFor(() => expect(button).not.toBeDisabled())
  })
})

describe('useScanForm — tabla de mensajes (7.6, D-12)', () => {
  it('401 -> mensaje de sesión expirada', async () => {
    const user = userEvent.setup()
    installAdapter(async (config) => {
      throw rejectionError(config, 401, { ...problem, status: 401 })
    })
    render(<TestHarness />)
    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'enviar' }))

    await waitFor(() =>
      expect(screen.getByTestId('server-error')).toHaveTextContent(SCAN_SUBMIT_MESSAGES.unauthorized),
    )
  })

  it.each([400, 422])('%i -> mensaje de validación (mismo mensaje)', async (status) => {
    const user = userEvent.setup()
    installAdapter(async (config) => {
      throw rejectionError(config, status, { ...problem, status })
    })
    render(<TestHarness />)
    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'enviar' }))

    await waitFor(() =>
      expect(screen.getByTestId('server-error')).toHaveTextContent(SCAN_SUBMIT_MESSAGES.validation),
    )
  })

  it('429 -> mensaje de límite alcanzado, sin número de minutos', async () => {
    const user = userEvent.setup()
    installAdapter(async (config) => {
      throw rejectionError(config, 429, { ...problem, status: 429 })
    })
    render(<TestHarness />)
    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'enviar' }))

    await waitFor(() =>
      expect(screen.getByTestId('server-error')).toHaveTextContent(SCAN_SUBMIT_MESSAGES.rateLimited),
    )
    expect(SCAN_SUBMIT_MESSAGES.rateLimited).not.toMatch(/\d/)
  })

  it('502 -> mensaje de sistema no disponible', async () => {
    const user = userEvent.setup()
    installAdapter(async (config) => {
      throw rejectionError(config, 502, { ...problem, status: 502 })
    })
    render(<TestHarness />)
    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'enviar' }))

    await waitFor(() =>
      expect(screen.getByTestId('server-error')).toHaveTextContent(SCAN_SUBMIT_MESSAGES.unavailable),
    )
  })

  it('otro 5xx (500) -> mensaje genérico', async () => {
    const user = userEvent.setup()
    installAdapter(async (config) => {
      throw rejectionError(config, 500, { ...problem, status: 500 })
    })
    render(<TestHarness />)
    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'enviar' }))

    await waitFor(() =>
      expect(screen.getByTestId('server-error')).toHaveTextContent(SCAN_SUBMIT_MESSAGES.generic),
    )
  })

  it('fallo de red -> mensaje de conexión, distinto del de 502', async () => {
    const user = userEvent.setup()
    installAdapter(async (config) => {
      throw networkError(config)
    })
    render(<TestHarness />)
    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'enviar' }))

    await waitFor(() =>
      expect(screen.getByTestId('server-error')).toHaveTextContent(SCAN_SUBMIT_MESSAGES.network),
    )
    expect(SCAN_SUBMIT_MESSAGES.network).not.toBe(SCAN_SUBMIT_MESSAGES.unavailable)
  })
})

describe('useScanForm — nada crudo del servidor en pantalla (7.7)', () => {
  it('ante un rechazo con detail/type/instance presentes, el error mostrado es la constante propia', async () => {
    const user = userEvent.setup()
    installAdapter(async (config) => {
      throw rejectionError(config, 401, {
        type: 'https://bridge.local/errors/unauthorized',
        title: 'Unauthorized',
        status: 401,
        detail: 'JWT firmado con una clave desconocida — campo interno x-secret-key',
        instance: '/api/v1/scan/start',
      })
    })
    render(<TestHarness />)
    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'enviar' }))

    const errorNode = await screen.findByTestId('server-error')
    expect(errorNode).toHaveTextContent(SCAN_SUBMIT_MESSAGES.unauthorized)
    expect(errorNode.textContent).not.toMatch(/x-secret-key/)
    expect(errorNode.textContent).not.toMatch(/bridge\.local/)
    expect(errorNode.textContent).not.toMatch(/api\/v1\/scan\/start/)
  })
})

describe('useScanForm — el 401 cierra sesión sin que el hook lo pida (7.8, D-8)', () => {
  it('el módulo del hook no invoca logout() por su cuenta', () => {
    const source = readFileSync(
      path.resolve(__dirname, '../src/features/scan-form/model/useScanForm.ts'),
      'utf-8',
    )
    expect(source).not.toMatch(/logout\(/)
    expect(source).not.toMatch(/authStore/i)
  })

  it('tras un rechazo 401 la aplicación queda no autenticada (efecto del interceptor, no del hook)', async () => {
    const initialState = useAuthStore.getState()
    useAuthStore.getState().login('a.b.c', 'alice@example.com')
    const logoutSpy = vi.spyOn(useAuthStore.getState(), 'logout')
    configureApiClient({
      getToken: () => useAuthStore.getState().token,
      onUnauthorized: () => useAuthStore.getState().logout(),
    })
    const user = userEvent.setup()
    installAdapter(async (config) => {
      throw rejectionError(config, 401, { ...problem, status: 401 })
    })
    render(<TestHarness />)
    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'enviar' }))

    await waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(false))
    expect(logoutSpy).toHaveBeenCalledTimes(1)

    logoutSpy.mockRestore()
    useAuthStore.setState(initialState, true)
    localStorage.clear()
  })
})

describe('useScanForm — el rechazo devuelve el formulario a estado enviable (7.9)', () => {
  it('tras un 429, isLoading es falso, los valores persisten y un nuevo submit reintenta', async () => {
    const user = userEvent.setup()
    let callCount = 0
    installAdapter(async (config) => {
      callCount += 1
      throw rejectionError(config, 429, { ...problem, status: 429 })
    })
    render(<TestHarness />)
    await fillValidForm(user)

    const button = screen.getByRole('button', { name: 'enviar' })
    await user.click(button)

    await waitFor(() => expect(button).not.toBeDisabled())
    expect(screen.getByLabelText('target_url')).toHaveValue('http://dvwa.local')
    expect(callCount).toBe(1)

    await user.click(button)
    await waitFor(() => expect(callCount).toBe(2))
  })
})

describe('useScanForm — campos numéricos con setValueAs (7.10, D-9, R-5)', () => {
  it('tipear 3 produce el número 3 en el cuerpo despachado, no el string "3"', async () => {
    const user = userEvent.setup()
    let capturedConfig: InternalAxiosRequestConfig | undefined
    installAdapter(async (config) => {
      capturedConfig = config
      return successResponse(config, { scan_id: '1', status: 'queued' as const, message: 'ok' })
    })
    render(<TestHarness />)
    await user.type(screen.getByLabelText('target_url'), 'http://dvwa.local')
    await user.type(screen.getByLabelText('phpsessid'), 'a1b2c3')
    await user.clear(screen.getByLabelText('sqlmap_level'))
    await user.type(screen.getByLabelText('sqlmap_level'), '3')
    await user.click(screen.getByLabelText('ethical_consent'))
    await user.click(screen.getByRole('button', { name: 'enviar' }))

    await waitFor(() => expect(capturedConfig).toBeDefined())
    const body = JSON.parse(capturedConfig?.data as string)
    expect(body.sqlmap_level).toBe(3)
  })

  it('vaciar el campo numérico produce el valor por defecto, sin mensaje de tipo inválido', async () => {
    const user = userEvent.setup()
    let capturedConfig: InternalAxiosRequestConfig | undefined
    installAdapter(async (config) => {
      capturedConfig = config
      return successResponse(config, { scan_id: '1', status: 'queued' as const, message: 'ok' })
    })
    render(<TestHarness />)
    await user.type(screen.getByLabelText('target_url'), 'http://dvwa.local')
    await user.type(screen.getByLabelText('phpsessid'), 'a1b2c3')
    await user.clear(screen.getByLabelText('sqlmap_level'))
    await user.click(screen.getByLabelText('ethical_consent'))
    await user.click(screen.getByRole('button', { name: 'enviar' }))

    await waitFor(() => expect(capturedConfig).toBeDefined())
    const body = JSON.parse(capturedConfig?.data as string)
    expect(body.sqlmap_level).toBe(1)
    expect(screen.queryByText(/expected number/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/invalid_type/i)).not.toBeInTheDocument()
  })
})

describe('useScanForm — aceptación y redirección al Dashboard (8.1–8.6, D-11)', () => {
  const originalLocation = window.location

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, href: 'http://localhost/scan' },
    })
    // shouldAdvanceTime: waitFor() de testing-library encuesta con
    // setTimeout real; sin esto, con los timers falsos activos el reloj
    // nunca avanza solo y waitFor cuelga hasta su propio timeout (5000ms).
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    })
  })

  it('un 202 deja el hook en éxito, y tras SUCCESS_REDIRECT_DELAY_MS navega a dashboardUrl (8.1, 8.2)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    installAdapter(async (config) =>
      successResponse(config, { scan_id: 'sc-1', status: 'queued' as const, message: 'ok' }),
    )
    render(<TestHarness />)
    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'enviar' }))

    await waitFor(() => expect(screen.getByTestId('success')).toHaveTextContent('sc-1'))
    expect(window.location.href).toBe('http://localhost/scan')

    await vi.advanceTimersByTimeAsync(SUCCESS_REDIRECT_DELAY_MS)

    expect(window.location.href).toBe(dashboardUrl)
  })

  it.each([401, 400, 422, 429, 502])('un rechazo %i no navega, ni siquiera pasado el retraso (8.3)', async (status) => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    installAdapter(async (config) => {
      throw rejectionError(config, status, { ...problem, status })
    })
    render(<TestHarness />)
    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'enviar' }))

    await waitFor(() => expect(screen.getByTestId('server-error')).not.toBeEmptyDOMElement())
    await vi.advanceTimersByTimeAsync(SUCCESS_REDIRECT_DELAY_MS)

    expect(window.location.href).toBe('http://localhost/scan')
  })

  it('un fallo de red tampoco navega (8.3)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    installAdapter(async (config) => {
      throw networkError(config)
    })
    render(<TestHarness />)
    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'enviar' }))

    await waitFor(() => expect(screen.getByTestId('server-error')).not.toBeEmptyDOMElement())
    await vi.advanceTimersByTimeAsync(SUCCESS_REDIRECT_DELAY_MS)

    expect(window.location.href).toBe('http://localhost/scan')
  })

  it('desmontar tras el 202 pero antes del temporizador no navega y no propaga error (8.4)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    installAdapter(async (config) =>
      successResponse(config, { scan_id: 'sc-2', status: 'queued' as const, message: 'ok' }),
    )
    const { unmount } = render(<TestHarness />)
    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'enviar' }))

    await waitFor(() => expect(screen.getByTestId('success')).toBeInTheDocument())

    expect(() => {
      unmount()
      vi.advanceTimersByTime(SUCCESS_REDIRECT_DELAY_MS)
    }).not.toThrow()
    expect(window.location.href).toBe('http://localhost/scan')
  })

  it('el destino es dashboardUrl, distinto de apiBaseUrl (8.5)', () => {
    expect(dashboardUrl).not.toBe(apiBaseUrl)
  })

  it('tras la aceptación no hay una segunda llamada a submitScan antes de navegar (8.6)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    let callCount = 0
    installAdapter(async (config) => {
      callCount += 1
      return successResponse(config, { scan_id: 'sc-3', status: 'queued' as const, message: 'ok' })
    })
    render(<TestHarness />)
    await fillValidForm(user)
    const button = screen.getByRole('button', { name: 'enviar' })
    await user.click(button)

    await waitFor(() => expect(screen.getByTestId('success')).toBeInTheDocument())
    expect(callCount).toBe(1)

    // El botón sigue en el DOM (no se desmontó) — un segundo clic antes de
    // que venza el temporizador de redirección no debe volver a despachar.
    await user.click(button)
    expect(callCount).toBe(1)
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
