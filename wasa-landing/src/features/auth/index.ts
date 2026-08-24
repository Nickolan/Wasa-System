/**
 * API pública de la slice `features/auth` (D-1, FSD). CHANGE-19 importa de
 * acá, nunca de una ruta interna — así la organización interna de la slice
 * puede cambiar sin tocar a sus consumidores.
 */
export { LoginForm } from './login/ui/LoginForm'
export type { LoginFormProps } from './login/ui/LoginForm'
export { RegisterForm } from './register/ui/RegisterForm'
export type { RegisterFormProps } from './register/ui/RegisterForm'
