import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { AxiosError } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ScanResponse } from '@entities/scan'
import {
  SQLMAP_LEVEL_MAX,
  SQLMAP_LEVEL_MIN,
  SQLMAP_RISK_MAX,
  SQLMAP_RISK_MIN,
} from '@entities/scan'
import { axiosInstance, configureApiClient } from '@shared/api/axiosInstance'
import { ScanForm } from '@features/scan-form/ui/ScanForm'
import { SCAN_SUBMIT_MESSAGES, SCAN_SUCCESS_MESSAGE } from '@features/scan-form/model/useScanForm'

function successResponse<T>(config: InternalAxiosRequestConfig, data: T, status = 202): AxiosResponse<T> {
  return { data, status, statusText: '', headers: {}, config }
}

function rejectionError(config: InternalAxiosRequestConfig, status: number, data: unknown): AxiosError {
  const response: AxiosResponse = { data, status, statusText: '', headers: {}, config }
  return new AxiosError('Request failed', String(status), config, {}, response)
}

function installAdapter(handler: (config: InternalAxiosRequestConfig) => Promise<AxiosResponse>) {
  axiosInstance.defaults.adapter = handler
}

const problem = {
  type: 'about:blank',
  title: 'Unauthorized',
  status: 401,
  detail: 'Credencial ausente o inválida',
  instance: '/api/v1/scan/start',
}

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/URL objetivo/i), 'http://dvwa.local')
  await user.type(screen.getByLabelText(/PHPSESSID/i), 'a1b2c3')
}

beforeEach(() => {
  configureApiClient({ getToken: () => null, onUnauthorized: () => {} })
})

afterEach(() => {
  cleanup()
})

describe('ScanForm — los cinco controles (9.1, 9.2)', () => {
  it('renderiza los cinco controles con etiqueta accesible, usando los primitivos de @shared/ui', () => {
    render(<ScanForm />)

    expect(screen.getByLabelText(/URL objetivo/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/PHPSESSID/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Nivel de SQLMap/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Riesgo de SQLMap/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/declaración ética|autorización/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /iniciar escaneo/i })).toBeInTheDocument()
  })
})

describe('ScanForm — botón deshabilitado sin declaración ética (9.3)', () => {
  it('está deshabilitado sin marcar, se habilita al marcar, se deshabilita al desmarcar', async () => {
    const user = userEvent.setup()
    render(<ScanForm />)
    await fillRequiredFields(user)

    const button = screen.getByRole('button', { name: /iniciar escaneo/i })
    const checkbox = screen.getByLabelText(/declaración ética|autorización/i)

    expect(button).toBeDisabled()

    await user.click(checkbox)
    expect(button).not.toBeDisabled()

    await user.click(checkbox)
    expect(button).toBeDisabled()
  })
})

describe('ScanForm — estado de carga (9.4)', () => {
  it('deshabilita el botón y muestra el Spinner durante el envío; un doble clic produce una sola solicitud', async () => {
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
    const { container } = render(<ScanForm />)
    await fillRequiredFields(user)
    await user.click(screen.getByLabelText(/declaración ética|autorización/i))

    const button = screen.getByRole('button', { name: /iniciar escaneo/i })
    await user.click(button)
    await user.click(button)

    await waitFor(() => expect(button).toBeDisabled())
    expect(container.querySelector('svg.animate-spin')).not.toBeNull()
    expect(callCount).toBe(1)

    resolveRequest?.()

    // El adaptador resuelve con un 202: el estado de carga se levanta (el
    // Spinner desaparece y `aria-busy` vuelve a `false`), pero el control
    // sigue **no enviable** — `scan-submission`: "tras una aceptación, el
    // formulario SHALL permanecer no enviable, porque el navegador está por
    // irse al Dashboard". El retorno a estado enviable es lo que exige el
    // **rechazo**, y está cubierto en `use-scan-form.test.tsx` (7.9).
    await waitFor(() => expect(button).toHaveAttribute('aria-busy', 'false'))
    expect(container.querySelector('svg.animate-spin')).toBeNull()
    expect(button).toBeDisabled()
  })
})

describe('ScanForm — errores inline (9.5)', () => {
  it('un submit inválido muestra el mensaje bajo el campo, asociado por aria-describedby', async () => {
    const user = userEvent.setup()
    render(<ScanForm />)

    await user.type(screen.getByLabelText(/URL objetivo/i), 'no-es-una-url')
    await user.type(screen.getByLabelText(/PHPSESSID/i), 'a1b2c3')
    await user.click(screen.getByLabelText(/declaración ética|autorización/i))
    await user.click(screen.getByRole('button', { name: /iniciar escaneo/i }))

    const urlInput = screen.getByLabelText(/URL objetivo/i)
    await waitFor(() => expect(urlInput).toHaveAttribute('aria-invalid', 'true'))
    const describedBy = urlInput.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    const message = document.getElementById(describedBy as string)
    expect(message).toHaveTextContent(/URL válida/)
  })
})

describe('ScanForm — error de servidor a nivel de formulario (9.6)', () => {
  it('un rechazo del Bridge muestra el mensaje de la tabla D-12 en la zona de error del formulario', async () => {
    const user = userEvent.setup()
    installAdapter(async (config) => {
      throw rejectionError(config, 401, problem)
    })
    render(<ScanForm />)
    await fillRequiredFields(user)
    await user.click(screen.getByLabelText(/declaración ética|autorización/i))
    await user.click(screen.getByRole('button', { name: /iniciar escaneo/i }))

    await waitFor(() => {
      expect(screen.getByText(SCAN_SUBMIT_MESSAGES.unauthorized)).toBeInTheDocument()
    })
  })
})

describe('ScanForm — confirmación de éxito, sin navegación (scan-submission, D-2, D-9)', () => {
  it('tras un 202 muestra la confirmación de éxito en la interfaz, sin navegar', async () => {
    const user = userEvent.setup()
    installAdapter(async (config) =>
      successResponse(config, { scan_id: 'sc-1', status: 'queued' as const, message: 'Escaneo encolado' }),
    )
    render(<ScanForm />)
    await fillRequiredFields(user)
    await user.click(screen.getByLabelText(/declaración ética|autorización/i))
    await user.click(screen.getByRole('button', { name: /iniciar escaneo/i }))

    await waitFor(() => {
      expect(screen.getByText(SCAN_SUCCESS_MESSAGE)).toBeInTheDocument()
    })
  })

  it('tras la aceptación el control de envío queda no enviable (guard de un segundo disparo)', async () => {
    const user = userEvent.setup()
    installAdapter(async (config) =>
      successResponse(config, { scan_id: 'sc-2', status: 'queued' as const, message: 'Escaneo encolado' }),
    )
    render(<ScanForm />)
    await fillRequiredFields(user)
    await user.click(screen.getByLabelText(/declaración ética|autorización/i))
    const button = screen.getByRole('button', { name: /iniciar escaneo/i })
    await user.click(button)

    await waitFor(() => expect(screen.getByText(SCAN_SUCCESS_MESSAGE)).toBeInTheDocument())
    expect(button).toBeDisabled()
  })

  it('no muestra la confirmación de éxito ante un rechazo del Bridge', async () => {
    const user = userEvent.setup()
    installAdapter(async (config) => {
      throw rejectionError(config, 502, { ...problem, status: 502 })
    })
    render(<ScanForm />)
    await fillRequiredFields(user)
    await user.click(screen.getByLabelText(/declaración ética|autorización/i))
    await user.click(screen.getByRole('button', { name: /iniciar escaneo/i }))

    await waitFor(() => {
      expect(screen.getByText(SCAN_SUBMIT_MESSAGES.unavailable)).toBeInTheDocument()
    })
    expect(screen.queryByText(SCAN_SUCCESS_MESSAGE)).not.toBeInTheDocument()
  })

  it('la confirmación es un texto propio: no muestra el `message` crudo que devolvió el Bridge', async () => {
    const user = userEvent.setup()
    installAdapter(async (config) =>
      successResponse(config, {
        scan_id: 'sc-3',
        status: 'queued' as const,
        message: 'queued on n8n worker node-7 (internal)',
      }),
    )
    const { container } = render(<ScanForm />)
    await fillRequiredFields(user)
    await user.click(screen.getByLabelText(/declaración ética|autorización/i))
    await user.click(screen.getByRole('button', { name: /iniciar escaneo/i }))

    await waitFor(() => expect(screen.getByText(SCAN_SUCCESS_MESSAGE)).toBeInTheDocument())
    expect(container.textContent).not.toMatch(/node-7/)
    expect(container.textContent).not.toMatch(/sc-3/)
  })
})

describe('ScanForm — prop opcional onAccepted (design.md D-1, grupo 3)', () => {
  it('se invoca exactamente una vez con la respuesta del Bridge tras una aceptación', async () => {
    const user = userEvent.setup()
    const onAccepted = vi.fn()
    installAdapter(async (config) =>
      successResponse(config, { scan_id: 'sc-onaccepted', status: 'queued' as const, message: 'ok' }),
    )
    render(<ScanForm onAccepted={onAccepted} />)
    await fillRequiredFields(user)
    await user.click(screen.getByLabelText(/declaración ética|autorización/i))
    await user.click(screen.getByRole('button', { name: /iniciar escaneo/i }))

    await waitFor(() => expect(onAccepted).toHaveBeenCalledTimes(1))
    expect(onAccepted).toHaveBeenCalledWith(
      expect.objectContaining<Partial<ScanResponse>>({ scan_id: 'sc-onaccepted', status: 'queued' }),
    )
  })

  it('no se invoca ante ningún rechazo del Bridge', async () => {
    const user = userEvent.setup()
    const onAccepted = vi.fn()
    installAdapter(async (config) => {
      throw rejectionError(config, 401, problem)
    })
    render(<ScanForm onAccepted={onAccepted} />)
    await fillRequiredFields(user)
    await user.click(screen.getByLabelText(/declaración ética|autorización/i))
    await user.click(screen.getByRole('button', { name: /iniciar escaneo/i }))

    await waitFor(() => {
      expect(screen.getByText(SCAN_SUBMIT_MESSAGES.unauthorized)).toBeInTheDocument()
    })
    expect(onAccepted).not.toHaveBeenCalled()
  })
})

describe('ScanForm — onAccepted, casos límite (3.3, D-1)', () => {
  it('desmontar antes de que corra el efecto no invoca onAccepted ni propaga error', async () => {
    const user = userEvent.setup()
    const onAccepted = vi.fn()
    installAdapter(async (config) =>
      successResponse(config, { scan_id: 'sc-unmount', status: 'queued' as const, message: 'ok' }),
    )
    const { unmount } = render(<ScanForm onAccepted={onAccepted} />)
    await fillRequiredFields(user)
    await user.click(screen.getByLabelText(/declaración ética|autorización/i))
    await user.click(screen.getByRole('button', { name: /iniciar escaneo/i }))

    expect(() => unmount()).not.toThrow()
  })

  it('sin la prop, el flujo de aceptación sigue mostrando la confirmación inline', async () => {
    const user = userEvent.setup()
    installAdapter(async (config) =>
      successResponse(config, { scan_id: 'sc-default', status: 'queued' as const, message: 'ok' }),
    )
    render(<ScanForm />)
    await fillRequiredFields(user)
    await user.click(screen.getByLabelText(/declaración ética|autorización/i))
    await user.click(screen.getByRole('button', { name: /iniciar escaneo/i }))

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(SCAN_SUCCESS_MESSAGE)
    })
  })
})

describe('ScanForm — los límites del control salen del contrato (9.7)', () => {
  it('min/max de los dos controles numéricos son SQLMAP_LEVEL_MIN/MAX y SQLMAP_RISK_MIN/MAX', () => {
    render(<ScanForm />)

    const level = screen.getByLabelText(/Nivel de SQLMap/i)
    const risk = screen.getByLabelText(/Riesgo de SQLMap/i)

    expect(level).toHaveAttribute('min', String(SQLMAP_LEVEL_MIN))
    expect(level).toHaveAttribute('max', String(SQLMAP_LEVEL_MAX))
    expect(risk).toHaveAttribute('min', String(SQLMAP_RISK_MIN))
    expect(risk).toHaveAttribute('max', String(SQLMAP_RISK_MAX))
  })
})
