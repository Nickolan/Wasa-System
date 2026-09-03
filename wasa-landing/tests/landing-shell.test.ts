import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = path.resolve(__dirname, '..')
const indexHtmlPath = path.join(projectRoot, 'index.html')
const indexCssPath = path.join(projectRoot, 'src/app/index.css')

function readIndexHtml(): string {
  return readFileSync(indexHtmlPath, 'utf-8')
}

function readIndexCss(): string {
  return readFileSync(indexCssPath, 'utf-8')
}

/** Cuerpo del bloque `@theme` (con o sin `static`) de `src/app/index.css`. */
function readThemeBlock(): string {
  const content = readIndexCss()
  const match = content.match(/@theme(?:\s+static)?\s*\{([\s\S]*?)\n\}/)
  expect(match, 'src/app/index.css no declara un bloque @theme').not.toBeNull()
  return match?.[1] ?? ''
}

/** Valor declarado de `--font-sans` dentro del bloque `@theme`, en una línea. */
function readFontSansValue(): string {
  const match = readThemeBlock().match(/--font-sans\s*:\s*([^;]+);/)
  expect(match, '@theme no declara --font-sans').not.toBeNull()
  return (match?.[1] ?? '').replace(/\s+/g, ' ').trim()
}

function walkSourceFiles(dir: string, onFile: (fullPath: string) => void): void {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walkSourceFiles(full, onFile)
    else if (/\.(ts|tsx)$/.test(entry)) onFile(full)
  }
}

/**
 * Entradas de la paleta de Tailwind (`slate-950`, `sky-600`, …) que alguna
 * clase de utilidad aplica realmente en `src/`. Es la definición operativa de
 * "valor que la interfaz ya usa" del requisito "sin tokens huérfanos".
 *
 * `white`/`black`/`transparent`/`current` son entradas reales de la paleta
 * de Tailwind sin matiz numérico (`--color-white`, no `--color-white-500`,
 * ver `node_modules/tailwindcss/theme.css`) — el sufijo de matiz es
 * opcional sólo para ese conjunto cerrado, no para cualquier palabra
 * (evita falsos positivos como `text-center`).
 */
const SHADELESS_PALETTE_ENTRIES = ['white', 'black', 'transparent', 'current']
const TAILWIND_COLOR_UTILITY = new RegExp(
  `\\b(?:bg|text|border|ring|outline|fill|stroke|from|via|to|decoration|accent|caret|placeholder|divide|shadow)-([a-z]+-\\d{2,3}|${SHADELESS_PALETTE_ENTRIES.join('|')})\\b`,
  'g',
)

function collectPaletteEntriesUsedInSrc(): Set<string> {
  const entries = new Set<string>()
  walkSourceFiles(path.join(projectRoot, 'src'), (full) => {
    const source = readFileSync(full, 'utf-8')
    for (const match of source.matchAll(TAILWIND_COLOR_UTILITY)) entries.add(match[1])
  })
  return entries
}

describe('landing-shell — el documento declara el idioma real de su contenido (D-6)', () => {
  it('index.html declara lang="es"', () => {
    const html = readIndexHtml()
    expect(html).toMatch(/<html[^>]*\blang="es"/)
  })

  it('el idioma está en el documento servido, sin necesidad de montar React (2.3)', () => {
    // Afirmación deliberadamente sobre el archivo estático, no sobre el DOM
    // montado por jsdom: el idioma tiene que estar ahí ANTES de que la
    // aplicación arranque.
    const html = readIndexHtml()
    const htmlTagMatch = html.match(/<html[^>]*>/)
    expect(htmlTagMatch).not.toBeNull()
    expect(htmlTagMatch?.[0]).toContain('lang="es"')
  })
})

describe('landing-shell — el título del documento identifica al producto (D-6)', () => {
  const pkg = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf-8')) as {
    name: string
  }

  it('el <title> no es el nombre del paquete de package.json', () => {
    const html = readIndexHtml()
    const titleMatch = html.match(/<title>([^<]*)<\/title>/)
    expect(titleMatch).not.toBeNull()
    expect(titleMatch?.[1]).not.toBe(pkg.name)
  })

  it('el <title> nombra a WASA', () => {
    const html = readIndexHtml()
    const titleMatch = html.match(/<title>([^<]*)<\/title>/)
    expect(titleMatch?.[1]).toMatch(/wasa/i)
  })
})

describe('landing-shell — el documento no provoca peticiones fallidas del agente de usuario (CA-3)', () => {
  it('index.html declara explícitamente un icono, para que el navegador no pida /favicon.ico y registre un 404 en la consola', () => {
    // Sin `<link rel="icon">` el navegador pide `/favicon.ico` por su cuenta;
    // el servidor no lo tiene y el 404 aparece en rojo en la consola. Es
    // exactamente lo que el Criterio de Aceptación 3 dice que no puede pasar,
    // y lo que la auditoría `errors-in-console` de Lighthouse reporta.
    const html = readIndexHtml()
    expect(html).toMatch(/<link[^>]*rel="(?:shortcut )?icon"[^>]*>/)
  })
})

describe('landing-shell — carga de la tipografía sin encadenar peticiones (D-2)', () => {
  it('preconnect a https://fonts.googleapis.com', () => {
    const html = readIndexHtml()
    expect(html).toMatch(/<link[^>]*rel="preconnect"[^>]*href="https:\/\/fonts\.googleapis\.com"/)
  })

  it('preconnect a https://fonts.gstatic.com, con crossorigin', () => {
    const html = readIndexHtml()
    const linkMatch = html.match(
      /<link[^>]*rel="preconnect"[^>]*href="https:\/\/fonts\.gstatic\.com"[^>]*>/,
    )
    expect(linkMatch).not.toBeNull()
    expect(linkMatch?.[0]).toMatch(/\bcrossorigin\b/)
  })

  it('la hoja de estilos de la fuente pide display=swap', () => {
    const html = readIndexHtml()
    const stylesheetMatch = html.match(
      /<link[^>]*rel="stylesheet"[^>]*href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]*)"/,
    )
    expect(stylesheetMatch).not.toBeNull()
    expect(stylesheetMatch?.[1]).toMatch(/display=swap/)
  })

  it('sólo pide Inter en el rango de pesos 400..700, sin itálica (3.3)', () => {
    const html = readIndexHtml()
    const stylesheetMatch = html.match(
      /<link[^>]*rel="stylesheet"[^>]*href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]*)"/,
    )
    const href = stylesheetMatch?.[1] ?? ''
    expect(href).toMatch(/family=Inter/)
    expect(href).toMatch(/wght@400\.\.700/)
    expect(href).not.toMatch(/ital/i)
  })

  it('no se carga ninguna segunda familia tipográfica, en particular ninguna mono (D-1, 3.3)', () => {
    const html = readIndexHtml()
    const familyMatches = [...html.matchAll(/family=([^&"]+)/g)].map((m) => decodeURIComponent(m[1]))
    expect(familyMatches).toHaveLength(1)
    expect(familyMatches[0]).toMatch(/^Inter/)
    expect(html).not.toMatch(/mono/i)
  })

  it('src/app/index.css no contiene ningún @import url(...) hacia un origen remoto (3.4)', () => {
    const css = readFileSync(indexCssPath, 'utf-8')
    expect(css).not.toMatch(/@import\s+url\(/)
  })
})

describe('landing-shell — tokens de diseño con un único punto de declaración (D-3, D-4)', () => {
  const css = () => readFileSync(indexCssPath, 'utf-8')

  it('existe un bloque @theme posterior al @import "tailwindcss"', () => {
    const content = css()
    const importIndex = content.indexOf('@import "tailwindcss"')
    const themeIndex = content.indexOf('@theme')
    expect(importIndex).toBeGreaterThanOrEqual(0)
    expect(themeIndex).toBeGreaterThan(importIndex)
  })

  it.each([
    ['--font-sans', /--font-sans\s*:/],
    ['superficie base', /--color-surface-base\s*:/],
    ['superficie elevada', /--color-surface-elevated\s*:/],
    ['marca', /--color-brand\s*:/],
    ['error', /--color-danger\s*:/],
    ['éxito', /--color-success\s*:/],
  ])('declara el token semántico de %s', (_label, pattern) => {
    expect(css()).toMatch(pattern)
  })

  it('los nombres de los tokens declarados son semánticos, no nombres de color (sin --color-slate-* ni --color-sky-* del lado izquierdo)', () => {
    // La afirmación es sobre los nombres DECLARADOS, no sobre el archivo
    // entero: referenciar `var(--color-slate-950)` como valor es justamente lo
    // que hace que el token sea un alias exacto de la paleta (D-4).
    const declaredNames = [...readThemeBlock().matchAll(/(--[a-z-]+)\s*:/g)].map((m) => m[1])
    expect(declaredNames.length).toBeGreaterThan(0)
    for (const name of declaredNames) {
      expect(name, `${name} nombra un color de la paleta en lugar de un rol semántico`).not.toMatch(
        /^--color-(slate|sky|red|green|gray|zinc|neutral|stone|blue|indigo|violet|amber|yellow|orange|rose|pink|teal|cyan|emerald|lime|fuchsia|purple)-/,
      )
    }
  })

  it('ningún token de color se declara con un literal de color (hex/rgb/hsl/oklch): sería una copia que puede divergir de la paleta real (4.2)', () => {
    // Un literal escrito a mano NO es "el valor que la interfaz ya usa": es
    // una transcripción de él. Este proyecto usa Tailwind 4, cuya paleta está
    // definida en oklch y NO coincide con los hex de Tailwind 3
    // (p. ej. `red-500` es `oklch(63.7% .237 25.331)` = #fb2c36, no #ef4444).
    // La única forma de que el token sea de verdad un alias es referenciar la
    // variable de la paleta.
    const themeBlock = readThemeBlock()
    const colorDeclarations = [...themeBlock.matchAll(/(--color-[a-z-]+)\s*:\s*([^;]+);/g)]
    expect(colorDeclarations.length).toBeGreaterThan(0)

    const literalPattern = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\s*\(/
    const offenders = colorDeclarations
      .filter(([, , value]) => literalPattern.test(value))
      .map(([, name, value]) => `${name}: ${value.trim()}`)
    expect(offenders).toEqual([])
  })

  it('cada token de color es un alias var() de una entrada de la paleta que la interfaz ya usa (D-4, sin huérfanos, 4.2)', () => {
    const themeBlock = readThemeBlock()
    const colorDeclarations = [...themeBlock.matchAll(/(--color-[a-z-]+)\s*:\s*([^;]+);/g)]

    // Entradas de la paleta efectivamente aplicadas por alguna clase de
    // Tailwind en `src/` — la definición operativa de "valor ya presente en
    // alguna sección".
    const paletteInUse = collectPaletteEntriesUsedInSrc()
    expect(paletteInUse.size).toBeGreaterThan(0)

    for (const [, name, rawValue] of colorDeclarations) {
      const value = rawValue.trim()
      const aliasMatch = value.match(
        new RegExp(`^var\\(\\s*--color-([a-z]+-\\d{2,3}|${SHADELESS_PALETTE_ENTRIES.join('|')})\\s*\\)$`),
      )
      expect(aliasMatch, `${name} no es un alias var(--color-…) de la paleta: ${value}`).not.toBeNull()
      const entry = aliasMatch?.[1] ?? ''
      expect(
        paletteInUse.has(entry),
        `${name} referencia --color-${entry}, que ninguna clase de Tailwind aplica en src/`,
      ).toBe(true)
    }
  })

  it('los tokens mapean exactamente la tabla de D-4', () => {
    const themeBlock = readThemeBlock()
    const expected: Array<[string, string]> = [
      ['--color-surface-base', 'slate-950'],
      ['--color-surface-elevated', 'slate-900'],
      ['--color-brand', 'sky-600'],
      ['--color-danger', 'red-500'],
      ['--color-success', 'green-500'],
    ]
    for (const [token, entry] of expected) {
      expect(themeBlock).toMatch(
        new RegExp(`${token}\\s*:\\s*var\\(\\s*--color-${entry}\\s*\\)\\s*;`),
      )
    }
  })

  it('index.css declara en @layer base la superficie base y color-scheme: dark en la raíz del documento (4.3)', () => {
    const content = css()
    const baseLayerMatch = content.match(/@layer\s+base\s*\{([\s\S]*)\}/)
    expect(baseLayerMatch).not.toBeNull()
    const baseLayer = baseLayerMatch?.[1] ?? ''
    expect(baseLayer).toMatch(/\bhtml\b[\s\S]*\{[\s\S]*color-scheme:\s*dark/)
    expect(baseLayer).toMatch(/\bhtml\b[\s\S]*\{[\s\S]*background(-color)?:\s*var\(--color-surface-base\)/)
  })
})

describe('landing-shell — la tipografía declarada es la del proyecto y degrada sin romper (D-1)', () => {
  it('--font-sans encabeza la pila con la tipografía elegida por el proyecto (Inter), no con la del sistema', () => {
    const value = readFontSansValue()
    const first = value.split(',')[0].trim().replace(/^['"]|['"]$/g, '')
    expect(first).toBe('Inter')
  })

  it('--font-sans incluye una cadena de reemplazo hasta una familia genérica siempre disponible', () => {
    const families = readFontSansValue()
      .split(',')
      .map((f) => f.trim().replace(/^['"]|['"]$/g, ''))
    // Más de una entrada, y la cadena llega a un genérico del sistema: si Inter
    // no carga, el texto sigue siendo legible.
    expect(families.length).toBeGreaterThan(1)
    expect(families).toContain('sans-serif')
    expect(families.indexOf('sans-serif')).toBeGreaterThan(0)
  })

  it('la familia declarada en @theme es la misma que index.html descarga (sin descarga sin consumidor, ni consumidor sin descarga)', () => {
    const declared = readFontSansValue().split(',')[0].trim().replace(/^['"]|['"]$/g, '')
    const html = readIndexHtml()
    const familyMatches = [...html.matchAll(/family=([^&:"]+)/g)].map((m) =>
      decodeURIComponent(m[1]).replace(/\+/g, ' '),
    )
    expect(familyMatches).toContain(declared)
  })
})

describe('landing-shell — la tipografía llega por herencia, ningún componente la redeclara (4.5)', () => {
  it('ningún archivo bajo src/widgets/, src/features/, src/pages/ ni src/shared/ui/ declara su propia familia tipográfica', () => {
    const roots = ['src/widgets', 'src/features', 'src/pages', 'src/shared/ui']
    const offenders: string[] = []

    function walk(dir: string) {
      const { existsSync, readdirSync, statSync } = require('node:fs') as typeof import('node:fs')
      if (!existsSync(dir)) return
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry)
        if (statSync(full).isDirectory()) {
          walk(full)
        } else if (/\.(ts|tsx)$/.test(entry)) {
          const source = readFileSync(full, 'utf-8')
          // Clase Tailwind de familia (font-sans/font-serif/font-mono/font-<custom>)
          // o `font-family` inline — ninguna de las dos debería aparecer.
          if (/\bfont-(sans|serif|mono)\b/.test(source) || /font-family\s*:/.test(source)) {
            offenders.push(path.relative(projectRoot, full))
          }
        }
      }
    }

    for (const root of roots) {
      walk(path.join(projectRoot, root))
    }

    expect(offenders).toEqual([])
  })
})
