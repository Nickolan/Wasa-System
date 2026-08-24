import { StrictMode } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '@app/App'
import { useAuthStore } from '@entities/user'
import { makeJwtExpiringIn } from './support/jwt'

/**
 * D-7: montar la aplicación completa (no LandingPage aislado) bajo
 * `StrictMode`, con espías sobre `console.error` y `console.warn`, no debe
 * emitir ningún llamado. `App`, no `LandingPage`, porque hay que incluir el
 * `useEffect` de hidratación y el cableado del cliente HTTP.
 *
 * Riesgo de falso verde (design.md D-7): se afirma sobre las llamadas
 * REGISTRADAS por el espía — nunca se las descarta silenciosamente — y su
 * contenido se vuelca en el mensaje de fallo si la aserción no se cumple.
 */

const initialState = useAuthStore.getState()

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState(initialState, true)
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.useRealTimers()
})

function dumpCalls(spy: ReturnType<typeof vi.spyOn>): string {
  return spy.mock.calls.map((args) => args.map(String).join(' ')).join('\n')
}

describe('landing-console-clean — montar la Landing completa no ensucia la consola (D-7)', () => {
  it('sin sesión persistida, bajo StrictMode: cero console.error y cero console.warn', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    expect(errorSpy, `console.error fue llamado:\n${dumpCalls(errorSpy)}`).not.toHaveBeenCalled()
    expect(warnSpy, `console.warn fue llamado:\n${dumpCalls(warnSpy)}`).not.toHaveBeenCalled()

    errorSpy.mockRestore()
    warnSpy.mockRestore()
  })

  it('con una sesión persistida vigente, bajo StrictMode: cero console.error y cero console.warn (5.2, triangulación)', () => {
    const token = makeJwtExpiringIn(3600)
    localStorage.setItem('wasa.auth', JSON.stringify({ token, email: 'alice@example.com' }))

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    // Guarda contra el falso verde de este test: si la clave o la forma del
    // almacenamiento cambiaran, la hidratación no ocurriría y este caso
    // degradaría silenciosamente a una copia del anterior (sin sesión).
    expect(
      useAuthStore.getState().isAuthenticated,
      'la sesión persistida no hidrató: este caso no está probando el estado "con sesión"',
    ).toBe(true)

    expect(errorSpy, `console.error fue llamado:\n${dumpCalls(errorSpy)}`).not.toHaveBeenCalled()
    expect(warnSpy, `console.warn fue llamado:\n${dumpCalls(warnSpy)}`).not.toHaveBeenCalled()

    errorSpy.mockRestore()
    warnSpy.mockRestore()
  })
})
