import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  scanSchema,
  TARGET_URL_MESSAGE,
  PHPSESSID_MESSAGE,
  SQLMAP_LEVEL_MESSAGE,
  SQLMAP_RISK_MESSAGE,
  ETHICAL_CONSENT_MESSAGE,
} from '@entities/scan'
import type { ScanApiError, ScanRequest } from '@entities/scan'
import type { AuthApiError } from '@entities/user'
import { expectZodError, issuePaths } from './support/zod'
import { getImportedModules } from './support/fsd'

const validForm = {
  target_url: 'http://dvwa.local',
  phpsessid: 'abc',
  ethical_consent: true,
}

describe('scanSchema — phpsessid (D-3)', () => {
  it('rechaza la cadena vacía, identificando phpsessid con el mensaje en español', () => {
    const error = expectZodError(() => scanSchema.parse({ ...validForm, phpsessid: '' }))
    expect(issuePaths(error)).toContain('phpsessid')
    expect(error.issues.find((i) => i.path[0] === 'phpsessid')?.message).toBe(PHPSESSID_MESSAGE)
  })

  it('rechaza el formulario cuando el campo está ausente, indicando que es requerido', () => {
    const { phpsessid: _phpsessid, ...rest } = validForm
    const error = expectZodError(() => scanSchema.parse(rest))
    expect(issuePaths(error)).toContain('phpsessid')
  })

  // D-3: con el orden inverso (`min(1).trim()`, la letra literal del
  // roadmap), "   " pasa la validación y sale como "" — este test fallaría
  // contra esa implementación incorrecta.
  it('rechaza una cadena de solo espacios, sin tener éxito devolviendo la cadena vacía', () => {
    const error = expectZodError(() => scanSchema.parse({ ...validForm, phpsessid: '   ' }))
    expect(issuePaths(error)).toContain('phpsessid')
  })

  it('recorta los espacios de los extremos de un phpsessid válido', () => {
    const result = scanSchema.parse({ ...validForm, phpsessid: '  a1b2c3  ' })
    expect(result.phpsessid).toBe('a1b2c3')
  })

  it('acepta un phpsessid sin espacios tal cual', () => {
    const result = scanSchema.parse({ ...validForm, phpsessid: 'a1b2c3d4e5f6g7h8' })
    expect(result.phpsessid).toBe('a1b2c3d4e5f6g7h8')
  })
})

describe('scanSchema — sqlmap_level / sqlmap_risk (D-5, D-6, D-11)', () => {
  it('criterio de aceptación del roadmap: nivel y riesgo omitidos toman el default 1', () => {
    const result = scanSchema.parse(validForm)
    expect(result.sqlmap_level).toBe(1)
    expect(result.sqlmap_risk).toBe(1)
  })

  it('acepta valores dentro de rango', () => {
    const result = scanSchema.parse({ ...validForm, sqlmap_level: 3, sqlmap_risk: 2 })
    expect(result.sqlmap_level).toBe(3)
    expect(result.sqlmap_risk).toBe(2)
  })

  it.each([
    [1, 1],
    [5, 3],
  ])('acepta los extremos del rango: nivel %i, riesgo %i', (sqlmap_level, sqlmap_risk) => {
    const result = scanSchema.parse({ ...validForm, sqlmap_level, sqlmap_risk })
    expect(result.sqlmap_level).toBe(sqlmap_level)
    expect(result.sqlmap_risk).toBe(sqlmap_risk)
  })

  // D-5: rechazo, no clamping — un nivel/riesgo fuera de rango debe LANZAR,
  // nunca tener éxito con el valor recortado al extremo del rango.
  it.each([6, 0])('rechaza el nivel %i fuera de rango, sin recortarlo, con el mensaje en español', (sqlmap_level) => {
    const error = expectZodError(() => scanSchema.parse({ ...validForm, sqlmap_level }))
    expect(issuePaths(error)).toContain('sqlmap_level')
    expect(error.issues.find((i) => i.path[0] === 'sqlmap_level')?.message).toBe(SQLMAP_LEVEL_MESSAGE)
  })

  it.each([4, 0])('rechaza el riesgo %i fuera de rango, sin recortarlo, con el mensaje en español', (sqlmap_risk) => {
    const error = expectZodError(() => scanSchema.parse({ ...validForm, sqlmap_risk }))
    expect(issuePaths(error)).toContain('sqlmap_risk')
    expect(error.issues.find((i) => i.path[0] === 'sqlmap_risk')?.message).toBe(SQLMAP_RISK_MESSAGE)
  })

  // D-6: sin z.coerce.number() — un decimal, un texto o un string numérico
  // deben rechazarse. Consecuencia para CHANGE-18: el formulario debe
  // registrar estos dos campos con `valueAsNumber: true` (o usar un
  // <select> con valores numéricos), porque un <input type="number"> por
  // defecto entrega un string a react-hook-form.
  it('rechaza un decimal', () => {
    const error = expectZodError(() => scanSchema.parse({ ...validForm, sqlmap_level: 2.5 }))
    expect(issuePaths(error)).toContain('sqlmap_level')
  })

  it('rechaza un texto', () => {
    const error = expectZodError(() => scanSchema.parse({ ...validForm, sqlmap_level: 'alto' }))
    expect(issuePaths(error)).toContain('sqlmap_level')
  })

  it('rechaza un string numérico (sin coerción) — CHANGE-18 debe usar valueAsNumber: true', () => {
    const error = expectZodError(() => scanSchema.parse({ ...validForm, sqlmap_level: '3' }))
    expect(issuePaths(error)).toContain('sqlmap_level')
  })
})

describe('scanSchema — ethical_consent (D-4, D-12)', () => {
  it('criterio de aceptación del roadmap: rechaza la declaración ética sin marcar', () => {
    const error = expectZodError(() => scanSchema.parse({ ...validForm, ethical_consent: false }))
    expect(issuePaths(error)).toContain('ethical_consent')
  })

  it('rechaza el formulario cuando el campo está ausente', () => {
    const { ethical_consent: _ethical_consent, ...rest } = validForm
    const error = expectZodError(() => scanSchema.parse(rest))
    expect(issuePaths(error)).toContain('ethical_consent')
  })

  // D-4: un `z.literal(true, { message })` simple no pasaría este test — el
  // issue `invalid_literal` ignora `message` y deja el texto por defecto de
  // Zod en inglés.
  it('el mensaje está en español en los dos casos de fallo, y NO es el texto por defecto de Zod', () => {
    const errorFromFalse = expectZodError(() => scanSchema.parse({ ...validForm, ethical_consent: false }))
    const { ethical_consent: _ethical_consent, ...rest } = validForm
    const errorFromAbsent = expectZodError(() => scanSchema.parse(rest))

    const messageFromFalse = errorFromFalse.issues.find((i) => i.path[0] === 'ethical_consent')?.message
    const messageFromAbsent = errorFromAbsent.issues.find((i) => i.path[0] === 'ethical_consent')?.message

    expect(messageFromFalse).toBe(ETHICAL_CONSENT_MESSAGE)
    expect(messageFromAbsent).toBe(ETHICAL_CONSENT_MESSAGE)
    expect(messageFromFalse).not.toBe('Invalid literal value, expected true')
    expect(messageFromAbsent).not.toBe('Invalid literal value, expected true')
  })

  it('acepta la declaración ética marcada y el valor de salida es true', () => {
    const result = scanSchema.parse({ ...validForm, ethical_consent: true })
    expect(result.ethical_consent).toBe(true)
  })
})

describe('scanSchema — formulario completo (HU-03-04, RN-WS-09)', () => {
  it('reporta un error por cada uno de los cuatro campos inválidos, no solo el primero', () => {
    const error = expectZodError(() =>
      scanSchema.parse({
        target_url: 'example.com',
        phpsessid: '   ',
        sqlmap_level: 9,
        ethical_consent: false,
      }),
    )
    const paths = issuePaths(error)
    expect(paths).toContain('target_url')
    expect(paths).toContain('phpsessid')
    expect(paths).toContain('sqlmap_level')
    expect(paths).toContain('ethical_consent')
  })

  it('descarta una clave desconocida sin romper la validación (paridad con extra="ignore")', () => {
    const result = scanSchema.parse({ ...validForm, unexpected_field: 'noise' })
    expect('unexpected_field' in result).toBe(false)
  })
})

describe('scanSchema — target_url (D-1, D-2)', () => {
  it('rechaza una URL sin forma de URL, identificando target_url con el mensaje en español', () => {
    const error = expectZodError(() => scanSchema.parse({ ...validForm, target_url: 'not-a-url' }))
    expect(issuePaths(error)).toContain('target_url')
    expect(error.issues.find((i) => i.path[0] === 'target_url')?.message).toBe(TARGET_URL_MESSAGE)
  })

  it.each([
    'https://example.com/login.php',
    'http://testphp.vulnweb.com/artists.php?artist=1',
  ])('acepta %s', (target_url) => {
    const result = scanSchema.parse({ ...validForm, target_url })
    expect(result.target_url).toBe(target_url)
  })

  it('preserva intacta la query string de una URL válida', () => {
    const target_url = 'http://testphp.vulnweb.com/artists.php?artist=1'
    const result = scanSchema.parse({ ...validForm, target_url })
    expect(result.target_url).toContain('?artist=1')
  })

  // D-1: por sí solo, z.string().url() acepta estos tres esquemas — es
  // exactamente lo que RN-WS-02 prohíbe. Sin este test, un `url()` a secas
  // pasaría la suite entera sin cubrir la regla de negocio.
  it.each(['ftp://example.com', 'file:///etc/passwd', 'javascript:alert(1)'])(
    'rechaza el esquema prohibido %s',
    (target_url) => {
      const error = expectZodError(() => scanSchema.parse({ ...validForm, target_url }))
      expect(issuePaths(error)).toContain('target_url')
    },
  )

  it.each(['example.com', '', '//example.com'])('rechaza la entrada inválida %s', (target_url) => {
    const error = expectZodError(() => scanSchema.parse({ ...validForm, target_url }))
    expect(issuePaths(error)).toContain('target_url')
  })

  // D-1: la razón de ser de un único `.refine()` en vez de
  // `url().refine(...)` — la cadena encadenada produce dos issues sobre el
  // mismo campo con el mismo mensaje porque el `.refine` corre igual aunque
  // `.url()` ya haya fallado (verificado contra zod@3.25.76).
  it('produce exactamente un issue sobre target_url cuando es inválida', () => {
    const error = expectZodError(() => scanSchema.parse({ ...validForm, target_url: 'not-a-url' }))
    expect(error.issues.filter((issue) => issue.path[0] === 'target_url')).toHaveLength(1)
  })

  it('recorta los espacios de los extremos de una URL válida', () => {
    const result = scanSchema.parse({ ...validForm, target_url: '  https://example.com  ' })
    expect(result.target_url).toBe('https://example.com')
  })

  // D-2: trim, sin normalización — HttpUrl del Bridge normaliza (agrega la
  // barra final); este schema deliberadamente no lo hace.
  it('no normaliza la URL: no agrega la barra final', () => {
    const result = scanSchema.parse({ ...validForm, target_url: 'https://example.com' })
    expect(result.target_url).toBe('https://example.com')
  })
})

describe('ScanRequest: la aceptación ética no viaja al Bridge (D-7)', () => {
  it('descartar ethical_consent de la salida de parse deja exactamente los cuatro campos del cable', () => {
    const parsed = scanSchema.parse(validForm)
    const { ethical_consent: _ethical_consent, ...rest } = parsed
    const requestBody: ScanRequest = rest

    expect(Object.keys(requestBody).sort()).toEqual(['phpsessid', 'sqlmap_level', 'sqlmap_risk', 'target_url'])
    expect('ethical_consent' in requestBody).toBe(false)
  })

  it('los defaults aplicados por la validación viajan como 1, no como campos ausentes', () => {
    const parsed = scanSchema.parse(validForm)
    const { ethical_consent: _ethical_consent, ...requestBody } = parsed

    expect(requestBody.sqlmap_level).toBe(1)
    expect(requestBody.sqlmap_risk).toBe(1)
    expect('sqlmap_level' in requestBody).toBe(true)
    expect('sqlmap_risk' in requestBody).toBe(true)
  })
})

describe('ScanApiError y AuthApiError: misma forma entre slices (D-8)', () => {
  // Este test importa de `@entities/scan` y `@entities/user` a la vez —
  // válido acá porque `tests/` está fuera del grafo de capas de FSD que
  // verifica `tests/fsd-boundaries.test.ts`. El código de producción de
  // ninguna de las dos slices puede hacer lo mismo. La unificación real de
  // ambos tipos en un `ProblemDetails` de `shared/api/` queda planificada
  // para CHANGE-18 (Open Question 2 de design.md); mientras tanto, este
  // guard hace fallar la compilación si una de las dos formas cambia sin la
  // otra.
  type Assert<T extends true> = T
  type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
  type _ScanApiErrorMatchesAuthApiError = Assert<Equals<ScanApiError, AuthApiError>>

  it('ambos tipos declaran los mismos cinco miembros de RFC 7807 (chequeo en runtime como evidencia del guard de tipos)', () => {
    const sample: ScanApiError = {
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      detail: null,
      instance: '/api/v1/scan/start',
    }
    const asAuthApiError: AuthApiError = sample
    expect(Object.keys(asAuthApiError).sort()).toEqual(['detail', 'instance', 'status', 'title', 'type'])
  })
})

/** Recursively lists every regular file under `dir`, relative to `dir`. */
function listFilesRecursively(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry)
    if (statSync(fullPath).isDirectory()) {
      return listFilesRecursively(fullPath).map((f) => path.join(entry, f))
    }
    return [entry]
  })
}

describe('entities/scan es modelo puro: sin UI, sin red, sin almacenamiento, sin importar de otras slices (D-8, requerimiento de pureza de la spec)', () => {
  const scanSliceRoot = path.resolve(__dirname, '../src/entities/scan')
  const files = listFilesRecursively(scanSliceRoot)

  // Imports reales (no comentarios): un import de "react-hook-form" no debe
  // confundirse con un import de "react". Se resuelve con el parser de TS
  // que ya usa fsd-boundaries.test.ts, no con una búsqueda de texto libre.
  const forbiddenImportPatterns: Array<{ label: string; pattern: RegExp }> = [
    { label: 'React', pattern: /^react$/i },
    { label: 'cliente HTTP (axios)', pattern: /^axios$/i },
    { label: 'store de sesión (authStore)', pattern: /authStore/i },
    // D-8: entities/scan no puede importar de entities/user — las slices de
    // una misma capa de FSD no se importan entre sí.
    { label: 'slice entities/user', pattern: /@entities\/user|entities\/user/i },
  ]

  it('la slice tiene al menos un archivo (guarda contra un false-negative por directorio vacío)', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files)(
    '%s no importa React, un cliente HTTP, el store de sesión ni entities/user',
    (relativeFile) => {
      const source = readFileSync(path.join(scanSliceRoot, relativeFile), 'utf-8')
      const imports = getImportedModules(source)
      const hits = forbiddenImportPatterns.filter(({ pattern }) =>
        imports.some((specifier) => pattern.test(specifier)),
      )
      expect(hits.map((h) => h.label)).toEqual([])
    },
  )

  it.each(files)('%s no menciona localStorage', (relativeFile) => {
    const source = readFileSync(path.join(scanSliceRoot, relativeFile), 'utf-8')
    expect(source).not.toMatch(/localStorage/)
  })
})
