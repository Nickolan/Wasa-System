/**
 * Extrae una constante entera de un módulo Python leído como texto plano
 * (D-7 de CHANGE-14: verificar la paridad de la política de contraseña
 * leyendo el módulo real del Bridge, no repitiendo el número).
 *
 * Modo de fallo elegido a propósito: si `name` no aparece como asignación
 * de un entero en `source`, lanza un error que **nombra la constante que
 * no pudo leer**, en vez de devolver `undefined` o saltear la aserción en
 * silencio. Un chequeo de paridad que se auto-desactiva cuando el backend
 * renombra la constante es peor que no tenerlo.
 */
export function extractPythonIntConstant(source: string, name: string): number {
  const pattern = new RegExp(`^${name}\\s*(?::\\s*\\w+\\s*)?=\\s*(-?\\d+)`, 'm')
  const match = source.match(pattern)

  if (!match) {
    throw new Error(
      `extractPythonIntConstant: no se pudo encontrar la constante "${name}" en el módulo Python provisto.`,
    )
  }

  return Number(match[1])
}
