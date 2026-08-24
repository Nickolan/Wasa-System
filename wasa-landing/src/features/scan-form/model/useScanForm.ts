/**
 * Estado del formulario de escaneo: validación, envío, carga y mensajes
 * (D-9, D-10, D-12 de design.md). `ScanForm.tsx` (grupo 9) solo renderiza y
 * delega acá — ninguna lógica de fetch/validación vive en el componente.
 */
import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'
import type { ScanForm, ScanRequest } from '@entities/scan'
import { scanSchema, SQLMAP_LEVEL_DEFAULT, SQLMAP_RISK_DEFAULT } from '@entities/scan'
import { dashboardUrl } from '@shared/config/env'
import { ScanSubmitError, submitScan } from '../api/submitScan'

/**
 * HU-05-01: el mensaje de éxito se ve ~2s antes de redirigir (D-11) — no es
 * inmediato, para que la pantalla no cambie sin explicación aparente.
 */
export const SUCCESS_REDIRECT_DELAY_MS = 2000

/**
 * `setValueAs`, no `valueAsNumber` (D-9, R-5): un campo numérico vacío con
 * `valueAsNumber` produce `NaN`, que `z.number()` rechaza con el mensaje en
 * inglés por defecto de Zod. Acá un campo vacío se convierte en "campo
 * omitido", y el `.default(...)` del schema lo completa.
 */
export const asOptionalNumber = (value: string): number | undefined =>
  value === '' ? undefined : Number(value)

/**
 * Tabla de mensajes indexada por situación (D-12), exportada por nombre para
 * que los tests afirmen sobre la constante, no repitan el literal. `400` y
 * `422` comparten mensaje (el Bridge no aceptó los datos); el `429` no dice
 * cuántos minutos faltan (R-1: `Retry-After` no está expuesto por CORS).
 */
export const SCAN_SUBMIT_MESSAGES = {
  unauthorized: 'Tu sesión expiró. Iniciá sesión de nuevo para lanzar el escaneo.',
  validation: 'El Bridge no aceptó los datos enviados. Revisá el formulario e intentá de nuevo.',
  rateLimited: 'Alcanzaste el límite de escaneos. Esperá un momento antes de volver a intentarlo.',
  unavailable: 'El sistema de escaneo no está disponible en este momento. Intentá más tarde.',
  generic: 'Ocurrió un error inesperado al iniciar el escaneo. Intentá de nuevo.',
  network: 'No pudimos conectarnos con el servidor. Verificá tu conexión e intentá de nuevo.',
} as const

/**
 * Confirmación de aceptación (`202`) que el usuario ve durante
 * `SUCCESS_REDIRECT_DELAY_MS`, antes de que el navegador se vaya al Dashboard
 * (HU-05-01, HU-05-02, `scan-submission`: "la confirmación SHALL ser visible
 * antes de la navegación"). Es texto propio, no el `message` que devolvió el
 * Bridge: ese campo es un registro del orquestador, no texto de interfaz —
 * mismo criterio que D-12 aplica al `detail` del error.
 */
export const SCAN_SUCCESS_MESSAGE =
  'Escaneo encolado. Te llevamos al Dashboard para seguir el progreso…'

/**
 * Traduce un `ScanSubmitError` al mensaje que ve el usuario (D-5, D-12):
 * nunca compone el mensaje a partir de `error.problem` — el `detail` del
 * Bridge es un registro de depuración, no texto de interfaz (7.7).
 */
function messageForSubmitError(error: ScanSubmitError): string {
  if (error.status === null) return SCAN_SUBMIT_MESSAGES.network
  if (error.status === 401) return SCAN_SUBMIT_MESSAGES.unauthorized
  if (error.status === 400 || error.status === 422) return SCAN_SUBMIT_MESSAGES.validation
  if (error.status === 429) return SCAN_SUBMIT_MESSAGES.rateLimited
  if (error.status === 502) return SCAN_SUBMIT_MESSAGES.unavailable
  return SCAN_SUBMIT_MESSAGES.generic
}

export function useScanForm() {
  const form = useForm<ScanForm, unknown, z.output<typeof scanSchema>>({
    // Instanciación explícita del genérico `Input` (D-10): sin esto, TS
    // infiere el `Input` de `zodResolver` como el tipo de *entrada* de Zod
    // para `ethical_consent` (`true` literal, por `z.literal(true)`), no
    // `boolean` — y `Resolver<{ethical_consent: true}>` no es asignable a
    // `Resolver<ScanForm>` en la posición contravariante de `resolver`.
    // Fijar `Input = ScanForm` acá es la comprobación covariante correcta:
    // `true` sigue siendo asignable a `boolean` en esa dirección.
    resolver: zodResolver<ScanForm, unknown, z.output<typeof scanSchema>>(scanSchema),
    defaultValues: {
      target_url: '',
      phpsessid: '',
      sqlmap_level: SQLMAP_LEVEL_DEFAULT,
      sqlmap_risk: SQLMAP_RISK_DEFAULT,
      ethical_consent: false,
    },
  })

  const [isLoading, setIsLoading] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [scanResponse, setScanResponse] = useState<Awaited<ReturnType<typeof submitScan>> | null>(null)

  /**
   * Refs, no estado: el guard de doble submit (7.5) y el de "ya se aceptó,
   * no reenviar" (8.6) tienen que leerse de forma síncrona dentro del mismo
   * tick en que se dispara un segundo submit — antes de que React vuelva a
   * renderizar con el estado actualizado.
   */
  const submittingRef = useRef(false)
  const succeededRef = useRef(false)

  // `useCallback` (no una función inline): además de la identidad estable
  // habitual, evita el falso positivo de `react(refs)` de oxlint, que
  // marca el acceso a `.current` como "durante el render" cuando la función
  // que lo hace queda anidada directamente en el cuerpo del hook — aunque
  // acá solo se ejecuta más tarde, como manejador de submit devuelto por
  // `handleSubmit` (nunca durante el render mismo).
  const onValidSubmit = useCallback(async (data: z.output<typeof scanSchema>) => {
    if (submittingRef.current || succeededRef.current) return
    submittingRef.current = true
    setIsLoading(true)
    setServerError(null)

    // D-10: `ScanRequest` no admite `ethical_consent` por tipo — omitirlo
    // acá es lo que impide despachar el checkbox al Bridge.
    const { ethical_consent: _ethicalConsent, ...request } = data
    const scanRequest: ScanRequest = request

    try {
      const response = await submitScan(scanRequest)
      succeededRef.current = true
      setScanResponse(response)
    } catch (error) {
      if (error instanceof ScanSubmitError) {
        setServerError(messageForSubmitError(error))
      } else {
        throw error
      }
    } finally {
      setIsLoading(false)
      submittingRef.current = false
    }
  }, [])

  // Falso positivo de `react(refs)`: `onValidSubmit` solo lee `.current`
  // dentro del manejador de submit que devuelve `handleSubmit` (react-hook-
  // form), nunca durante el render. `handleSubmit` se invoca acá para
  // *producir* ese manejador — patrón idiomático de RHF —, no para ejecutar
  // `onValidSubmit` de forma síncrona.
  // oxlint-disable-next-line react/refs
  const onSubmit = form.handleSubmit(onValidSubmit)

  /**
   * Redirección al Dashboard tras la aceptación (D-11): en un efecto con
   * `clearTimeout` en el cleanup, no en el `then` del submit — un
   * `setTimeout` disparado ahí seguiría vivo tras desmontar el componente y
   * navegaría igual (8.4). jsdom no implementa la navegación; los tests
   * sustituyen `window.location` por un objeto propio (D-11, nota de
   * testing) — este módulo solo le asigna `href`.
   */
  useEffect(() => {
    if (!scanResponse) return
    const timeoutId = setTimeout(() => {
      window.location.href = dashboardUrl
    }, SUCCESS_REDIRECT_DELAY_MS)
    return () => clearTimeout(timeoutId)
  }, [scanResponse])

  return {
    register: form.register,
    formState: form.formState,
    watch: form.watch,
    onSubmit,
    isLoading,
    serverError,
    scanResponse,
  }
}
