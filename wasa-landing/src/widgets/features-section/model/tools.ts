/**
 * Contenido estático como datos (D-9): cada tarjeta se genera a partir de
 * esta estructura, no de JSX repetido, para que las aserciones "al menos
 * cuatro" y "ninguna descripción vacía" sean verificables sobre datos y no
 * sobre texto suelto. Detalle interno de la slice: no se exporta desde el
 * `index.ts` público (D-9, 6.5). Vive en `model/`, separado de `ui/`, para
 * que el componente sea el único export de su archivo (fast refresh).
 */
export const TOOLS = [
  {
    name: 'ZAP',
    description: 'Detecta vulnerabilidades web comunes explorando la aplicación de forma activa y pasiva.',
  },
  {
    name: 'Nuclei',
    description: 'Ejecuta plantillas de detección para identificar configuraciones y vulnerabilidades conocidas.',
  },
  {
    name: 'ffuf',
    description: 'Descubre rutas, archivos y parámetros ocultos mediante fuzzing dirigido.',
  },
  {
    name: 'SQLMap',
    description: 'Identifica y explota puntos de inyección SQL en los parámetros del objetivo.',
  },
] as const
