/**
 * Copy de la pantalla de espera como datos (D-3 de design.md), no como
 * literales en el JSX: `ScanPendingWidget` sólo coloca estas cadenas. Los
 * tests afirman sobre las constantes, nunca sobre el literal — mismo
 * criterio que `SCAN_SUBMIT_MESSAGES` en `features/scan-form`.
 *
 * Texto acordado con el usuario en el checkpoint de governance de este
 * change (D-3, D-7): comunica los tres hechos que exige la spec
 * `scan-pending-screen` — el escaneo está en curso, tarda
 * aproximadamente diez minutos, y el reporte llega por email a la
 * casilla de la cuenta con la que el usuario inició sesión, sin pedirle
 * que se quede en la página.
 */
export const SCAN_PENDING_COPY = {
  heading: 'Tu escaneo está en curso',
  status:
    'Recibimos tu solicitud y el análisis ya arrancó. Estamos ejecutando ZAP, Nuclei, ffuf y SQLMap sobre el objetivo que indicaste.',
  duration:
    'El escaneo completo tarda aproximadamente 10 minutos. Es una estimación: puede variar según el tamaño del sitio objetivo.',
  email:
    'Cuando termine, te enviamos el reporte con los hallazgos por correo electrónico, a la casilla de la cuenta con la que iniciaste sesión. No hace falta que dejes esta página abierta.',
} as const
