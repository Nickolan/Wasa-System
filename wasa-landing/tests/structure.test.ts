import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/** Recursively lists every regular file under `dir`, relative to `dir`. */
function listFilesRecursively(dir: string): string[] {
  if (!existsSync(dir)) return []
  const entries = readdirSync(dir)
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry)
    if (statSync(fullPath).isDirectory()) {
      return listFilesRecursively(fullPath).map((f) => path.join(entry, f))
    }
    return [entry]
  })
}

const projectRoot = path.resolve(__dirname, '..')

describe('entry point lives in the app layer', () => {
  it('src/app/main.tsx exists', () => {
    expect(existsSync(path.join(projectRoot, 'src/app/main.tsx'))).toBe(true)
  })

  it('src/main.tsx (template default) does not exist', () => {
    expect(existsSync(path.join(projectRoot, 'src/main.tsx'))).toBe(false)
  })
})

describe('no leftover Vite template demo content', () => {
  it.each([
    'src/App.css',
    'src/index.css',
    'src/assets/react.svg',
    'public/vite.svg',
  ])('%s does not exist', (relativePath) => {
    expect(existsSync(path.join(projectRoot, relativePath))).toBe(false)
  })
})

describe('the six FSD layers exist under src/', () => {
  it.each(['app', 'pages', 'widgets', 'features', 'entities', 'shared'])(
    'src/%s/ exists',
    (layer) => {
      expect(existsSync(path.join(projectRoot, 'src', layer))).toBe(true)
    },
  )
})

describe('roadmap-committed subdirectories exist', () => {
  it.each([
    'src/app/stores',
    'src/app/providers',
    'src/shared/ui',
    'src/shared/api',
    'src/shared/config',
    'src/shared/lib',
  ])('%s exists', (relativePath) => {
    expect(existsSync(path.join(projectRoot, relativePath))).toBe(true)
  })
})

describe('cada pieza de dominio aparece únicamente en el change que la implementa (CHANGE-13)', () => {
  it('src/app/stores/authStore.ts exists', () => {
    expect(existsSync(path.join(projectRoot, 'src/app/stores/authStore.ts'))).toBe(true)
  })

  it('src/app/stores/ contains no other store besides authStore.ts', () => {
    const files = listFilesRecursively(path.join(projectRoot, 'src/app/stores'))
    expect(files).toEqual(['authStore.ts'])
  })

  it.each(['src/shared/api', 'src/features'])(
    '%s contains only .gitkeep',
    (relativeDir) => {
      const files = listFilesRecursively(path.join(projectRoot, relativeDir))
      const nonGitkeep = files.filter((f) => path.basename(f) !== '.gitkeep')
      expect(nonGitkeep).toEqual([])
    },
  )
})

describe('src/entities quedó poblado por la slice user (CHANGE-14, D-9)', () => {
  it('src/entities/.gitkeep ya no existe — la capa dejó de estar vacía', () => {
    expect(existsSync(path.join(projectRoot, 'src/entities/.gitkeep'))).toBe(false)
  })

  it('src/entities/ contiene únicamente la slice user, sin otras slices', () => {
    const entries = readdirSync(path.join(projectRoot, 'src/entities'))
    expect(entries).toEqual(['user'])
  })

  it('src/entities/user/ contiene exactamente los módulos declarados por el design (D-2, D-8)', () => {
    const files = listFilesRecursively(path.join(projectRoot, 'src/entities/user')).sort()
    expect(files).toEqual(
      [
        'index.ts',
        path.join('model', 'loginSchema.ts'),
        path.join('model', 'passwordRules.ts'),
        path.join('model', 'registerSchema.ts'),
        path.join('model', 'types.ts'),
      ].sort(),
    )
  })
})

describe('src/shared/ui/ está poblado por CHANGE-15 (shared-ui-atoms)', () => {
  it('contains exactly the five primitives from the roadmap, no .gitkeep leftover', () => {
    const files = listFilesRecursively(path.join(projectRoot, 'src/shared/ui'))
    expect(files.sort()).toEqual(
      ['Button.tsx', 'Checkbox.tsx', 'Input.tsx', 'Modal.tsx', 'Spinner.tsx'].sort(),
    )
  })
})

describe('every .gitkeep is annotated with the change that will populate it (D-10)', () => {
  it('every .gitkeep under src/ contains a non-empty comment', () => {
    const allFiles = listFilesRecursively(path.join(projectRoot, 'src'))
    const gitkeeps = allFiles.filter((f) => path.basename(f) === '.gitkeep')

    expect(gitkeeps.length).toBeGreaterThan(0)

    for (const relativeGitkeep of gitkeeps) {
      const content = readFileSync(
        path.join(projectRoot, 'src', relativeGitkeep),
        'utf-8',
      ).trim()
      expect(content.startsWith('#')).toBe(true)
      expect(content.length).toBeGreaterThan(1)
    }
  })
})

describe('index.html points at the relocated entry', () => {
  it('has a single module script pointing to /src/app/main.tsx', () => {
    const html = readFileSync(path.join(projectRoot, 'index.html'), 'utf-8')
    const scriptMatches = [...html.matchAll(/<script type="module" src="([^"]+)">/g)]

    expect(scriptMatches).toHaveLength(1)
    expect(scriptMatches[0][1]).toBe('/src/app/main.tsx')
  })

  it('does not reference the old template entry path', () => {
    const html = readFileSync(path.join(projectRoot, 'index.html'), 'utf-8')
    expect(html).not.toContain('/src/main.tsx')
  })
})
