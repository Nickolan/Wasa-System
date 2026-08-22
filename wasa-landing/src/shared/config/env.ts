/**
 * Puerta única de configuración de entorno del frontend (D-5, D-7).
 *
 * Ningún otro módulo de `wasa-landing/src/` debe leer `import.meta.env`
 * directamente — todo pasa por los valores exportados acá. Falla ruidosamente
 * al cargar el módulo si falta una variable requerida, en vez de propagar
 * `undefined` hacia un consumidor lejano (p. ej. `axios.create({ baseURL:
 * undefined })` en CHANGE-16), donde el error se manifestaría sin mencionar
 * configuración.
 */

type RequiredEnvVarName = 'VITE_API_BASE_URL' | 'VITE_DASHBOARD_URL'

function readRequiredEnvVar(name: RequiredEnvVarName): string {
  const value = import.meta.env[name]
  if (!value || value.trim() === '') {
    throw new Error(`Falta la variable de entorno ${name}`)
  }
  return value
}

/** Origen del FastAPI Bridge (sin prefijo de versión de API — D-3). */
export const apiBaseUrl: string = readRequiredEnvVar('VITE_API_BASE_URL')

/** Destino de redirección de navegador al Dashboard React existente. */
export const dashboardUrl: string = readRequiredEnvVar('VITE_DASHBOARD_URL')
