import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { generateReactRoutes } from '../emit/codegen'
import { mergeRouteFiles } from '../emit/merge-routes'
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

describe('merge malformed routes.ts fallback', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  function makeProject(pages: Record<string, string>) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-malformed-'))
    dirs.push(root)
    const pagesDir = path.join(root, 'src', 'pages')
    const outFile = path.join(root, 'src', 'routes.ts')
    fs.mkdirSync(pagesDir, { recursive: true })
    for (const [rel, content] of Object.entries(pages)) {
      const file = path.join(pagesDir, rel)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, content)
    }
    return { root, pagesDir, outFile }
  }

  function expectFreshFallback(oldContent: string, pages: Record<string, string>) {
    const { pagesDir } = makeProject(pages)
    const fresh = regenReact(pagesDir)
    expect(mergeRouteFiles(fresh, oldContent)).toBe(fresh)
    return { fresh, pagesDir }
  }

  it.each([
    ['empty file', ''],
    ['whitespace only', '   \n\n  '],
    ['no routes export', 'export const foo = 1\n'],
    ['wrong export name', 'export const route = []\n'],
    ['unclosed routes array', 'export const routes: FileRoute[] = [\n  {\n    path: "x",\n'],
    ['unclosed outer bracket', 'export const routes: FileRoute[] = [\n'],
    ['routes assigned object literal', 'export const routes = {}\nexport default routes\n'],
    ['routes assigned null', 'export const routes = null\n'],
    ['routes assigned string', 'export const routes = "nope"\n'],
    ['empty routes array', 'export const routes: FileRoute[] = []\nexport default routes\n'],
    [
      'array body without route objects',
      `export const routes: FileRoute[] = [
  // user deleted everything
  not-a-route,
]
export default routes
`,
    ],
    [
      'truncated after export keyword',
      'export const routes',
    ],
  ])('mergeRouteFiles returns fresh when old is %s', (_label, oldContent) => {
    expectFreshFallback(oldContent, {
      'index.tsx': 'export default function Home() {}',
      'about.tsx': 'export default function About() {}',
    })
  })

  it('mergeRouteFiles returns fresh when old routes array never closes before EOF', () => {
    const { pagesDir } = makeProject({
      'index.tsx': 'export default function Home() {}',
    })
    const fresh = regenReact(pagesDir)
    const old = `${fresh.slice(0, -2)}\n`
    expect(mergeRouteFiles(fresh, old)).toBe(fresh)
  })

  it('runGeneration overwrites malformed routes.ts with fresh scan output', () => {
    const { root, pagesDir, outFile } = makeProject({
      'index.tsx': 'export default function Home() {}',
      'about.tsx': 'export default function About() {}',
    })

    fs.writeFileSync(outFile, 'export const broken = true\n')
    const resolved = resolveOptions(root, { pagesDir: 'src/pages', outFile: 'src/routes.ts' })
    const { changed } = runGeneration(resolved, () => {}, () => {})

    expect(changed).toBe(true)
    const written = fs.readFileSync(outFile, 'utf-8')
    expect(written).toContain('./pages/index.tsx')
    expect(written).toContain('./pages/about.tsx')
    expect(written).not.toContain('broken')
    expect(written).toContain('export default routes')
  })

  it('runGeneration overwrites empty routes array without merge artifacts', () => {
    const { root, pagesDir, outFile } = makeProject({
      'index.tsx': 'export default function Home() {}',
    })

    fs.writeFileSync(
      outFile,
      `import Ghost from './ghost.tsx'
export const routes: FileRoute[] = []
export default routes
`,
    )

    const resolved = resolveOptions(root, { pagesDir: 'src/pages', outFile: 'src/routes.ts' })
    runGeneration(resolved, () => {}, () => {})

    const written = fs.readFileSync(outFile, 'utf-8')
    expect(written).toContain('./pages/index.tsx')
    expect(written).not.toContain('Ghost')
    expect(written).not.toMatch(/export const routes: FileRoute\[\] = \[\]/)
  })

  it('runGeneration recovers when old file has valid prelude but corrupt array', () => {
    const { root, pagesDir, outFile } = makeProject({
      'index.tsx': 'export default function Home() {}',
    })
    const fresh = regenReact(pagesDir)

    const corrupt = fresh.replace(
      'export const routes: FileRoute[] = [',
      'export const routes: FileRoute[] = [ /* oops */ ',
    ).replace(/\]\s*\n\nexport default routes/, '\n  { path: "orphan"\nexport default routes')

    fs.writeFileSync(outFile, corrupt)
    const resolved = resolveOptions(root, { pagesDir: 'src/pages', outFile: 'src/routes.ts' })
    runGeneration(resolved, () => {}, () => {})

    const written = fs.readFileSync(outFile, 'utf-8')
    expect(written).toContain('./pages/index.tsx')
    expect(collectRouteSliceSafe(written)).toBe(true)
  })

  it('preserves edits on parseable routes when trailing object is incomplete', () => {
    const { pagesDir } = makeProject({
      'about.tsx': 'export default function About() {}',
    })
    const fresh = regenReact(pagesDir)
    const edited = fresh.replace(
      /path: "\/about",/,
      'path: "/about",\n    handle: { malformedMerge: true },',
    )
    const corrupt = edited.replace(
      /\nexport default routes/,
      '\n  { path: "broken"\nexport default routes',
    )

    const merged = mergeRouteFiles(fresh, corrupt)
    expect(merged).toContain('malformedMerge: true')
    expect(merged).toContain('./pages/about.tsx')
    expect(merged).not.toContain('path: "broken"')
  })
})

function collectRouteSliceSafe(content: string): boolean {
  return content.includes('export const routes') && content.includes('[') && content.includes(']')
}
