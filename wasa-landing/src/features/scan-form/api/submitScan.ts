/**
 * Envío del formulario de escaneo al FastAPI Bridge (`POST /api/v1/scan/start`).
 *
 * D-6/D-7 de design.md: la credencial de sesión **no** se adjunta acá — sale
 * del interceptor de `@shared/api/axiosInstance` (D-1), configurado una
 * única vez desde `app/providers/httpClientProvider.ts`. Este módulo no lee
 * el token ni importa el store de sesión (task 6.7): el criterio de
 * aceptación del roadmap exige exactamente eso — "vía interceptor, no
 * manual".
 *
 * El rechazo se traduce a `ScanSubmitError`, una clase que transporta el
 * estado HTTP (o `null` si nunca hubo respuesta — D-6) y el cuerpo RFC 7807
 * parseado (o `null` si el cuerpo recibido no tiene esa forma — D-5), en vez
 * de propagar el error de Axios pelado.
 */
import axios from 'axios'
import type { ScanRequest, ScanResponse } from '@entities/scan'
import { axiosInstance } from '@shared/api/axiosInstance'
import { isProblemDetails, type ProblemDetails } from '@shared/api/problemDetails'

export const SCAN_START_PATH = '/api/v1/scan/start'

/**
 * `status: null` significa "nunca hubo respuesta" (fallo de red, D-6).
 * `problem: null` significa "hubo estado, pero el cuerpo no era Problem
 * Details" (D-5) — no se inventa un `detail` a partir de un cuerpo ajeno.
 */
export class ScanSubmitError extends Error {
  readonly status: number | null
  readonly problem: ProblemDetails | null

  constructor(status: number | null, problem: ProblemDetails | null) {
    super('scan submit failed')
    this.name = 'ScanSubmitError'
    this.status = status
    this.problem = problem
  }
}

export async function submitScan(request: ScanRequest): Promise<ScanResponse> {
  try {
    const response = await axiosInstance.post<ScanResponse>(SCAN_START_PATH, request)
    return response.data
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? null
      const data: unknown = error.response?.data
      const problem = isProblemDetails(data) ? data : null
      throw new ScanSubmitError(status, problem)
    }
    throw error
  }
}
