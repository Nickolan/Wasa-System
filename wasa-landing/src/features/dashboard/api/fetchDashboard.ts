/**
 * Consulta del estado consolidado de escaneos y vulnerabilidades
 * (`GET /api/v1/dashboard`, sin barra final — el router del Bridge declara
 * `@router.get("")` sobre el prefijo `/api/v1/dashboard`). Spec de
 * referencia: `dashboard-client-requests`.
 *
 * Mismo patrón que `features/scan-form/api/submitScan.ts` (D-7 de
 * design.md): la credencial de sesión **no** se adjunta acá — sale del
 * interceptor de `@shared/api/axiosInstance`, configurado una única vez
 * desde `app/providers/httpClientProvider.ts`. Este módulo no lee el token
 * ni importa el store de sesión (task 3.3): la operación del Bridge es
 * pública y se resuelve igual con sesión o sin ella.
 *
 * El rechazo se traduce a `DashboardFetchError`, que transporta el estado
 * HTTP (o `null` si nunca hubo respuesta) y el cuerpo RFC 7807 parseado (o
 * `null` si el cuerpo recibido no tiene esa forma), en vez de propagar el
 * error de Axios pelado (task 3.4).
 */
import axios from 'axios'
import type { DashboardResponse } from '@entities/dashboard'
import { axiosInstance } from '@shared/api/axiosInstance'
import { isProblemDetails, type ProblemDetails } from '@shared/api/problemDetails'

export const DASHBOARD_PATH = '/api/v1/dashboard'

/**
 * Filtros de la interfaz, ya traducidos a la forma que espera el llamador
 * de esta función. `undefined` significa "sin seleccionar" — task 3.2/D-7:
 * un filtro ausente se omite del pedido, no se envía vacío.
 */
export interface DashboardQueryFilters {
  scanId?: number
  severity?: string
  source?: string
}

/**
 * `status: null` significa "nunca hubo respuesta" (fallo de red).
 * `problem: null` significa "hubo estado, pero el cuerpo no era Problem
 * Details" — no se inventa un `detail` a partir de un cuerpo ajeno.
 */
export class DashboardFetchError extends Error {
  readonly status: number | null
  readonly problem: ProblemDetails | null

  constructor(status: number | null, problem: ProblemDetails | null) {
    super('dashboard fetch failed')
    this.name = 'DashboardFetchError'
    this.status = status
    this.problem = problem
  }
}

/**
 * Construye los `params` de axios omitiendo los filtros ausentes (D-7): el
 * Bridge trata la cadena vacía como ausente, pero depender de esa
 * tolerancia acopla este módulo a un detalle de su implementación.
 */
function buildParams(filters: DashboardQueryFilters): Record<string, number | string> {
  const params: Record<string, number | string> = {}
  if (filters.scanId !== undefined) params.scan_id = filters.scanId
  if (filters.severity !== undefined) params.severity = filters.severity
  if (filters.source !== undefined) params.source = filters.source
  return params
}

export async function fetchDashboard(filters: DashboardQueryFilters): Promise<DashboardResponse> {
  try {
    const response = await axiosInstance.get<DashboardResponse>(DASHBOARD_PATH, {
      params: buildParams(filters),
    })
    return response.data
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? null
      const data: unknown = error.response?.data
      const problem = isProblemDetails(data) ? data : null
      throw new DashboardFetchError(status, problem)
    }
    throw error
  }
}
