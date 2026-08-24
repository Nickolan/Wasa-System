/**
 * API pública de la slice `features/scan-form` (D-8 de `entities/scan`,
 * mismo patrón, FSD). Los consumidores importan de acá, nunca de una ruta
 * interna de `api/`, `model/` o `ui/`.
 */
export { ScanForm } from './ui/ScanForm'
export {
  useScanForm,
  SCAN_SUBMIT_MESSAGES,
  SCAN_SUCCESS_MESSAGE,
  SUCCESS_REDIRECT_DELAY_MS,
  asOptionalNumber,
} from './model/useScanForm'
export { submitScan, ScanSubmitError, SCAN_START_PATH } from './api/submitScan'
