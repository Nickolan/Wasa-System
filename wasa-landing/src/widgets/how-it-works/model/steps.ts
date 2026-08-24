/**
 * Contenido estático como datos (D-9), detalle interno (no se exporta
 * desde el `index.ts` público de la slice). Empieza por crear la cuenta y
 * cubre configurar, enviar y consultar resultados — sin mencionar la
 * infraestructura interna que ejecuta el escaneo. Vive en `model/`,
 * separado de `ui/`, para que el componente sea el único export de su
 * archivo (fast refresh).
 */
export const STEPS = [
  {
    title: 'Creá tu cuenta',
    description: 'Registrate con tu email para obtener acceso al formulario de escaneo.',
  },
  {
    title: 'Configurá el escaneo',
    description: 'Indicá la URL objetivo y los parámetros del análisis que querés ejecutar.',
  },
  {
    title: 'Enviá el escaneo',
    description: 'Confirmá la declaración ética y disparalo con un clic.',
  },
  {
    title: 'Consultá los resultados',
    description: 'Revisá las vulnerabilidades detectadas desde el panel de resultados.',
  },
] as const
