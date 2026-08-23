import { z } from 'zod'
import { PASSWORD_MIN_LENGTH, passwordWithByteCeiling } from './passwordRules'
import type { UserRegister } from './types'

/**
 * Schema del formulario de registro (RN-WS-15).
 *
 * `password` exige el mínimo de `PASSWORD_MIN_LENGTH` (8, RN-WS-15) además
 * del techo de 72 bytes compartido con el login (D-3). `confirmPassword`
 * exige solo no estar vacío: la comparación con `password` la hace el
 * `.superRefine` de abajo.
 *
 * Sin `.strict()` (D-5): el objeto Zod ya descarta claves desconocidas en
 * la salida de `parse` por defecto, que es exactamente lo que mantiene
 * limpio el cuerpo que viaja al Bridge (`extra="forbid"`). `.strict()`
 * reportaría esas claves como un error sin campo asociado (`path: []`).
 */
export const registerSchema = z
  .object({
    email: z.string().trim().email({ message: 'Ingresá un email válido.' }),
    password: passwordWithByteCeiling(
      z.string().min(PASSWORD_MIN_LENGTH, {
        message: 'La contraseña debe tener al menos 8 caracteres.',
      }),
    ),
    confirmPassword: z.string().min(1, { message: 'Confirmá tu contraseña.' }),
  })
  .superRefine((values, ctx) => {
    if (values.password !== values.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: 'Las contraseñas no coinciden.',
      })
    }
  })

/**
 * Guard de tipo (D-6): falla en compilación si `registerSchema` y
 * `UserRegister` se separan. Tipo exportado, no `const` (`noUnusedLocals`).
 *
 * `Equals` resuelve la rama negativa a `false`, no a `never` — ver la nota
 * en `loginSchema.ts` sobre por qué `never` deja pasar cualquier
 * divergencia sin error.
 */
type Assert<T extends true> = T
type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
export type _RegisterSchemaMatchesType = Assert<Equals<z.infer<typeof registerSchema>, UserRegister>>
