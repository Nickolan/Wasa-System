/**
 * API pública de la slice `entities/user` (D-8, FSD). Los consumidores
 * importan de acá, nunca de una ruta interna de `model/`.
 */
export { PASSWORD_MIN_LENGTH, PASSWORD_MAX_BYTES, utf8ByteLength } from './model/passwordRules'
export { loginSchema } from './model/loginSchema'
export { registerSchema } from './model/registerSchema'
export { useAuthStore } from './model/authStore'
export type {
  UserRegister,
  UserLogin,
  UserRegisterRequest,
  TokenResponse,
  AuthApiError,
} from './model/types'
