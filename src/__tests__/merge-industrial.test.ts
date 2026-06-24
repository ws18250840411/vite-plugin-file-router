import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import { generateReactRoutes } from '../emit/codegen'
import { mergeRouteFiles } from '../emit/merge-routes'
import { collectRouteSliceMap } from '../emit/parse-routes-file'
import { resolveOptions, runGeneration } from '../generate'
import { scanDir } from '../core/scanner'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES = path.join(__dirname, 'fixtures', 'merge')

function normalize(content: string): string {
  return content.replace(/\r\n/g, '\n').trimEnd() + '\n'
}

function readFixture(name: string): string {
  return normalize(fs.readFileSync(path.join(FIXTURES, name), 'utf-8'))
}

function patchMarker(content: string, routeId: string, marker: string): string {
  const slice = collectRouteSliceMap(content).get(routeId) ?? ''
  if (!slice) throw new Error(`missing route ${routeId}`)
  const block = slice.includes('handle:')
    ? slice.replace(/handle: \{[^}]+\}/, `handle: { marker: "${marker}" }`)
    : slice.replace(
        /(path: [^\n]+,|index: true,|lazy:)/,
        `handle: { marker: "${marker}" },\n        $1`,
      )
  const positioned = content.indexOf(slice)
  if (positioned < 0) throw new Error(`route slice not found in content: ${routeId}`)
  return content.slice(0, positioned) + block + content.slice(positioned + slice.length)
}

describe('merge industrial closure', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  function makeProject(pages: Record<string, string>) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-industrial-'))
    dirs.push(root)
    const pagesDir = path.join(root, 'src', 'pages')
    fs.mkdirSync(pagesDir, { recursive: true })
    for (const [rel, src] of Object.entries(pages)) {
      const file = path.join(pagesDir, rel)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, src)
    }
    const outFile = path.join(root, 'src', 'routes.ts')
    const tree = scanDir(pagesDir, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const fresh = generateReactRoutes(tree, {
      root,
      pagesDir,
      outFile,
      framework: 'react',
      importMode: 'lazy',
      baseRoute: '',
    })
    return { root, pagesDir, outFile, fresh }
  }

  it('snapshot: plain leaf edit + add page', () => {
    const { pagesDir, fresh } = makeProject({
      'index.tsx': 'export default function Home() {}',
      'about.tsx': 'export default function About() {}',
    })
    const edited = patchMarker(fresh, './pages/about.tsx', 'snap-about')
    fs.writeFileSync(path.join(pagesDir, 'help.tsx'), 'export default function Help() {}')

    const tree2 = scanDir(pagesDir, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const fresh2 = generateReactRoutes(tree2, {
      root: path.dirname(path.dirname(pagesDir)),
      pagesDir,
      outFile: path.join(path.dirname(path.dirname(pagesDir)), 'src', 'routes.ts'),
      framework: 'react',
      importMode: 'lazy',
      baseRoute: '',
    })
    const merged = normalize(mergeRouteFiles(fresh2, edited))
    expect(merged).toBe(readFixture('plain-after-merge.ts'))
  })

  it('snapshot: root layout edit + child edit + add page', () => {
    const { pagesDir, fresh } = makeProject({
      '_layout.tsx': 'export default function Layout() { return null }',
      'index.tsx': 'export default function Home() {}',
      'about.tsx': 'export default function About() {}',
    })
    let edited = patchMarker(fresh, './pages/_layout.tsx', 'snap-layout')
    edited = patchMarker(edited, './pages/about.tsx', 'snap-about')
    fs.writeFileSync(path.join(pagesDir, 'help.tsx'), 'export default function Help() {}')

    const tree2 = scanDir(pagesDir, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const outFile = path.join(path.dirname(path.dirname(pagesDir)), 'src', 'routes.ts')
    const fresh2 = generateReactRoutes(tree2, {
      root: path.dirname(path.dirname(pagesDir)),
      pagesDir,
      outFile,
      framework: 'react',
      importMode: 'lazy',
      baseRoute: '',
    })
    const merged = normalize(mergeRouteFiles(fresh2, edited))
    expect(merged).toBe(readFixture('layout-after-merge.ts'))
  })

  it('snapshot: nested dashboard edit + add/remove churn', () => {
    const { pagesDir, fresh } = makeProject({
      '_layout.tsx': 'export default function Layout() { return null }',
      'index.tsx': 'export default function Home() {}',
      'about.tsx': 'export default function About() {}',
      'contact.tsx': 'export default function Contact() {}',
      'dashboard/_layout.tsx': 'export default function DL() {}',
      'dashboard/index.tsx': 'export default function DI() {}',
      'dashboard/settings.tsx': 'export default function DS() {}',
    })
    let edited = patchMarker(fresh, './pages/dashboard/_layout.tsx', 'snap-dash')
    edited = patchMarker(edited, './pages/dashboard/settings.tsx', 'snap-settings')

    fs.unlinkSync(path.join(pagesDir, 'contact.tsx'))
    fs.writeFileSync(path.join(pagesDir, 'dashboard', 'profile.tsx'), 'export default function P() {}')

    const tree2 = scanDir(pagesDir, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const outFile = path.join(path.dirname(path.dirname(pagesDir)), 'src', 'routes.ts')
    const fresh2 = generateReactRoutes(tree2, {
      root: path.dirname(path.dirname(pagesDir)),
      pagesDir,
      outFile,
      framework: 'react',
      importMode: 'lazy',
      baseRoute: '',
    })
    const merged = normalize(mergeRouteFiles(fresh2, edited))
    expect(merged).toBe(readFixture('dashboard-after-merge.ts'))
  })

  it('merge is idempotent for mergeRouteFiles', () => {
    const { pagesDir, fresh } = makeProject({
      '_layout.tsx': 'export default function Layout() { return null }',
      'index.tsx': 'export default function Home() {}',
      'about.tsx': 'export default function About() {}',
    })
    const edited = patchMarker(fresh, './pages/about.tsx', 'idem-about')
    fs.writeFileSync(path.join(pagesDir, 'help.tsx'), 'export default function Help() {}')

    const tree2 = scanDir(pagesDir, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const outFile = path.join(path.dirname(path.dirname(pagesDir)), 'src', 'routes.ts')
    const fresh2 = generateReactRoutes(tree2, {
      root: path.dirname(path.dirname(pagesDir)),
      pagesDir,
      outFile,
      framework: 'react',
      importMode: 'lazy',
      baseRoute: '',
    })
    const once = mergeRouteFiles(fresh2, edited)
    const twice = mergeRouteFiles(fresh2, once)
    expect(twice).toBe(once)
  })

  it('runGeneration is idempotent when pages are unchanged after merge', () => {
    const { root, pagesDir, outFile, fresh } = makeProject({
      'index.tsx': 'export default function Home() {}',
      'about.tsx': 'export default function About() {}',
    })
    fs.writeFileSync(outFile, fresh)

    let edited = patchMarker(fresh, './pages/about.tsx', 'idem-run')
    fs.writeFileSync(outFile, edited)
    fs.writeFileSync(path.join(pagesDir, 'help.tsx'), 'export default function Help() {}')

    const resolved = resolveOptions(root, { pagesDir: 'src/pages', outFile: 'src/routes.ts' })
    const first = runGeneration(resolved, () => {}, () => {})
    const afterFirst = fs.readFileSync(outFile, 'utf-8')
    const second = runGeneration(resolved, () => {}, () => {})
    const afterSecond = fs.readFileSync(outFile, 'utf-8')

    expect(first.changed).toBe(true)
    expect(second.changed).toBe(false)
    expect(afterSecond).toBe(afterFirst)
    expect(afterSecond).toContain('idem-run')
    expect(afterSecond).toContain('./pages/help.tsx')
  })

  it('drops orphan manual routes without page import on merge', () => {
    const { pagesDir, fresh } = makeProject({
      'index.tsx': 'export default function Home() {}',
      'about.tsx': 'export default function About() {}',
    })
    const edited = patchMarker(fresh, './pages/about.tsx', 'keep-about')
    const orphan = `{
        path: "manual-orphan",
        lazy: async () => {
          const Remote = await import("../components/Remote")
          return { Component: Remote.Default }
        },
      },`
    const withOrphan = edited.replace(
      'export const routes: FileRoute[] = [',
      `export const routes: FileRoute[] = [\n  ${orphan}`,
    )

    fs.writeFileSync(path.join(pagesDir, 'help.tsx'), 'export default function Help() {}')
    const tree2 = scanDir(pagesDir, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const outFile = path.join(path.dirname(path.dirname(pagesDir)), 'src', 'routes.ts')
    const fresh2 = generateReactRoutes(tree2, {
      root: path.dirname(path.dirname(pagesDir)),
      pagesDir,
      outFile,
      framework: 'react',
      importMode: 'lazy',
      baseRoute: '',
    })
    const merged = mergeRouteFiles(fresh2, withOrphan)

    expect(merged).toContain('keep-about')
    expect(merged).toContain('./pages/help.tsx')
    expect(merged).not.toContain('manual-orphan')
    expect(merged).not.toContain('../components/Remote')
  })
})
