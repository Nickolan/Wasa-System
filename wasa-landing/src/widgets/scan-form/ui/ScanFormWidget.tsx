import { useAuthStore } from '@entities/user'
import { ScanForm } from '@features/scan-form'
import { SCAN_FORM_ANCHOR_ID } from '../model/anchor'

/**
 * Clases Tailwind planas concentradas acá (D-13), un punto por componente.
 */
const SECTION_CLASSES = 'flex w-full flex-col items-center gap-6 px-6 py-16 text-center text-slate-100'
const ETHICAL_NOTICE_CLASSES = 'max-w-xl text-sm text-slate-400'
const WALL_CLASSES = 'flex w-full max-w-md flex-col items-center gap-4'
const WALL_TEXT_CLASSES = 'text-base text-slate-300'
const ACTIONS_CLASSES = 'flex gap-3'
const PRIMARY_ACTION_CLASSES =
  'rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500'
const SECONDARY_ACTION_CLASSES =
  'rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 hover:border-slate-500'
const FORM_WRAPPER_CLASSES = 'flex w-full max-w-md flex-col items-stretch gap-4'
const LOGOUT_CLASSES = 'self-end text-sm text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline'

/**
 * Nombre accesible de la sección (`landing-composition`: cada sección es una
 * región identificable y con nombre). Es el mismo en los dos estados de
 * sesión, igual que el ancla (D-5): la región no cambia de identidad cuando
 * cambia su contenido. Va como `aria-label` y no como `aria-labelledby`
 * porque la sección no tiene encabezado visible propio.
 */
const SECTION_LABEL = 'Formulario de escaneo'

export interface ScanFormWidgetProps {
  /** Invocada cuando el visitante sin sesión activa "Iniciar Sesión" desde el muro. */
  onRequestLogin: () => void
  /** Invocada cuando el visitante sin sesión activa "Crear Cuenta" desde el muro. */
  onRequestRegister: () => void
}

/**
 * La puerta al formulario de escaneo (`auth-wall`, RN-WS-10). El ancla vive
 * en la sección exterior y existe en los dos estados de sesión (D-5): el
 * destino del CTA de la presentación nunca desaparece a mitad de vida de la
 * página, ni siquiera si la sesión expira mientras está abierta.
 *
 * La ocultación es por ausencia del nodo, no por estilo (D-6): el `ScanForm`
 * sólo se monta cuando `isAuthenticated` es `true`, leído con un selector
 * del store (no `getState()`) para que la transición sea reactiva.
 */
export function ScanFormWidget({ onRequestLogin, onRequestRegister }: ScanFormWidgetProps) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const logout = useAuthStore((state) => state.logout)

  return (
    <section id={SCAN_FORM_ANCHOR_ID} aria-label={SECTION_LABEL} className={SECTION_CLASSES}>
      {/* Aviso ético — siempre, en los dos estados de sesión (D-8). */}
      <p className={ETHICAL_NOTICE_CLASSES}>
        Usá WASA únicamente sobre objetivos para los que contás con autorización del propietario.
        Escanear sistemas sin autorización puede ser ilegal.
      </p>

      {isAuthenticated ? (
        <div className={FORM_WRAPPER_CLASSES}>
          <button type="button" onClick={logout} className={LOGOUT_CLASSES}>
            Cerrar sesión
          </button>
          <ScanForm />
        </div>
      ) : (
        <div className={WALL_CLASSES}>
          <p className={WALL_TEXT_CLASSES}>
            Necesitás una sesión activa para usar el formulario de escaneo.
          </p>
          <div className={ACTIONS_CLASSES}>
            <button type="button" onClick={onRequestLogin} className={PRIMARY_ACTION_CLASSES}>
              Iniciar Sesión
            </button>
            <button type="button" onClick={onRequestRegister} className={SECONDARY_ACTION_CLASSES}>
              Crear Cuenta
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
