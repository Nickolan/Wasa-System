import { z } from 'zod'

/**
 * Política de contraseña compartida por `loginSchema` y `registerSchema`
 * (D-2). Ninguno de los dos schemas repite estos números: ambos importan
 * de acá.
 *
 * `PASSWORD_MAX_BYTES` es el techo duro de bcrypt (bcrypt >= 4.1 lanza
 * `ValueError` por encima de 72 bytes UTF-8 en vez de truncar) y es un
 * espejo exacto de `_BCRYPT_MAX_PASSWORD_BYTES` en
 * `fastapi_bridge/schemas/auth_schemas.py` (D-2 de CHANGE-02). La paridad
 * con ese valor está verificada por `tests/auth-schemas-parity.test.ts`
 * (D-7), no solo documentada acá.
 *
 * `PASSWORD_MIN_LENGTH` es RN-WS-15 y solo rige en el registro (D-3).
 */
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_BYTES = 72

/**
 * Largo en bytes de la codificación UTF-8 de `value` (D-1).
 *
 * Deliberadamente NO usa `value.length`: esa propiedad cuenta unidades de
 * código UTF-16 y subestima el tamaño real de todo carácter no ASCII (por
 * ejemplo, "🔒".repeat(19) tiene `.length === 38` pero 76 bytes UTF-8). Un
 * `.max(72)` sobre `.length` parecería paridad con el Bridge y no lo
 * sería: solo coincidiría en el subconjunto ASCII.
 */
export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

/**
 * Aplica el techo de bytes (D-2, D-12) a un `z.string()` ya construido por
 * el schema que lo consume. `loginSchema` y `registerSchema` le pasan su
 * propio mínimo de longitud ya aplicado (o ninguno, en el caso del login —
 * D-3), de modo que el chequeo de longitud (builtin de Zod) corra antes
 * que este refine y —si falla— este refine se salteé, dejando un solo
 * mensaje por campo (comportamiento de Zod v3 verificado en design.md).
 */
export function passwordWithByteCeiling(base: z.ZodString) {
  return base.refine((value) => utf8ByteLength(value) <= PASSWORD_MAX_BYTES, {
    message: 'La contraseña no puede superar los 72 bytes.',
  })
}
