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
  it('src/app/stores/authStore.ts no longer exists (reubicado a entities/user, CHANGE-16 D-3/A)', () => {
    expect(existsSync(path.join(projectRoot, 'src/app/stores/authStore.ts'))).toBe(false)
  })

  it('src/app/stores/ contains only .gitkeep (authStore.ts se reubicó a entities/user, CHANGE-16 D-3/A)', () => {
    const files = listFilesRecursively(path.join(projectRoot, 'src/app/stores'))
    expect(files).toEqual(['.gitkeep'])
  })

})

describe('src/shared/api/ quedó poblado por CHANGE-18 (D-13)', () => {
  it('src/shared/api/ contiene exactamente los módulos declarados por el design (D-1..D-6)', () => {
    const files = listFilesRecursively(path.join(projectRoot, 'src/shared/api')).sort()
    expect(files).toEqual(['axiosInstance.ts', 'problemDetails.ts'].sort())
  })
})

describe('src/features quedó poblado por las slices auth (CHANGE-16) y scan-form (CHANGE-18)', () => {
  it('src/features/.gitkeep ya no existe — la capa dejó de estar vacía', () => {
    expect(existsSync(path.join(projectRoot, 'src/features/.gitkeep'))).toBe(false)
  })

  it('src/features/ contiene únicamente las slices auth y scan-form, sin otras slices', () => {
    const entries = readdirSync(path.join(projectRoot, 'src/features'))
    expect(entries).toEqual(['auth', 'scan-form'])
  })

  it('src/features/auth/ contiene exactamente los módulos declarados por el design (D-1)', () => {
    const files = listFilesRecursively(path.join(projectRoot, 'src/features/auth')).sort()
    expect(files).toEqual(
      [
        'index.ts',
        path.join('lib', 'authErrors.ts'),
        path.join('lib', 'authHttp.ts'),
        path.join('lib', 'authMessages.ts'),
        path.join('lib', 'useAuthFormSubmit.ts'),
        path.join('login', 'api', 'loginApi.ts'),
        path.join('login', 'model', 'useLogin.ts'),
        path.join('login', 'ui', 'LoginForm.tsx'),
        path.join('register', 'api', 'registerApi.ts'),
        path.join('register', 'model', 'useRegister.ts'),
        path.join('register', 'ui', 'RegisterForm.tsx'),
      ].sort(),
    )
  })

  it('src/features/scan-form contiene exactamente los módulos declarados por el design (D-6..D-11)', () => {
    const files = listFilesRecursively(path.join(projectRoot, 'src/features/scan-form')).sort()
    expect(files).toEqual(
      [
        'index.ts',
        path.join('api', 'submitScan.ts'),
        path.join('model', 'useScanForm.ts'),
        path.join('ui', 'ScanForm.tsx'),
      ].sort(),
    )
  })
})

describe('src/entities quedó poblado por la slice user (CHANGE-14, D-9)', () => {
  it('src/entities/.gitkeep ya no existe — la capa dejó de estar vacía', () => {
    expect(existsSync(path.join(projectRoot, 'src/entities/.gitkeep'))).toBe(false)
  })

  it('src/entities/ contiene únicamente las slices scan y user, sin otras (D-9 de CHANGE-17)', () => {
    const entries = readdirSync(path.join(projectRoot, 'src/entities'))
    expect(entries).toEqual(['scan', 'user'])
  })

  it('src/entities/user/ contiene exactamente los módulos declarados por el design (D-2, D-8; CHANGE-16 D-3/A suma authStore.ts)', () => {
    const files = listFilesRecursively(path.join(projectRoot, 'src/entities/user')).sort()
    expect(files).toEqual(
      [
        'index.ts',
        path.join('model', 'authStore.ts'),
        path.join('model', 'loginSchema.ts'),
        path.join('model', 'passwordRules.ts'),
        path.join('model', 'registerSchema.ts'),
        path.join('model', 'types.ts'),
      ].sort(),
    )
  })
})

describe('src/entities/scan/ quedó poblado por CHANGE-17 (D-9)', () => {
  it('src/entities/scan/ contiene exactamente los módulos declarados por el design (D-7, D-8, D-11)', () => {
    const files = listFilesRecursively(path.join(projectRoot, 'src/entities/scan')).sort()
    expect(files).toEqual(
      ['index.ts', path.join('model', 'scanSchema.ts'), path.join('model', 'types.ts')].sort(),
    )
  })
})

describe('src/widgets/ quedó poblado por CHANGE-19 (D-1..D-14)', () => {
  it('src/widgets/.gitkeep ya no existe — la capa dejó de estar vacía', () => {
    expect(existsSync(path.join(projectRoot, 'src/widgets/.gitkeep'))).toBe(false)
  })

  it('src/widgets/ contiene únicamente las seis slices declaradas por el design, sin otras', () => {
    const entries = readdirSync(path.join(projectRoot, 'src/widgets')).sort()
    expect(entries).toEqual(
      ['auth-modal', 'features-section', 'footer', 'hero', 'how-it-works', 'scan-form'].sort(),
    )
  })

  it('src/widgets/auth-modal/ contiene exactamente los módulos declarados por el design (D-1, D-3, D-4)', () => {
    const files = listFilesRecursively(path.join(projectRoot, 'src/widgets/auth-modal')).sort()
    expect(files).toEqual(
      [
        'index.ts',
        path.join('model', 'useAuthModal.ts'),
        path.join('ui', 'LoginModal.tsx'),
        path.join('ui', 'RegisterModal.tsx'),
      ].sort(),
    )
  })

  it('src/widgets/scan-form/ contiene exactamente los módulos declarados por el design (D-5, D-6, D-8, D-11)', () => {
    const files = listFilesRecursively(path.join(projectRoot, 'src/widgets/scan-form')).sort()
    expect(files).toEqual(
      ['index.ts', path.join('model', 'anchor.ts'), path.join('ui', 'ScanFormWidget.tsx')].sort(),
    )
  })

  it('src/widgets/hero/ contiene exactamente los módulos declarados por el design (D-2, D-7)', () => {
    const files = listFilesRecursively(path.join(projectRoot, 'src/widgets/hero')).sort()
    expect(files).toEqual(
      ['index.ts', path.join('model', 'useHeroCta.ts'), path.join('ui', 'HeroWidget.tsx')].sort(),
    )
  })

  it('src/widgets/features-section/ contiene exactamente los módulos declarados por el design (D-9, D-10)', () => {
    const files = listFilesRecursively(path.join(projectRoot, 'src/widgets/features-section')).sort()
    expect(files).toEqual(
      ['index.ts', path.join('model', 'tools.ts'), path.join('ui', 'FeaturesWidget.tsx')].sort(),
    )
  })

  it('src/widgets/how-it-works/ contiene exactamente los módulos declarados por el design (D-9)', () => {
    const files = listFilesRecursively(path.join(projectRoot, 'src/widgets/how-it-works')).sort()
    expect(files).toEqual(
      ['index.ts', path.join('model', 'steps.ts'), path.join('ui', 'HowItWorksWidget.tsx')].sort(),
    )
  })

  it('src/widgets/footer/ contiene exactamente los módulos declarados por el design', () => {
    const files = listFilesRecursively(path.join(projectRoot, 'src/widgets/footer')).sort()
    expect(files).toEqual(['index.ts', path.join('ui', 'FooterWidget.tsx')].sort())
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
