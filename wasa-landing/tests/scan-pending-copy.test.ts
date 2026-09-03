import { describe, expect, it } from 'vitest'
import { SCAN_PENDING_COPY } from '@widgets/scan-pending/model/copy'

/**
 * Heurística mínima de "está en español": el texto contiene al menos una
 * palabra funcional común del español. No es un detector lingüístico
 * completo — alcanza para blindar contra un copy pegado en inglés por
 * error (mismo criterio de esfuerzo que el resto de la suite para textos
 * de producto).
 */
const SPANISH_MARKER = /\b(que|el|la|los|las|de|del|por|para|con|una|un|te|se|tu)\b/i

describe('SCAN_PENDING_COPY — el copy de la pantalla de espera es datos (task 4.1, D-3)', () => {
  it('ninguna cadena está vacía', () => {
    for (const value of Object.values(SCAN_PENDING_COPY)) {
      expect(value.trim().length).toBeGreaterThan(0)
    }
  })

  it('todas las cadenas están en español', () => {
    for (const value of Object.values(SCAN_PENDING_COPY)) {
      expect(value).toMatch(SPANISH_MARKER)
    }
  })

  it('el encabezado comunica que el escaneo está en curso', () => {
    expect(SCAN_PENDING_COPY.heading).toMatch(/escaneo/i)
  })

  it('el estado comunica que el escaneo fue aceptado y está en curso, no que terminó ni que falló', () => {
    expect(SCAN_PENDING_COPY.status).toMatch(/en curso|arrancó|ejecutando/i)
    expect(SCAN_PENDING_COPY.status).not.toMatch(/termin|falló|error/i)
  })

  it('el texto de duración menciona los diez minutos como estimación, no como garantía', () => {
    expect(SCAN_PENDING_COPY.duration).toMatch(/diez minutos|10 minutos/i)
    expect(SCAN_PENDING_COPY.duration).toMatch(/estimaci|aproximad/i)
  })

  it('el aviso de email menciona la casilla de la cuenta del usuario', () => {
    expect(SCAN_PENDING_COPY.email).toMatch(/correo electrónico|email/i)
    expect(SCAN_PENDING_COPY.email).toMatch(/casilla/i)
    expect(SCAN_PENDING_COPY.email).toMatch(/cuenta/i)
  })

  it('el aviso de email tranquiliza en vez de pedir que la página se mantenga abierta', () => {
    // La entrega no depende de la pantalla (spec `scan-pending-screen`): el
    // texto tiene que decir explícitamente que no hace falta, no limitarse
    // a omitir el pedido.
    expect(SCAN_PENDING_COPY.email).toMatch(/no hace falta/i)
  })
})
