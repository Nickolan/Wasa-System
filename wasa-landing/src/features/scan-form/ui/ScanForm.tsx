/**
 * Interfaz del formulario de escaneo (HU-02, D-9). Solo renderiza y delega
 * a `model/useScanForm.ts` — ninguna lógica de validación ni de fetch vive
 * acá (regla dura del proyecto: el componente orquesta, el hook decide).
 */
import { Button } from '@shared/ui/Button'
import { Checkbox } from '@shared/ui/Checkbox'
import { Input } from '@shared/ui/Input'
import {
  SQLMAP_LEVEL_MAX,
  SQLMAP_LEVEL_MIN,
  SQLMAP_RISK_MAX,
  SQLMAP_RISK_MIN,
} from '@entities/scan'
import { SCAN_SUCCESS_MESSAGE, asOptionalNumber, useScanForm } from '../model/useScanForm'

export function ScanForm() {
  const { register, formState, watch, onSubmit, isLoading, serverError, scanResponse } = useScanForm()
  const ethicalConsent = watch('ethical_consent')
  const accepted = scanResponse !== null

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Input
        label="URL objetivo"
        placeholder="http://dvwa.local"
        error={formState.errors.target_url?.message}
        {...register('target_url')}
      />

      <Input
        label="PHPSESSID"
        error={formState.errors.phpsessid?.message}
        {...register('phpsessid')}
      />

      <Input
        label="Nivel de SQLMap"
        type="number"
        min={SQLMAP_LEVEL_MIN}
        max={SQLMAP_LEVEL_MAX}
        step={1}
        error={formState.errors.sqlmap_level?.message}
        {...register('sqlmap_level', { setValueAs: asOptionalNumber })}
      />

      <Input
        label="Riesgo de SQLMap"
        type="number"
        min={SQLMAP_RISK_MIN}
        max={SQLMAP_RISK_MAX}
        step={1}
        error={formState.errors.sqlmap_risk?.message}
        {...register('sqlmap_risk', { setValueAs: asOptionalNumber })}
      />

      <Checkbox
        label="Declaro que cuento con autorización para escanear este objetivo (declaración ética)"
        error={formState.errors.ethical_consent?.message}
        {...register('ethical_consent')}
      />

      {serverError && (
        <p role="alert" className="text-sm text-red-500">
          {serverError}
        </p>
      )}

      {/*
        HU-05-01/02 y `scan-submission`: la confirmación tiene que ser visible
        antes de la navegación (D-11) — sin esto el usuario espera el retraso
        de 2 s sin ninguna señal y la pantalla cambia sin explicación, que es
        exactamente lo que el retraso existe para evitar. `role="status"` (no
        `alert`): es una confirmación, no un error.
      */}
      {accepted && (
        <p role="status" className="text-sm text-green-500">
          {SCAN_SUCCESS_MESSAGE}
        </p>
      )}

      {/*
        Tras la aceptación el control queda no enviable: el navegador está por
        irse al Dashboard, y el guard del hook ya impide un segundo despacho —
        el `disabled` es lo que además lo explica en pantalla.
      */}
      <Button type="submit" loading={isLoading} disabled={!ethicalConsent || accepted}>
        Iniciar escaneo
      </Button>
    </form>
  )
}
