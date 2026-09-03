import { MemoryRouter } from 'react-router-dom'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DashboardResponse } from '@entities/dashboard'
import type { DashboardFilters, UseDashboardResult } from '@features/dashboard'
import { DashboardFetchError } from '@features/dashboard'
import { DASHBOARD_PAGE_CONTENT } from '@pages/DashboardPage/model/content'

const useDashboardMock = vi.fn<() => UseDashboardResult>()

vi.mock('@features/dashboard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@features/dashboard')>()
  return {
    ...actual,
    useDashboard: () => useDashboardMock(),
  }
})

const DashboardPage = (await import('@pages/DashboardPage')).default

const NO_FILTERS: DashboardFilters = { scanId: null, severity: null, source: null }

function baseResult(overrides: Partial<UseDashboardResult> = {}): UseDashboardResult {
  return {
    data: null,
    isLoading: false,
    error: null,
    filters: NO_FILTERS,
    setFilter: vi.fn(),
    ...overrides,
  }
}

const WITH_DATA: DashboardResponse = {
  scans: [{ id: 1, target_url: 'http://a.local', scan_date: '2026-01-01T10:00:00Z' }],
  vulnerabilities: [{ id: 1, scan_id: 1, severity: 'critical', url: 'http://a.local/x' }],
}

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  useDashboardMock.mockReset()
})

describe('DashboardPage — composición y montaje (task 6.1)', () => {
  it('vista inicial: panel general', () => {
    useDashboardMock.mockReturnValue(baseResult({ data: WITH_DATA }))
    renderPage()
    expect(screen.getByRole('button', { name: /panel general/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('tiene exactamente un encabezado de primer nivel (spec shared-ui-kit, unified-design-system)', () => {
    useDashboardMock.mockReturnValue(baseResult({ data: WITH_DATA }))
    renderPage()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('los filtros están presentes', () => {
    useDashboardMock.mockReturnValue(baseResult({ data: WITH_DATA }))
    renderPage()
    expect(screen.getByLabelText('Escaneo')).toBeInTheDocument()
    expect(screen.getByLabelText('Severidad')).toBeInTheDocument()
    expect(screen.getByLabelText('Herramienta')).toBeInTheDocument()
  })
})

describe('DashboardPage — estados de carga y error (task 6.2)', () => {
  it('primera carga: informa que está cargando', () => {
    useDashboardMock.mockReturnValue(baseResult({ isLoading: true, data: null }))
    renderPage()
    expect(screen.getByText(DASHBOARD_PAGE_CONTENT.loading)).toBeInTheDocument()
  })

  it('la consulta falla: muestra el mensaje de error y deja de cargar', () => {
    useDashboardMock.mockReturnValue(
      baseResult({ isLoading: false, error: new DashboardFetchError(500, null), data: null }),
    )
    renderPage()
    expect(screen.getByText(DASHBOARD_PAGE_CONTENT.error)).toBeInTheDocument()
    expect(screen.queryByText(DASHBOARD_PAGE_CONTENT.loading)).not.toBeInTheDocument()
  })

  it('el mensaje de error no filtra detalles de infraestructura', () => {
    useDashboardMock.mockReturnValue(
      baseResult({ error: new DashboardFetchError(500, null), data: null }),
    )
    const { container } = renderPage()
    expect(container.textContent).not.toMatch(/localhost|https?:\/\/|dashboard fetch failed/i)
  })

  it('un refetch fallido tras una carga previa exitosa no oculta el contenido ya visible (fix code-review #1)', () => {
    useDashboardMock.mockReturnValue(
      baseResult({ data: WITH_DATA, error: new DashboardFetchError(500, null) }),
    )
    renderPage()

    // El contenido ya cargado (filtros, conmutador de vistas) sigue visible.
    expect(screen.getByLabelText('Escaneo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /panel general/i })).toBeInTheDocument()

    // El error de página completa NO reemplaza el contenido.
    expect(screen.queryByText(DASHBOARD_PAGE_CONTENT.error)).not.toBeInTheDocument()

    // Se muestra en cambio un aviso no bloqueante.
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})

describe('DashboardPage — pública, sin sesión (task 6.4)', () => {
  it('se muestra sin sesión iniciada, sin muro de autenticación', () => {
    useDashboardMock.mockReturnValue(baseResult({ data: WITH_DATA }))
    renderPage()
    expect(screen.queryByRole('heading', { name: /iniciar sesión/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /panel general/i })).toBeInTheDocument()
  })
})

describe('DashboardPage — no ensucia la consola (task 6.5)', () => {
  it('montar la pantalla completa con datos no emite console.error ni console.warn', async () => {
    useDashboardMock.mockReturnValue(baseResult({ data: WITH_DATA }))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    renderPage()
    await waitFor(() => expect(screen.getByLabelText('Escaneo')).toBeInTheDocument())

    expect(errorSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()

    errorSpy.mockRestore()
    warnSpy.mockRestore()
  })
})
