import { readFileSync } from 'node:fs'
import path from 'node:path'
import { create } from 'zustand'
import { describe, expect, it } from 'vitest'

const projectRoot = path.resolve(__dirname, '..')

describe('zustand is installed and importable (D-14)', () => {
  it('create resolves and is a function — no store is created here', () => {
    expect(typeof create).toBe('function')
  })
})

describe('package.json declares the full frontend stack manifest', () => {
  const pkg = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf-8')) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }

  it.each(['react', 'react-dom', 'react-hook-form', 'zod', '@hookform/resolvers', 'axios', 'zustand', 'recharts'])(
    '%s is a runtime dependency',
    (dep) => {
      expect(pkg.dependencies?.[dep]).toBeDefined()
    },
  )

  it('no test devDependency leaks into runtime dependencies', () => {
    const testDeps = ['vitest', '@testing-library/react', '@testing-library/jest-dom', 'jsdom']
    for (const dep of testDeps) {
      expect(pkg.dependencies?.[dep]).toBeUndefined()
    }
  })

  it('autoprefixer is declared nowhere (D-4)', () => {
    expect(pkg.dependencies?.autoprefixer).toBeUndefined()
    expect(pkg.devDependencies?.autoprefixer).toBeUndefined()
  })
})
