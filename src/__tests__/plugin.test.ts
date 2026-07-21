import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { isCatchAllSegment, isGroupDir, joinUrlPath, nameToSegment } from '../core/path-parser'

describe('path-parser', () => {
  it('converts dynamic segments', () => {
    expect(nameToSegment('[id]')).toBe(':id')
    expect(nameToSegment('[[id]]')).toBe(':id?')
    expect(nameToSegment('[...slug]')).toBe('*')
    expect(nameToSegment('[[...slug]]')).toBe('*?')
  })

  it('detects groups and catch-all', () => {
    expect(isGroupDir('(tabs)')).toBe(true)
    expect(isGroupDir('tabs')).toBe(false)
    expect(isCatchAllSegment('*')).toBe(true)
    expect(isCatchAllSegment('about')).toBe(false)
  })

  it('joins url paths', () => {
    expect(joinUrlPath('', 'about')).toBe('/about')
    expect(joinUrlPath('/app', 'home')).toBe('/app/home')
    expect(joinUrlPath('/app', '*')).toBe('/app/*')
  })
})

describe('meta-reader', () => {
  it('reads static meta exports', async () => {
    const { readStaticMeta } = await import('../core/meta-reader')
    const src = `export const meta = { title: 'Home', requiresAuth: true, id: 'home' }`
    expect(readStaticMeta(src)).toEqual({ title: 'Home', requiresAuth: true, id: 'home' })
  })

  it('reads meta wrapped in a static helper call', async () => {
    const { readStaticMeta } = await import('../core/meta-reader')
    const src = `import { pageMeta } from '@/components/AnimatedOutlet'
export const meta = pageMeta({ anim: 'modal', title: '支付' })`
    expect(readStaticMeta(src)).toEqual({ anim: 'modal', title: '支付' })
  })
})

describe('scanner', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  function makePages(structure: Record<string, string>) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-scan-'))
    dirs.push(root)
    const pages = path.join(root, 'pages')
    fs.mkdirSync(pages, { recursive: true })
    for (const [rel, content] of Object.entries(structure)) {
      const file = path.join(pages, rel)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, content)
    }
    return pages
  }

  it('scans index and static routes', async () => {
    const { scanDir } = await import('../core/scanner')
    const pages = makePages({
      'index.tsx': `export default function Home() {}`,
      'about.tsx': `export const meta = { title: 'About' }; export default function About() {}`,
      'detail/[id].tsx': `export default function Detail() {}`,
    })

    const root = scanDir(pages, '', {
      extensions: ['tsx'],
      exclude: [],
      baseRoute: '',
    })

    const paths = root.children.map((c) => c.urlPath).sort()
    expect(paths).toContain('/')
    expect(paths).toContain('/about')
    expect(root.children.find((c) => c.urlPath === '/about')?.meta?.title).toBe('About')

    const detailDir = root.children.find((c) => c.path === 'detail')
    expect(detailDir?.children[0]?.path).toBe(':id')
  })

  it('ignores route groups in url', async () => {
    const { scanDir } = await import('../core/scanner')
    const pages = makePages({
      '(app)/dashboard.tsx': `export default function Dash() {}`,
    })
    const root = scanDir(pages, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const group = root.children.find((c) => c.isGroup)
    expect(group).toBeTruthy()
    const dashboard = group?.children.find((c) => c.filePath)
    expect(dashboard?.urlPath).toBe('/dashboard')
  })
})

describe('codegen', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('generates react routes file', async () => {
    const { scanDir } = await import('../core/scanner')
    const { generateReactRoutes } = await import('../emit/codegen')

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-gen-'))
    dirs.push(root)
    const pages = path.join(root, 'src', 'pages')
    const outFile = path.join(root, 'src', 'routes.ts')
    fs.mkdirSync(pages, { recursive: true })
    fs.writeFileSync(path.join(pages, 'index.tsx'), 'export default function Home() {}')
    fs.writeFileSync(path.join(pages, 'about.tsx'), 'export default function About() {}')

    const tree = scanDir(pages, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const code = generateReactRoutes(tree, {
      root,
      pagesDir: pages,
      outFile,
      framework: 'react',
      importMode: 'lazy',
      baseRoute: '',
    })

    expect(code).toContain('satisfies RouteObject[]')
    expect(code).toContain('import("./pages/index.tsx")')
    expect(code).toContain('Component: m.default')
    expect(code).toContain("import type { RouteObject } from 'react-router-dom'")
    expect(code).not.toContain('GeneratedRoutePath')
    expect(code).toContain('export default routes')
  })

  it('generates routes for pages inside route groups without url segment', async () => {
    const { scanDir } = await import('../core/scanner')
    const { generateReactRoutes } = await import('../emit/codegen')

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-gen-group-'))
    dirs.push(root)
    const pages = path.join(root, 'src', 'pages')
    const outFile = path.join(root, 'src', 'routes.ts')
    fs.mkdirSync(path.join(pages, '(app)'), { recursive: true })
    fs.mkdirSync(path.join(pages, '(app)', '(tabs)'), { recursive: true })
    fs.writeFileSync(path.join(pages, '(app)', 'about.tsx'), 'export default function About() {}')
    fs.writeFileSync(path.join(pages, '(app)', '(tabs)', 'home.tsx'), 'export default function Home() {}')

    const tree = scanDir(pages, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const code = generateReactRoutes(tree, {
      root,
      pagesDir: pages,
      outFile,
      framework: 'react',
      importMode: 'lazy',
      baseRoute: '',
    })

    expect(code).toContain('import("./pages/(app)/about.tsx")')
    expect(code).toContain('import("./pages/(app)/(tabs)/home.tsx")')
    expect(code).toContain(`path: "/about"`)
    expect(code).toContain(`path: "/home"`)
  })

  it('generates nested routes when a layout wraps route-group pages', async () => {
    const { scanDir } = await import('../core/scanner')
    const { generateReactRoutes } = await import('../emit/codegen')

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-gen-group-layout-'))
    dirs.push(root)
    const pages = path.join(root, 'src', 'pages')
    const outFile = path.join(root, 'src', 'routes.ts')
    fs.mkdirSync(path.join(pages, '(app)'), { recursive: true })
    fs.writeFileSync(path.join(pages, '_layout.tsx'), 'export default function Root() {}')
    fs.writeFileSync(path.join(pages, '(app)', 'about.tsx'), 'export default function About() {}')

    const tree = scanDir(pages, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const code = generateReactRoutes(tree, {
      root,
      pagesDir: pages,
      outFile,
      framework: 'react',
      importMode: 'lazy',
      baseRoute: '',
    })

    expect(code).toContain('import("./pages/_layout.tsx")')
    expect(code).toContain('import("./pages/(app)/about.tsx")')
    expect(code).toContain('children: [')
    expect(code).toContain(`path: "about"`)
  })

  it('generates layout scoped to a route group', async () => {
    const { scanDir } = await import('../core/scanner')
    const { generateReactRoutes } = await import('../emit/codegen')

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-gen-group-own-layout-'))
    dirs.push(root)
    const pages = path.join(root, 'src', 'pages')
    const outFile = path.join(root, 'src', 'routes.ts')
    fs.mkdirSync(path.join(pages, '(app)'), { recursive: true })
    fs.writeFileSync(path.join(pages, '(app)', '_layout.tsx'), 'export default function App() {}')
    fs.writeFileSync(path.join(pages, '(app)', 'dashboard.tsx'), 'export default function Dash() {}')

    const tree = scanDir(pages, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const code = generateReactRoutes(tree, {
      root,
      pagesDir: pages,
      outFile,
      framework: 'react',
      importMode: 'lazy',
      baseRoute: '',
    })

    expect(code).toContain('import("./pages/(app)/_layout.tsx")')
    expect(code).toContain('import("./pages/(app)/dashboard.tsx")')
    expect(code).toContain(`path: "dashboard"`)
  })
})

describe('generate', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('writes physical routes.ts', async () => {
    const { resolveOptions, runGeneration } = await import('../generate')

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-write-'))
    dirs.push(root)
    const pages = path.join(root, 'src', 'pages')
    fs.mkdirSync(pages, { recursive: true })
    fs.writeFileSync(path.join(pages, 'index.tsx'), 'export default function Home() {}')

    const resolved = resolveOptions(root, {
      pagesDir: 'src/pages',
      outFile: 'src/routes.ts',
    })

    const { changed } = runGeneration(resolved, () => {}, () => {})
    expect(changed).toBe(true)
    expect(fs.existsSync(path.join(root, 'src', 'routes.ts'))).toBe(true)
    expect(fs.readFileSync(path.join(root, 'src', 'routes.ts'), 'utf-8')).toContain('RouteObject[]')

    const { changed: changedAgain } = runGeneration(resolved, () => {}, () => {})
    expect(changedAgain).toBe(false)
  })

  it('writes routes to a custom outFile path with adjusted imports', async () => {
    const { resolveOptions, runGeneration } = await import('../generate')

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-write-custom-'))
    dirs.push(root)
    const pages = path.join(root, 'src', 'pages')
    fs.mkdirSync(pages, { recursive: true })
    fs.writeFileSync(path.join(pages, 'index.tsx'), 'export default function Home() {}')

    const resolved = resolveOptions(root, {
      pagesDir: 'src/pages',
      outFile: 'src/router/table.ts',
    })

    runGeneration(resolved, () => {}, () => {})
    const out = path.join(root, 'src', 'router', 'table.ts')
    const code = fs.readFileSync(out, 'utf-8')
    expect(code).toContain('satisfies RouteObject[]')
    expect(code).toMatch(/import\(["']\.\.\/pages\/index\.tsx["']\)/)
  })

  it('emits plain JS when outFile ends with .js', async () => {
    const { resolveOptions, runGeneration } = await import('../generate')

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-write-js-'))
    dirs.push(root)
    const pages = path.join(root, 'src', 'pages')
    fs.mkdirSync(pages, { recursive: true })
    fs.writeFileSync(path.join(pages, 'index.tsx'), 'export default function Home() {}')

    const resolved = resolveOptions(root, {
      pagesDir: 'src/pages',
      outFile: 'src/routes.js',
    })

    runGeneration(resolved, () => {}, () => {})
    const code = fs.readFileSync(path.join(root, 'src', 'routes.js'), 'utf-8')
    expect(code).toContain('export const routes = [')
    expect(code).not.toContain('export type FileRoute')
    expect(code).toContain('export default routes')
  })

  it('generates vue routes file', async () => {
    const { scanDir } = await import('../core/scanner')
    const { generateVueRoutes } = await import('../emit/codegen')

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-vue-'))
    dirs.push(root)
    const pages = path.join(root, 'src', 'pages')
    const outFile = path.join(root, 'src', 'routes.ts')
    fs.mkdirSync(path.join(pages, 'user'), { recursive: true })
    fs.writeFileSync(path.join(pages, 'index.vue'), '<template><div>Home</div></template>')
    fs.writeFileSync(path.join(pages, 'user', '[id].vue'), '<template><div>User</div></template>')

    const tree = scanDir(pages, '', { extensions: ['vue'], exclude: [], baseRoute: '' })
    const code = generateVueRoutes(tree, {
      root,
      pagesDir: pages,
      outFile,
      framework: 'vue',
      importMode: 'lazy',
      baseRoute: '',
    })

    expect(code).toContain('satisfies RouteRecordRaw[]')
    expect(code).toContain('import("./pages/index.vue")')
    expect(code).toContain("import type { RouteRecordRaw } from 'vue-router'")
    expect(code).toContain('path: "/user/:id"')
  })

  it('generates vue nested layout routes', async () => {
    const { scanDir } = await import('../core/scanner')
    const { generateVueRoutes } = await import('../emit/codegen')

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-vlayout-'))
    dirs.push(root)
    const pages = path.join(root, 'src', 'pages')
    const outFile = path.join(root, 'src', 'routes.ts')
    fs.mkdirSync(path.join(pages, 'dashboard'), { recursive: true })
    fs.writeFileSync(path.join(pages, '_layout.vue'), '<template><router-view /></template>')
    fs.writeFileSync(path.join(pages, 'index.vue'), '<template><div /></template>')
    fs.writeFileSync(path.join(pages, 'dashboard', '_layout.vue'), '<template><router-view /></template>')
    fs.writeFileSync(path.join(pages, 'dashboard', 'index.vue'), '<template><div /></template>')

    const tree = scanDir(pages, '', { extensions: ['vue'], exclude: [], baseRoute: '' })
    const code = generateVueRoutes(tree, {
      root,
      pagesDir: pages,
      outFile,
      framework: 'vue',
      importMode: 'lazy',
      baseRoute: '',
    })

    expect(code).toContain('import("./pages/_layout.vue")')
    expect(code).toContain('import("./pages/dashboard/_layout.vue")')
    expect(code).toContain('children: [')
    expect(code).toContain('path: "dashboard"')
  })

  it('generates react loader/action exports', async () => {
    const { scanDir } = await import('../core/scanner')
    const { generateReactRoutes } = await import('../emit/codegen')

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-rr-'))
    dirs.push(root)
    const pages = path.join(root, 'src', 'pages')
    const outFile = path.join(root, 'src', 'routes.ts')
    fs.mkdirSync(pages, { recursive: true })
    fs.writeFileSync(
      path.join(pages, 'data.tsx'),
      'export async function loader() { return null }\nexport default function Page() {}',
    )

    const tree = scanDir(pages, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const code = generateReactRoutes(tree, {
      root,
      pagesDir: pages,
      outFile,
      framework: 'react',
      importMode: 'lazy',
      baseRoute: '',
    })

    expect(code).toContain('loader: m.loader')
  })

  it('reads vue route block', async () => {
    const { readVueRouteBlock } = await import('../core/vue-route-block')
    const src = `<route>{"name":"about","meta":{"requiresAuth":true}}</route>`
    expect(readVueRouteBlock(src)).toEqual({
      name: 'about',
      meta: { requiresAuth: true },
    })
  })

  it('generates not-found catch-all route', async () => {
    const { scanDir } = await import('../core/scanner')
    const { generateReactRoutes } = await import('../emit/codegen')

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-404-'))
    dirs.push(root)
    const pages = path.join(root, 'src', 'pages')
    const outFile = path.join(root, 'src', 'routes.ts')
    fs.mkdirSync(pages, { recursive: true })
    fs.writeFileSync(path.join(pages, 'index.tsx'), 'export default function Home() {}')
    fs.writeFileSync(path.join(pages, 'not-found.tsx'), 'export default function NF() {}')

    const tree = scanDir(pages, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const code = generateReactRoutes(tree, {
      root,
      pagesDir: pages,
      outFile,
      framework: 'react',
      importMode: 'lazy',
      baseRoute: '',
    })

    expect(code).toContain('path: "*"')
    expect(code.indexOf('path: "*"')).toBeGreaterThan(code.indexOf('index: true'))
  })

  it('generates react nested layout routes', async () => {
    const { scanDir } = await import('../core/scanner')
    const { generateReactRoutes } = await import('../emit/codegen')

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-rlayout-'))
    dirs.push(root)
    const pages = path.join(root, 'src', 'pages')
    const outFile = path.join(root, 'src', 'routes.ts')
    fs.mkdirSync(path.join(pages, 'dashboard'), { recursive: true })
    fs.writeFileSync(path.join(pages, '_layout.tsx'), 'export default function L() { return null }')
    fs.writeFileSync(path.join(pages, 'index.tsx'), 'export default function Home() {}')
    fs.writeFileSync(path.join(pages, 'dashboard', '_layout.tsx'), 'export default function DL() { return null }')
    fs.writeFileSync(path.join(pages, 'dashboard', 'index.tsx'), 'export default function D() {}')

    const tree = scanDir(pages, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const code = generateReactRoutes(tree, {
      root,
      pagesDir: pages,
      outFile,
      framework: 'react',
      importMode: 'lazy',
      baseRoute: '',
    })

    expect(code).toContain('import("./pages/_layout.tsx")')
    expect(code).toContain('import("./pages/dashboard/_layout.tsx")')
    expect(code).toContain('path: "dashboard"')
  })

  it('omits catch-all when pages have no not-found', async () => {
    const { scanDir } = await import('../core/scanner')
    const { generateReactRoutes } = await import('../emit/codegen')

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-no-404-'))
    dirs.push(root)
    const pages = path.join(root, 'src', 'pages')
    const outFile = path.join(root, 'src', 'routes.ts')
    fs.mkdirSync(pages, { recursive: true })
    fs.writeFileSync(path.join(pages, 'index.tsx'), 'export default function Home() {}')

    const tree = scanDir(pages, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const code = generateReactRoutes(tree, {
      root,
      pagesDir: pages,
      outFile,
      framework: 'react',
      importMode: 'lazy',
      baseRoute: '',
    })

    expect(code).not.toContain('path: "*"')
  })

  it('wires layout loading.tsx into react lazy route', async () => {
    const { scanDir } = await import('../core/scanner')
    const { generateReactRoutes } = await import('../emit/codegen')

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-layout-loading-'))
    dirs.push(root)
    const pages = path.join(root, 'src', 'pages')
    const outFile = path.join(root, 'src', 'routes.ts')
    fs.mkdirSync(pages, { recursive: true })
    fs.writeFileSync(path.join(pages, '_layout.tsx'), 'export default function L() { return null }')
    fs.writeFileSync(path.join(pages, 'loading.tsx'), 'export default function Loading() { return null }')
    fs.writeFileSync(path.join(pages, 'index.tsx'), 'export default function Home() {}')

    const tree = scanDir(pages, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const code = generateReactRoutes(tree, {
      root,
      pagesDir: pages,
      outFile,
      framework: 'react',
      importMode: 'lazy',
      baseRoute: '',
    })

    expect(code).toContain("import RouteLoading from './pages/loading.tsx'")
    expect(code).toContain('HydrateFallback: RouteLoading')
    expect(code).not.toContain('HydrateFallback: l.default')
  })

  it('keeps route-group layout nested instead of flattening its children', async () => {
    const { scanDir } = await import('../core/scanner')
    const { generateReactRoutes } = await import('../emit/codegen')

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-gen-group-layout-nested-'))
    dirs.push(root)
    const pages = path.join(root, 'src', 'pages')
    const outFile = path.join(root, 'src', 'routes.ts')
    fs.mkdirSync(path.join(pages, '(app)'), { recursive: true })
    fs.writeFileSync(path.join(pages, '_layout.tsx'), 'export default function Root() {}')
    fs.writeFileSync(path.join(pages, 'loading.tsx'), 'export default function Loading() {}')
    fs.writeFileSync(path.join(pages, '(app)', '_layout.tsx'), 'export default function App() {}')
    fs.writeFileSync(path.join(pages, '(app)', 'dashboard.tsx'), 'export default function Dash() {}')

    const tree = scanDir(pages, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const code = generateReactRoutes(tree, {
      root,
      pagesDir: pages,
      outFile,
      framework: 'react',
      importMode: 'lazy',
      baseRoute: '',
      globalLoadingPath: tree.loadingPath,
      globalErrorPath: tree.errorPath,
    })

    const appLayout = code.indexOf('import("./pages/(app)/_layout.tsx")')
    const dashboard = code.indexOf('import("./pages/(app)/dashboard.tsx")')
    expect(appLayout).toBeGreaterThan(-1)
    expect(dashboard).toBeGreaterThan(appLayout)
    expect([...code.matchAll(/HydrateFallback: RouteLoading/g)].length).toBe(1)
  })

  it('wires layout loading.vue into vue defineAsyncComponent', async () => {
    const { scanDir } = await import('../core/scanner')
    const { generateVueRoutes } = await import('../emit/codegen')

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-vue-layout-loading-'))
    dirs.push(root)
    const pages = path.join(root, 'src', 'pages')
    const outFile = path.join(root, 'src', 'routes.ts')
    fs.mkdirSync(pages, { recursive: true })
    fs.writeFileSync(path.join(pages, '_layout.vue'), '<template><router-view /></template>')
    fs.writeFileSync(path.join(pages, 'loading.vue'), '<template><div>Loading</div></template>')
    fs.writeFileSync(path.join(pages, 'index.vue'), '<template><div>Home</div></template>')

    const tree = scanDir(pages, '', { extensions: ['vue'], exclude: [], baseRoute: '' })
    const code = generateVueRoutes(tree, {
      root,
      pagesDir: pages,
      outFile,
      framework: 'vue',
      importMode: 'lazy',
      baseRoute: '',
      globalLoadingPath: tree.loadingPath,
      globalErrorPath: tree.errorPath,
    })

    expect(code).toContain('import { defineAsyncComponent } from \'vue\'')
    expect(code).toContain('./pages/loading.vue')
    expect(code).toContain('loadingComponent:')
  })

  it('wires loading.vue into vue lazy leaf routes', async () => {
    const { scanDir } = await import('../core/scanner')
    const { generateVueRoutes } = await import('../emit/codegen')

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-vue-leaf-loading-'))
    dirs.push(root)
    const pages = path.join(root, 'src', 'pages')
    const outFile = path.join(root, 'src', 'routes.ts')
    fs.mkdirSync(pages, { recursive: true })
    fs.writeFileSync(path.join(pages, 'loading.vue'), '<template><div>Loading</div></template>')
    fs.writeFileSync(path.join(pages, 'about.vue'), '<template><div>About</div></template>')

    const tree = scanDir(pages, '', { extensions: ['vue'], exclude: [], baseRoute: '' })
    const code = generateVueRoutes(tree, {
      root,
      pagesDir: pages,
      outFile,
      framework: 'vue',
      importMode: 'lazy',
      baseRoute: '',
      globalLoadingPath: tree.loadingPath,
      globalErrorPath: tree.errorPath,
    })

    expect(code).toContain('defineAsyncComponent')
    expect(code).toContain('loadingComponent:')
    expect(code).not.toMatch(/component: \(\) => import\("\.\/pages\/about\.vue"\)/)
  })
})
