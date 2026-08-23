import { z } from 'zod'
import { passwordWithByteCeiling } from './passwordRules'
import type { UserLogin } from './types'

/**
 * Schema del formulario de inicio de sesión.
 *
 * D-11: el email se recorta (`trim`) porque el `UserRepository` del Bridge
 * normaliza con `email.strip().lower()` — un espacio final no debería
 * rechazar un email por lo demás válido. NO se pasa a minúsculas acá: esa
 * normalización ya la hace el Bridge, y duplicarla alteraría en silencio
 * lo que el usuario escribió.
 *
 * D-3: la contraseña exige el techo de 72 bytes (compartido con el
 * registro) pero deliberadamente NO el mínimo de 8 caracteres de
 * `registerSchema` — ver el test dedicado en `tests/login-schema.test.ts`
 * para el porqué (no es simetría olvidada, es la asimetría del Bridge).
 */
export const loginSchema = z.object({
  email: z.string().trim().email({ message: 'Ingresá un email válido.' }),
  password: passwordWithByteCeiling(z.string().min(1, { message: 'Ingresá tu contraseña.' })),
})

/**
 * Guard de tipo (D-6): falla en compilación si `loginSchema` y `UserLogin`
 * se separan. Se declara como tipo exportado, no como `const`, porque
 * `noUnusedLocals` está activo y se quejaría de una constante testigo sin
 * uso.
 *
 * Nota: `Equals` resuelve la rama negativa a `false`, no a `never`, a
 * propósito — `never` satisface trivialmente cualquier restricción
 * (`extends true`), así que un `Equals` que devolviera `never` en el
 * mismatch dejaría pasar callado cualquier divergencia (campo de más, de
 * menos, o de otro tipo). Verificado empíricamente: con `never` el guard
 * no fallaba ni con un campo extra ni con uno faltante.
 */
type Assert<T extends true> = T
type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
export type _LoginSchemaMatchesType = Assert<Equals<z.infer<typeof loginSchema>, UserLogin>>
