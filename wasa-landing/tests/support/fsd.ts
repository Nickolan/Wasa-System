import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

/**
 * Single source of truth for the FSD layer order (D-11). Adding a layer or
 * changing the direction of the rule is a one-line change here.
 */
export const LAYER_ORDER = ['app', 'pages', 'widgets', 'features', 'entities', 'shared']

/** Returns the raw import/export-from/dynamic-import specifiers referenced by a source file, statically. */
export function getImportedModules(sourceText: string): string[] {
  const info = ts.preProcessFile(sourceText, true, true)
  return info.importedFiles.map((f) => f.fileName)
}

/**
 * Maps a bare specifier — an alias (`@features/auth`) or an already-resolved
 * src-relative path (`shared/foo.ts`) — to its FSD layer name. Returns null
 * when it doesn't resolve to a layer (external package, or a relative
 * specifier that hasn't been resolved yet — see resolveLayerOfImport).
 */
export function resolveLayer(specifier: string): string | null {
  const aliasMatch = specifier.match(/^@(app|pages|widgets|features|entities|shared)(\/|$)/)
  if (aliasMatch) return aliasMatch[1]

  if (specifier.startsWith('.')) return null

  const layerMatch = specifier.match(/^(app|pages|widgets|features|entities|shared)(\/|$)/)
  if (layerMatch) return layerMatch[1]

  return null
}

/**
 * Resolves the FSD layer of an import specifier written inside `importingFile`
 * (a path relative to `src/`, forward-slash separated), handling both aliases
 * and relative imports that may cross layer boundaries
 * (e.g. "../../features/x" from "shared/foo.ts").
 */
export function resolveLayerOfImport(importingFile: string, specifier: string): string | null {
  const direct = resolveLayer(specifier)
  if (direct) return direct

  if (specifier.startsWith('.')) {
    const importerDir = path.posix.dirname(importingFile)
    const resolved = path.posix.normalize(path.posix.join(importerDir, specifier))
    return resolveLayer(resolved)
  }

  return null
}

/** The FSD layer a src-relative file path belongs to (its first path segment). */
export function layerOf(srcRelativeFile: string): string {
  return srcRelativeFile.split('/')[0]
}

/** Lists every .ts/.tsx file under `srcRoot`, as forward-slash paths relative to it. */
export function listSourceFiles(srcRoot: string): string[] {
  const results: string[] = []
  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
      } else if (/\.(ts|tsx)$/.test(entry)) {
        results.push(path.relative(srcRoot, full).split(path.sep).join('/'))
      }
    }
  }
  walk(srcRoot)
  return results
}

/** Finds every FSD boundary violation (import resolving to an earlier layer) under `srcRoot`. */
export function findBoundaryViolations(srcRoot: string): string[] {
  const violations: string[] = []
  for (const file of listSourceFiles(srcRoot)) {
    const importerLayer = layerOf(file)
    const importerIndex = LAYER_ORDER.indexOf(importerLayer)
    const sourceText = readFileSync(path.join(srcRoot, file), 'utf-8')

    for (const spec of getImportedModules(sourceText)) {
      const importedLayer = resolveLayerOfImport(file, spec)
      if (!importedLayer) continue
      const importedIndex = LAYER_ORDER.indexOf(importedLayer)
      if (importedIndex < importerIndex) {
        violations.push(
          `${file} (layer: ${importerLayer}) imports ${spec} (layer: ${importedLayer}) — violates ${LAYER_ORDER.join(' -> ')}`,
        )
      }
    }
  }
  return violations
}
