import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from '@app/App'
import { useAuthStore } from '@entities/user'
import { axiosInstance } from '@shared/api/axiosInstance'
import { listSourceFiles } from './support/fsd'

const initialState = useAuthStore.getState()

function navigateTo(targetPath: string) {
  window.history.pushState({}, '', targetPath)
}

function successResponse<T>(config: InternalAxiosRequestConfig, data: T, status = 200): AxiosResponse<T> {
  return { data, status, statusText: '', headers: {}, config }
}

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState(initialState, true)
  // `DashboardPage` monta `useDashboard`, que emite una consulta real vía
  // `axiosInstance`: se instala un adaptador que responde un dashboard
  // vacío, para que estos tests de routing no dependan de un backend real.
  axiosInstance.defaults.adapter = async (config) => successResponse(config, { scans: [], vulnerabilities: [] })
})

afterEach(() => {
  cleanup()
  navigateTo('/')
})

describe('App — la ruta /dashboard renderiza la pantalla de resultados (task 6.3, spec dashboard-screen)', () => {
  it('navegar a /dashboard monta la pantalla de resultados y no HomePage, AboutPage ni ScanPage', async () => {
    navigateTo('/dashboard')
    render(<App />)

    await waitFor(() => expect(screen.getByRole('button', { name: /panel general/i })).toBeInTheDocument())
    expect(screen.queryByText(/web application security assessment/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /qué es wasa/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /iniciar escaneo/i })).not.toBeInTheDocument()
  })

  it('las demás rutas siguen montando lo suyo', () => {
    navigateTo('/')
    const { unmount } = render(<App />)
    expect(screen.getByText(/web application security assessment/i)).toBeInTheDocument()
    unmount()

    navigateTo('/about')
    const aboutRender = render(<App />)
    expect(screen.getByRole('heading', { name: /qué es wasa/i })).toBeInTheDocument()
    aboutRender.unmount()

    navigateTo('/scan')
    render(<App />)
    expect(screen.getByRole('heading', { name: /iniciar escaneo/i })).toBeInTheDocument()
  })
})

describe('Pantalla de resultados — ninguna pieza lee el estado de sesión (task 6.4)', () => {
  it('ningún archivo bajo pages/DashboardPage, widgets/dashboard-* o features/dashboard importa @entities/user', () => {
    const projectRoot = path.resolve(__dirname, '..')
    const srcRoot = path.join(projectRoot, 'src')
    const prefixes = ['pages/DashboardPage/', 'features/dashboard/']

    const violations: string[] = []
    for (const file of listSourceFiles(srcRoot)) {
      const isDashboardWidget = file.startsWith('widgets/dashboard-')
      const isDashboardOwnFile = prefixes.some((prefix) => file.startsWith(prefix))
      if (!isDashboardWidget && !isDashboardOwnFile) continue

      const sourceText = readFileSync(path.join(srcRoot, file), 'utf-8')
      if (sourceText.includes('@entities/user') || /authStore/i.test(sourceText)) {
        violations.push(file)
      }
    }
    expect(violations).toEqual([])
  })
})
