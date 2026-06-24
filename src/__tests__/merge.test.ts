import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { generateReactRoutes, generateVueRoutes } from '../emit/codegen'
import { mergeRouteFiles } from '../emit/merge-routes'
import {
  collectPositionedRouteSlices,
  collectRouteSliceMap,
} from '../emit/parse-routes-file'
import { resolveOptions, runGeneration } from '../generate'
import { scanDir } from '../core/scanner'

function replaceRouteBlock(content: string, routeId: string, block: string): string {
  const slice = collectPositionedRouteSlices(content).find((s) => s.id === routeId)
  if (!slice) throw new Error(`missing route ${routeId}`)
  return content.slice(0, slice.start) + block + content.slice(slice.end)
}

function regenAndMerge(
  edited: string,
  pagesDir: string,
  framework: 'react' | 'vue' = 'react',
  baseRoute = '',
) {
  const root = path.dirname(path.dirname(pagesDir))
  const outFile = path.join(root, 'src', 'routes.ts')
  const extensions = framework === 'vue' ? ['vue'] : ['tsx']
  const tree = scanDir(pagesDir, '', { extensions, exclude: [], baseRoute })
  const ctx = {
    root,
    pagesDir,
    outFile,
    framework,
    importMode: 'lazy' as const,
    baseRoute,
  }
  const fresh = framework === 'vue'
    ? generateVueRoutes(tree, ctx)
    : generateReactRoutes(tree, ctx)
  return mergeRouteFiles(fresh, edited)
}

function mergeAfterAddingPage(
  fresh: string,
  edited: string,
  pagesDir: string,
  newPageRel: string,
  newPageSource: string,
): string {
  fs.writeFileSync(path.join(pagesDir, newPageRel), newPageSource)
  const framework = newPageRel.endsWith('.vue') ? 'vue' : 'react'
  return regenAndMerge(edited, pagesDir, framework)
}

function regenReact(pagesDir: string, baseRoute = '') {
  const root = path.dirname(path.dirname(pagesDir))
  const outFile = path.join(root, 'src', 'routes.ts')
  const tree = scanDir(pagesDir, '', { extensions: ['tsx'], exclude: [], baseRoute })
  return generateReactRoutes(tree, {
    root,
    pagesDir,
    outFile,
    framework: 'react',
    importMode: 'lazy',
    baseRoute,
  })
}

function patchHandle(content: string, routeId: string, marker: string): string {
  const slice = collectRouteSliceMap(content).get(routeId) ?? ''
  if (!slice) throw new Error(`route missing: ${routeId}`)
  const block = slice.includes('handle:')
    ? slice.replace(/handle: \{[^}]+\}/, `handle: { marker: "${marker}" }`)
    : slice.replace(
        /(path: [^\n]+,|index: true,|lazy:)/,
        `handle: { marker: "${marker}" },\n        $1`,
      )
  return replaceRouteBlock(content, routeId, block)
}

function routeMarker(content: string, routeId: string): string | undefined {
  const slice = collectRouteSliceMap(content).get(routeId) ?? ''
  const m = slice.match(/marker: "([^"]+)"/)
  return m?.[1]
}

describe('merge-routes', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  function makeProject(pages: Record<string, string>) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-merge-'))
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

  function ctx(root: string, pagesDir: string, outFile: string) {
    return {
      root,
      pagesDir,
      outFile,
      framework: 'react' as const,
      importMode: 'lazy' as const,
      baseRoute: '',
    }
  }

  it('writes fresh file when routes.ts does not exist', () => {
    const { root, pagesDir, outFile } = makeProject({
      'index.tsx': 'export default function Home() {}',
    })
    const resolved = resolveOptions(root, { pagesDir: 'src/pages', outFile: 'src/routes.ts' })
    const { changed } = runGeneration(resolved, () => {}, () => {})
    expect(changed).toBe(true)
    expect(fs.existsSync(outFile)).toBe(true)
    expect(fs.readFileSync(outFile, 'utf-8')).toContain('./pages/index.tsx')
  })

  it('collectRouteSliceMap indexes nested leaf routes', () => {
    const { root, pagesDir, outFile } = makeProject({
      '_layout.tsx': 'export default function Layout() { return null }',
      'index.tsx': 'export default function Home() {}',
      'about.tsx': 'export default function About() {}',
    })

    const tree = scanDir(pagesDir, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const fresh = generateReactRoutes(tree, ctx(root, pagesDir, outFile))
    const edited = fresh.replace(
      /path: "about",/,
      'path: "about",\n        handle: { title: "Custom About" },',
    )

    const map = collectRouteSliceMap(edited)
    expect(map.has('./pages/about.tsx')).toBe(true)
    expect(map.get('./pages/about.tsx')).toContain('Custom About')
  })

  it('preserves user edits on existing page when a new page is added', () => {
    const { root, pagesDir, outFile } = makeProject({
      '_layout.tsx': 'export default function Layout() { return null }',
      'index.tsx': 'export default function Home() {}',
      'about.tsx': 'export default function About() {}',
    })

    const tree = scanDir(pagesDir, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const fresh = generateReactRoutes(tree, ctx(root, pagesDir, outFile))
    fs.writeFileSync(outFile, fresh)

    const edited = fresh.replace(
      /path: "about",/,
      'path: "about",\n        handle: { title: "Custom About" },',
    )
    fs.writeFileSync(outFile, edited)

    fs.writeFileSync(
      path.join(pagesDir, 'contact.tsx'),
      'export default function Contact() {}',
    )

    const resolved = resolveOptions(root, { pagesDir: 'src/pages', outFile: 'src/routes.ts' })
    runGeneration(resolved, () => {}, () => {})

    const next = fs.readFileSync(outFile, 'utf-8')
    expect(next).toContain('Custom About')
    expect(next).toContain('./pages/contact.tsx')
  })

  it('drops route when page file is deleted', () => {
    const { root, pagesDir, outFile } = makeProject({
      'index.tsx': 'export default function Home() {}',
      'about.tsx': 'export default function About() {}',
    })

    const resolved = resolveOptions(root, { pagesDir: 'src/pages', outFile: 'src/routes.ts' })
    runGeneration(resolved, () => {}, () => {})
    expect(fs.readFileSync(outFile, 'utf-8')).toContain('./pages/about.tsx')

    fs.unlinkSync(path.join(pagesDir, 'about.tsx'))
    runGeneration(resolved, () => {}, () => {})

    const next = fs.readFileSync(outFile, 'utf-8')
    expect(next).not.toContain('./pages/about.tsx')
  })

  it('does not migrate edits when page file is renamed', () => {
    const { root, pagesDir, outFile } = makeProject({
      'about.tsx': 'export default function About() {}',
    })

    const resolved = resolveOptions(root, { pagesDir: 'src/pages', outFile: 'src/routes.ts' })
    runGeneration(resolved, () => {}, () => {})

    const edited = fs
      .readFileSync(outFile, 'utf-8')
      .replace(/path: "\/about",/, 'path: "/about",\n    handle: { title: "Kept" },')
    fs.writeFileSync(outFile, edited)

    fs.renameSync(path.join(pagesDir, 'about.tsx'), path.join(pagesDir, 'info.tsx'))
    runGeneration(resolved, () => {}, () => {})

    const next = fs.readFileSync(outFile, 'utf-8')
    expect(next).toContain('./pages/info.tsx')
    expect(next).not.toContain('Kept')
    expect(next).not.toContain('./pages/about.tsx')
  })

  it('adds child route under layout while preserving sibling edits', () => {
    const { root, pagesDir, outFile } = makeProject({
      'dashboard/_layout.tsx': 'export default function DashLayout() { return null }',
      'dashboard/index.tsx': 'export default function DashHome() {}',
      'dashboard/settings.tsx': 'export default function Settings() {}',
    })

    const resolved = resolveOptions(root, { pagesDir: 'src/pages', outFile: 'src/routes.ts' })
    runGeneration(resolved, () => {}, () => {})

    const edited = fs
      .readFileSync(outFile, 'utf-8')
      .replace(
        /path: "settings",/,
        'path: "settings",\n            handle: { title: "Settings Custom" },',
      )
    fs.writeFileSync(outFile, edited)

    fs.writeFileSync(
      path.join(pagesDir, 'dashboard', 'profile.tsx'),
      'export default function Profile() {}',
    )
    runGeneration(resolved, () => {}, () => {})

    const next = fs.readFileSync(outFile, 'utf-8')
    expect(next).toContain('Settings Custom')
    expect(next).toContain('./pages/dashboard/profile.tsx')
  })

  it('keeps fresh codegen formatting after merge', () => {
    const { root, pagesDir, outFile } = makeProject({
      '_layout.tsx': 'export default function Layout() { return null }',
      'index.tsx': 'export default function Home() {}',
      'about.tsx': 'export default function About() {}',
    })

    const tree = scanDir(pagesDir, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const fresh = generateReactRoutes(tree, ctx(root, pagesDir, outFile))
    const edited = fresh.replace(
      /path: "about",/,
      'path: "about",\n        handle: { stable: true },',
    )

    const merged = mergeAfterAddingPage(
      fresh,
      edited,
      pagesDir,
      'contact.tsx',
      'export default function Contact() {}',
    )

    expect(merged).toContain('stable: true')
    expect(merged).toContain('./pages/contact.tsx')
    expect(merged).toMatch(/\n  \{\n    lazy: async \(\) => \{\n      const m = await import\("\.\/pages\/_layout\.tsx"\)/)
    expect(merged).not.toMatch(/,\s*,/)
  })

  it('mergeRouteFiles returns fresh when old file cannot be parsed', () => {
    const fresh = `export const routes: FileRoute[] = []\nexport default routes\n`
    const old = `export const broken = true\n`
    expect(mergeRouteFiles(fresh, old)).toBe(fresh)
  })

  describe('route groups', () => {
    it('preserves hand-edits on pages inside (group) directories', () => {
      const { pagesDir } = makeProject({
        '(app)/about.tsx': 'export default function About() {}',
        '(app)/contact.tsx': 'export default function Contact() {}',
      })
      const fresh = regenReact(pagesDir)

      const aboutId = './pages/(app)/about.tsx'
      const edited = patchHandle(fresh, aboutId, 'group-about')
      const merged = mergeAfterAddingPage(
        fresh,
        edited,
        pagesDir,
        '(app)/help.tsx',
        'export default function Help() {}',
      )

      expect(routeMarker(merged, aboutId)).toBe('group-about')
      expect(merged).toContain('./pages/(app)/help.tsx')
      expect(merged).toContain('./pages/(app)/contact.tsx')
    })

    it('preserves layout head inside a route group while children follow scan', () => {
      const { pagesDir } = makeProject({
        '(app)/_layout.tsx': 'export default function App() {}',
        '(app)/dashboard.tsx': 'export default function Dash() {}',
      })
      const fresh = regenReact(pagesDir)

      const layoutId = './pages/(app)/_layout.tsx'
      let edited = patchHandle(fresh, layoutId, 'group-layout')
      edited = patchHandle(edited, './pages/(app)/dashboard.tsx', 'group-dash')

      fs.writeFileSync(path.join(pagesDir, '(app)', 'settings.tsx'), 'export default function S() {}')
      const merged = regenAndMerge(edited, pagesDir)

      expect(routeMarker(merged, layoutId)).toBe('group-layout')
      expect(routeMarker(merged, './pages/(app)/dashboard.tsx')).toBe('group-dash')
      expect(merged).toContain('./pages/(app)/settings.tsx')
    })

    it('flattens route-group children under a root layout on merge', () => {
      const { pagesDir } = makeProject({
        '_layout.tsx': 'export default function Root() {}',
        '(app)/about.tsx': 'export default function About() {}',
      })
      const fresh = regenReact(pagesDir)

      const edited = patchHandle(fresh, './pages/(app)/about.tsx', 'nested-group')
      const merged = mergeAfterAddingPage(
        fresh,
        edited,
        pagesDir,
        '(app)/news.tsx',
        'export default function News() {}',
      )

      expect(routeMarker(merged, './pages/(app)/about.tsx')).toBe('nested-group')
      expect(merged).toContain('./pages/_layout.tsx')
      expect(merged).toContain('./pages/(app)/news.tsx')
      expect(merged).toContain('children: [')
    })
  })
})

describe('merge field order preservation', () => {
  const dirs: string[] = []
  const lazyAbout = `lazy: async () => {
          const m = await import("./pages/about.tsx")
          return {
            Component: m.default,
          }
        },`

  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  function setupLayoutAbout() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-merge-order-'))
    dirs.push(root)
    const pagesDir = path.join(root, 'src', 'pages')
    const outFile = path.join(root, 'src', 'routes.ts')
    fs.mkdirSync(pagesDir, { recursive: true })
    fs.writeFileSync(path.join(pagesDir, '_layout.tsx'), 'export default function Layout() { return null }')
    fs.writeFileSync(path.join(pagesDir, 'index.tsx'), 'export default function Home() {}')
    fs.writeFileSync(path.join(pagesDir, 'about.tsx'), 'export default function About() {}')

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

  function aboutSlice(content: string): string {
    const slice = collectRouteSliceMap(content).get('./pages/about.tsx')
    if (!slice) throw new Error('about route missing')
    return slice
  }

  it.each([
    {
      name: 'path → lazy → handle (codegen default + trailing handle)',
      block: `{
        path: "about",
        ${lazyAbout}
        handle: { order: "path-lazy-handle" },
      }`,
      assert: (merged: string, slice: string) => {
        expect(slice).toContain('order: "path-lazy-handle"')
        expect(slice.indexOf('path:')).toBeLessThan(slice.indexOf('lazy:'))
        expect(slice.indexOf('lazy:')).toBeLessThan(slice.indexOf('handle:'))
        expect(merged).toContain('./pages/contact.tsx')
      },
    },
    {
      name: 'lazy → path → handle',
      block: `{
        ${lazyAbout}
        path: "about",
        handle: { order: "lazy-path-handle" },
      }`,
      assert: (merged: string, slice: string) => {
        expect(slice).toContain('order: "lazy-path-handle"')
        expect(slice.indexOf('lazy:')).toBeLessThan(slice.indexOf('path:'))
        expect(slice.indexOf('path:')).toBeLessThan(slice.indexOf('handle:'))
        expect(merged).toContain('./pages/contact.tsx')
      },
    },
    {
      name: 'handle → path → lazy',
      block: `{
        handle: { order: "handle-path-lazy" },
        path: "about",
        ${lazyAbout}
      }`,
      assert: (_merged: string, slice: string) => {
        expect(slice).toContain('order: "handle-path-lazy"')
        expect(slice.indexOf('handle:')).toBeLessThan(slice.indexOf('path:'))
        expect(slice.indexOf('path:')).toBeLessThan(slice.indexOf('lazy:'))
      },
    },
    {
      name: 'handle → lazy → path',
      block: `{
        handle: { order: "handle-lazy-path" },
        ${lazyAbout}
        path: "about",
      }`,
      assert: (_merged: string, slice: string) => {
        expect(slice).toContain('order: "handle-lazy-path"')
        expect(slice.indexOf('handle:')).toBeLessThan(slice.indexOf('lazy:'))
        expect(slice.indexOf('lazy:')).toBeLessThan(slice.indexOf('path:'))
      },
    },
    {
      name: 'handle meta key order z-before-a',
      block: `{
        path: "about",
        ${lazyAbout}
        handle: { zebra: 1, alpha: 2, order: "meta-key-order" },
      }`,
      assert: (_merged: string, slice: string) => {
        expect(slice).toContain('zebra: 1, alpha: 2')
        expect(slice.indexOf('zebra:')).toBeLessThan(slice.indexOf('alpha:'))
      },
    },
  ])('react about route: $name', ({ block, assert }) => {
    const { pagesDir, fresh } = setupLayoutAbout()
    const edited = replaceRouteBlock(fresh, './pages/about.tsx', block)
    const merged = mergeAfterAddingPage(
      fresh,
      edited,
      pagesDir,
      'contact.tsx',
      'export default function Contact() {}',
    )
    const slice = aboutSlice(merged)
    assert(merged, slice)
    expect(merged).not.toMatch(/,\s*,/)
  })

  it('preserves index route when index: true is placed after lazy', () => {
    const { pagesDir, fresh } = setupLayoutAbout()
    const indexBlock = `{
        lazy: async () => {
          const m = await import("./pages/index.tsx")
          return {
            Component: m.default,
          }
        },
        index: true,
        handle: { order: "lazy-before-index" },
      }`
    const edited = replaceRouteBlock(fresh, './pages/index.tsx', indexBlock)
    const merged = mergeAfterAddingPage(
      fresh,
      edited,
      pagesDir,
      'contact.tsx',
      'export default function Contact() {}',
    )
    const slice = collectRouteSliceMap(merged).get('./pages/index.tsx') ?? ''
    expect(slice).toContain('order: "lazy-before-index"')
    expect(slice.indexOf('lazy:')).toBeLessThan(slice.indexOf('index:'))
  })

  it('preserves sync route when Component precedes path', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-merge-sync-order-'))
    dirs.push(root)
    const pagesDir = path.join(root, 'src', 'pages')
    const outFile = path.join(root, 'src', 'routes.ts')
    fs.mkdirSync(pagesDir, { recursive: true })
    fs.writeFileSync(path.join(pagesDir, 'legal.sync.tsx'), 'export default function Legal() {}')

    const tree = scanDir(pagesDir, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const fresh = generateReactRoutes(tree, {
      root,
      pagesDir,
      outFile,
      framework: 'react',
      importMode: 'lazy',
      baseRoute: '',
    })

    const legalBlock = `{
        Component: LegalPage,
        path: "legal",
        handle: { order: "component-before-path" },
      }`
    const edited = replaceRouteBlock(fresh, './pages/legal.sync.tsx', legalBlock)
    const merged = mergeAfterAddingPage(
      fresh,
      edited,
      pagesDir,
      'extra.sync.tsx',
      'export default function Extra() {}',
    )
    const slice = collectRouteSliceMap(merged).get('./pages/legal.sync.tsx') ?? ''
    expect(slice).toContain('order: "component-before-path"')
    expect(slice.indexOf('Component:')).toBeLessThan(slice.indexOf('path:'))
    expect(merged).toContain('./pages/extra.sync.tsx')
  })

  it('preserves hand-edited lazy block on a .sync page over filename-driven sync codegen', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-merge-sync-to-lazy-'))
    dirs.push(root)
    const pagesDir = path.join(root, 'src', 'pages')
    const outFile = path.join(root, 'src', 'routes.ts')
    fs.mkdirSync(pagesDir, { recursive: true })
    fs.writeFileSync(path.join(pagesDir, 'legal.sync.tsx'), 'export default function Legal() {}')

    const tree = scanDir(pagesDir, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const fresh = generateReactRoutes(tree, {
      root,
      pagesDir,
      outFile,
      framework: 'react',
      importMode: 'lazy',
      baseRoute: '',
    })

    expect(fresh).toContain('import LegalPage from')
    expect(fresh).toMatch(/Component: LegalPage/)

    const lazyBlock = `{
        lazy: async () => {
          const m = await import("./pages/legal.sync.tsx")
          return { Component: m.default }
        },
        path: "legal",
        handle: { load: "manual-lazy" },
      }`
    const edited = replaceRouteBlock(fresh, './pages/legal.sync.tsx', lazyBlock)

    const merged = mergeAfterAddingPage(
      fresh,
      edited,
      pagesDir,
      'extra.tsx',
      'export default function Extra() {}',
    )

    const slice = collectRouteSliceMap(merged).get('./pages/legal.sync.tsx') ?? ''
    expect(slice).toContain('load: "manual-lazy"')
    expect(slice).toContain('lazy: async () =>')
    expect(slice).not.toMatch(/Component:\s*LegalPage/)
    expect(merged).toContain('./pages/extra.tsx')
  })

  it('preserves layout head field order when layout lazy block is customized', () => {
    const { pagesDir, fresh } = setupLayoutAbout()
    const layoutBlock = collectRouteSliceMap(fresh).get('./pages/_layout.tsx') ?? ''
    const customLayout = layoutBlock.replace(
      /lazy: async \(\) => \{[\s\S]*?\},/,
      `handle: { order: "layout-handle-first" },
    lazy: async () => {
      const m = await import("./pages/_layout.tsx")
      return {
        Component: m.default,
      }
    },`,
    )
    const edited = replaceRouteBlock(fresh, './pages/_layout.tsx', customLayout)
    const merged = mergeAfterAddingPage(
      fresh,
      edited,
      pagesDir,
      'contact.tsx',
      'export default function Contact() {}',
    )
    const slice = collectRouteSliceMap(merged).get('./pages/_layout.tsx') ?? ''
    expect(slice).toContain('order: "layout-handle-first"')
    expect(slice.indexOf('handle:')).toBeLessThan(slice.indexOf('lazy:'))
    expect(merged).toContain('./pages/contact.tsx')
  })

  it('resets sibling route order to scan order when user reorders siblings', () => {
    const { pagesDir, outFile, fresh } = setupLayoutAbout()
    fs.writeFileSync(path.join(pagesDir, 'contact.tsx'), 'export default function Contact() {}')
    const tree = scanDir(pagesDir, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const withContact = generateReactRoutes(tree, {
      root: path.dirname(path.dirname(pagesDir)),
      pagesDir,
      outFile,
      framework: 'react',
      importMode: 'lazy',
      baseRoute: '',
    })

    const layoutSlice = collectPositionedRouteSlices(withContact).find(
      (s) => s.id === './pages/_layout.tsx',
    )
    if (!layoutSlice) throw new Error('layout missing')
    const children = collectRouteSliceMap(withContact)
    const about = children.get('./pages/about.tsx')!
    const contact = children.get('./pages/contact.tsx')!
    const index = children.get('./pages/index.tsx')!

    const swappedChildren = withContact.replace(
      layoutSlice.text,
      layoutSlice.text.replace(
        /children: \[[\s\S]*\]/,
        `children: [\n${contact},\n${about},\n${index},\n      ]`,
      ),
    )

    const tree2 = scanDir(pagesDir, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const fresh2 = generateReactRoutes(tree2, {
      root: path.dirname(path.dirname(pagesDir)),
      pagesDir,
      outFile,
      framework: 'react',
      importMode: 'lazy',
      baseRoute: '',
    })
    const merged = mergeRouteFiles(fresh2, swappedChildren)
    const mergedLayout = collectRouteSliceMap(merged).get('./pages/_layout.tsx') ?? ''
    const indexPos = mergedLayout.indexOf('./pages/index.tsx')
    const aboutPos = mergedLayout.indexOf('./pages/about.tsx')
    const contactPos = mergedLayout.indexOf('./pages/contact.tsx')
    expect(indexPos).toBeLessThan(aboutPos)
    expect(aboutPos).toBeLessThan(contactPos)
  })

  it.each([
    {
      name: 'path → component (vue default)',
      block: `{
        path: "about",
        component: () => import("./pages/about.vue"),
        meta: { order: "path-component" },
      }`,
      assert: (slice: string) => {
        expect(slice.indexOf('path:')).toBeLessThan(slice.indexOf('component:'))
        expect(slice.indexOf('component:')).toBeLessThan(slice.indexOf('meta:'))
      },
    },
    {
      name: 'component → path → meta',
      block: `{
        component: () => import("./pages/about.vue"),
        path: "about",
        meta: { order: "component-path-meta" },
      }`,
      assert: (slice: string) => {
        expect(slice.indexOf('component:')).toBeLessThan(slice.indexOf('path:'))
        expect(slice).toContain('order: "component-path-meta"')
      },
    },
    {
      name: 'meta → path → component',
      block: `{
        meta: { order: "meta-path-component", zebra: 1, alpha: 2 },
        path: "about",
        component: () => import("./pages/about.vue"),
      }`,
      assert: (slice: string) => {
        expect(slice.indexOf('meta:')).toBeLessThan(slice.indexOf('path:'))
        expect(slice).toContain('zebra: 1, alpha: 2')
      },
    },
  ])('vue about route: $name', ({ block, assert }) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-merge-vue-order-'))
    dirs.push(root)
    const pagesDir = path.join(root, 'src', 'pages')
    const outFile = path.join(root, 'src', 'routes.ts')
    fs.mkdirSync(pagesDir, { recursive: true })
    fs.writeFileSync(path.join(pagesDir, '_layout.vue'), '<template><router-view /></template>')
    fs.writeFileSync(path.join(pagesDir, 'index.vue'), '<template><div /></template>')
    fs.writeFileSync(path.join(pagesDir, 'about.vue'), '<template><div /></template>')

    const tree = scanDir(pagesDir, '', { extensions: ['vue'], exclude: [], baseRoute: '' })
    const fresh = generateVueRoutes(tree, {
      root,
      pagesDir,
      outFile,
      framework: 'vue',
      importMode: 'lazy',
      baseRoute: '',
    })
    const edited = replaceRouteBlock(fresh, './pages/about.vue', block)
    const merged = mergeAfterAddingPage(
      fresh,
      edited,
      pagesDir,
      'contact.vue',
      '<template><div /></template>',
    )
    const slice = collectRouteSliceMap(merged).get('./pages/about.vue') ?? ''
    assert(slice)
    expect(merged).toContain('./pages/contact.vue')
  })
})

describe('merge edge cases', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  function projectRoot(pagesDir: string) {
    return path.dirname(path.dirname(pagesDir))
  }

  function genReact(pagesDir: string, outFile: string, baseRoute = '') {
    const tree = scanDir(pagesDir, '', { extensions: ['tsx'], exclude: [], baseRoute })
    return generateReactRoutes(tree, {
      root: projectRoot(pagesDir),
      pagesDir,
      outFile,
      framework: 'react',
      importMode: 'lazy',
      baseRoute,
    })
  }

  it('preserves catch-all not-found route field order', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-merge-catchall-'))
    dirs.push(root)
    const pagesDir = path.join(root, 'src', 'pages')
    const outFile = path.join(root, 'src', 'routes.ts')
    fs.mkdirSync(pagesDir, { recursive: true })
    fs.writeFileSync(path.join(pagesDir, '_layout.tsx'), 'export default function L() {}')
    fs.writeFileSync(path.join(pagesDir, 'index.tsx'), 'export default function H() {}')
    fs.writeFileSync(path.join(pagesDir, 'not-found.tsx'), 'export default function NF() {}')

    const fresh = genReact(pagesDir, outFile)
    const notFoundBlock = `{
        handle: { order: "catchall-handle-first" },
        lazy: async () => {
          const m = await import("./pages/not-found.tsx")
          return {
            Component: m.default,
          }
        },
        path: "*",
      }`
    const edited = replaceRouteBlock(fresh, './pages/not-found.tsx', notFoundBlock)
    fs.writeFileSync(path.join(pagesDir, 'extra.tsx'), 'export default function E() {}')
    const merged = mergeRouteFiles(
      genReact(pagesDir, outFile),
      edited,
    )
    const slice = collectRouteSliceMap(merged).get('./pages/not-found.tsx') ?? ''
    expect(slice).toContain('order: "catchall-handle-first"')
    expect(slice.indexOf('handle:')).toBeLessThan(slice.indexOf('lazy:'))
    expect(slice.indexOf('lazy:')).toBeLessThan(slice.indexOf('path:'))
    expect(merged).toContain('./pages/extra.tsx')
    expect(merged).toContain('path: "*"')
  })

  it('preserves loader-first order inside lazy return block', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-merge-loader-'))
    dirs.push(root)
    const pagesDir = path.join(root, 'src', 'pages')
    const outFile = path.join(root, 'src', 'routes.ts')
    fs.mkdirSync(pagesDir, { recursive: true })
    fs.writeFileSync(
      path.join(pagesDir, 'data.tsx'),
      'export async function loader() { return null }\nexport default function Page() {}',
    )

    const fresh = genReact(pagesDir, outFile)
    const dataBlock = `{
        path: "/data",
        lazy: async () => {
          const m = await import("./pages/data.tsx")
          return {
            loader: m.loader,
            Component: m.default,
          }
        },
        handle: { order: "loader-before-component" },
      }`
    const edited = replaceRouteBlock(fresh, './pages/data.tsx', dataBlock)
    fs.writeFileSync(path.join(pagesDir, 'more.tsx'), 'export default function M() {}')
    const merged = mergeRouteFiles(genReact(pagesDir, outFile), edited)
    const slice = collectRouteSliceMap(merged).get('./pages/data.tsx') ?? ''
    expect(slice).toContain('loader: m.loader')
    expect(slice).toContain('order: "loader-before-component"')
    expect(slice.indexOf('loader: m.loader')).toBeLessThan(slice.indexOf('Component: m.default'))
    expect(merged).toContain('./pages/more.tsx')
  })

  it('preserves sync route with loader and action field order', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-merge-sync-exports-'))
    dirs.push(root)
    const pagesDir = path.join(root, 'src', 'pages')
    const outFile = path.join(root, 'src', 'routes.ts')
    fs.mkdirSync(pagesDir, { recursive: true })
    fs.writeFileSync(
      path.join(pagesDir, 'admin.sync.tsx'),
      `export async function loader() { return null }
export async function action() { return null }
export default function Admin() {}`,
    )

    const fresh = genReact(pagesDir, outFile)
    const adminBlock = `{
        action,
        loader,
        Component: AdminPage,
        path: "/admin",
        handle: { order: "action-loader-component" },
      }`
    const edited = replaceRouteBlock(fresh, './pages/admin.sync.tsx', adminBlock)
    fs.writeFileSync(path.join(pagesDir, 'panel.sync.tsx'), 'export default function P() {}')
    const merged = mergeRouteFiles(genReact(pagesDir, outFile), edited)
    const slice = collectRouteSliceMap(merged).get('./pages/admin.sync.tsx') ?? ''
    expect(slice).toContain('order: "action-loader-component"')
    expect(slice.indexOf('action,')).toBeLessThan(slice.indexOf('loader,'))
    expect(slice.indexOf('loader,')).toBeLessThan(slice.indexOf('Component:'))
    expect(merged).toContain('./pages/panel.sync.tsx')
  })

  it('preserves dynamic :id route with reversed field order', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-merge-dynamic-'))
    dirs.push(root)
    const pagesDir = path.join(root, 'src', 'pages')
    const outFile = path.join(root, 'src', 'routes.ts')
    fs.mkdirSync(path.join(pagesDir, 'user'), { recursive: true })
    fs.writeFileSync(path.join(pagesDir, 'index.tsx'), 'export default function H() {}')
    fs.writeFileSync(path.join(pagesDir, 'user', '[id].tsx'), 'export default function U() {}')

    const fresh = genReact(pagesDir, outFile)
    const dynamicBlock = `{
        lazy: async () => {
          const m = await import("./pages/user/[id].tsx")
          return {
            Component: m.default,
          }
        },
        path: "/user/:id",
        handle: { order: "dynamic-lazy-path" },
      }`
    const edited = replaceRouteBlock(fresh, './pages/user/[id].tsx', dynamicBlock)
    fs.writeFileSync(path.join(pagesDir, 'list.tsx'), 'export default function L() {}')
    const merged = mergeRouteFiles(genReact(pagesDir, outFile), edited)
    const slice = collectRouteSliceMap(merged).get('./pages/user/[id].tsx') ?? ''
    expect(slice).toContain('order: "dynamic-lazy-path"')
    expect(slice).toContain('path: "/user/:id"')
    expect(slice.indexOf('lazy:')).toBeLessThan(slice.indexOf('path:'))
    expect(merged).toContain('./pages/list.tsx')
  })

  it('preserves nested dashboard child field order', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-merge-nested-'))
    dirs.push(root)
    const pagesDir = path.join(root, 'src', 'pages')
    const outFile = path.join(root, 'src', 'routes.ts')
    fs.mkdirSync(path.join(pagesDir, 'dashboard'), { recursive: true })
    fs.writeFileSync(path.join(pagesDir, 'dashboard', '_layout.tsx'), 'export default function L() {}')
    fs.writeFileSync(path.join(pagesDir, 'dashboard', 'index.tsx'), 'export default function H() {}')
    fs.writeFileSync(path.join(pagesDir, 'dashboard', 'settings.tsx'), 'export default function S() {}')

    const fresh = genReact(pagesDir, outFile)
    const settingsBlock = `{
            handle: { order: "nested-settings-handle-first" },
            path: "settings",
            lazy: async () => {
              const m = await import("./pages/dashboard/settings.tsx")
              return {
                Component: m.default,
              }
            },
          }`
    const edited = replaceRouteBlock(fresh, './pages/dashboard/settings.tsx', settingsBlock)
    fs.writeFileSync(path.join(pagesDir, 'dashboard', 'profile.tsx'), 'export default function P() {}')
    const merged = mergeRouteFiles(genReact(pagesDir, outFile), edited)
    const slice = collectRouteSliceMap(merged).get('./pages/dashboard/settings.tsx') ?? ''
    expect(slice).toContain('order: "nested-settings-handle-first"')
    expect(slice.indexOf('handle:')).toBeLessThan(slice.indexOf('path:'))
    expect(merged).toContain('./pages/dashboard/profile.tsx')
  })

  it('merges correctly with baseRoute wrapper', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-merge-base-'))
    dirs.push(root)
    const pagesDir = path.join(root, 'src', 'pages')
    const outFile = path.join(root, 'src', 'routes.ts')
    fs.mkdirSync(pagesDir, { recursive: true })
    fs.writeFileSync(path.join(pagesDir, 'about.tsx'), 'export default function A() {}')

    const fresh = genReact(pagesDir, outFile, '/app')
    const aboutBlock = `{
        handle: { order: "base-route-child" },
        path: "/about",
        lazy: async () => {
          const m = await import("./pages/about.tsx")
          return {
            Component: m.default,
          }
        },
      }`
    const edited = replaceRouteBlock(fresh, './pages/about.tsx', aboutBlock)
    fs.writeFileSync(path.join(pagesDir, 'help.tsx'), 'export default function H() {}')
    const merged = mergeRouteFiles(genReact(pagesDir, outFile, '/app'), edited)
    expect(merged).toContain('path: "/app"')
    expect(merged).toContain('order: "base-route-child"')
    expect(merged).toContain('./pages/help.tsx')
  })

  it('preserves vue layout with defineAsyncComponent field order', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-merge-vue-loading-'))
    dirs.push(root)
    const pagesDir = path.join(root, 'src', 'pages')
    const outFile = path.join(root, 'src', 'routes.ts')
    fs.mkdirSync(pagesDir, { recursive: true })
    fs.writeFileSync(path.join(pagesDir, '_layout.vue'), '<template><router-view /></template>')
    fs.writeFileSync(path.join(pagesDir, 'loading.vue'), '<template><div>Loading</div></template>')
    fs.writeFileSync(path.join(pagesDir, 'index.vue'), '<template><div /></template>')

    const tree = scanDir(pagesDir, '', { extensions: ['vue'], exclude: [], baseRoute: '' })
    const fresh = generateVueRoutes(tree, {
      root,
      pagesDir,
      outFile,
      framework: 'vue',
      importMode: 'lazy',
      baseRoute: '',
    })

    const layoutBlock = collectRouteSliceMap(fresh).get('./pages/_layout.vue') ?? ''
    const customLayout = layoutBlock.replace(
      /component: defineAsyncComponent\(\{[\s\S]*?\}\),/,
      `meta: { order: "vue-layout-meta-first" },
    component: defineAsyncComponent({
      delay: 0,
      loader: () => import("./pages/_layout.vue"),
      loadingComponent: LoadingPage,
    }),`,
    )
    const edited = replaceRouteBlock(fresh, './pages/_layout.vue', customLayout)
    fs.writeFileSync(path.join(pagesDir, 'about.vue'), '<template><div /></template>')
    const tree2 = scanDir(pagesDir, '', { extensions: ['vue'], exclude: [], baseRoute: '' })
    const fresh2 = generateVueRoutes(tree2, {
      root,
      pagesDir,
      outFile,
      framework: 'vue',
      importMode: 'lazy',
      baseRoute: '',
    })
    const merged = mergeRouteFiles(fresh2, edited)
    const slice = collectRouteSliceMap(merged).get('./pages/_layout.vue') ?? ''
    expect(slice).toContain('order: "vue-layout-meta-first"')
    expect(slice.indexOf('meta:')).toBeLessThan(slice.indexOf('component:'))
    expect(slice).toContain('loadingComponent: LoadingPage')
    expect(merged).toContain('./pages/about.vue')
  })

  it('preserves expanded lazy block with custom await binding order', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-merge-lazy-style-'))
    dirs.push(root)
    const pagesDir = path.join(root, 'src', 'pages')
    const outFile = path.join(root, 'src', 'routes.ts')
    fs.mkdirSync(pagesDir, { recursive: true })
    fs.writeFileSync(path.join(pagesDir, 'about.tsx'), 'export default function A() {}')

    const fresh = genReact(pagesDir, outFile)
    const aboutBlock = `{
        path: "/about",
        lazy: async () => {
          const mod = await import("./pages/about.tsx")
          return {
            Component: mod.default,
          }
        },
        handle: { order: "custom-await-binding" },
      }`
    const edited = replaceRouteBlock(fresh, './pages/about.tsx', aboutBlock)
    fs.writeFileSync(path.join(pagesDir, 'extra.tsx'), 'export default function E() {}')
    const merged = mergeRouteFiles(genReact(pagesDir, outFile), edited)
    const slice = collectRouteSliceMap(merged).get('./pages/about.tsx') ?? ''
    expect(slice).toContain('const mod = await import')
    expect(slice).toContain('order: "custom-await-binding"')
    expect(merged).toContain('./pages/extra.tsx')
  })

  it('preserves ErrorBoundary-first order in lazy return block', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-merge-error-boundary-'))
    dirs.push(root)
    const pagesDir = path.join(root, 'src', 'pages')
    const outFile = path.join(root, 'src', 'routes.ts')
    fs.mkdirSync(pagesDir, { recursive: true })
    fs.writeFileSync(
      path.join(pagesDir, 'risk.tsx'),
      `export function ErrorBoundary() { return null }
export default function Risk() {}`,
    )

    const fresh = genReact(pagesDir, outFile)
    const riskBlock = `{
        path: "/risk",
        lazy: async () => {
          const m = await import("./pages/risk.tsx")
          return {
            ErrorBoundary: m.ErrorBoundary,
            Component: m.default,
          }
        },
        handle: { order: "error-boundary-first" },
      }`
    const edited = replaceRouteBlock(fresh, './pages/risk.tsx', riskBlock)
    fs.writeFileSync(path.join(pagesDir, 'safe.tsx'), 'export default function S() {}')
    const merged = mergeRouteFiles(genReact(pagesDir, outFile), edited)
    const slice = collectRouteSliceMap(merged).get('./pages/risk.tsx') ?? ''
    expect(slice).toContain('order: "error-boundary-first"')
    expect(slice.indexOf('ErrorBoundary:')).toBeLessThan(slice.indexOf('Component:'))
    expect(merged).toContain('./pages/safe.tsx')
  })

  it('preserves loader + ErrorBoundary + Component order in lazy return', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-merge-rr-exports-'))
    dirs.push(root)
    const pagesDir = path.join(root, 'src', 'pages')
    const outFile = path.join(root, 'src', 'routes.ts')
    fs.mkdirSync(pagesDir, { recursive: true })
    fs.writeFileSync(
      path.join(pagesDir, 'reports.tsx'),
      `export async function loader() { return null }
export function ErrorBoundary() { return null }
export default function Reports() {}`,
    )

    const fresh = genReact(pagesDir, outFile)
    const reportsBlock = `{
        lazy: async () => {
          const m = await import("./pages/reports.tsx")
          return {
            loader: m.loader,
            ErrorBoundary: m.ErrorBoundary,
            Component: m.default,
          }
        },
        path: "/reports",
        handle: { order: "loader-error-component" },
      }`
    const edited = replaceRouteBlock(fresh, './pages/reports.tsx', reportsBlock)
    fs.writeFileSync(path.join(pagesDir, 'summary.tsx'), 'export default function S() {}')
    const merged = mergeRouteFiles(genReact(pagesDir, outFile), edited)
    const slice = collectRouteSliceMap(merged).get('./pages/reports.tsx') ?? ''
    expect(slice).toContain('order: "loader-error-component"')
    expect(slice.indexOf('loader:')).toBeLessThan(slice.indexOf('ErrorBoundary:'))
    expect(slice.indexOf('ErrorBoundary:')).toBeLessThan(slice.indexOf('Component:'))
    expect(merged).toContain('./pages/summary.tsx')
  })

  it('preserves Promise.all layout lazy with loading-only field order', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-merge-promise-loading-'))
    dirs.push(root)
    const pagesDir = path.join(root, 'src', 'pages')
    const outFile = path.join(root, 'src', 'routes.ts')
    fs.mkdirSync(pagesDir, { recursive: true })
    fs.writeFileSync(path.join(pagesDir, '_layout.tsx'), 'export default function L() {}')
    fs.writeFileSync(path.join(pagesDir, 'loading.tsx'), 'export default function Loading() {}')
    fs.writeFileSync(path.join(pagesDir, 'index.tsx'), 'export default function H() {}')

    const fresh = genReact(pagesDir, outFile)
    const layoutBlock = `{
    handle: { order: "promise-all-loading" },
    lazy: async () => {
      const [m, l] = await Promise.all([
        import("./pages/_layout.tsx"),
        import("./pages/loading.tsx"),
      ])
      return {
        HydrateFallback: l.default,
        Component: m.default,
      }
    },
    children: [
      {
        index: true,
        lazy: async () => {
          const m = await import("./pages/index.tsx")
          return {
            Component: m.default,
          }
        },
      },
    ],
  }`
    const edited = replaceRouteBlock(fresh, './pages/_layout.tsx', layoutBlock)
    fs.writeFileSync(path.join(pagesDir, 'extra.tsx'), 'export default function E() {}')
    const merged = mergeRouteFiles(genReact(pagesDir, outFile), edited)
    const slice = collectRouteSliceMap(merged).get('./pages/_layout.tsx') ?? ''
    expect(slice).toContain('order: "promise-all-loading"')
    expect(slice).toContain('Promise.all')
    expect(slice.indexOf('HydrateFallback:')).toBeLessThan(slice.indexOf('Component:'))
    expect(merged).toContain('./pages/extra.tsx')
  })

  it('preserves Promise.all layout lazy with loading and error import order', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-merge-promise-both-'))
    dirs.push(root)
    const pagesDir = path.join(root, 'src', 'pages')
    const outFile = path.join(root, 'src', 'routes.ts')
    fs.mkdirSync(pagesDir, { recursive: true })
    fs.writeFileSync(path.join(pagesDir, '_layout.tsx'), 'export default function L() {}')
    fs.writeFileSync(path.join(pagesDir, 'loading.tsx'), 'export default function Loading() {}')
    fs.writeFileSync(path.join(pagesDir, 'error.tsx'), 'export default function Err() {}')
    fs.writeFileSync(path.join(pagesDir, 'index.tsx'), 'export default function H() {}')

    const fresh = genReact(pagesDir, outFile)
    const layoutBlock = `{
    lazy: async () => {
      const [e, m, l] = await Promise.all([
        import("./pages/error.tsx"),
        import("./pages/_layout.tsx"),
        import("./pages/loading.tsx"),
      ])
      return {
        ErrorBoundary: e.default,
        Component: m.default,
        HydrateFallback: l.default,
      }
    },
    children: [
      {
        index: true,
        lazy: async () => {
          const m = await import("./pages/index.tsx")
          return {
            Component: m.default,
          }
        },
      },
    ],
  }`
    const edited = replaceRouteBlock(fresh, './pages/_layout.tsx', layoutBlock)
    fs.writeFileSync(path.join(pagesDir, 'about.tsx'), 'export default function A() {}')
    const merged = mergeRouteFiles(genReact(pagesDir, outFile), edited)
    const slice = collectRouteSliceMap(merged).get('./pages/_layout.tsx') ?? ''
    expect(slice).toContain('import("./pages/error.tsx")')
    expect(slice.indexOf('import("./pages/error.tsx")')).toBeLessThan(
      slice.indexOf('import("./pages/_layout.tsx")'),
    )
    expect(slice.indexOf('ErrorBoundary:')).toBeLessThan(slice.indexOf('HydrateFallback:'))
    expect(merged).toContain('./pages/about.tsx')
  })

  it('preserves shouldRevalidate after Component in lazy return', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-merge-revalidate-'))
    dirs.push(root)
    const pagesDir = path.join(root, 'src', 'pages')
    const outFile = path.join(root, 'src', 'routes.ts')
    fs.mkdirSync(pagesDir, { recursive: true })
    fs.writeFileSync(
      path.join(pagesDir, 'cache.tsx'),
      `export function shouldRevalidate() { return true }
export default function Cache() {}`,
    )

    const fresh = genReact(pagesDir, outFile)
    const cacheBlock = `{
        path: "/cache",
        lazy: async () => {
          const m = await import("./pages/cache.tsx")
          return {
            Component: m.default,
            shouldRevalidate: m.shouldRevalidate,
          }
        },
        handle: { order: "component-before-revalidate" },
      }`
    const edited = replaceRouteBlock(fresh, './pages/cache.tsx', cacheBlock)
    fs.writeFileSync(path.join(pagesDir, 'fresh.tsx'), 'export default function F() {}')
    const merged = mergeRouteFiles(genReact(pagesDir, outFile), edited)
    const slice = collectRouteSliceMap(merged).get('./pages/cache.tsx') ?? ''
    expect(slice).toContain('shouldRevalidate: m.shouldRevalidate')
    expect(slice.indexOf('Component:')).toBeLessThan(slice.indexOf('shouldRevalidate:'))
    expect(merged).toContain('./pages/fresh.tsx')
  })

  it('preserves vue defineAsyncComponent with errorComponent field order', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-merge-vue-error-'))
    dirs.push(root)
    const pagesDir = path.join(root, 'src', 'pages')
    const outFile = path.join(root, 'src', 'routes.ts')
    fs.mkdirSync(pagesDir, { recursive: true })
    fs.writeFileSync(path.join(pagesDir, '_layout.vue'), '<template><router-view /></template>')
    fs.writeFileSync(path.join(pagesDir, 'loading.vue'), '<template><div>L</div></template>')
    fs.writeFileSync(path.join(pagesDir, 'error.vue'), '<template><div>E</div></template>')
    fs.writeFileSync(path.join(pagesDir, 'index.vue'), '<template><div /></template>')

    const tree = scanDir(pagesDir, '', { extensions: ['vue'], exclude: [], baseRoute: '' })
    const fresh = generateVueRoutes(tree, {
      root,
      pagesDir,
      outFile,
      framework: 'vue',
      importMode: 'lazy',
      baseRoute: '',
    })

    const layoutBlock = collectRouteSliceMap(fresh).get('./pages/_layout.vue') ?? ''
    const customLayout = layoutBlock.replace(
      /component: defineAsyncComponent\(\{[\s\S]*?\}\),/,
      `component: defineAsyncComponent({
      errorComponent: ErrorPage,
      delay: 0,
      loader: () => import("./pages/_layout.vue"),
      loadingComponent: LoadingPage,
    }),`,
    )
    const edited = replaceRouteBlock(fresh, './pages/_layout.vue', customLayout)
    fs.writeFileSync(path.join(pagesDir, 'about.vue'), '<template><div /></template>')
    const tree2 = scanDir(pagesDir, '', { extensions: ['vue'], exclude: [], baseRoute: '' })
    const merged = mergeRouteFiles(
      generateVueRoutes(tree2, {
        root,
        pagesDir,
        outFile,
        framework: 'vue',
        importMode: 'lazy',
        baseRoute: '',
      }),
      edited,
    )
    const slice = collectRouteSliceMap(merged).get('./pages/_layout.vue') ?? ''
    expect(slice.indexOf('errorComponent:')).toBeLessThan(slice.indexOf('loader:'))
    expect(slice.indexOf('loader:')).toBeLessThan(slice.indexOf('loadingComponent:'))
    expect(merged).toContain('./pages/about.vue')
  })
})

describe('merge compound scenarios', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  function setupAppPages(extra: Record<string, string> = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-compound-'))
    dirs.push(root)
    const pagesDir = path.join(root, 'src', 'pages')
    fs.mkdirSync(pagesDir, { recursive: true })

    const base: Record<string, string> = {
      '_layout.tsx': 'export default function Layout() { return null }',
      'index.tsx': 'export default function Home() {}',
      'about.tsx': 'export default function About() {}',
      'contact.tsx': 'export default function Contact() {}',
      ...extra,
    }
    for (const [rel, src] of Object.entries(base)) {
      const file = path.join(pagesDir, rel)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, src)
    }

    const outFile = path.join(root, 'src', 'routes.ts')
    const fresh = regenReact(pagesDir)
    return { root, pagesDir, outFile, fresh }
  }

  function setupDashboardPages(extra: Record<string, string> = {}) {
    return setupAppPages({
      'dashboard/_layout.tsx': 'export default function DL() {}',
      'dashboard/index.tsx': 'export default function DI() {}',
      'dashboard/settings.tsx': 'export default function DS() {}',
      ...extra,
    })
  }

  it('preserves markers on multiple sibling edits when adding a page', () => {
    const { pagesDir, fresh } = setupAppPages()
    let edited = patchHandle(fresh, './pages/index.tsx', 'home')
    edited = patchHandle(edited, './pages/about.tsx', 'about')
    edited = patchHandle(edited, './pages/contact.tsx', 'contact')

    fs.writeFileSync(path.join(pagesDir, 'help.tsx'), 'export default function Help() {}')
    const merged = regenAndMerge(edited, pagesDir)

    expect(routeMarker(merged, './pages/index.tsx')).toBe('home')
    expect(routeMarker(merged, './pages/about.tsx')).toBe('about')
    expect(routeMarker(merged, './pages/contact.tsx')).toBe('contact')
    expect(merged).toContain('./pages/help.tsx')
  })

  it('preserves parent and multiple child edits when adding a child', () => {
    const { pagesDir, fresh } = setupAppPages()
    let edited = patchHandle(fresh, './pages/_layout.tsx', 'root-layout')
    edited = patchHandle(edited, './pages/about.tsx', 'about')
    edited = patchHandle(edited, './pages/contact.tsx', 'contact')

    fs.writeFileSync(path.join(pagesDir, 'help.tsx'), 'export default function Help() {}')
    const merged = regenAndMerge(edited, pagesDir)

    expect(routeMarker(merged, './pages/_layout.tsx')).toBe('root-layout')
    expect(routeMarker(merged, './pages/about.tsx')).toBe('about')
    expect(routeMarker(merged, './pages/contact.tsx')).toBe('contact')
    expect(merged).toContain('./pages/help.tsx')
  })

  it('preserves parent edit when a child page is deleted', () => {
    const { pagesDir, fresh } = setupAppPages()
    let edited = patchHandle(fresh, './pages/_layout.tsx', 'layout-kept')
    edited = patchHandle(edited, './pages/contact.tsx', 'contact-lost')

    fs.unlinkSync(path.join(pagesDir, 'contact.tsx'))
    const merged = regenAndMerge(edited, pagesDir)

    expect(routeMarker(merged, './pages/_layout.tsx')).toBe('layout-kept')
    expect(merged).not.toContain('./pages/contact.tsx')
    expect(merged).not.toContain('contact-lost')
    expect(merged).toContain('./pages/about.tsx')
  })

  it('preserves unrelated child edits when a sibling page is deleted', () => {
    const { pagesDir, fresh } = setupAppPages()
    let edited = patchHandle(fresh, './pages/about.tsx', 'about-kept')
    edited = patchHandle(edited, './pages/contact.tsx', 'contact-removed')

    fs.unlinkSync(path.join(pagesDir, 'contact.tsx'))
    const merged = regenAndMerge(edited, pagesDir)

    expect(routeMarker(merged, './pages/about.tsx')).toBe('about-kept')
    expect(merged).not.toContain('./pages/contact.tsx')
    expect(merged).not.toContain('contact-removed')
  })

  it('preserves nested parent and child edits when adding a dashboard child', () => {
    const { pagesDir, fresh } = setupDashboardPages()
    let edited = patchHandle(fresh, './pages/dashboard/_layout.tsx', 'dash-layout')
    edited = patchHandle(edited, './pages/dashboard/settings.tsx', 'dash-settings')

    fs.writeFileSync(
      path.join(pagesDir, 'dashboard', 'profile.tsx'),
      'export default function Profile() {}',
    )
    const merged = regenAndMerge(edited, pagesDir)

    expect(routeMarker(merged, './pages/dashboard/_layout.tsx')).toBe('dash-layout')
    expect(routeMarker(merged, './pages/dashboard/settings.tsx')).toBe('dash-settings')
    expect(merged).toContain('./pages/dashboard/profile.tsx')
    expect(merged).toContain('./pages/dashboard/index.tsx')
  })

  it('preserves nested parent edit when a dashboard child is deleted', () => {
    const { pagesDir, fresh } = setupDashboardPages()
    let edited = patchHandle(fresh, './pages/dashboard/_layout.tsx', 'dash-layout')
    edited = patchHandle(edited, './pages/dashboard/settings.tsx', 'settings-gone')

    fs.unlinkSync(path.join(pagesDir, 'dashboard', 'settings.tsx'))
    const merged = regenAndMerge(edited, pagesDir)

    expect(routeMarker(merged, './pages/dashboard/_layout.tsx')).toBe('dash-layout')
    expect(merged).not.toContain('./pages/dashboard/settings.tsx')
    expect(merged).not.toContain('settings-gone')
    expect(merged).toContain('./pages/dashboard/index.tsx')
  })

  it('handles add and delete in the same regen while keeping unrelated edits', () => {
    const { pagesDir, fresh } = setupAppPages()
    const edited = patchHandle(fresh, './pages/about.tsx', 'about-kept')

    fs.unlinkSync(path.join(pagesDir, 'contact.tsx'))
    fs.writeFileSync(path.join(pagesDir, 'help.tsx'), 'export default function Help() {}')
    const merged = regenAndMerge(edited, pagesDir)

    expect(routeMarker(merged, './pages/about.tsx')).toBe('about-kept')
    expect(merged).not.toContain('./pages/contact.tsx')
    expect(merged).toContain('./pages/help.tsx')
  })

  it('handles multiple adds and one delete with several preserved edits', () => {
    const { pagesDir, fresh } = setupAppPages()
    let edited = patchHandle(fresh, './pages/_layout.tsx', 'layout')
    edited = patchHandle(edited, './pages/index.tsx', 'home')
    edited = patchHandle(edited, './pages/about.tsx', 'about')

    fs.unlinkSync(path.join(pagesDir, 'contact.tsx'))
    fs.writeFileSync(path.join(pagesDir, 'help.tsx'), 'export default function Help() {}')
    fs.writeFileSync(path.join(pagesDir, 'legal.tsx'), 'export default function Legal() {}')
    const merged = regenAndMerge(edited, pagesDir)

    expect(routeMarker(merged, './pages/_layout.tsx')).toBe('layout')
    expect(routeMarker(merged, './pages/index.tsx')).toBe('home')
    expect(routeMarker(merged, './pages/about.tsx')).toBe('about')
    expect(merged).not.toContain('./pages/contact.tsx')
    expect(merged).toContain('./pages/help.tsx')
    expect(merged).toContain('./pages/legal.tsx')
  })

  it('handles nested add + delete: dashboard profile added, settings removed', () => {
    const { pagesDir, fresh } = setupDashboardPages()
    let edited = patchHandle(fresh, './pages/dashboard/_layout.tsx', 'dash-layout')
    edited = patchHandle(edited, './pages/dashboard/index.tsx', 'dash-home')

    fs.unlinkSync(path.join(pagesDir, 'dashboard', 'settings.tsx'))
    fs.writeFileSync(
      path.join(pagesDir, 'dashboard', 'profile.tsx'),
      'export default function Profile() {}',
    )
    const merged = regenAndMerge(edited, pagesDir)

    expect(routeMarker(merged, './pages/dashboard/_layout.tsx')).toBe('dash-layout')
    expect(routeMarker(merged, './pages/dashboard/index.tsx')).toBe('dash-home')
    expect(merged).not.toContain('./pages/dashboard/settings.tsx')
    expect(merged).toContain('./pages/dashboard/profile.tsx')
  })

  it('runGeneration keeps multi-edit routes.ts after pages churn', () => {
    const { root, pagesDir, outFile, fresh } = setupDashboardPages()
    let edited = patchHandle(fresh, './pages/_layout.tsx', 'app-layout')
    edited = patchHandle(edited, './pages/about.tsx', 'about')
    edited = patchHandle(edited, './pages/dashboard/settings.tsx', 'settings')
    fs.writeFileSync(outFile, edited)

    fs.unlinkSync(path.join(pagesDir, 'contact.tsx'))
    fs.writeFileSync(path.join(pagesDir, 'help.tsx'), 'export default function Help() {}')
    fs.writeFileSync(
      path.join(pagesDir, 'dashboard', 'profile.tsx'),
      'export default function Profile() {}',
    )

    const resolved = resolveOptions(root, { pagesDir: 'src/pages', outFile: 'src/routes.ts' })
    runGeneration(resolved, () => {}, () => {})
    const merged = fs.readFileSync(outFile, 'utf-8')

    expect(routeMarker(merged, './pages/_layout.tsx')).toBe('app-layout')
    expect(routeMarker(merged, './pages/about.tsx')).toBe('about')
    expect(routeMarker(merged, './pages/dashboard/settings.tsx')).toBe('settings')
    expect(merged).not.toContain('./pages/contact.tsx')
    expect(merged).toContain('./pages/help.tsx')
    expect(merged).toContain('./pages/dashboard/profile.tsx')
  })

  it('preserves root and nested edits together after only nested page delete', () => {
    const { pagesDir, fresh } = setupDashboardPages()
    let edited = patchHandle(fresh, './pages/about.tsx', 'root-about')
    edited = patchHandle(edited, './pages/dashboard/_layout.tsx', 'dash-layout')
    edited = patchHandle(edited, './pages/dashboard/index.tsx', 'dash-index')

    fs.unlinkSync(path.join(pagesDir, 'dashboard', 'index.tsx'))
    const merged = regenAndMerge(edited, pagesDir)

    expect(routeMarker(merged, './pages/about.tsx')).toBe('root-about')
    expect(routeMarker(merged, './pages/dashboard/_layout.tsx')).toBe('dash-layout')
    expect(merged).not.toContain('./pages/dashboard/index.tsx')
    expect(merged).not.toContain('dash-index')
    expect(merged).toContain('./pages/dashboard/settings.tsx')
  })

  it('preserves edits on both root and nested layouts in one merge', () => {
    const { pagesDir, fresh } = setupDashboardPages()
    let edited = patchHandle(fresh, './pages/_layout.tsx', 'root-layout')
    edited = patchHandle(edited, './pages/dashboard/_layout.tsx', 'dash-layout')
    edited = patchHandle(edited, './pages/dashboard/settings.tsx', 'dash-settings')

    fs.writeFileSync(path.join(pagesDir, 'help.tsx'), 'export default function Help() {}')
    const merged = regenAndMerge(edited, pagesDir)

    expect(routeMarker(merged, './pages/_layout.tsx')).toBe('root-layout')
    expect(routeMarker(merged, './pages/dashboard/_layout.tsx')).toBe('dash-layout')
    expect(routeMarker(merged, './pages/dashboard/settings.tsx')).toBe('dash-settings')
    expect(merged).toContain('./pages/help.tsx')
  })

  it('stress: five leaf edits + delete two + add three in one regen', () => {
    const { pagesDir, fresh } = setupAppPages({
      'legal.tsx': 'export default function Legal() {}',
      'stats.tsx': 'export async function loader() { return null }\nexport default function Stats() {}',
      'dashboard/_layout.tsx': 'export default function DL() {}',
      'dashboard/index.tsx': 'export default function DI() {}',
      'dashboard/settings.tsx': 'export default function DS() {}',
    })

    let edited = patchHandle(fresh, './pages/index.tsx', 'm-home')
    edited = patchHandle(edited, './pages/about.tsx', 'm-about')
    edited = patchHandle(edited, './pages/contact.tsx', 'm-contact')
    edited = patchHandle(edited, './pages/legal.tsx', 'm-legal')
    edited = patchHandle(edited, './pages/stats.tsx', 'm-stats')
    edited = patchHandle(edited, './pages/dashboard/settings.tsx', 'm-settings')

    fs.unlinkSync(path.join(pagesDir, 'contact.tsx'))
    fs.unlinkSync(path.join(pagesDir, 'legal.tsx'))
    fs.writeFileSync(path.join(pagesDir, 'help.tsx'), 'export default function Help() {}')
    fs.writeFileSync(path.join(pagesDir, 'faq.tsx'), 'export default function Faq() {}')
    fs.writeFileSync(path.join(pagesDir, 'news.tsx'), 'export default function News() {}')

    const merged = regenAndMerge(edited, pagesDir)

    expect(routeMarker(merged, './pages/index.tsx')).toBe('m-home')
    expect(routeMarker(merged, './pages/about.tsx')).toBe('m-about')
    expect(routeMarker(merged, './pages/stats.tsx')).toBe('m-stats')
    expect(routeMarker(merged, './pages/dashboard/settings.tsx')).toBe('m-settings')
    expect(merged).not.toContain('./pages/contact.tsx')
    expect(merged).not.toContain('./pages/legal.tsx')
    expect(merged).not.toContain('m-contact')
    expect(merged).not.toContain('m-legal')
    expect(merged).toContain('./pages/help.tsx')
    expect(merged).toContain('./pages/faq.tsx')
    expect(merged).toContain('./pages/news.tsx')
  })

  it('stress: dual layout edits + four child edits + nested add/delete', () => {
    const { pagesDir, fresh } = setupDashboardPages({
      'legal.tsx': 'export default function Legal() {}',
      'stats.tsx': 'export default function Stats() {}',
    })

    let edited = patchHandle(fresh, './pages/_layout.tsx', 'm-root-layout')
    edited = patchHandle(edited, './pages/index.tsx', 'm-home')
    edited = patchHandle(edited, './pages/about.tsx', 'm-about')
    edited = patchHandle(edited, './pages/legal.tsx', 'm-legal')
    edited = patchHandle(edited, './pages/dashboard/_layout.tsx', 'm-dash-layout')
    edited = patchHandle(edited, './pages/dashboard/index.tsx', 'm-dash-home')
    edited = patchHandle(edited, './pages/dashboard/settings.tsx', 'm-dash-settings')

    fs.unlinkSync(path.join(pagesDir, 'contact.tsx'))
    fs.unlinkSync(path.join(pagesDir, 'dashboard', 'index.tsx'))
    fs.unlinkSync(path.join(pagesDir, 'stats.tsx'))
    fs.writeFileSync(path.join(pagesDir, 'help.tsx'), 'export default function Help() {}')
    fs.writeFileSync(path.join(pagesDir, 'dashboard', 'profile.tsx'), 'export default function P() {}')
    fs.writeFileSync(path.join(pagesDir, 'dashboard', 'billing.tsx'), 'export default function B() {}')

    const merged = regenAndMerge(edited, pagesDir)

    expect(routeMarker(merged, './pages/_layout.tsx')).toBe('m-root-layout')
    expect(routeMarker(merged, './pages/index.tsx')).toBe('m-home')
    expect(routeMarker(merged, './pages/about.tsx')).toBe('m-about')
    expect(routeMarker(merged, './pages/legal.tsx')).toBe('m-legal')
    expect(routeMarker(merged, './pages/dashboard/_layout.tsx')).toBe('m-dash-layout')
    expect(routeMarker(merged, './pages/dashboard/settings.tsx')).toBe('m-dash-settings')
    expect(merged).not.toContain('./pages/contact.tsx')
    expect(merged).not.toContain('./pages/dashboard/index.tsx')
    expect(merged).not.toContain('./pages/stats.tsx')
    expect(merged).not.toContain('m-dash-home')
    expect(merged).toContain('./pages/help.tsx')
    expect(merged).toContain('./pages/dashboard/profile.tsx')
    expect(merged).toContain('./pages/dashboard/billing.tsx')
  })

  it('stress: runGeneration with seven markers across tree churn', () => {
    const { root, pagesDir, outFile, fresh } = setupAppPages({
      'legal.tsx': 'export default function Legal() {}',
      'stats.tsx': 'export default function Stats() {}',
      'dashboard/_layout.tsx': 'export default function DL() {}',
      'dashboard/index.tsx': 'export default function DI() {}',
      'dashboard/settings.tsx': 'export default function DS() {}',
    })

    let edited = patchHandle(fresh, './pages/_layout.tsx', 's-layout')
    edited = patchHandle(edited, './pages/index.tsx', 's-home')
    edited = patchHandle(edited, './pages/about.tsx', 's-about')
    edited = patchHandle(edited, './pages/legal.tsx', 's-legal')
    edited = patchHandle(edited, './pages/dashboard/_layout.tsx', 's-dash')
    edited = patchHandle(edited, './pages/dashboard/settings.tsx', 's-settings')
    edited = patchHandle(edited, './pages/stats.tsx', 's-stats')
    fs.writeFileSync(outFile, edited)

    fs.unlinkSync(path.join(pagesDir, 'contact.tsx'))
    fs.unlinkSync(path.join(pagesDir, 'legal.tsx'))
    fs.unlinkSync(path.join(pagesDir, 'dashboard', 'index.tsx'))
    fs.writeFileSync(path.join(pagesDir, 'help.tsx'), 'export default function Help() {}')
    fs.writeFileSync(path.join(pagesDir, 'faq.tsx'), 'export default function Faq() {}')
    fs.writeFileSync(path.join(pagesDir, 'dashboard', 'profile.tsx'), 'export default function P() {}')

    runGeneration(resolveOptions(root, { pagesDir: 'src/pages', outFile: 'src/routes.ts' }), () => {}, () => {})
    const merged = fs.readFileSync(outFile, 'utf-8')

    expect(routeMarker(merged, './pages/_layout.tsx')).toBe('s-layout')
    expect(routeMarker(merged, './pages/index.tsx')).toBe('s-home')
    expect(routeMarker(merged, './pages/about.tsx')).toBe('s-about')
    expect(routeMarker(merged, './pages/dashboard/_layout.tsx')).toBe('s-dash')
    expect(routeMarker(merged, './pages/dashboard/settings.tsx')).toBe('s-settings')
    expect(routeMarker(merged, './pages/stats.tsx')).toBe('s-stats')
    expect(merged).not.toContain('./pages/contact.tsx')
    expect(merged).not.toContain('./pages/legal.tsx')
    expect(merged).not.toContain('./pages/dashboard/index.tsx')
    expect(merged).toContain('./pages/help.tsx')
    expect(merged).toContain('./pages/faq.tsx')
    expect(merged).toContain('./pages/dashboard/profile.tsx')
  })
})
