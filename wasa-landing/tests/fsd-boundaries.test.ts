import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  LAYER_ORDER,
  findBoundaryViolations,
  getImportedModules,
  layerOf,
  listSourceFiles,
  resolveLayer,
  resolveLayerOfImport,
} from './support/fsd'

const projectRoot = path.resolve(__dirname, '..')
const srcRoot = path.join(projectRoot, 'src')

describe('fsd import boundaries helpers', () => {
  it('getImportedModules extracts static imports from source text', () => {
    const source = `import { create } from 'zustand'\nimport App from './App'\n`
    expect(getImportedModules(source)).toEqual(['zustand', './App'])
  })

  it('resolveLayer maps an alias specifier to its layer', () => {
    expect(resolveLayer('@features/auth')).toBe('features')
  })
})

describe('shared/ does not import from higher FSD layers', () => {
  it('no file under src/shared imports @app, @pages, @widgets, @features or @entities', () => {
    const violations: string[] = []
    for (const file of listSourceFiles(srcRoot).filter((f) => layerOf(f) === 'shared')) {
      const sourceText = readFileSync(path.join(srcRoot, file), 'utf-8')
      for (const spec of getImportedModules(sourceText)) {
        const importedLayer = resolveLayerOfImport(file, spec)
        if (importedLayer && importedLayer !== 'shared') {
          violations.push(`${file} imports ${spec} (layer: ${importedLayer})`)
        }
      }
    }
    expect(violations).toEqual([])
  })
})

describe('the detector itself catches a deliberately violating fixture (guard on the guard)', () => {
  it('flags a simulated shared/ file that imports from @features', () => {
    const fixtureFile = 'shared/broken.ts'
    const fixtureSource = `import { useAuthFeature } from '@features/auth'\n`

    const importerIndex = LAYER_ORDER.indexOf(layerOf(fixtureFile))
    const violations: string[] = []

    for (const spec of getImportedModules(fixtureSource)) {
      const importedLayer = resolveLayerOfImport(fixtureFile, spec)
      if (!importedLayer) continue
      if (LAYER_ORDER.indexOf(importedLayer) < importerIndex) {
        violations.push(`${fixtureFile} imports ${spec} (layer: ${importedLayer})`)
      }
    }

    expect(violations).toEqual([`${fixtureFile} imports @features/auth (layer: features)`])
  })

  it('also flags a relative import that crosses layers, not just alias imports', () => {
    const fixtureFile = 'shared/lib/broken.ts'
    const fixtureSource = `import { useAuthFeature } from '../../features/auth'\n`

    const importerIndex = LAYER_ORDER.indexOf(layerOf(fixtureFile))
    const violations: string[] = []

    for (const spec of getImportedModules(fixtureSource)) {
      const importedLayer = resolveLayerOfImport(fixtureFile, spec)
      if (!importedLayer) continue
      if (LAYER_ORDER.indexOf(importedLayer) < importerIndex) {
        violations.push(`${fixtureFile} imports ${spec} (layer: ${importedLayer})`)
      }
    }

    expect(violations).toEqual([
      `${fixtureFile} imports ../../features/auth (layer: features)`,
    ])
  })
})

describe('no FSD layer imports from a layer that comes after it (app -> pages -> widgets -> features -> entities -> shared)', () => {
  it('every import in src/ resolves to the same layer or a later one in LAYER_ORDER', () => {
    expect(findBoundaryViolations(srcRoot)).toEqual([])
  })
})
