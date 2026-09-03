import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { AxiosError } from 'axios'
import { MemoryRouter } from 'react-router-dom'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '@entities/user'
import { axiosInstance, configureApiClient } from '@shared/api/axiosInstance'
import ScanPage from '@pages/ScanPage'

function rejectionError(config: InternalAxiosRequestConfig, status: number, data: unknown): AxiosError {
  const response: AxiosResponse = { data, status, statusText: '', headers: {}, config }
  return new AxiosError('Request failed', String(status), config, {}, response)
}

const initialState = useAuthStore.getState()

function renderScanPage() {
  return render(
    <MemoryRouter>
      <ScanPage />
    </MemoryRouter>,
  )
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/URL objetivo/i), 'http://dvwa.local')
  await user.type(screen.getByLabelText(/PHPSESSID/i), 'a1b2c3')
  await user.click(screen.getByLabelText(/declaración ética|autorización/i))
  await user.click(screen.getByRole('button', { name: /iniciar escaneo/i }))
}

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState(initialState, true)
  useAuthStore.getState().login('tok', 'a@b.com')
  configureApiClient({ getToken: () => useAuthStore.getState().token, onUnauthorized: () => {} })
})

afterEach(() => {
  cleanup()
})

describe('ScanPage — la aceptación reemplaza el formulario por la pantalla de espera (task 5.1, D-1)', () => {
  it('tras un 202 la pantalla de espera está visible y el formulario ya no está en el documento', async () => {
    const user = userEvent.setup()
    axiosInstance.defaults.adapter = async (config) => ({
      data: { scan_id: 'sc-page-1', status: 'queued' as const, message: 'ok' },
      status: 202,
      statusText: '',
      headers: {},
      config,
    })
    renderScanPage()
    await fillAndSubmit(user)

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/tu escaneo está en curso/i))
    expect(screen.queryByLabelText(/URL objetivo/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /iniciar escaneo/i })).not.toBeInTheDocument()
  })

  it('ante un rechazo, el formulario sigue presente con sus valores', async () => {
    const user = userEvent.setup()
    axiosInstance.defaults.adapter = async (config) => {
      throw rejectionError(config, 401, {
        type: 'about:blank',
        title: 'Unauthorized',
        status: 401,
        detail: 'Credencial inválida',
        instance: '/api/v1/scan/start',
      })
    }
    renderScanPage()
    await fillAndSubmit(user)

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByLabelText(/URL objetivo/i)).toHaveValue('http://dvwa.local')
    expect(screen.queryByRole('status', { name: /tu escaneo está en curso/i })).not.toBeInTheDocument()
  })
})

describe('ScanPage — tiene exactamente un encabezado de primer nivel (spec shared-ui-kit, unified-design-system)', () => {
  it('en el formulario y en la espera, un solo h1', async () => {
    const user = userEvent.setup()
    renderScanPage()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)

    axiosInstance.defaults.adapter = async (config) => ({
      data: { scan_id: 'sc-page-h1', status: 'queued' as const, message: 'ok' },
      status: 202,
      statusText: '',
      headers: {},
      config,
    })
    await fillAndSubmit(user)
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })
})

describe('ScanPage — el encabezado cambia con el estado, sin navegar ni recargar (task 5.3, D-1)', () => {
  it('el heading "Iniciar Escaneo" deja de anunciarse cuando la pantalla de espera está visible', async () => {
    const user = userEvent.setup()
    axiosInstance.defaults.adapter = async (config) => ({
      data: { scan_id: 'sc-page-2', status: 'queued' as const, message: 'ok' },
      status: 202,
      statusText: '',
      headers: {},
      config,
    })
    renderScanPage()
    expect(screen.getByRole('heading', { name: /iniciar escaneo/i })).toBeInTheDocument()

    await fillAndSubmit(user)

    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())
    expect(screen.queryByRole('heading', { name: /iniciar escaneo/i })).not.toBeInTheDocument()
  })

  it('la transición no navega el navegador ni recarga la aplicación', async () => {
    const user = userEvent.setup()
    const originalHref = window.location.href
    axiosInstance.defaults.adapter = async (config) => ({
      data: { scan_id: 'sc-page-3', status: 'queued' as const, message: 'ok' },
      status: 202,
      statusText: '',
      headers: {},
      config,
    })
    renderScanPage()
    await fillAndSubmit(user)

    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())
    expect(window.location.href).toBe(originalHref)
  })
})

describe('ScanPage — remontar la página vuelve al formulario (task 5.4, D-5: estado en memoria)', () => {
  it('un remontaje tras la aceptación pierde el estado de espera y muestra el formulario de nuevo', async () => {
    const user = userEvent.setup()
    axiosInstance.defaults.adapter = async (config) => ({
      data: { scan_id: 'sc-page-4', status: 'queued' as const, message: 'ok' },
      status: 202,
      statusText: '',
      headers: {},
      config,
    })
    const { unmount } = renderScanPage()
    await fillAndSubmit(user)
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())

    // Trade-off aceptado (D-5): sin persistencia, un remontaje —equivalente
    // a un refresh de `/scan`— vuelve a mostrar el formulario en blanco. El
    // canal real de entrega del reporte es el email, que no depende de este
    // estado en memoria.
    unmount()
    renderScanPage()

    expect(screen.getByLabelText(/URL objetivo/i)).toHaveValue('')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
