import { z } from 'zod'
import type { ScanForm, ScanRequest } from './types'

/**
 * Schema del formulario de escaneo (HU-02-01..05).
 *
 * D-1: `target_url` se valida con un único `.refine()` que subsume el
 * formato de URL y restringe el esquema a `http:`/`https:`. NO se usa
 * `z.string().url().refine(...)`: un `.refine` de campo corre siempre,
 * aunque el check builtin anterior de ese mismo campo haya fallado
 * (verificado contra zod@3.25.76) — encadenar `url()` produce dos issues
 * sobre el mismo campo con el mismo mensaje cuando el valor no es una URL.
 * Un `refine` único produce exactamente uno.
 */
export const TARGET_URL_MESSAGE = 'Ingresá una URL válida que empiece con http:// o https://.'

const isHttpUrl = (value: string): boolean => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

/**
 * D-3: `trim()` **antes** de `min(1)`, no al revés. `z.string().min(1).trim()`
 * acepta `"   "` — `min(1)` mide los tres espacios, pasa, y recién después
 * se recorta a `""` (verificado contra zod@3.25.76). Escrito en este orden,
 * `"   "` se recorta primero y `min(1)` mide la cadena vacía resultante:
 * falla, tal como exige RN-WS-03.
 */
export const PHPSESSID_MESSAGE = 'PHPSESSID requerido.'

/**
 * D-11: rangos y defaults de SQLMap, paridad literal con
 * `fastapi_bridge/schemas/scan_schemas.py` (`Field(ge=1, le=5) = 1` y
 * `Field(ge=1, le=3) = 1`). Se exportan por nombre — no quedan inline en el
 * schema — porque el test de paridad (D-10) y el futuro formulario de
 * CHANGE-18 los necesitan por nombre.
 */
export const SQLMAP_LEVEL_MIN = 1
export const SQLMAP_LEVEL_MAX = 5
export const SQLMAP_LEVEL_DEFAULT = 1
export const SQLMAP_RISK_MIN = 1
export const SQLMAP_RISK_MAX = 3
export const SQLMAP_RISK_DEFAULT = 1

export const SQLMAP_LEVEL_MESSAGE = `El nivel debe ser un número entero entre ${SQLMAP_LEVEL_MIN} y ${SQLMAP_LEVEL_MAX}.`
export const SQLMAP_RISK_MESSAGE = `El riesgo debe ser un número entero entre ${SQLMAP_RISK_MIN} y ${SQLMAP_RISK_MAX}.`

/**
 * D-4: `errorMap`, no `{ message }`. Un `message` simple no llega al issue
 * `invalid_literal` que produce `z.literal` (verificado contra zod@3.25.76):
 * el usuario vería el texto por defecto en inglés
 * ("Invalid literal value, expected true"). `errorMap` es el único
 * mecanismo que lo reemplaza, y lo hace tanto para `false` como para el
 * campo ausente — el mismo problema para quien usa el formulario.
 */
export const ETHICAL_CONSENT_MESSAGE = 'Tenés que aceptar la declaración ética para iniciar el escaneo.'

export const scanSchema = z.object({
  target_url: z.string().trim().refine(isHttpUrl, { message: TARGET_URL_MESSAGE }),
  phpsessid: z.string().trim().min(1, { message: PHPSESSID_MESSAGE }),
  // D-5: se rechaza fuera de rango, no se recorta (sin clamping) — resuelto
  // así la contradicción entre HU-02-04 ("clamping") y RN-WS-04/05 más
  // scan-payload-contract ("rechazo"), a favor del Bridge.
  // D-6: sin coerción (`z.number()`, no `z.coerce.number()`) — ver D-6 en
  // design.md sobre por qué `coerce` ensancharía el contrato en silencio.
  sqlmap_level: z
    .number()
    .int({ message: SQLMAP_LEVEL_MESSAGE })
    .min(SQLMAP_LEVEL_MIN, { message: SQLMAP_LEVEL_MESSAGE })
    .max(SQLMAP_LEVEL_MAX, { message: SQLMAP_LEVEL_MESSAGE })
    .default(SQLMAP_LEVEL_DEFAULT),
  sqlmap_risk: z
    .number()
    .int({ message: SQLMAP_RISK_MESSAGE })
    .min(SQLMAP_RISK_MIN, { message: SQLMAP_RISK_MESSAGE })
    .max(SQLMAP_RISK_MAX, { message: SQLMAP_RISK_MESSAGE })
    .default(SQLMAP_RISK_DEFAULT),
  ethical_consent: z.literal(true, {
    errorMap: () => ({ message: ETHICAL_CONSENT_MESSAGE }),
  }),
})

/**
 * Guards de tipo (D-7): fallan en compilación si `scanSchema` y los tipos
 * de `types.ts` se separan. Tipos exportados, no `const`: `noUnusedLocals`
 * está activo y se quejaría de una constante testigo sin uso.
 *
 * `Equals` resuelve la rama negativa a `false`, nunca a `never` — `never`
 * satisface trivialmente `T extends true` y dejaría pasar callado cualquier
 * divergencia (verificado empíricamente en CHANGE-14, D-6 de `loginSchema.ts`;
 * se copia acá la forma ya corregida, sin volver a discutirla).
 *
 * `ethical_consent` se excluye de los dos guards de abajo porque su tipo
 * diverge a propósito: `true` en la salida del schema, `boolean` en
 * `ScanForm` (el checkbox empieza sin marcar). Se cubre con el guard de
 * compatibilidad de más abajo, no de igualdad.
 */
type Assert<T extends true> = T
type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Extends<A, B> = A extends B ? true : false

export type _ScanRequestMatchesOutput = Assert<
  Equals<Omit<z.output<typeof scanSchema>, 'ethical_consent'>, ScanRequest>
>
export type _ScanFormMatchesInput = Assert<
  Equals<Omit<z.input<typeof scanSchema>, 'ethical_consent'>, Omit<ScanForm, 'ethical_consent'>>
>

/**
 * Guard de compatibilidad de `ethical_consent` (D-7): la salida validada
 * del schema para este campo es `true`; `ScanForm.ethical_consent` es
 * `boolean`, a propósito, porque el checkbox del formulario empieza sin
 * marcar y `false` tiene que ser un estado representable — o el usuario
 * nunca llega a ver el mensaje de RN-WS-01. `true` SHALL seguir siendo
 * asignable a `boolean`; lo inverso no se exige.
 */
export type _EthicalConsentOutputIsAssignableToFormField = Assert<
  Extends<z.output<typeof scanSchema>['ethical_consent'], ScanForm['ethical_consent']>
>

