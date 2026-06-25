import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { GenerateContext } from '../types'

describe('loading / error fallback codegen', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  function makePages(files: Record<string, string>) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-loading-'))
    dirs.push(root)
    const pages = path.join(root, 'src', 'pages')
    fs.mkdirSync(pages, { recursive: true })
    for (const [rel, content] of Object.entries(files)) {
      const file = path.join(pages, rel)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, content)
    }
    return { root, pages, outFile: path.join(root, 'src', 'routes.ts') }
  }

  function reactCtx(
    root: string,
    pages: string,
    outFile: string,
  ): GenerateContext {
    return {
      root,
      pagesDir: pages,
      outFile,
      framework: 'react',
      importMode: 'lazy',
      baseRoute: '',
    }
  }

  function vueCtx(root: string, pages: string, outFile: string): GenerateContext {
    return {
      root,
      pagesDir: pages,
      outFile,
      framework: 'vue',
      importMode: 'lazy',
      baseRoute: '',
    }
  }

  const baseReactPages = {
    '_layout.tsx': 'export default function Root() { return null }',
    'index.tsx': 'export default function Home() {}',
    'about.tsx': 'export default function About() {}',
  }

  it('react: with loading.tsx emits HydrateFallback only on root layout', async () => {
    const { scanDir } = await import('../core/scanner')
    const { generateReactRoutes } = await import('../emit/codegen')

    const { root, pages, outFile } = makePages({
      ...baseReactPages,
      'loading.tsx': 'export default function Loading() { return null }',
    })
    const tree = scanDir(pages, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const code = generateReactRoutes(tree, reactCtx(root, pages, outFile))

    expect(code).toContain("import RouteLoading from './pages/loading.tsx'")
    expect(code).toContain('HydrateFallback: RouteLoading')
    expect(code).not.toContain('HydrateFallback: l.default')
    expect(code).not.toContain('import("./pages/loading.tsx")')

    const rootLayout = code.slice(0, code.indexOf('children: ['))
    expect(rootLayout).toContain('HydrateFallback: RouteLoading')

    const aboutSlice = code.slice(code.indexOf('path: "about"'))
    expect(aboutSlice).not.toContain('HydrateFallback: RouteLoading')
  })

  it('react: nested layout gets HydrateFallback when it has local loading.tsx', async () => {
    const { scanDir } = await import('../core/scanner')
    const { generateReactRoutes } = await import('../emit/codegen')

    const { root, pages, outFile } = makePages({
      ...baseReactPages,
      'loading.tsx': 'export default function Loading() { return null }',
      '(app)/_layout.tsx': 'export default function App() {}',
      '(app)/loading.tsx': 'export default function AppLoading() {}',
      '(app)/dashboard.tsx': 'export default function Dash() {}',
    })
    const tree = scanDir(pages, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const code = generateReactRoutes(tree, reactCtx(root, pages, outFile))

    expect([...code.matchAll(/HydrateFallback: RouteLoading/g)].length).toBe(2)

    const dashboardSlice = code.slice(code.indexOf('path: "dashboard"'))
    expect(dashboardSlice).not.toContain('HydrateFallback: RouteLoading')
  })

  it('react: without error.tsx omits RouteError and ErrorBoundary', async () => {
    const { scanDir } = await import('../core/scanner')
    const { generateReactRoutes } = await import('../emit/codegen')

    const { root, pages, outFile } = makePages(baseReactPages)
    const tree = scanDir(pages, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const code = generateReactRoutes(tree, reactCtx(root, pages, outFile))

    expect(code).not.toContain('RouteError')
    expect(code).not.toContain('ErrorBoundary:')
    expect(code).toContain('lazy: async () =>')
  })

  it('react: without loading.tsx omits RouteLoading import and HydrateFallback', async () => {
    const { scanDir } = await import('../core/scanner')
    const { generateReactRoutes } = await import('../emit/codegen')

    const { root, pages, outFile } = makePages(baseReactPages)
    const tree = scanDir(pages, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const code = generateReactRoutes(tree, reactCtx(root, pages, outFile))

    expect(code).not.toContain('RouteLoading')
    expect(code).not.toContain('HydrateFallback: RouteLoading')
    expect(code).toContain('lazy: async () =>')
  })

  it('react: with loading + error puts ErrorBoundary only on root layout', async () => {
    const { scanDir } = await import('../core/scanner')
    const { generateReactRoutes } = await import('../emit/codegen')

    const { root, pages, outFile } = makePages({
      ...baseReactPages,
      'loading.tsx': 'export default function Loading() {}',
      'error.tsx': 'export default function Err() {}',
      '(app)/_layout.tsx': 'export default function App() {}',
      '(app)/dashboard.tsx': 'export default function Dash() {}',
    })
    const tree = scanDir(pages, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const code = generateReactRoutes(tree, reactCtx(root, pages, outFile))

    expect(code).toContain("import RouteError from './pages/error.tsx'")

    const rootLayout = code.slice(0, code.indexOf('children: ['))
    expect(rootLayout).toContain('ErrorBoundary: RouteError')

    const appLayoutSlice = code.slice(
      code.indexOf('import("./pages/(app)/_layout.tsx")'),
      code.indexOf('import("./pages/(app)/dashboard.tsx")'),
    )
    expect(appLayoutSlice).not.toContain('ErrorBoundary: RouteError')
    expect(appLayoutSlice).not.toContain('HydrateFallback: RouteLoading')
  })

  it('react: merge restores HydrateFallback when loading.tsx is added back', async () => {
    const { scanDir } = await import('../core/scanner')
    const { generateReactRoutes } = await import('../emit/codegen')
    const { mergeRouteFiles } = await import('../emit/merge-routes')

    const { root, pages, outFile } = makePages({
      ...baseReactPages,
      'loading.tsx': 'export default function Loading() {}',
      'error.tsx': 'export default function Err() {}',
    })
    const tree = scanDir(pages, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const ctx = reactCtx(root, pages, outFile)

    const withoutAux = makePages(baseReactPages)
    const treeWithout = scanDir(withoutAux.pages, '', {
      extensions: ['tsx'],
      exclude: [],
      baseRoute: '',
    })
    const stale = generateReactRoutes(treeWithout, reactCtx(withoutAux.root, withoutAux.pages, outFile))
    const fresh = generateReactRoutes(tree, ctx)

    const merged = mergeRouteFiles(fresh, stale)
    const rootLayout = merged.slice(0, merged.indexOf('children: ['))
    expect(rootLayout).toContain('HydrateFallback: RouteLoading')
    expect(rootLayout).toContain('ErrorBoundary: RouteError')
    expect(merged).not.toMatch(/HydrateFallback:\s*l\.default/)
  })

  it('react: merge drops HydrateFallback when loading.tsx is removed', async () => {
    const { scanDir } = await import('../core/scanner')
    const { generateReactRoutes } = await import('../emit/codegen')
    const { mergeRouteFiles } = await import('../emit/merge-routes')

    const { root, pages, outFile } = makePages({
      ...baseReactPages,
      'loading.tsx': 'export default function Loading() {}',
    })
    const tree = scanDir(pages, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const ctx = reactCtx(root, pages, outFile)
    const withLoading = generateReactRoutes(tree, ctx)

    const withoutAux = makePages(baseReactPages)
    const treeWithout = scanDir(withoutAux.pages, '', {
      extensions: ['tsx'],
      exclude: [],
      baseRoute: '',
    })
    const fresh = generateReactRoutes(
      treeWithout,
      reactCtx(withoutAux.root, withoutAux.pages, outFile),
    )

    const merged = mergeRouteFiles(fresh, withLoading)
    expect(merged).not.toContain('HydrateFallback: RouteLoading')
    expect(merged).not.toContain("import RouteLoading")
  })

  it('react: runGeneration regen drops loading when loading.tsx is removed', async () => {
    const { resolveOptions, runGeneration } = await import('../generate')

    const { root, pages, outFile } = makePages({
      ...baseReactPages,
      'loading.tsx': 'export default function Loading() {}',
    })
    const resolved = resolveOptions(root, { pagesDir: 'src/pages', outFile: 'src/routes.ts' })
    resolved.pagesDir = pages
    resolved.outFile = outFile

    runGeneration(resolved)
    let routes = fs.readFileSync(outFile, 'utf-8')
    expect(routes).toContain('RouteLoading')

    fs.unlinkSync(path.join(pages, 'loading.tsx'))
    fs.unlinkSync(outFile)
    const { changed } = runGeneration(resolved)
    expect(changed).toBe(true)

    routes = fs.readFileSync(outFile, 'utf-8')
    expect(routes).not.toContain('RouteLoading')
    expect(routes).not.toContain('HydrateFallback: RouteLoading')
  })

  it('vue: with loading.vue uses defineAsyncComponent on leaf routes', async () => {
    const { scanDir } = await import('../core/scanner')
    const { generateVueRoutes } = await import('../emit/codegen')

    const { root, pages, outFile } = makePages({
      'about.vue': '<template>About</template>',
      'loading.vue': '<template>Loading</template>',
    })
    const tree = scanDir(pages, '', { extensions: ['vue'], exclude: [], baseRoute: '' })
    const code = generateVueRoutes(tree, vueCtx(root, pages, outFile))

    expect(code).toContain('defineAsyncComponent')
    expect(code).toContain('loadingComponent:')
    expect(code).toContain('./pages/loading.vue')
    expect(code).not.toMatch(/component: \(\) => import\("\.\/pages\/about\.vue"\)/)
  })

  it('vue: without loading.vue keeps plain dynamic import on leaf routes', async () => {
    const { scanDir } = await import('../core/scanner')
    const { generateVueRoutes } = await import('../emit/codegen')

    const { root, pages, outFile } = makePages({
      'about.vue': '<template>About</template>',
    })
    const tree = scanDir(pages, '', { extensions: ['vue'], exclude: [], baseRoute: '' })
    const code = generateVueRoutes(tree, vueCtx(root, pages, outFile))

    expect(code).not.toContain('defineAsyncComponent')
    expect(code).not.toContain('loadingComponent:')
    expect(code).toContain('() => import("./pages/about.vue")')
  })
})
