/**
 * Formas de dominio de la slice `entities/user` (D-6, D-10).
 *
 * `UserRegister` y `UserLogin` describen la entrada de los formularios —
 * necesarios *antes* de parsear, como estado inicial de `react-hook-form`.
 * `TokenResponse` y `AuthApiError` son tipos, no schemas: nadie los parsea
 * en runtime en este change (esa decisión queda abierta para CHANGE-18,
 * D-10).
 *
 * Los miembros de `TokenResponse` y `AuthApiError` conservan exactamente
 * el nombre que usa el Bridge en el cable (`snake_case`), sin renombrar a
 * la convención de TypeScript: un renombrado silencioso convierte un
 * contrato verificable en una traducción que nadie ejercita hasta que
 * rompe en runtime.
 */
import type { ProblemDetails } from '@shared/api/problemDetails'

/** Datos del formulario de registro, tal como los produce react-hook-form. */
export interface UserRegister {
  email: string
  password: string
  confirmPassword: string
}

/** Datos del formulario de inicio de sesión. */
export interface UserLogin {
  email: string
  password: string
}

/**
 * Cuerpo que efectivamente viaja a `POST /auth/register`. `confirmPassword`
 * es un control de la interfaz, no un dato del dominio: el Bridge lo
 * rechazaría con `extra="forbid"` si se lo enviara.
 */
export type UserRegisterRequest = Omit<UserRegister, 'confirmPassword'>

/** Respuesta única de `POST /auth/register` (201) y `POST /auth/login` (200). */
export interface TokenResponse {
  access_token: string
  token_type: 'bearer'
  expires_in: number
}

/**
 * Cuerpo de error RFC 7807 (Problem Details) emitido por el Bridge.
 *
 * Alias del contrato compartido de `shared/api/` (D-4 de design.md,
 * CHANGE-18): la forma de los cinco miembros se declara una única vez para
 * todo el frontend, no dentro de esta slice. Referenciar el tipo se borra al
 * compilar (`verbatimModuleSyntax`) y no arrastra código de red a la slice.
 * El nombre `AuthApiError` se sigue exportando desde la API pública de la
 * slice, así que ningún consumidor cambia su import.
 */
export type AuthApiError = ProblemDetails
