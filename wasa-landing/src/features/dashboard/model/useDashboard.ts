/**
 * Estado de la pantalla de resultados: filtros + carga de datos (D-7 de
 * design.md, spec `dashboard-client-requests`). `pages/DashboardPage` y los
 * widgets consumen esto — ninguna lógica de fetch vive en ellos.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { DashboardResponse } from '@entities/dashboard'
import { DashboardFetchError, fetchDashboard, type DashboardQueryFilters } from '../api/fetchDashboard'

export interface DashboardFilters {
  scanId: number | null
  severity: string | null
  source: string | null
}

export type DashboardFilterKey = keyof DashboardFilters

const INITIAL_FILTERS: DashboardFilters = { scanId: null, severity: null, source: null }

/** `null` es "sin filtrar" acá; `undefined` es "ausente del pedido" en `DashboardQueryFilters` (D-7). */
function toQueryFilters(filters: DashboardFilters): DashboardQueryFilters {
  const query: DashboardQueryFilters = {}
  if (filters.scanId !== null) query.scanId = filters.scanId
  if (filters.severity !== null) query.severity = filters.severity
  if (filters.source !== null) query.source = filters.source
  return query
}

export interface UseDashboardResult {
  data: DashboardResponse | null
  isLoading: boolean
  error: DashboardFetchError | null
  filters: DashboardFilters
  setFilter: (key: DashboardFilterKey, value: DashboardFilters[DashboardFilterKey]) => void
}

export function useDashboard(): UseDashboardResult {
  const [filters, setFilters] = useState<DashboardFilters>(INITIAL_FILTERS)
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<DashboardFetchError | null>(null)

  // Guarda de obsolescencia (D-7, task 4.3): un identificador incremental.
  // Al resolver, si el identificador ya no es el vigente, la respuesta se
  // descarta — así una respuesta tardía de un pedido superado nunca
  // reemplaza el resultado del pedido vigente.
  const latestRequestIdRef = useRef(0)
  // `isLoading` a pantalla completa sólo en la primera carga (task 4.4):
  // en recargas por cambio de filtro los datos previos permanecen
  // visibles, sin volver a mostrar el estado de carga.
  const hasLoadedOnceRef = useRef(false)

  useEffect(() => {
    const requestId = latestRequestIdRef.current + 1
    latestRequestIdRef.current = requestId

    if (!hasLoadedOnceRef.current) setIsLoading(true)

    fetchDashboard(toQueryFilters(filters))
      .then((response) => {
        if (latestRequestIdRef.current !== requestId) return
        setData(response)
        setError(null)
        hasLoadedOnceRef.current = true
        setIsLoading(false)
      })
      .catch((caught: unknown) => {
        if (latestRequestIdRef.current !== requestId) return
        hasLoadedOnceRef.current = true
        setIsLoading(false)
        if (caught instanceof DashboardFetchError) {
          setError(caught)
          return
        }
        throw caught
      })
  }, [filters])

  const setFilter = useCallback((key: DashboardFilterKey, value: DashboardFilters[DashboardFilterKey]) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }, [])

  return { data, isLoading, error, filters, setFilter }
}
