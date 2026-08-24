import { configureApiClient } from '@shared/api/axiosInstance'
import { useAuthStore } from '@entities/user'

/**
 * Único punto de cableado entre el cliente HTTP compartido y el estado de
 * sesión de la aplicación (D-1, D-2, D-3 de design.md). `shared/api/` no
 * puede importar `@entities/user` sin violar la dirección de capas
 * de FSD; este módulo vive en `app/` — la capa que sí puede conocer ambos —
 * y es quien conecta uno con el otro.
 *
 * El proveedor de credencial lee `useAuthStore.getState().token` con
 * `getState()`, no con un hook: el interceptor no es un componente y se
 * invoca en cada petición (D-3), fuera de cualquier ciclo de render.
 *
 * `configureApiClient` solo asigna referencias de módulo (D-2): invocar
 * esta función más de una vez dentro del mismo efecto de montaje —lo que
 * el modo estricto de React garantiza en desarrollo— deja el mismo
 * comportamiento, sin acumular interceptores ni duplicar efectos.
 */
export function wireHttpClient(): void {
  configureApiClient({
    getToken: () => useAuthStore.getState().token,
    onUnauthorized: () => useAuthStore.getState().logout(),
  })
}
