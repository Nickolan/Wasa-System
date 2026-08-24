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

/**
 * Los límites de `sqlmap_level`/`sqlmap_risk` (D-10, CHANGE-17) no viven en
 * constantes con nombre en el Bridge: están inline en la anotación del
 * campo, `nombre: Annotated[int, Field(ge=..., le=...)] = default`. Este
 * helper extrae los tres números de esa forma textual concreta.
 *
 * Trade-off asumido (D-10, R-1): más acoplado a la forma exacta de la
 * línea que `extractPythonIntConstant`, que solo depende de un nombre. Si
 * el backend reformatea la anotación, este helper falla nombrando el campo
 * que no pudo leer, en vez de saltearse en silencio — es el modo de fallo
 * deseado.
 */
export interface PythonFieldRange {
  min: number
  max: number
  default: number
}

export function extractPythonFieldRange(source: string, fieldName: string): PythonFieldRange {
  const pattern = new RegExp(
    `^\\s*${fieldName}\\s*:\\s*Annotated\\[int,\\s*Field\\(ge=(-?\\d+),\\s*le=(-?\\d+)\\)\\]\\s*=\\s*(-?\\d+)`,
    'm',
  )
  const match = source.match(pattern)

  if (!match) {
    throw new Error(
      `extractPythonFieldRange: no se pudo encontrar el campo "${fieldName}" (con la forma Annotated[int, Field(ge=..., le=...)] = default) en el módulo Python provisto.`,
    )
  }

  return { min: Number(match[1]), max: Number(match[2]), default: Number(match[3]) }
}
