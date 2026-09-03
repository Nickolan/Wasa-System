import { readFileSync } from 'node:fs'
import path from 'node:path'
import { MemoryRouter } from 'react-router-dom'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import HomePage from '@pages/HomePage'

const projectRoot = path.resolve(__dirname, '..')
const srcRoot = path.join(projectRoot, 'src')

afterEach(() => {
  cleanup()
})

/**
 * Spec `shared-ui-kit`, escenario "Las páginas comparten un mismo
 * contenedor": las cuatro páginas de la aplicación componen `PageShell`, y
 * ninguna redeclara el contenedor raíz a mano.
 */
const PAGES = [
  'pages/HomePage/index.tsx',
  'pages/ScanPage/index.tsx',
  'pages/AboutPage/index.tsx',
  'pages/DashboardPage/index.tsx',
]

describe('las cuatro páginas componen PageShell (spec shared-ui-kit)', () => {
  it.each(PAGES)('%s importa y usa PageShell, no un contenedor propio', (relativeFile) => {
    const source = readFileSync(path.join(srcRoot, relativeFile), 'utf-8')
    expect(source).toMatch(/PageShell/)
    expect(source).not.toMatch(/flex min-h-screen w-full flex-col/)
  })
})

describe('HomePage — tiene exactamente un encabezado de primer nivel (spec shared-ui-kit)', () => {
  it('el h1 del HeroWidget es el único de la página', () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    )
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })
})
