import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = path.resolve(__dirname, '..')

describe('Tailwind 4 is wired via the Vite plugin, not PostCSS (D-4, D-5)', () => {
  it('vite.config.ts registers the @tailwindcss/vite plugin', () => {
    const viteConfig = readFileSync(path.join(projectRoot, 'vite.config.ts'), 'utf-8')
    expect(viteConfig).toMatch(/@tailwindcss\/vite/)
    expect(viteConfig).toMatch(/tailwindcss\(\)/)
  })

  it.each(['tailwind.config.js', 'tailwind.config.ts', 'tailwind.config.cjs', 'tailwind.config.mjs'])(
    '%s does not exist',
    (file) => {
      expect(existsSync(path.join(projectRoot, file))).toBe(false)
    },
  )

  it.each(['postcss.config.js', 'postcss.config.ts', 'postcss.config.cjs', 'postcss.config.mjs'])(
    '%s does not exist',
    (file) => {
      expect(existsSync(path.join(projectRoot, file))).toBe(false)
    },
  )

  it('package.json does not declare autoprefixer anywhere', () => {
    const pkg = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf-8'))
    expect(pkg.dependencies?.autoprefixer).toBeUndefined()
    expect(pkg.devDependencies?.autoprefixer).toBeUndefined()
  })
})

describe('the global stylesheet lives in the app layer (D-8)', () => {
  const cssPath = path.join(projectRoot, 'src/app/index.css')

  it('src/app/index.css exists and imports tailwindcss v4-style', () => {
    expect(existsSync(cssPath)).toBe(true)
    const content = readFileSync(cssPath, 'utf-8')
    expect(content).toContain('@import "tailwindcss"')
  })

  it('does not use the removed v3 @tailwind directives', () => {
    const content = readFileSync(cssPath, 'utf-8')
    expect(content).not.toMatch(/@tailwind\s+(base|components|utilities)/)
  })

  it('is imported from src/app/main.tsx', () => {
    const mainTsx = readFileSync(path.join(projectRoot, 'src/app/main.tsx'), 'utf-8')
    expect(mainTsx).toMatch(/import\s+['"]\.\/index\.css['"]/)
  })
})
