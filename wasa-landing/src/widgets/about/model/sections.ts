/**
 * Contenido de la página "Acerca de WASA" como datos (design.md D-6), no
 * como JSX repetido: `AboutWidget` sólo itera sobre esta estructura, sin
 * literales de texto en el JSX. Mismo patrón que `TOOLS`/`STEPS` de
 * `features-section`/`how-it-works` — deliberadamente **no** reutiliza
 * `TOOLS`: el contenido acá son párrafos, no descripciones de una línea
 * para tarjetas de gancho (D-6, "por qué no reutilizar TOOLS").
 *
 * La sección de datos (`data`) está redactada contra la tabla de
 * comportamientos verificados de D-7 — no afirma cifrado en reposo,
 * retención acotada, borrado a pedido ni certificaciones, porque el
 * sistema no los implementa. Texto acordado con el usuario en el
 * checkpoint de governance de este change.
 */
export const ABOUT_SECTIONS = [
  {
    id: 'what',
    title: 'Qué es WASA',
    body: [
      'WASA (Web Application Security Analyzer) es una plataforma que automatiza el análisis de seguridad de aplicaciones web: orquesta varias herramientas reconocidas de análisis para detectar vulnerabilidades sobre un objetivo que vos elegís.',
      'Está pensada para quienes quieren evaluar la seguridad de una aplicación propia o de un objetivo sobre el que cuentan con autorización, sin tener que instalar ni operar cada herramienta por separado.',
    ],
  },
  {
    id: 'tools',
    title: 'Qué herramientas ejecuta',
    body: [
      'Cada escaneo corre cuatro herramientas de análisis, cada una con un enfoque distinto:',
      'OWASP ZAP explora la aplicación de forma activa y pasiva para detectar vulnerabilidades web comunes.',
      'Nuclei ejecuta plantillas de detección para identificar configuraciones y vulnerabilidades conocidas.',
      'ffuf descubre rutas, archivos y parámetros ocultos mediante fuzzing dirigido.',
      'SQLMap identifica y explota puntos de inyección SQL en los parámetros del objetivo.',
    ],
  },
  {
    id: 'flow',
    title: 'Cómo es un escaneo de punta a punta',
    body: [
      'Con una sesión iniciada, cargás la URL objetivo y los parámetros del análisis, y disparás el escaneo con un clic.',
      'El escaneo completo tarda aproximadamente 10 minutos: es una estimación, no una garantía, y puede variar según el tamaño del sitio objetivo.',
      'No hace falta que te quedes esperando: cuando termina, te enviamos el reporte con los hallazgos por correo electrónico, a la casilla de la cuenta con la que iniciaste sesión.',
    ],
  },
  {
    id: 'data',
    title: 'Qué pasa con tus datos',
    body: [
      'Tu email y tu contraseña se usan para crear tu cuenta: la contraseña se almacena hasheada con bcrypt, nunca en texto plano.',
      'La URL objetivo y el PHPSESSID que ingresás viajan hasta el workflow que ejecuta las herramientas de análisis, y quedan asociados a tu escaneo en la base del sistema — igual que los hallazgos que ese escaneo produce.',
      'Tu email también viaja junto con el escaneo para que el reporte te llegue a vos: no podés elegir otro destinatario.',
      'El token de tu sesión se guarda en el navegador que usás para iniciar sesión.',
      'WASA es un proyecto académico: los datos de tus escaneos quedan almacenados en la base del sistema y no se comparten con terceros, pero no ofrecemos todavía política de retención ni borrado a pedido.',
      'Usá WASA únicamente sobre objetivos para los que contás con autorización del propietario. Escanear sistemas sin autorización puede ser ilegal.',
    ],
  },
] as const
