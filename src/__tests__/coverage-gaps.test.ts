import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { invalidateScanCache, scanDir } from '../core/scanner'
import { generateReactRoutes, generateVueRoutes } from '../emit/codegen'
import { resolveOptions, runGeneration } from '../generate'
import type { GenerateContext } from '../types'

function makeTmpPages(structure: Record<string, string>, ext = 'tsx') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-cov-'))
  const pages = path.join(root, 'src', 'pages')
  fs.mkdirSync(pages, { recursive: true })
  for (const [rel, content] of Object.entries(structure)) {
    const file = path.join(pages, rel)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content)
  }
  return { root, pages }
}

describe('scanner edge cases', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('scans @slotname directories as parallel route slots', () => {
    const { root, pages } = makeTmpPages({
      'index.tsx': 'export default function Home() {}',
      '@sidebar/nav.tsx': 'export default function Nav() {}',
      '@sidebar/links.tsx': 'export default function Links() {}',
    })
    dirs.push(root)

    const tree = scanDir(pages, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    expect(tree.slots).toBeDefined()
    expect(tree.slots!['sidebar']).toBeDefined()
    expect(tree.slots!['sidebar'].children.length).toBe(2)
  })

  it('handles non-existent directory gracefully', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-cov-nodir-'))
    dirs.push(root)

    const tree = scanDir(path.join(root, 'nonexist'), '', {
      extensions: ['tsx'],
      exclude: [],
      baseRoute: '',
    })
    expect(tree.children).toEqual([])
  })

  it('invalidateScanCache without argument clears entire cache', () => {
    const { root, pages } = makeTmpPages({ 'index.tsx': 'export default function H() {}' })
    dirs.push(root)

    scanDir(pages, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    expect(() => invalidateScanCache()).not.toThrow()
  })

  it('handles file read errors gracefully (deleted file during scan)', () => {
    const { root, pages } = makeTmpPages({ 'index.tsx': 'export default function H() {}' })
    dirs.push(root)

    invalidateScanCache()
    scanDir(pages, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })

    fs.unlinkSync(path.join(pages, 'index.tsx'))
    invalidateScanCache()

    fs.writeFileSync(path.join(pages, 'index.tsx'), 'export default function H() {}')
    const tree = scanDir(pages, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    expect(tree.children.length).toBeGreaterThan(0)
  })

  it('skips symlinks in scan directory', () => {
    const { root, pages } = makeTmpPages({ 'index.tsx': 'export default function H() {}' })
    dirs.push(root)

    const target = path.join(pages, 'index.tsx')
    const link = path.join(pages, 'link.tsx')
    fs.symlinkSync(target, link)

    const tree = scanDir(pages, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const filePaths = tree.children.map((c) => c.filePath).filter(Boolean)
    expect(filePaths.length).toBe(1)
  })

  it('skips dot-prefixed entries', () => {
    const { root, pages } = makeTmpPages({
      'index.tsx': 'export default function H() {}',
      '.hidden.tsx': 'export default function Hidden() {}',
    })
    dirs.push(root)

    const tree = scanDir(pages, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    expect(tree.children.every((c) => !c.filePath?.includes('.hidden'))).toBe(true)
  })

  it('excludes matching paths', () => {
    const { root, pages } = makeTmpPages({
      'index.tsx': 'export default function H() {}',
      'internal/secret.tsx': 'export default function S() {}',
    })
    dirs.push(root)

    const tree = scanDir(pages, '', {
      extensions: ['tsx'],
      exclude: ['internal/**'],
      baseRoute: '',
    })
    const allPaths = tree.children.flatMap((c) => [c.urlPath, ...c.children.map((gc) => gc.urlPath)])
    expect(allPaths).not.toContain('/internal/secret')
  })
})

describe('codegen parallel slots', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('generates slots export for @slotname directories', () => {
    const { root, pages } = makeTmpPages({
      'index.tsx': 'export default function H() {}',
      '@sidebar/nav.tsx': 'export default function Nav() {}',
    })
    dirs.push(root)

    const tree = scanDir(pages, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const code = generateReactRoutes(tree, {
      root,
      pagesDir: pages,
      outFile: path.join(root, 'src', 'routes.ts'),
      framework: 'react',
      importMode: 'lazy',
      baseRoute: '',
    })

    expect(code).toContain('export const slots')
    expect(code).toContain('"sidebar"')
  })

  it('generates SlotNames type when typedRoutes is enabled', () => {
    const { root, pages } = makeTmpPages({
      'index.tsx': 'export default function H() {}',
      '@sidebar/nav.tsx': 'export default function Nav() {}',
      '@footer/info.tsx': 'export default function Info() {}',
    })
    dirs.push(root)

    const tree = scanDir(pages, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const code = generateReactRoutes(tree, {
      root,
      pagesDir: pages,
      outFile: path.join(root, 'src', 'routes.ts'),
      framework: 'react',
      importMode: 'lazy',
      baseRoute: '',
      typedRoutes: true,
      outputLanguage: 'ts',
    })

    expect(code).toContain('export type SlotNames')
    expect(code).toContain('"sidebar"')
    expect(code).toContain('"footer"')
  })

  it('generates sync slot imports when importMode is sync', () => {
    const { root, pages } = makeTmpPages({
      'index.tsx': 'export default function H() {}',
      '@sidebar/nav.tsx': 'export default function Nav() {}',
    })
    dirs.push(root)

    const tree = scanDir(pages, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const code = generateReactRoutes(tree, {
      root,
      pagesDir: pages,
      outFile: path.join(root, 'src', 'routes.ts'),
      framework: 'react',
      importMode: 'sync',
      baseRoute: '',
    })

    expect(code).toContain('export const slots')
    expect(code).toContain('component:')
  })
})

describe('codegen directory route flattening', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('flattens single-page directory into combined path under a layout', () => {
    const { root, pages } = makeTmpPages({
      '_layout.tsx': 'export default function L() { return null }',
      'index.tsx': 'export default function H() {}',
      'blog/post.tsx': 'export default function Post() {}',
    })
    dirs.push(root)

    const tree = scanDir(pages, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const code = generateReactRoutes(tree, {
      root,
      pagesDir: pages,
      outFile: path.join(root, 'src', 'routes.ts'),
      framework: 'react',
      importMode: 'lazy',
      baseRoute: '',
    })

    expect(code).toContain('path: "blog/post"')
  })

  it('emits directory children when directory has multiple pages under a layout', () => {
    const { root, pages } = makeTmpPages({
      '_layout.tsx': 'export default function L() { return null }',
      'index.tsx': 'export default function H() {}',
      'blog/post.tsx': 'export default function Post() {}',
      'blog/list.tsx': 'export default function List() {}',
    })
    dirs.push(root)

    const tree = scanDir(pages, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const code = generateReactRoutes(tree, {
      root,
      pagesDir: pages,
      outFile: path.join(root, 'src', 'routes.ts'),
      framework: 'react',
      importMode: 'lazy',
      baseRoute: '',
    })

    expect(code).toContain('path: "blog"')
    expect(code).toContain('children: [')
  })

  it('emits directory route children for vue with a layout', () => {
    const { root, pages } = makeTmpPages({
      '_layout.vue': '<template><router-view /></template>',
      'index.vue': '<template><div>Home</div></template>',
      'blog/post.vue': '<template><div>Post</div></template>',
      'blog/list.vue': '<template><div>List</div></template>',
    })
    dirs.push(root)

    const tree = scanDir(pages, '', { extensions: ['vue'], exclude: [], baseRoute: '' })
    const code = generateVueRoutes(tree, {
      root,
      pagesDir: pages,
      outFile: path.join(root, 'src', 'routes.ts'),
      framework: 'vue',
      importMode: 'lazy',
      baseRoute: '',
    })

    expect(code).toContain('path: "blog"')
    expect(code).toContain('children: [')
  })
})

describe('codegen sync import naming', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('generates correct names for not-found and dynamic pages in sync mode', () => {
    const { root, pages } = makeTmpPages({
      'index.tsx': 'export default function H() {}',
      'not-found.tsx': 'export default function NF() {}',
      '[id].tsx': 'export default function D() {}',
    })
    dirs.push(root)

    const tree = scanDir(pages, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const code = generateReactRoutes(tree, {
      root,
      pagesDir: pages,
      outFile: path.join(root, 'src', 'routes.ts'),
      framework: 'react',
      importMode: 'sync',
      baseRoute: '',
    })

    expect(code).toMatch(/import NotFoundPage from/)
    expect(code).toMatch(/import DynamicPage from/)
  })

  it('generates correct name for 404 page', () => {
    const { root, pages } = makeTmpPages({
      'index.tsx': 'export default function H() {}',
      '404.tsx': 'export default function NF() {}',
    })
    dirs.push(root)

    const tree = scanDir(pages, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const code = generateReactRoutes(tree, {
      root,
      pagesDir: pages,
      outFile: path.join(root, 'src', 'routes.ts'),
      framework: 'react',
      importMode: 'sync',
      baseRoute: '',
    })

    expect(code).toMatch(/import NotFoundPage from/)
  })
})

describe('codegen ErrorBoundary wiring', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('wires ErrorBoundary export into lazy route', () => {
    const { root, pages } = makeTmpPages({
      'index.tsx': 'export default function H() {}\nexport function ErrorBoundary() { return null }',
    })
    dirs.push(root)

    const tree = scanDir(pages, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const code = generateReactRoutes(tree, {
      root,
      pagesDir: pages,
      outFile: path.join(root, 'src', 'routes.ts'),
      framework: 'react',
      importMode: 'lazy',
      baseRoute: '',
    })

    expect(code).toContain('ErrorBoundary: m.ErrorBoundary')
  })
})

describe('codegen formatMetaField edge cases', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('serializes meta with special characters in keys', () => {
    const { root, pages } = makeTmpPages({
      'index.tsx': `export const meta = { 'with-dash': true, normal: 'val' }\nexport default function H() {}`,
    })
    dirs.push(root)

    const tree = scanDir(pages, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const code = generateReactRoutes(tree, {
      root,
      pagesDir: pages,
      outFile: path.join(root, 'src', 'routes.ts'),
      framework: 'react',
      importMode: 'lazy',
      baseRoute: '',
    })

    expect(code).toContain('handle:')
    expect(code).toContain('"with-dash"')
  })
})

describe('codegen vue sync layout and catch-all', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('generates sync layout import for vue routes', () => {
    const { root, pages } = makeTmpPages({
      '_layout.vue': '<template><router-view /></template>',
      'index.vue': '<template><div>Home</div></template>',
      'about.vue': '<template><div>About</div></template>',
    })
    dirs.push(root)

    const tree = scanDir(pages, '', { extensions: ['vue'], exclude: [], baseRoute: '' })
    const code = generateVueRoutes(tree, {
      root,
      pagesDir: pages,
      outFile: path.join(root, 'src', 'routes.ts'),
      framework: 'vue',
      importMode: 'sync',
      baseRoute: '',
    })

    expect(code).toMatch(/import \w+ from ['"]\.\/pages\/_layout\.vue['"]/)
    expect(code).toContain('component:')
  })

  it('generates vue catch-all route with pathMatch', () => {
    const { root, pages } = makeTmpPages({
      '_layout.vue': '<template><router-view /></template>',
      'index.vue': '<template><div>Home</div></template>',
      'not-found.vue': '<template><div>404</div></template>',
    })
    dirs.push(root)

    const tree = scanDir(pages, '', { extensions: ['vue'], exclude: [], baseRoute: '' })
    const code = generateVueRoutes(tree, {
      root,
      pagesDir: pages,
      outFile: path.join(root, 'src', 'routes.ts'),
      framework: 'vue',
      importMode: 'lazy',
      baseRoute: '',
    })

    expect(code).toContain(':pathMatch(.*)*')
  })

  it('generates vue catch-all with [...slug] segment', () => {
    const { root, pages } = makeTmpPages({
      '_layout.vue': '<template><router-view /></template>',
      'index.vue': '<template><div>Home</div></template>',
      '[...slug].vue': '<template><div>Catch</div></template>',
    })
    dirs.push(root)

    const tree = scanDir(pages, '', { extensions: ['vue'], exclude: [], baseRoute: '' })
    const code = generateVueRoutes(tree, {
      root,
      pagesDir: pages,
      outFile: path.join(root, 'src', 'routes.ts'),
      framework: 'vue',
      importMode: 'lazy',
      baseRoute: '',
    })

    expect(code).toContain(':pathMatch(.*)*')
  })
})

describe('scanner file-read error and edge cases', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('handles unreadable file gracefully (permission denied)', () => {
    const { root, pages } = makeTmpPages({
      'index.tsx': 'export default function H() {}',
      'secret.tsx': 'export default function S() {}',
    })
    dirs.push(root)

    const secretFile = path.join(pages, 'secret.tsx')
    invalidateScanCache()
    fs.chmodSync(secretFile, 0o000)

    const tree = scanDir(pages, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const secretNode = tree.children.find((c) => c.filePath?.includes('secret'))
    expect(secretNode?.hasDefaultExport).toBe(false)

    fs.chmodSync(secretFile, 0o644)
  })

  it('handles directory that becomes unreadable', () => {
    const { root, pages } = makeTmpPages({
      'index.tsx': 'export default function H() {}',
      'sub/page.tsx': 'export default function P() {}',
    })
    dirs.push(root)

    const subDir = path.join(pages, 'sub')
    fs.chmodSync(subDir, 0o000)

    invalidateScanCache()
    const tree = scanDir(pages, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const subNode = tree.children.find((c) => c.routeId?.includes('sub'))
    expect(subNode?.children.length).toBe(0)

    fs.chmodSync(subDir, 0o755)
  })
})

describe('codegen vue baseRoute and nested catch-all', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('generates vue layout with baseRoute', () => {
    const { root, pages } = makeTmpPages({
      '_layout.vue': '<template><router-view /></template>',
      'index.vue': '<template><div>Home</div></template>',
    })
    dirs.push(root)

    const tree = scanDir(pages, '', { extensions: ['vue'], exclude: [], baseRoute: '/app' })
    const code = generateVueRoutes(tree, {
      root,
      pagesDir: pages,
      outFile: path.join(root, 'src', 'routes.ts'),
      framework: 'vue',
      importMode: 'lazy',
      baseRoute: '/app',
    })

    expect(code).toContain('path: "/app"')
  })

  it('generates vue nested catch-all under subdirectory', () => {
    const { root, pages } = makeTmpPages({
      '_layout.vue': '<template><router-view /></template>',
      'index.vue': '<template><div>Home</div></template>',
      'docs/index.vue': '<template><div>Docs</div></template>',
      'docs/[...slug].vue': '<template><div>Catch</div></template>',
    })
    dirs.push(root)

    const tree = scanDir(pages, '', { extensions: ['vue'], exclude: [], baseRoute: '' })
    const code = generateVueRoutes(tree, {
      root,
      pagesDir: pages,
      outFile: path.join(root, 'src', 'routes.ts'),
      framework: 'vue',
      importMode: 'lazy',
      baseRoute: '',
    })

    expect(code).toContain(':pathMatch(.*)*')
  })
})

describe('generate.ts virtualRoutes advanced options', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('resolves relative component paths in virtual routes', () => {
    const { root } = makeTmpPages({ 'index.tsx': 'export default function H() {}' })
    dirs.push(root)

    const resolved = resolveOptions(root, {
      framework: 'react',
      virtualRoutes: [
        { path: 'admin', component: 'src/pages/index.tsx' },
      ],
    })
    runGeneration(resolved, () => {}, () => {})
    const output = fs.readFileSync(resolved.outFile, 'utf-8')
    expect(output).toContain('admin')
  })

  it('applies meta and importMode on virtual routes', () => {
    const { root } = makeTmpPages({ 'index.tsx': 'export default function H() {}' })
    dirs.push(root)

    const resolved = resolveOptions(root, {
      framework: 'react',
      typedRoutes: true,
      virtualRoutes: [
        {
          path: '/settings',
          component: path.join(root, 'src/pages/index.tsx'),
          meta: { title: 'Settings' },
          importMode: 'sync',
        },
      ],
    })
    runGeneration(resolved, () => {}, () => {})
    const output = fs.readFileSync(resolved.outFile, 'utf-8')
    expect(output).toContain('/settings')
    expect(output).toContain('Settings')
  })

  it('transformRoutes can modify the route tree', () => {
    const { root } = makeTmpPages({
      'index.tsx': 'export default function H() {}',
      'about.tsx': 'export default function A() {}',
    })
    dirs.push(root)

    const resolved = resolveOptions(root, {
      framework: 'react',
      transformRoutes: (tree) => {
        tree.children = tree.children.filter((c) => c.urlPath !== '/about')
        return tree
      },
    })
    runGeneration(resolved, () => {}, () => {})
    const output = fs.readFileSync(resolved.outFile, 'utf-8')
    expect(output).not.toContain('/about')
    expect(output).toContain('/')
  })
})

describe('generate.ts manifest with nested filePath+children nodes', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('includes nested children on pages that also have filePath', () => {
    const { root } = makeTmpPages({
      'index.tsx': [
        'export async function loader() { return {} }',
        'export async function action() { return {} }',
        'export default function H() { return null }',
      ].join('\n'),
      'dashboard/_layout.tsx': 'export default function L() { return null }',
      'dashboard/index.tsx': 'export default function D() { return null }',
      'dashboard/stats.tsx': [
        'export async function loader() { return {} }',
        'export default function S() { return null }',
      ].join('\n'),
    })
    dirs.push(root)

    const resolved = resolveOptions(root, {
      framework: 'react',
      ssrManifest: true,
    })
    runGeneration(resolved, () => {}, () => {})

    const manifestPath = resolved.outFile.replace(/\.ts$/, '.manifest.json')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))

    const dashLayout = manifest.routes.find((r: any) =>
      r.component && r.component.includes('_layout'))
    expect(dashLayout).toBeDefined()
    expect(dashLayout.children).toBeDefined()

    const statsRoute = dashLayout.children.find((r: any) => r.path?.includes('stats'))
    expect(statsRoute).toBeDefined()
    expect(statsRoute.hasLoader).toBe(true)
  })
})

describe('codegen vue route block alias', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('generates alias from vue route block', () => {
    const { root, pages } = makeTmpPages({
      'index.vue': '<route>{"alias":"/home"}</route>\n<template><div>Home</div></template>',
    })
    dirs.push(root)

    const tree = scanDir(pages, '', { extensions: ['vue'], exclude: [], baseRoute: '' })
    const code = generateVueRoutes(tree, {
      root,
      pagesDir: pages,
      outFile: path.join(root, 'src', 'routes.ts'),
      framework: 'vue',
      importMode: 'lazy',
      baseRoute: '',
    })

    expect(code).toContain('alias: "/home"')
  })

  it('generates array alias from vue route block', () => {
    const { root, pages } = makeTmpPages({
      'index.vue': '<route>{"alias":["/home","/main"]}</route>\n<template><div>Home</div></template>',
    })
    dirs.push(root)

    const tree = scanDir(pages, '', { extensions: ['vue'], exclude: [], baseRoute: '' })
    const code = generateVueRoutes(tree, {
      root,
      pagesDir: pages,
      outFile: path.join(root, 'src', 'routes.ts'),
      framework: 'vue',
      importMode: 'lazy',
      baseRoute: '',
    })

    expect(code).toContain('alias: ["/home", "/main"]')
  })
})

describe('codegen vue top-level catch-all (vueAbsolutePath)', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('generates pathMatch for top-level not-found without layout', () => {
    const { root, pages } = makeTmpPages({
      'index.vue': '<template><div>Home</div></template>',
      'not-found.vue': '<template><div>404</div></template>',
    })
    dirs.push(root)

    const tree = scanDir(pages, '', { extensions: ['vue'], exclude: [], baseRoute: '' })
    const code = generateVueRoutes(tree, {
      root,
      pagesDir: pages,
      outFile: path.join(root, 'src', 'routes.ts'),
      framework: 'vue',
      importMode: 'lazy',
      baseRoute: '',
    })

    expect(code).toContain(':pathMatch(.*)*')
  })

  it('generates pathMatch for top-level [...slug] without layout', () => {
    const { root, pages } = makeTmpPages({
      'index.vue': '<template><div>Home</div></template>',
      '[...slug].vue': '<template><div>Catch</div></template>',
    })
    dirs.push(root)

    const tree = scanDir(pages, '', { extensions: ['vue'], exclude: [], baseRoute: '' })
    const code = generateVueRoutes(tree, {
      root,
      pagesDir: pages,
      outFile: path.join(root, 'src', 'routes.ts'),
      framework: 'vue',
      importMode: 'lazy',
      baseRoute: '',
    })

    expect(code).toContain(':pathMatch(.*)*')
  })
})

describe('generate.ts manifest with virtual route children', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('includes children from virtual routes in SSR manifest', () => {
    const { root } = makeTmpPages({
      'index.tsx': 'export default function H() { return null }',
      'admin.tsx': 'export default function A() { return null }',
    })
    dirs.push(root)

    const resolved = resolveOptions(root, {
      framework: 'react',
      ssrManifest: true,
      virtualRoutes: [
        {
          path: '/settings',
          component: path.join(root, 'src/pages/admin.tsx'),
          children: [
            { path: 'profile', component: path.join(root, 'src/pages/index.tsx') },
          ],
        },
      ],
    })
    runGeneration(resolved, () => {}, () => {})

    const manifestPath = resolved.outFile.replace(/\.ts$/, '.manifest.json')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    const settingsRoute = manifest.routes.find((r: any) => r.path === '/settings')
    expect(settingsRoute).toBeDefined()
    expect(settingsRoute.children).toBeDefined()
    expect(settingsRoute.children.length).toBeGreaterThan(0)
  })
})

describe('codegen modal routes sync mode and meta', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('generates modal routes with sync imports', () => {
    const { root, pages } = makeTmpPages({
      'index.tsx': 'export default function H() {}',
      '+login.tsx': 'export default function Login() {}',
    })
    dirs.push(root)

    const tree = scanDir(pages, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const code = generateReactRoutes(tree, {
      root,
      pagesDir: pages,
      outFile: path.join(root, 'src', 'routes.ts'),
      framework: 'react',
      importMode: 'sync',
      baseRoute: '',
    })

    expect(code).toContain('export const modalRoutes')
    expect(code).toContain('component:')
  })

  it('includes meta on modal routes', () => {
    const { root, pages } = makeTmpPages({
      'index.tsx': 'export default function H() {}',
      '+login.tsx': `export const meta = { title: 'Login' }\nexport default function Login() {}`,
    })
    dirs.push(root)

    const tree = scanDir(pages, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const code = generateReactRoutes(tree, {
      root,
      pagesDir: pages,
      outFile: path.join(root, 'src', 'routes.ts'),
      framework: 'react',
      importMode: 'lazy',
      baseRoute: '',
    })

    expect(code).toContain('export const modalRoutes')
    expect(code).toContain('meta:')
    expect(code).toContain('Login')
  })
})

describe('generate.ts resolveOptions edge cases', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('throws when outFile is .cjs', () => {
    expect(() => resolveOptions('/tmp', { outFile: 'src/routes.cjs' })).toThrow(/ESM/)
  })

  it('throws when outFile is inside pagesDir', () => {
    expect(() => resolveOptions('/tmp', {
      pagesDir: 'src/pages',
      outFile: 'src/pages/routes.ts',
    })).toThrow(/outside/)
  })
})

describe('generate.ts output lock edge cases', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('handles pre-existing stale lock file from dead process', () => {
    const { root } = makeTmpPages({ 'index.tsx': 'export default function H() {}' })
    dirs.push(root)

    const outFile = path.join(root, 'src', 'routes.ts')
    const lockFile = `${outFile}.vite-file-router.lock`
    fs.mkdirSync(path.dirname(lockFile), { recursive: true })
    fs.writeFileSync(lockFile, JSON.stringify({
      pid: 999999999,
      token: 'stale-token',
      createdAt: Date.now() - 60000,
    }))

    const resolved = resolveOptions(root, { pagesDir: 'src/pages', outFile: 'src/routes.ts' })
    const { changed } = runGeneration(resolved, () => {}, () => {})
    expect(changed).toBe(true)
    expect(fs.existsSync(outFile)).toBe(true)
  })

  it('handles corrupted lock file (invalid JSON)', () => {
    const { root } = makeTmpPages({ 'index.tsx': 'export default function H() {}' })
    dirs.push(root)

    const outFile = path.join(root, 'src', 'routes.ts')
    const lockFile = `${outFile}.vite-file-router.lock`
    fs.mkdirSync(path.dirname(lockFile), { recursive: true })
    fs.writeFileSync(lockFile, 'not valid json {{{')

    const oldMtime = fs.statSync(lockFile).mtimeMs
    const past = new Date(oldMtime - 120000)
    fs.utimesSync(lockFile, past, past)

    const resolved = resolveOptions(root, { pagesDir: 'src/pages', outFile: 'src/routes.ts' })
    const { changed } = runGeneration(resolved, () => {}, () => {})
    expect(changed).toBe(true)
  })
})

describe('merge-routes custom children inside layout (line 240)', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('preserves user-added route inside children array on regen', () => {
    const { root, pages } = makeTmpPages({
      '_layout.tsx': 'export default function L() { return null }',
      'index.tsx': 'export default function H() { return null }',
      'about.tsx': 'export default function A() { return null }',
    })
    dirs.push(root)

    const resolved = resolveOptions(root, { pagesDir: 'src/pages', outFile: 'src/routes.ts' })
    runGeneration(resolved, () => {}, () => {})

    let content = fs.readFileSync(resolved.outFile, 'utf-8')
    const customChild = `      {\n        path: "/custom-admin",\n        element: null,\n      },`
    content = content.replace(
      /(\s*)(children: \[)/,
      `$1$2\n${customChild}`
    )
    fs.writeFileSync(resolved.outFile, content)

    fs.writeFileSync(path.join(pages, 'contact.tsx'), 'export default function C() { return null }')
    invalidateScanCache()
    runGeneration(resolved, () => {}, () => {})

    const after = fs.readFileSync(resolved.outFile, 'utf-8')
    expect(after).toContain('/custom-admin')
    expect(after).toContain('contact')
  })
})

describe('merge-routes manifest corruption (line 102)', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('handles manifest with valid base64 but invalid JSON content', () => {
    const { root, pages } = makeTmpPages({
      'index.tsx': 'export default function H() { return null }',
    })
    dirs.push(root)

    const resolved = resolveOptions(root, { pagesDir: 'src/pages', outFile: 'src/routes.ts' })
    runGeneration(resolved, () => {}, () => {})

    let content = fs.readFileSync(resolved.outFile, 'utf-8')
    const invalidBase64 = Buffer.from('not valid json {{{{').toString('base64')
    content = content.replace(
      /\/\* @vite-file-router-manifest [A-Za-z0-9+/=]+ \*\/\s*$/,
      `/* @vite-file-router-manifest ${invalidBase64} */\n`,
    )
    const userImport = "import { myHelper } from '@/utils/helpers'\n"
    content = content.replace('/* eslint-disable */', `/* eslint-disable */\n${userImport}`)
    fs.writeFileSync(resolved.outFile, content)

    fs.writeFileSync(path.join(pages, 'about.tsx'), 'export default function A() { return null }')
    invalidateScanCache()
    expect(() => runGeneration(resolved, () => {}, () => {})).not.toThrow()
    const after = fs.readFileSync(resolved.outFile, 'utf-8')
    expect(after).toContain('@vite-file-router-manifest')
    expect(after).toContain('about')
    expect(after).toContain('myHelper')
  })
})
