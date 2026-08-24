import axios from 'axios'
import { apiBaseUrl } from '@shared/config/env'

/** Prefijo de la API de autenticación, declarado una sola vez (D-1, R-6). */
const AUTH_API_PREFIX = '/api/v1/auth'

/** Timeout explícito (~15s, checkpoint 2026-08-23): un axios sin timeout esperaría indefinidamente ante un servidor que nunca responde, alimentando D-14 (`status: null` → mensaje genérico). */
const AUTH_HTTP_TIMEOUT_MS = 15_000

/**
 * Instancia de axios propia de la slice de autenticación (D-2): no es la
 * `axiosInstance` compartida de CHANGE-18, ni lo será cuando exista. Los dos
 * endpoints de auth son públicos: no llevan `Authorization`, y su 401
 * significa "credenciales incorrectas", no "sesión expirada" — pasarlos por
 * el interceptor compartido desloguearía a un usuario ya autenticado ante un
 * simple error de tipeo. Por eso esta instancia no tiene ningún interceptor.
 */
export const authHttp = axios.create({
  baseURL: `${apiBaseUrl}${AUTH_API_PREFIX}`,
  timeout: AUTH_HTTP_TIMEOUT_MS,
})
