/**
 * Formas de dominio de la slice `entities/scan` (D-7).
 *
 * `ScanForm` describe la entrada del formulario — necesaria *antes* de
 * parsear, como estado inicial de `react-hook-form`. `ScanRequest` es el
 * cuerpo que efectivamente viaja al Bridge: espejo exacto del `ScanRequest`
 * Pydantic (`fastapi_bridge/schemas/scan_schemas.py`), sin el checkbox de
 * aceptación ética. `ScanResponse` y `ScanApiError` son tipos, no schemas:
 * nadie los parsea en runtime en este change (mismo criterio que D-10 de
 * CHANGE-14).
 *
 * Los miembros del cable conservan exactamente el nombre que usa el Bridge
 * (`snake_case`), sin renombrar a la convención de TypeScript: un
 * renombrado silencioso convierte un contrato verificable en una traducción
 * que nadie ejercita hasta que rompe en runtime.
 */

/**
 * Datos del formulario de escaneo, tal como los produce react-hook-form.
 *
 * `sqlmap_level` y `sqlmap_risk` son opcionales: `.default(1)` en el schema
 * hace que la salida validada siempre los tenga, pero la entrada del
 * formulario puede omitirlos.
 *
 * `ethical_consent` es `boolean`, no `true` (a propósito): el checkbox
 * empieza sin marcar, y `false` tiene que ser un estado representable del
 * formulario, o el usuario no puede llegar a ver el mensaje de RN-WS-01.
 */
export interface ScanForm {
  target_url: string
  phpsessid: string
  sqlmap_level?: number
  sqlmap_risk?: number
  ethical_consent: boolean
}

/**
 * Cuerpo que efectivamente viaja a `POST /api/v1/scan/start`.
 * `ethical_consent` es una condición de la interfaz (RN-WS-01), no un dato
 * del dominio del escaneo: el Bridge la descarta (`extra="ignore"`), y este
 * tipo excluyéndola es lo que impide que CHANGE-18 componga un cuerpo con
 * el checkbox adentro.
 */
export interface ScanRequest {
  target_url: string
  phpsessid: string
  sqlmap_level: number
  sqlmap_risk: number
}

/** Respuesta de aceptación de `POST /api/v1/scan/start` (202): fire-and-forward, siempre `queued`. */
export interface ScanResponse {
  scan_id: string
  status: 'queued'
  message: string
}

/**
 * Cuerpo de error RFC 7807 (Problem Details) emitido por el Bridge.
 * `detail` es `string | null` porque el Bridge siempre emite la clave,
 * aunque su valor pueda ser nulo — no porque la clave pueda faltar.
 *
 * Duplica la forma de `AuthApiError` de `entities/user` a propósito (D-8):
 * las slices de una misma capa de FSD no se importan entre sí. El riesgo de
 * divergencia queda mitigado por un guard de tipo entre slices en
 * `tests/scan-schema.test.ts`.
 */
export interface ScanApiError {
  type: string
  title: string
  status: number
  detail: string | null
  instance: string
}
