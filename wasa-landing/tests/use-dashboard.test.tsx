import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardResponse } from '@entities/dashboard'
import { useDashboard } from '@features/dashboard/model/useDashboard'

const fetchDashboardMock = vi.fn()

vi.mock('@features/dashboard/api/fetchDashboard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@features/dashboard/api/fetchDashboard')>()
  return {
    ...actual,
    fetchDashboard: (...args: Parameters<typeof actual.fetchDashboard>) => fetchDashboardMock(...args),
  }
})

const EMPTY: DashboardResponse = { scans: [], vulnerabilities: [] }
const WITH_DATA: DashboardResponse = { scans: [{ id: 1 }], vulnerabilities: [{ id: 1 }] }
const OTHER_DATA: DashboardResponse = { scans: [{ id: 2 }], vulnerabilities: [{ id: 2 }] }

beforeEach(() => {
  fetchDashboardMock.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('useDashboard — consulta inicial al montar (task 4.1)', () => {
  it('una única consulta al montar, sin params', async () => {
    fetchDashboardMock.mockResolvedValue(EMPTY)
    renderHook(() => useDashboard())

    await waitFor(() => expect(fetchDashboardMock).toHaveBeenCalledTimes(1))
    expect(fetchDashboardMock).toHaveBeenCalledWith({})
  })

  it('los tres filtros inician en "sin filtrar" (null)', () => {
    fetchDashboardMock.mockResolvedValue(EMPTY)
    const { result } = renderHook(() => useDashboard())

    expect(result.current.filters).toEqual({ scanId: null, severity: null, source: null })
  })
})

describe('useDashboard — reconsulta ante cada cambio de filtro (task 4.2)', () => {
  it('cada setFilter dispara una consulta nueva con los filtros vigentes combinados', async () => {
    fetchDashboardMock.mockResolvedValue(EMPTY)
    const { result } = renderHook(() => useDashboard())
    await waitFor(() => expect(fetchDashboardMock).toHaveBeenCalledTimes(1))

    act(() => result.current.setFilter('severity', 'Critical'))
    await waitFor(() => expect(fetchDashboardMock).toHaveBeenCalledTimes(2))
    expect(fetchDashboardMock).toHaveBeenLastCalledWith({ severity: 'Critical' })

    act(() => result.current.setFilter('scanId', 5))
    await waitFor(() => expect(fetchDashboardMock).toHaveBeenCalledTimes(3))
    expect(fetchDashboardMock).toHaveBeenLastCalledWith({ severity: 'Critical', scanId: 5 })
  })
})

describe('useDashboard — guarda de respuesta obsoleta (task 4.3, D-7)', () => {
  it('una respuesta tardía de un pedido superado no reemplaza el resultado del pedido vigente', async () => {
    let resolveFirst: (value: DashboardResponse) => void = () => {}
    let resolveSecond: (value: DashboardResponse) => void = () => {}

    fetchDashboardMock.mockImplementationOnce(
      () => new Promise<DashboardResponse>((resolve) => (resolveFirst = resolve)),
    )

    const { result } = renderHook(() => useDashboard())
    await waitFor(() => expect(fetchDashboardMock).toHaveBeenCalledTimes(1))

    fetchDashboardMock.mockImplementationOnce(
      () => new Promise<DashboardResponse>((resolve) => (resolveSecond = resolve)),
    )
    act(() => result.current.setFilter('severity', 'Critical'))
    await waitFor(() => expect(fetchDashboardMock).toHaveBeenCalledTimes(2))

    resolveSecond(OTHER_DATA)
    await waitFor(() => expect(result.current.data).toEqual(OTHER_DATA))

    resolveFirst(WITH_DATA)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(result.current.data).toEqual(OTHER_DATA)
  })
})

describe('useDashboard — política de estados de carga (task 4.4)', () => {
  it('isLoading es true durante la primera carga y false apenas resuelve', async () => {
    let resolveFirst: (value: DashboardResponse) => void = () => {}
    fetchDashboardMock.mockImplementationOnce(
      () => new Promise<DashboardResponse>((resolve) => (resolveFirst = resolve)),
    )

    const { result } = renderHook(() => useDashboard())
    expect(result.current.isLoading).toBe(true)

    resolveFirst(EMPTY)
    await waitFor(() => expect(result.current.isLoading).toBe(false))
  })

  it('tras un cambio de filtro con datos ya cargados, los datos previos siguen visibles hasta que llega la respuesta nueva', async () => {
    fetchDashboardMock.mockResolvedValueOnce(WITH_DATA)
    const { result } = renderHook(() => useDashboard())
    await waitFor(() => expect(result.current.data).toEqual(WITH_DATA))
    expect(result.current.isLoading).toBe(false)

    let resolveSecond: (value: DashboardResponse) => void = () => {}
    fetchDashboardMock.mockImplementationOnce(
      () => new Promise<DashboardResponse>((resolve) => (resolveSecond = resolve)),
    )
    act(() => result.current.setFilter('severity', 'Critical'))

    // Los datos previos permanecen y no se reactiva la carga a pantalla completa.
    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toEqual(WITH_DATA)

    resolveSecond(OTHER_DATA)
    await waitFor(() => expect(result.current.data).toEqual(OTHER_DATA))
  })
})

describe('useDashboard — no ensucia la consola (task 4.5, D-4.1)', () => {
  it('no registra la respuesta ni nada más por consola', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchDashboardMock.mockResolvedValue(WITH_DATA)

    renderHook(() => useDashboard())
    await waitFor(() => expect(fetchDashboardMock).toHaveBeenCalled())

    expect(logSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()

    logSpy.mockRestore()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })
})
