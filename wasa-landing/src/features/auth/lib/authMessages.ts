/**
 * Traducción `status → mensaje` de la slice (D-5). El módulo `api/` es
 * transporte puro y no decide copy; el mensaje lo resuelve `model/`, porque
 * el mismo código de estado significa cosas distintas según la operación
 * (401 es "credenciales incorrectas" en login, pero no tiene lectura en
 * registro; 409 es "email duplicado" en registro, pero no en login). El
 * `detail` que emite el Bridge nunca llega hasta acá — D-6.
 */

/** Mensaje genérico, declarado una sola vez, compartido por ambas operaciones (D-5, checkpoint 2026-08-23). */
export const GENERIC_AUTH_ERROR_MESSAGE = 'No pudimos completar la operación. Intentá de nuevo en unos minutos.'

function resolveMessage(statusMap: Record<number, string>, status: number | null): string {
  if (status === null) return GENERIC_AUTH_ERROR_MESSAGE
  return statusMap[status] ?? GENERIC_AUTH_ERROR_MESSAGE
}

const LOGIN_STATUS_MESSAGES: Record<number, string> = {
  401: 'Credenciales incorrectas.',
}

const REGISTER_STATUS_MESSAGES: Record<number, string> = {
  409: 'Este email ya está registrado.',
}

/** Resuelve el mensaje de servidor visible ante un fallo de inicio de sesión. */
export function resolveLoginErrorMessage(status: number | null): string {
  return resolveMessage(LOGIN_STATUS_MESSAGES, status)
}

/** Resuelve el mensaje de servidor visible ante un fallo de registro. */
export function resolveRegisterErrorMessage(status: number | null): string {
  return resolveMessage(REGISTER_STATUS_MESSAGES, status)
}
