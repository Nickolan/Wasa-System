import axios, { type AxiosInstance } from 'axios'
import { apiBaseUrl } from '@shared/config/env'

/**
 * Único cliente HTTP del frontend hacia el FastAPI Bridge (`http-client`).
 * Su `baseURL` sale de la puerta única de configuración de entorno — el
 * módulo no lee las variables de entorno de Vite por su cuenta.
 */
export const axiosInstance: AxiosInstance = axios.create({ baseURL: apiBaseUrl })

/**
 * La credencial de sesión y la reacción al `401` entran por inyección, no
 * por import (D-1 de design.md): este módulo vive en `shared/` y no conoce
 * el `authStore` ni ninguna capa superior. `getToken` se invoca en **cada**
 * petición (D-3) — capturarlo una vez dejaría fijo el token del arranque.
 */
let getToken: (() => string | null) | null = null
let onUnauthorized: (() => void) | null = null

/**
 * Punto de configuración que la capa `app` invoca al arrancar (D-1, D-2).
 * Solo **asigna referencias de módulo**: los interceptores ya están
 * registrados desde que este módulo se evaluó, así que llamarla más de una
 * vez —lo que el modo estricto de React garantiza en desarrollo— no
 * duplica interceptores ni acumula efectos, por construcción.
 */
export function configureApiClient(config: {
  getToken: () => string | null
  onUnauthorized: () => void
}): void {
  getToken = config.getToken
  onUnauthorized = config.onUnauthorized
}

axiosInstance.interceptors.request.use((config) => {
  const token = getToken?.() ?? null
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }
  return config
})

axiosInstance.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      onUnauthorized?.()
    }
    return Promise.reject(error)
  },
)
