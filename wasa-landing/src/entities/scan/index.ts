/**
 * API pública de la slice `entities/scan` (D-8, FSD). Los consumidores
 * importan de acá, nunca de una ruta interna de `model/`.
 */
export {
  scanSchema,
  SQLMAP_LEVEL_MIN,
  SQLMAP_LEVEL_MAX,
  SQLMAP_LEVEL_DEFAULT,
  SQLMAP_RISK_MIN,
  SQLMAP_RISK_MAX,
  SQLMAP_RISK_DEFAULT,
  TARGET_URL_MESSAGE,
  PHPSESSID_MESSAGE,
  SQLMAP_LEVEL_MESSAGE,
  SQLMAP_RISK_MESSAGE,
  ETHICAL_CONSENT_MESSAGE,
} from './model/scanSchema'
export type { ScanForm, ScanRequest, ScanResponse, ScanApiError } from './model/types'
