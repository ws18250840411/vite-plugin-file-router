import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { inferOutputLanguage } from '../core/output-language'
import { generateReactRoutes } from '../emit/codegen'
import { collectRouteSliceMap } from '../emit/parse-routes-file'
import { resolveOptions, runGeneration } from '../generate'
import { scanDir } from '../core/scanner'

describe('javascript project support', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  function makeJsxProject() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-js-proj-'))
    dirs.push(root)
    const pagesDir = path.join(root, 'src', 'pages')
    fs.mkdirSync(pagesDir, { recursive: true })
    fs.writeFileSync(
      path.join(pagesDir, '_layout.jsx'),
      `import { Outlet } from 'react-router-dom'
export default function L() { return <Outlet /> }`,
    )
    fs.writeFileSync(
      path.join(pagesDir, 'index.jsx'),
      `export const meta = { title: 'Home' }
export default function Home() { return null }`,
    )
    fs.writeFileSync(
      path.join(pagesDir, 'about.jsx'),
      'export default function About() { return null }',
    )
    fs.writeFileSync(
      path.join(pagesDir, 'legal.sync.jsx'),
      'export default function Legal() { return null }',
    )
    return { root, pagesDir }
  }

  it('generates routes.js with .jsx import paths and no TypeScript', () => {
    const { root, pagesDir } = makeJsxProject()
    const outFile = path.join(root, 'src', 'routes.js')
    const tree = scanDir(pagesDir, '', { extensions: ['jsx', 'js'], exclude: [], baseRoute: '' })
    const code = generateReactRoutes(tree, {
      root,
      pagesDir,
      outFile,
      framework: 'react',
      importMode: 'lazy',
      baseRoute: '',
      outputLanguage: 'js',
    })

    expect(code).toContain('export const routes = [')
    expect(code).not.toMatch(/export type /)
    expect(code).toContain('import("./pages/index.jsx")')
    expect(code).toContain('import LegalPage from \'./pages/legal.sync.jsx\'')
  })

  it('runGeneration writes routes.js and merge preserves hand-edits', () => {
    const { root, pagesDir } = makeJsxProject()
    const resolved = resolveOptions(root, {
      pagesDir: 'src/pages',
      outFile: 'src/routes.js',
      extensions: ['jsx', 'js'],
    })

    expect(resolved.outputLanguage).toBe('js')
    runGeneration(resolved, () => {}, () => {})

    const outFile = path.join(root, 'src', 'routes.js')
    let content = fs.readFileSync(outFile, 'utf-8')
    const aboutId = './pages/about.jsx'
    const slice = collectRouteSliceMap(content).get(aboutId) ?? ''
    const editedSlice = slice.replace(
      /path: "about",/,
      'handle: { auth: true },\n        path: "about",',
    )
    content = content.slice(0, content.indexOf(slice)) + editedSlice + content.slice(content.indexOf(slice) + slice.length)
    fs.writeFileSync(outFile, content)

    fs.writeFileSync(
      path.join(pagesDir, 'contact.jsx'),
      'export default function Contact() { return null }',
    )
    runGeneration(resolved, () => {}, () => {})

    const merged = fs.readFileSync(outFile, 'utf-8')
    expect(merged).toContain('./pages/contact.jsx')
    expect(collectRouteSliceMap(merged).get(aboutId) ?? '').toContain('auth: true')
    expect(merged).not.toContain('export type')
  })

  it('infers js output for .mjs and .cjs outFile', () => {
    expect(inferOutputLanguage('/app/routes.mjs')).toBe('js')
    expect(inferOutputLanguage('/app/routes.cjs')).toBe('js')
  })

  it('outputLanguage option overrides .ts outFile extension', () => {
    const { root, pagesDir } = makeJsxProject()
    const resolved = resolveOptions(root, {
      pagesDir: 'src/pages',
      outFile: 'src/routes.ts',
      extensions: ['jsx'],
      outputLanguage: 'js',
    })
    expect(resolved.outputLanguage).toBe('js')
    runGeneration(resolved, () => {}, () => {})
    const code = fs.readFileSync(path.join(root, 'src', 'routes.ts'), 'utf-8')
    expect(code).toContain('export const routes = [')
    expect(code).not.toContain('export type FileRoute')
  })

  it('plugin package loads from CommonJS build', async () => {
    const { createRequire } = await import('node:module')
    const require = createRequire(import.meta.url)
    const plugin = require('../../dist/index.cjs')
    expect(typeof plugin.default).toBe('function')
  })
})
