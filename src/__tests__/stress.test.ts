import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

import { afterEach, describe, expect, it } from 'vitest'

import { mergeRouteFiles } from '../emit/merge-routes'
import { collectRouteSliceMap } from '../emit/parse-routes-file'
import { generateReactRoutes } from '../emit/codegen'
import { resolveOptions, runGeneration } from '../generate'
import { scanDir } from '../core/scanner'

function regenReact(pagesDir: string) {
  const root = path.dirname(path.dirname(pagesDir))
  const outFile = path.join(root, 'src', 'routes.ts')
  const tree = scanDir(pagesDir, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
  return generateReactRoutes(tree, {
    root,
    pagesDir,
    outFile,
    framework: 'react',
    importMode: 'lazy',
    baseRoute: '',
  })
}

function patchMarker(content: string, routeId: string, marker: string): string {
  const map = collectRouteSliceMap(content)
  const slice = map.get(routeId)
  if (!slice) throw new Error(`missing ${routeId}`)
  const block = slice.replace(
    /(path: [^\n]+,|index: true,|lazy:)/,
    `handle: { marker: "${marker}" },\n        $1`,
  )
  return content.replace(slice, block)
}

describe('stress / scale', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  function makeProject(extraPages: Record<string, string> = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-stress-'))
    dirs.push(root)
    const pagesDir = path.join(root, 'src', 'pages')
    const outFile = path.join(root, 'src', 'routes.ts')
    fs.mkdirSync(pagesDir, { recursive: true })
    fs.writeFileSync(path.join(pagesDir, 'index.tsx'), 'export default function Home() {}')
    for (const [rel, source] of Object.entries(extraPages)) {
      const file = path.join(pagesDir, rel)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, source)
    }
    return { root, pagesDir, outFile }
  }

  it('generates 60 leaf routes within a reasonable time budget', () => {
    const pages: Record<string, string> = {}
    for (let i = 0; i < 60; i++) {
      pages[`section-${i}.tsx`] = `export default function S${i}() {}`
    }
    const { pagesDir, outFile } = makeProject(pages)

    const start = performance.now()
    const fresh = regenReact(pagesDir)
    fs.writeFileSync(outFile, fresh)
    const elapsed = performance.now() - start

    expect(fresh).toContain('./pages/section-59.tsx')
    expect(fresh).toContain('./pages/section-0.tsx')
    expect(elapsed).toBeLessThan(5_000)
    expect(collectRouteSliceMap(fresh).size).toBeGreaterThanOrEqual(61)
  })

  it('merges hand-edits across 60 routes after churn', () => {
    const pages: Record<string, string> = {}
    for (let i = 0; i < 60; i++) {
      pages[`batch-${i}.tsx`] = `export default function B${i}() {}`
    }
    const { pagesDir, outFile } = makeProject(pages)

    let content = regenReact(pagesDir)
    content = patchMarker(content, './pages/batch-7.tsx', 'keep-7')
    content = patchMarker(content, './pages/batch-42.tsx', 'keep-42')
    fs.writeFileSync(outFile, content)

    fs.unlinkSync(path.join(pagesDir, 'batch-3.tsx'))
    fs.unlinkSync(path.join(pagesDir, 'batch-50.tsx'))
    fs.writeFileSync(path.join(pagesDir, 'batch-new.tsx'), 'export default function New() {}')

    const start = performance.now()
    const resolved = resolveOptions(path.dirname(path.dirname(pagesDir)), {
      pagesDir: 'src/pages',
      outFile: 'src/routes.ts',
    })
    runGeneration(resolved, () => {}, () => {})
    const elapsed = performance.now() - start
    const merged = fs.readFileSync(outFile, 'utf-8')

    expect(merged).toContain('marker: "keep-7"')
    expect(merged).toContain('marker: "keep-42"')
    expect(merged).toContain('./pages/batch-new.tsx')
    expect(merged).not.toContain('./pages/batch-3.tsx')
    expect(merged).not.toContain('./pages/batch-50.tsx')
    expect(elapsed).toBeLessThan(5_000)
  })

  it('handles burst page creates followed by a single regen', () => {
    const { root, pagesDir, outFile } = makeProject()
    const resolved = resolveOptions(root, { pagesDir: 'src/pages', outFile: 'src/routes.ts' })

    for (let i = 0; i < 30; i++) {
      fs.writeFileSync(
        path.join(pagesDir, `burst-${i}.tsx`),
        `export default function Burst${i}() {}`,
      )
    }

    runGeneration(resolved, () => {}, () => {})
    const written = fs.readFileSync(outFile, 'utf-8')

    for (let i = 0; i < 30; i++) {
      expect(written).toContain(`./pages/burst-${i}.tsx`)
    }
    expect((written.match(/export const routes/g) ?? []).length).toBe(1)
  })

  it('parallel runGeneration calls leave a valid routes file', async () => {
    const pages: Record<string, string> = {}
    for (let i = 0; i < 25; i++) {
      pages[`parallel-${i}.tsx`] = `export default function P${i}() {}`
    }
    const { root, pagesDir, outFile } = makeProject(pages)
    const resolved = resolveOptions(root, { pagesDir: 'src/pages', outFile: 'src/routes.ts' })

    fs.writeFileSync(outFile, regenReact(pagesDir))

    await Promise.all(
      Array.from({ length: 12 }, () =>
        Promise.resolve().then(() => runGeneration(resolved, () => {}, () => {})),
      ),
    )

    const written = fs.readFileSync(outFile, 'utf-8')
    expect((written.match(/export const routes/g) ?? []).length).toBe(1)
    expect(written).toContain('export default routes')
    expect(collectRouteSliceMap(written).size).toBeGreaterThanOrEqual(26)
    for (let i = 0; i < 25; i++) {
      expect(written).toContain(`./pages/parallel-${i}.tsx`)
    }
  })

  it('merge stays linear-ish for 80 route slice map lookups', () => {
    const pages: Record<string, string> = {}
    for (let i = 0; i < 80; i++) {
      pages[`scale-${i}.tsx`] = `export default function X${i}() {}`
    }
    const { pagesDir } = makeProject(pages)

    const fresh = regenReact(pagesDir)
    let edited = fresh
    for (const id of ['./pages/scale-1.tsx', './pages/scale-40.tsx', './pages/scale-79.tsx']) {
      edited = patchMarker(edited, id, `m-${id}`)
    }

    const start = performance.now()
    const merged = mergeRouteFiles(fresh, edited)
    const elapsed = performance.now() - start

    expect(merged).toContain('marker: "m-./pages/scale-40.tsx"')
    expect(elapsed).toBeLessThan(500)
  })
})
