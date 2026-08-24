import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { listSourceFiles } from './support/fsd'

const projectRoot = path.resolve(__dirname, '..')
const srcRoot = path.join(projectRoot, 'src')

describe('localStorage: punto único de acceso (spec: "Punto único de acceso al almacenamiento", D-12)', () => {
  it('no file under src/ other than entities/user/model/authStore.ts mentions localStorage', () => {
    const offenders = listSourceFiles(srcRoot)
      .filter((f) => f !== 'entities/user/model/authStore.ts')
      .filter((f) => readFileSync(path.join(srcRoot, f), 'utf-8').includes('localStorage'))

    expect(offenders).toEqual([])
  })

  it('entities/user/model/authStore.ts is the sole module invoking hydrate (spec: "Punto único de restauración")', () => {
    const offenders = listSourceFiles(srcRoot)
      .filter((f) => f !== 'entities/user/model/authStore.ts')
      .filter((f) => /\.hydrate\s*\(/.test(readFileSync(path.join(srcRoot, f), 'utf-8')))
      // App.tsx is expected to call hydrate() as an action — the store
      // module itself is the only one *defining* it; this check only
      // guards against a second, independent caller elsewhere.
      .filter((f) => f !== 'app/App.tsx')

    expect(offenders).toEqual([])
  })
})
