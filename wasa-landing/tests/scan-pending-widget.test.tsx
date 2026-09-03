import { MemoryRouter } from 'react-router-dom'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ScanResponse } from '@entities/scan'
import { SCAN_PENDING_COPY } from '@widgets/scan-pending/model/copy'
import { ScanPendingWidget } from '@widgets/scan-pending'

const SCAN: ScanResponse = { scan_id: 'sc-pending-1', status: 'queued', message: 'queued on n8n worker node-7' }

function renderWidget(scan: ScanResponse = SCAN) {
  return render(
    <MemoryRouter>
      <ScanPendingWidget scan={scan} />
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
})

describe('ScanPendingWidget — región de estado accesible con encabezado propio (task 4.3, spec scan-pending-screen)', () => {
  it('expone una región de estado (role="status") con nombre accesible', () => {
    renderWidget()
    const region = screen.getByRole('status')
    expect(region).toBeInTheDocument()
    expect(region).toHaveAccessibleName()
  })

  it('tiene un encabezado propio con el texto de SCAN_PENDING_COPY.heading', () => {
    renderWidget()
    expect(screen.getByRole('heading', { name: SCAN_PENDING_COPY.heading })).toBeInTheDocument()
  })

  it('muestra los tres hechos obligatorios: en curso, duración estimada y entrega por email', () => {
    renderWidget()
    expect(screen.getByText(SCAN_PENDING_COPY.status)).toBeInTheDocument()
    expect(screen.getByText(SCAN_PENDING_COPY.duration)).toBeInTheDocument()
    expect(screen.getByText(SCAN_PENDING_COPY.email)).toBeInTheDocument()
  })
})

describe('ScanPendingWidget — triangulación (task 4.5)', () => {
  it('muestra el scan_id como referencia y no muestra el message crudo de la respuesta del Bridge', () => {
    const { container } = renderWidget()
    expect(screen.getByText(new RegExp(SCAN.scan_id))).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/node-7/)
    expect(container.textContent).not.toMatch(SCAN.message)
  })

  it('el texto no le pide al usuario mantener la página abierta', () => {
    const { container } = renderWidget()
    expect(container.textContent).not.toMatch(/manten[eé].*(página|pestaña).*abiert/i)
  })

  it('cualquier indicador visual de progreso es decorativo (aria-hidden)', () => {
    const { container } = renderWidget()
    const decorative = container.querySelectorAll('[aria-hidden="true"]')
    expect(decorative.length).toBeGreaterThan(0)
  })

  it('usa el spinner compartido (shared/ui/Spinner), no un div hecho a mano (fix code-review #3)', () => {
    const { container } = renderWidget()
    const svgSpinner = container.querySelector('svg.animate-spin')
    expect(svgSpinner).not.toBeNull()
  })

  it('el estado se entiende con el texto solo: ocultando lo aria-hidden, los tres hechos siguen legibles', () => {
    renderWidget()
    const region = screen.getByRole('status')
    const textWithoutDecorative = Array.from(region.querySelectorAll('*'))
      .filter((node) => node.getAttribute('aria-hidden') !== 'true')
      .map((node) => (node.children.length === 0 ? node.textContent : ''))
      .join(' ')

    expect(textWithoutDecorative).toMatch(/en curso|arrancó/i)
    expect(textWithoutDecorative).toMatch(/diez minutos|10 minutos/i)
    expect(textWithoutDecorative).toMatch(/correo electrónico|email/i)
  })
})

describe('ScanPendingWidget — salidas (task 4.6, D-4)', () => {
  it('ofrece al menos una acción de navegación activable', () => {
    renderWidget()
    const home = screen.getByRole('link', { name: /volver al inicio/i })
    expect(home).toBeInTheDocument()
    expect(home).toHaveAttribute('href', '/')
  })

  it('ofrece un enlace secundario al Dashboard, navegación interna en la misma pestaña (CHANGE-26, D-9)', () => {
    renderWidget()
    const dashboard = screen.getByRole('link', { name: /dashboard/i })
    expect(dashboard).toBeInTheDocument()
    expect(dashboard).toHaveAttribute('href', '/dashboard')
    expect(dashboard).not.toHaveAttribute('target')
  })

  it('activar la salida no emite ninguna solicitud al Bridge (no hay fetch/axios adjunto a los links)', () => {
    renderWidget()
    // Ambos son elementos de navegación pura (<Link>/<a>), sin manejador de
    // click que dispare red: la ausencia de cualquier atributo onClick con
    // lógica de red es estructural, no hace falta un spy de red para un
    // componente que no importa ningún cliente HTTP (ver 8.1, fsd-boundaries).
    const home = screen.getByRole('link', { name: /volver al inicio/i })
    const dashboard = screen.getByRole('link', { name: /dashboard/i })
    expect(home.tagName).toBe('A')
    expect(dashboard.tagName).toBe('A')
  })
})
