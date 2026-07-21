import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { collectRouteDiagnostics, scanDir } from '../core/scanner'
import { readVueRouteBlockResult } from '../core/vue-route-block'
import { generateReactRoutes, generateVueRoutes } from '../emit/codegen'
import { mergeRouteFiles } from '../emit/merge-routes'
import { collectRouteSliceMap, parseRoutesFile } from '../emit/parse-routes-file'
import { resolveOptions, runGeneration } from '../generate'
import fileRouter from '../plugin'

describe('3.0 industrial contracts', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  function project(files: Record<string, string>, extension = 'tsx') {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-v3-'))
    dirs.push(root)
    const pagesDir = path.join(root, 'src', 'pages')
    const outFile = path.join(root, 'src', 'routes.ts')
    for (const [relative, source] of Object.entries(files)) {
      const file = path.join(pagesDir, relative)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, source)
    }
    const tree = scanDir(pagesDir, '', { extensions: [extension], exclude: [], baseRoute: '' })
    return { root, pagesDir, outFile, tree }
  }

  function reactCode(value: ReturnType<typeof project>, baseRoute = '') {
    return generateReactRoutes(value.tree, {
      root: value.root,
      pagesDir: value.pagesDir,
      outFile: value.outFile,
      framework: 'react',
      importMode: 'lazy',
      baseRoute,
    })
  }

  it('keeps dynamic directories and nested catch-all routes scoped to their parents', () => {
    const value = project({
      '[tenant]/settings.tsx': 'export default function Settings() {}',
      'docs/[...slug].tsx': 'export default function Docs() {}',
    })
    const code = reactCode(value)

    expect(code).toContain('path: "/:tenant/settings"')
    expect(code).toContain('path: "/docs/*"')
    expect(code).not.toMatch(/path: "\*"[\s\S]*docs\/\[\.\.\.slug\]/)
  })

  it('applies baseRoute to a real root layout without duplicating child paths', () => {
    const value = project({
      '_layout.tsx': 'export default function Layout() {}',
      'index.tsx': 'export default function Home() {}',
      'about.tsx': 'export default function About() {}',
    })
    const code = reactCode(value, '/app')

    expect(code).toContain('path: "/app"')
    expect(code).toContain('path: "about"')
    expect(code).not.toContain('path: "/app/about"')
  })

  it('allocates collision-free fallback imports for nested layouts', () => {
    const value = project({
      '_layout.tsx': 'export default function Layout() {}',
      'loading.tsx': 'export default function Loading() {}',
      '(app)/_layout.tsx': 'export default function AppLayout() {}',
      '(app)/loading.tsx': 'export default function AppLoading() {}',
      '(app)/dashboard.tsx': 'export default function Dashboard() {}',
    })
    const code = reactCode(value)

    expect(code).toContain("import RouteLoading from './pages/loading.tsx'")
    expect(code).toContain("from './pages/(app)/loading.tsx'")
    expect(new Set([...code.matchAll(/import ([A-Za-z_$][\w$]*) from/g)].map((match) => match[1])).size)
      .toBe([...code.matchAll(/import ([A-Za-z_$][\w$]*) from/g)].length)
    expect(parseRoutesFile(code)).not.toBeNull()
  })

  it('reads current React route-module exports and nested static metadata through AST', () => {
    const value = project({
      'data.tsx': `
        const pattern = /export\\s+default/
        export const meta = { title: 'Data', access: { roles: ['admin'] } }
        export async function loader() { return pattern.source }
        export const middleware = [() => null]
        export default function Data() { return <div>{'}]'}</div> }
      `,
    })
    const code = reactCode(value)

    expect(code).toContain('loader: m.loader')
    expect(code).toContain('middleware: m.middleware')
    expect(code).toContain('access: {"roles":["admin"]}')
  })

  it('parses Vue JSON5/YAML route blocks and emits official Vue Router records', () => {
    const value = project({
      'account.vue': `<template><div /></template>
<route lang="yaml">
path: account/:id
name: account
props: true
meta:
  auth:
    role: admin
</route>`,
    }, 'vue')
    const code = generateVueRoutes(value.tree, {
      root: value.root,
      pagesDir: value.pagesDir,
      outFile: value.outFile,
      framework: 'vue',
      importMode: 'lazy',
      baseRoute: '',
    })

    expect(code).toContain("import type { RouteRecordRaw } from 'vue-router'")
    expect(code).toContain('path: "/account/:id"')
    expect(code).toContain('name: "account"')
    expect(code).toContain('props: true')
    expect(code).toContain('auth: {"role":"admin"}')
  })

  it('analyzes script and script-setup blocks independently', () => {
    const value = project({
      'mixed.vue': `<script lang="ts">
import Shared from './shared'
export const meta = { source: 'normal-script' }
</script>
<script setup lang="ts">
import Shared from './shared'
void Shared
</script>
<template><Shared /></template>`,
    }, 'vue')
    const diagnostics = collectRouteDiagnostics(value.tree, 'vue')
    const code = generateVueRoutes(value.tree, {
      root: value.root,
      pagesDir: value.pagesDir,
      outFile: value.outFile,
      framework: 'vue',
      importMode: 'lazy',
      baseRoute: '',
    })

    expect(diagnostics).toEqual([])
    expect(code).toContain('source: "normal-script"')
  })

  it('three-way merges user imports, statements, routes, comments, overrides, and deletions', () => {
    const value = project({
      'index.tsx': 'export default function Home() {}',
      'about.tsx': 'export default function About() {}',
    })
    const baseline = reactCode(value)
    const parsed = parseRoutesFile(baseline)!
    let current = baseline.replace(
      "import type { RouteObject } from 'react-router-dom'",
      "import type { RouteObject } from 'react-router-dom'\nimport ManualPage from './manual-page'\nconst audit = 'user-owned'",
    )
    const offset = parsed.array.end - 1
    const delta = current.length - baseline.length
    current = `${current.slice(0, offset + delta)}\n  { path: '/manual', Component: ManualPage },\n${current.slice(offset + delta)}`

    const currentParsed = parseRoutesFile(current)!
    const allRoutes = currentParsed.routes.flatMap(function flatten(route): typeof currentParsed.routes {
      return [route, ...route.children.flatMap(flatten)]
    })
    const aboutRoute = allRoutes.find((route) => route.sourceIds.includes('./pages/about.tsx'))!
    const lazy = aboutRoute.properties.find((property) => property.key === 'lazy')!
    const comma = current.indexOf(',', lazy.end)
    current = current.slice(0, lazy.start) + current.slice(comma + 1)

    const about = collectRouteSliceMap(current).get('page:about.tsx')!
    const editedAbout = about
      .replace('path: "/about",', '// user path contract\n    path: "/company",')
    current = current.replace(about, editedAbout)

    fs.writeFileSync(path.join(value.pagesDir, 'help.tsx'), 'export default function Help() {}')
    value.tree = scanDir(value.pagesDir, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const merged = mergeRouteFiles(reactCode(value), current)
    const mergedAbout = collectRouteSliceMap(merged).get('page:about.tsx')!

    expect(merged).toContain("import ManualPage from './manual-page'")
    expect(merged).toContain("const audit = 'user-owned'")
    expect(merged).toContain("path: '/manual'")
    expect(merged).toContain('./pages/help.tsx')
    expect(mergedAbout).toContain('// user path contract')
    expect(mergedAbout).toContain('path: "/company"')
    expect(mergedAbout).not.toContain('lazy: async')
  })

  it('blocks generation for missing React defaults and ambiguous convention files', () => {
    const value = project({
      '_layout.tsx': 'export default function A() {}',
      '_layout.sync.tsx': 'export default function B() {}',
      'index.tsx': 'export const loader = () => null',
      'not-found.tsx': 'export default function NotFound() {}',
      '[...all].tsx': 'export default function CatchAll() {}',
    })
    const diagnostics = collectRouteDiagnostics(value.tree, 'react')

    expect(diagnostics.some((item) => item.code === 'scan-error')).toBe(true)
    expect(diagnostics.some((item) => item.code === 'missing-default-export')).toBe(true)
    expect(diagnostics.some((item) => item.code === 'duplicate-route')).toBe(true)

    const resolved = resolveOptions(value.root)
    expect(() => runGeneration(resolved, () => {}, () => {})).toThrow(/Route generation failed/)
    expect(fs.existsSync(value.outFile)).toBe(false)
  })

  it('emits layout metadata and rejects a static meta/runtime handle collision', () => {
    const value = project({
      '_layout.tsx': `
        export const meta = { section: 'admin' }
        export const handle = { legacy: true }
        export default function Layout() {}
      `,
      'index.tsx': 'export default function Home() {}',
    })
    const diagnostics = collectRouteDiagnostics(value.tree, 'react')
    expect(diagnostics.some((item) => item.code === 'conflicting-route-export')).toBe(true)

    const code = reactCode(value)
    const layout = collectRouteSliceMap(code).get('layout:_layout.tsx') ?? ''
    expect(layout).toContain('handle: { section: "admin" }')
    expect(layout).not.toContain('handle: m.handle')
  })

  it('emits Vue layout route-block fields and metadata', () => {
    const value = project({
      '_layout.vue': `<template><router-view /></template>
<route lang="json5">{ path: 'workspace', name: 'workspace', meta: { auth: true } }</route>`,
      'index.vue': '<template><div>Home</div></template>',
    }, 'vue')
    const code = generateVueRoutes(value.tree, {
      root: value.root,
      pagesDir: value.pagesDir,
      outFile: value.outFile,
      framework: 'vue',
      importMode: 'lazy',
      baseRoute: '',
    })
    const layout = collectRouteSliceMap(code).get('layout:_layout.vue') ?? ''
    expect(layout).toContain('path: "/workspace"')
    expect(layout).toContain('name: "workspace"')
    expect(layout).toContain('meta: { auth: true }')
  })

  it('emits an empty path for nested Vue route-group layouts', () => {
    const value = project({
      '_layout.vue': '<template><router-view /></template>',
      '(app)/_layout.vue': '<template><router-view /></template>',
      '(app)/dashboard.vue': '<template><div>Dashboard</div></template>',
    }, 'vue')
    const code = generateVueRoutes(value.tree, {
      root: value.root,
      pagesDir: value.pagesDir,
      outFile: value.outFile,
      framework: 'vue',
      importMode: 'lazy',
      baseRoute: '',
    })
    const groupLayout = collectRouteSliceMap(code).get('layout:(app)/_layout.vue') ?? ''
    expect(groupLayout).toContain("path: ''")
    expect(groupLayout).toContain('path: "dashboard"')
  })

  it('emits absolute paths for top-level Vue layouts without a root layout', () => {
    const value = project({
      'admin/settings/_layout.vue': '<template><router-view /></template>',
      'admin/settings/index.vue': '<template><div>Settings</div></template>',
      '(app)/_layout.vue': '<template><router-view /></template>',
      '(app)/dashboard.vue': '<template><div>Dashboard</div></template>',
    }, 'vue')
    const code = generateVueRoutes(value.tree, {
      root: value.root,
      pagesDir: value.pagesDir,
      outFile: value.outFile,
      framework: 'vue',
      importMode: 'lazy',
      baseRoute: '',
    })

    expect(collectRouteSliceMap(code).get('layout:admin/settings/_layout.vue')).toContain('path: "/admin/settings"')
    expect(collectRouteSliceMap(code).get('layout:(app)/_layout.vue')).toContain("path: '/'")
  })

  it('loads rootless generated layouts in the Vue Router runtime', async () => {
    const value = project({
      'admin/settings/_layout.vue': '<template><router-view /></template>',
      'admin/settings/index.vue': '<template><div>Settings</div></template>',
      '(app)/_layout.vue': '<template><router-view /></template>',
      '(app)/dashboard.vue': '<template><div>Dashboard</div></template>',
    }, 'vue')
    const outFile = path.join(value.root, 'src', 'routes.mjs')
    const code = generateVueRoutes(value.tree, {
      root: value.root,
      pagesDir: value.pagesDir,
      outFile,
      framework: 'vue',
      importMode: 'lazy',
      baseRoute: '',
      outputLanguage: 'js',
    })
    fs.writeFileSync(outFile, code)
    const { default: routes } = await import(pathToFileURL(outFile).href)
    const replaceComponents = (records: Array<Record<string, any>>) => {
      for (const record of records) {
        record.component = { render: () => null }
        if (record.children) replaceComponents(record.children)
      }
    }
    replaceComponents(routes)
    const router = createRouter({ history: createMemoryHistory(), routes })

    await router.push('/admin/settings')
    expect(router.currentRoute.value.matched).toHaveLength(2)
    await router.push('/dashboard')
    expect(router.currentRoute.value.matched).toHaveLength(2)
  })

  it('rejects ambiguous or unsupported Vue route blocks', () => {
    const duplicate = readVueRouteBlockResult(
      '<template><div /></template><route>{ name: "one" }</route><route>{ name: "two" }</route>',
      'duplicate.vue',
    )
    const external = readVueRouteBlockResult(
      '<template><div /></template><route src="./route.json" />',
      'external.vue',
    )
    const unknown = readVueRouteBlockResult(
      '<template><div /></template><route>{ metaa: { auth: true } }</route>',
      'unknown.vue',
    )

    expect(duplicate.error).toContain('only one <route>')
    expect(external.error).toContain('<route src> is not supported')
    expect(unknown.error).toContain('Unsupported <route> field')
  })

  it('diagnoses duplicate Vue paths introduced by route-block overrides', () => {
    const value = project({
      'first.vue': '<template><div /></template><route>{ path: "shared" }</route>',
      'second.vue': '<template><div /></template><route>{ path: "shared" }</route>',
    }, 'vue')
    const diagnostics = collectRouteDiagnostics(value.tree, 'vue')

    expect(diagnostics.some((item) => item.message.includes('Duplicate route "/shared"'))).toBe(true)
  })

  it('rejects duplicate Vue route names', () => {
    const value = project({
      'first.vue': '<template><div /></template><route>{ name: "shared" }</route>',
      'second.vue': '<template><div /></template><route>{ name: "shared" }</route>',
    }, 'vue')
    const diagnostics = collectRouteDiagnostics(value.tree, 'vue')
    expect(diagnostics.some((item) => item.message.includes('Duplicate route name "shared"'))).toBe(true)
  })

  it('strips Vue route blocks through the file-router Vite transform', async () => {
    const plugin = fileRouter({ framework: 'vue' })
    const source = `<template><div /></template>
<route lang="json5">{ name: 'home' }</route>
<style>.page { color: red }</style>`
    const transformed = await (plugin.transform as any).call({}, source, '/app/src/pages/index.vue')

    expect(transformed.code).not.toContain('<route')
    expect(transformed.code).toContain('<template><div /></template>')
    expect(transformed.code).toContain('<style>.page { color: red }</style>')
    expect(transformed.code.split('\n')).toHaveLength(source.split('\n').length)
  })

  it('skips route regeneration for component-only edits and regenerates metadata changes', () => {
    const value = project({
      'index.tsx': 'export default function Home() { return null }',
    })
    const resolved = resolveOptions(value.root, { logDiagnostics: false })
    expect(runGeneration(resolved, () => {}, () => {}).changed).toBe(true)

    fs.writeFileSync(
      path.join(value.pagesDir, 'index.tsx'),
      'export default function Home() { return <main>updated</main> }',
    )
    expect(runGeneration(resolved, () => {}, () => {}).changed).toBe(false)

    fs.writeFileSync(
      path.join(value.pagesDir, 'index.tsx'),
      `export const meta = { title: 'Updated' }
export default function Home() { return <main>updated</main> }`,
    )
    expect(runGeneration(resolved, () => {}, () => {}).changed).toBe(true)
    expect(fs.readFileSync(value.outFile, 'utf8')).toContain('title: "Updated"')
  })

  it('keeps page modules in Vite HMR and adds routes only when route config changes', async () => {
    const value = project({
      'index.tsx': 'export default function Home() { return null }',
    })
    const plugin = fileRouter({ logDiagnostics: false })
    await (plugin.configResolved as any).call({}, { root: value.root })
    await (plugin.buildStart as any).call({})

    const pageModule = { id: path.join(value.pagesDir, 'index.tsx') }
    const routeModule = { id: value.outFile, url: '/src/routes.ts' }
    const invalidated: unknown[] = []
    const server = {
      moduleGraph: {
        getModuleById: (id: string) => id === value.outFile ? routeModule : undefined,
        invalidateModule: (module: unknown) => invalidated.push(module),
      },
    }

    fs.writeFileSync(pageModule.id, 'export default function Home() { return <main>updated</main> }')
    const componentResult = await (plugin.handleHotUpdate as any).call({}, {
      file: pageModule.id,
      server,
      read: async () => fs.readFileSync(pageModule.id, 'utf8'),
      modules: [pageModule],
    })
    expect(componentResult).toBeUndefined()

    fs.writeFileSync(
      pageModule.id,
      `export const meta = { hmr: true }
export default function Home() { return null }`,
    )
    const routeResult = await (plugin.handleHotUpdate as any).call({}, {
      file: pageModule.id,
      server,
      read: async () => fs.readFileSync(pageModule.id, 'utf8'),
      modules: [pageModule],
    })
    expect(routeResult).toEqual([pageModule, routeModule])
    expect(invalidated).toContain(routeModule)
  })

  it('rejects layout loading and error modules without default components', () => {
    const value = project({
      '_layout.tsx': 'export default function Layout() {}',
      'loading.tsx': 'export const pending = true',
      'error.tsx': 'export const message = "failed"',
      'index.tsx': 'export default function Home() {}',
    })
    const diagnostics = collectRouteDiagnostics(value.tree, 'react')
    const missing = diagnostics.filter((item) => item.code === 'missing-default-export')
    expect(missing.map((item) => path.basename(item.routes[0]))).toEqual(['loading.tsx', 'error.tsx'])
  })
})
