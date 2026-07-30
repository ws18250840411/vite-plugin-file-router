import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { generateReactRoutes, generateVueRoutes } from '../emit/codegen'
import { mergeRouteFiles } from '../emit/merge-routes'
import { resolveOptions, runGeneration, writeRouteFiles } from '../generate'
import { scanDir } from '../core/scanner'
import type { GenerateContext, RouteNode } from '../types'

function normalize(content: string): string {
  return content.replace(/\r\n/g, '\n').trimEnd() + '\n'
}

function makeReactCtx(root: string, opts: Partial<GenerateContext> = {}): GenerateContext {
  return {
    root: path.join(root, 'src'),
    pagesDir: path.join(root, 'src/pages'),
    outFile: path.join(root, 'src/routes.ts'),
    framework: 'react',
    importMode: 'lazy',
    baseRoute: '',
    outputLanguage: 'ts',
    typedRoutes: true,
    ...opts,
  }
}

function extractRoutePaths(content: string): string | null {
  const match = content.match(/export type RoutePaths = (.+)/)
  return match ? match[1] : null
}

describe('typed routes', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  function makeProject(pages: Record<string, string>, ext = 'tsx') {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-typed-'))
    dirs.push(root)
    const pagesDir = path.join(root, 'src', 'pages')
    fs.mkdirSync(pagesDir, { recursive: true })
    for (const [rel, src] of Object.entries(pages)) {
      const file = path.join(pagesDir, rel)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, src)
    }
    return root
  }

  function reactTree(root: string, baseRoute = ''): RouteNode {
    return scanDir(
      path.join(root, 'src/pages'),
      baseRoute,
      { extensions: ['tsx', 'ts', 'jsx', 'js'], exclude: [], baseRoute },
    )
  }

  function vueTree(root: string, baseRoute = ''): RouteNode {
    return scanDir(
      path.join(root, 'src/pages'),
      baseRoute,
      { extensions: ['vue'], exclude: [], baseRoute },
    )
  }

  describe('React codegen', () => {
    it('generates RoutePaths union with all page URLs', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'about.tsx': 'export default function A() { return null }',
        'user/[id].tsx': 'export default function U() { return null }',
        'dashboard/index.tsx': 'export default function D() { return null }',
        'dashboard/settings.tsx': 'export default function S() { return null }',
      })
      const ctx = makeReactCtx(root)
      const content = generateReactRoutes(reactTree(root), ctx)
      const routePaths = extractRoutePaths(content)

      expect(routePaths).not.toBeNull()
      expect(routePaths).toContain('"/"')
      expect(routePaths).toContain('"/about"')
      expect(routePaths).toContain('"/user/:id"')
      expect(routePaths).toContain('"/dashboard"')
      expect(routePaths).toContain('"/dashboard/settings"')
    })

    it('excludes catch-all and not-found routes from RoutePaths', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'about.tsx': 'export default function A() { return null }',
        'not-found.tsx': 'export default function N() { return null }',
        'docs/[...slug].tsx': 'export default function D() { return null }',
      })
      const ctx = makeReactCtx(root)
      const content = generateReactRoutes(reactTree(root), ctx)
      const routePaths = extractRoutePaths(content)

      expect(routePaths).not.toBeNull()
      expect(routePaths).toContain('"/"')
      expect(routePaths).toContain('"/about"')
      expect(routePaths).not.toContain('"*"')
      expect(routePaths).not.toContain('not-found')
      // Catch-all [...slug] should not appear as a typed path
      expect(routePaths).not.toMatch(/docs.*\*/)
    })

    it('includes baseRoute prefix in paths', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'about.tsx': 'export default function A() { return null }',
      })
      const ctx = makeReactCtx(root, { baseRoute: '/app' })
      const content = generateReactRoutes(reactTree(root, '/app'), ctx)
      const routePaths = extractRoutePaths(content)

      expect(routePaths).toContain('"/app"')
      expect(routePaths).toContain('"/app/about"')
    })

    it('generates RoutePaths = never for empty pages dir', () => {
      const root = makeProject({})
      const ctx = makeReactCtx(root)
      const content = generateReactRoutes(reactTree(root), ctx)

      expect(extractRoutePaths(content)).toBe('never')
    })
  })

  describe('Vue codegen', () => {
    it('generates RoutePaths union for Vue pages', () => {
      const root = makeProject({
        'index.vue': '<template><div>Home</div></template>',
        'about.vue': '<template><div>About</div></template>',
        'user/[id].vue': '<template><div>User</div></template>',
      }, 'vue')
      const ctx: GenerateContext = {
        root: path.join(root, 'src'),
        pagesDir: path.join(root, 'src/pages'),
        outFile: path.join(root, 'src/routes.ts'),
        framework: 'vue',
        importMode: 'lazy',
        baseRoute: '',
        outputLanguage: 'ts',
        typedRoutes: true,
      }
      const content = generateVueRoutes(vueTree(root), ctx)
      const routePaths = extractRoutePaths(content)

      expect(routePaths).not.toBeNull()
      expect(routePaths).toContain('"/"')
      expect(routePaths).toContain('"/about"')
      expect(routePaths).toContain('"/user/:id"')
    })
  })

  describe('disabled / JS output', () => {
    it('does not generate RoutePaths when typedRoutes is false', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'about.tsx': 'export default function A() { return null }',
      })
      const ctx = makeReactCtx(root, { typedRoutes: false })
      const content = generateReactRoutes(reactTree(root), ctx)

      expect(content).not.toContain('RoutePaths')
    })

    it('does not generate RoutePaths by default', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
      })
      const ctx = makeReactCtx(root, { typedRoutes: undefined })
      const content = generateReactRoutes(reactTree(root), ctx)

      expect(content).not.toContain('RoutePaths')
    })

    it('skips RoutePaths for JS output even when typedRoutes is true', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'about.tsx': 'export default function A() { return null }',
      })
      const ctx = makeReactCtx(root, { outputLanguage: 'js' })
      const content = generateReactRoutes(reactTree(root), ctx)

      expect(content).not.toContain('RoutePaths')
    })
  })

  describe('merge integration', () => {
    it('updates RoutePaths when a page is added', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'about.tsx': 'export default function A() { return null }',
      })
      const resolved = resolveOptions(root, { framework: 'react', typedRoutes: true })
      runGeneration(resolved, () => {}, () => {})
      const outFile = resolved.outFile
      const before = fs.readFileSync(outFile, 'utf-8')
      expect(extractRoutePaths(before)).toContain('"/about"')
      expect(extractRoutePaths(before)).not.toContain('"/contact"')

      // Add a new page
      fs.writeFileSync(path.join(root, 'src/pages/contact.tsx'), 'export default function C() { return null }')
      const resolved2 = resolveOptions(root, { framework: 'react', typedRoutes: true })
      runGeneration(resolved2, () => {}, () => {})

      const after = fs.readFileSync(outFile, 'utf-8')
      expect(extractRoutePaths(after)).toContain('"/contact"')
      expect(extractRoutePaths(after)).toContain('"/about"')
    })

    it('updates RoutePaths when a page is removed', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'about.tsx': 'export default function A() { return null }',
      })
      const resolved = resolveOptions(root, { framework: 'react', typedRoutes: true })
      runGeneration(resolved, () => {}, () => {})

      // Remove a page
      fs.unlinkSync(path.join(root, 'src/pages/about.tsx'))
      runGeneration(resolveOptions(root, { framework: 'react', typedRoutes: true }), () => {}, () => {})

      const after = fs.readFileSync(resolved.outFile, 'utf-8')
      expect(extractRoutePaths(after)).not.toContain('"/about"')
      expect(extractRoutePaths(after)).toContain('"/"')
    })

    it('adds RoutePaths when typedRoutes is enabled on an existing file', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'about.tsx': 'export default function A() { return null }',
      })
      // Generate without typedRoutes
      const resolved1 = resolveOptions(root, { framework: 'react' })
      runGeneration(resolved1, () => {}, () => {})
      const before = fs.readFileSync(resolved1.outFile, 'utf-8')
      expect(before).not.toContain('RoutePaths')

      // Regenerate with typedRoutes enabled
      const resolved2 = resolveOptions(root, { framework: 'react', typedRoutes: true })
      runGeneration(resolved2, () => {}, () => {})
      const after = fs.readFileSync(resolved2.outFile, 'utf-8')
      expect(extractRoutePaths(after)).toContain('"/about"')
    })

    it('removes RoutePaths when typedRoutes is disabled', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'about.tsx': 'export default function A() { return null }',
      })
      // Generate with typedRoutes
      const resolved1 = resolveOptions(root, { framework: 'react', typedRoutes: true })
      runGeneration(resolved1, () => {}, () => {})
      expect(fs.readFileSync(resolved1.outFile, 'utf-8')).toContain('RoutePaths')

      // Regenerate without typedRoutes
      const resolved2 = resolveOptions(root, { framework: 'react' })
      runGeneration(resolved2, () => {}, () => {})
      const after = fs.readFileSync(resolved2.outFile, 'utf-8')
      expect(after).not.toContain('RoutePaths')
    })

    it('preserves user custom type alongside RoutePaths through regen', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'about.tsx': 'export default function A() { return null }',
      })
      const resolved = resolveOptions(root, { framework: 'react', typedRoutes: true })
      runGeneration(resolved, () => {}, () => {})

      // User adds a custom type declaration
      const outFile = resolved.outFile
      const content = fs.readFileSync(outFile, 'utf-8')
      const withCustom = content.replace(
        'export const routes = [',
        'export type AppRoute = RoutePaths | "/custom"\n\nexport const routes = [',
      )
      fs.writeFileSync(outFile, withCustom)

      // Regenerate (add a page)
      fs.writeFileSync(path.join(root, 'src/pages/contact.tsx'), 'export default function C() { return null }')
      runGeneration(resolveOptions(root, { framework: 'react', typedRoutes: true }), () => {}, () => {})

      const after = fs.readFileSync(outFile, 'utf-8')
      expect(after).toContain('AppRoute')
      expect(after).toContain('"/custom"')
      expect(extractRoutePaths(after)).toContain('"/contact"')
    })
  })

  describe('RouteParams type generation', () => {
    function extractRouteParams(content: string): string | null {
      const match = content.match(/export interface RouteParams \{([\s\S]*?)\n\}/)
      return match ? match[1].trim() : null
    }

    it('generates RouteParams with param types for dynamic routes', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'about.tsx': 'export default function A() { return null }',
        'user/[id].tsx': 'export default function U() { return null }',
      })
      const ctx = makeReactCtx(root)
      const content = generateReactRoutes(reactTree(root), ctx)
      const params = extractRouteParams(content)

      expect(params).not.toBeNull()
      expect(params).toContain('"/": Record<string, never>')
      expect(params).toContain('"/about": Record<string, never>')
      expect(params).toContain('"/user/:id": { id: string }')
    })

    it('generates DynamicRoutePaths and StaticRoutePaths unions', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'about.tsx': 'export default function A() { return null }',
        'user/[id].tsx': 'export default function U() { return null }',
      })
      const ctx = makeReactCtx(root)
      const content = generateReactRoutes(reactTree(root), ctx)

      expect(content).toContain('export type DynamicRoutePaths = "/user/:id"')
      expect(content).toContain('export type StaticRoutePaths = "/" | "/about"')
    })

    it('handles optional params correctly', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'docs/[[slug]].tsx': 'export default function D() { return null }',
      })
      const ctx = makeReactCtx(root)
      const content = generateReactRoutes(reactTree(root), ctx)

      expect(content).toContain('slug?: string')
    })

    it('generates buildPath function', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'user/[id].tsx': 'export default function U() { return null }',
      })
      const ctx = makeReactCtx(root)
      const content = generateReactRoutes(reactTree(root), ctx)

      expect(content).toContain('export function buildPath')
      expect(content).toContain('DynamicRoutePaths')
      expect(content).toContain('RouteParams[P]')
    })

    it('does not generate RouteParams when typedRoutes is false', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'user/[id].tsx': 'export default function U() { return null }',
      })
      const ctx = makeReactCtx(root, { typedRoutes: false })
      const content = generateReactRoutes(reactTree(root), ctx)

      expect(content).not.toContain('RouteParams')
      expect(content).not.toContain('buildPath')
    })
  })

  describe('autoCodeSplitting', () => {
    it('layout mode makes layouts sync and pages lazy', () => {
      const root = makeProject({
        '_layout.tsx': 'export default function L() { return null }',
        'index.tsx': 'export default function H() { return null }',
        'about.tsx': 'export default function A() { return null }',
      })
      const ctx = makeReactCtx(root, { autoCodeSplitting: 'layout' })
      const content = generateReactRoutes(reactTree(root), ctx)

      expect(content).toMatch(/import \w+ from/)
      expect(content).toContain('lazy: async () => {')
    })

    it('route mode makes everything lazy', () => {
      const root = makeProject({
        '_layout.tsx': 'export default function L() { return null }',
        'index.tsx': 'export default function H() { return null }',
      })
      const ctx = makeReactCtx(root, { autoCodeSplitting: 'route' })
      const content = generateReactRoutes(reactTree(root), ctx)

      expect(content).not.toMatch(/^import \w+ from/m)
      expect(content).toContain('lazy: async () => {')
    })
  })

  describe('virtual routes', () => {
    it('merges virtual routes with filesystem routes', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
      })
      const resolved = resolveOptions(root, {
        framework: 'react',
        typedRoutes: true,
        virtualRoutes: [
          { path: '/admin', component: path.join(root, 'src/pages/index.tsx') },
        ],
      })
      runGeneration(resolved, () => {}, () => {})
      const output = fs.readFileSync(resolved.outFile, 'utf-8')

      expect(output).toContain('/admin')
      expect(extractRoutePaths(output)).toContain('"/"')
    })

    it('supports nested children in virtual routes', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'admin.tsx': 'export default function A() { return null }',
      })
      const resolved = resolveOptions(root, {
        framework: 'react',
        typedRoutes: true,
        virtualRoutes: [
          {
            path: '/settings',
            component: path.join(root, 'src/pages/admin.tsx'),
            children: [
              { path: 'profile', component: path.join(root, 'src/pages/index.tsx') },
              { path: 'account', component: path.join(root, 'src/pages/admin.tsx') },
            ],
          },
        ],
      })
      runGeneration(resolved, () => {}, () => {})
      const output = fs.readFileSync(resolved.outFile, 'utf-8')

      expect(output).toContain('/settings')
      expect(output).toContain('profile')
      expect(output).toContain('account')
    })
  })

  describe('modal routes', () => {
    it('generates modalRoutes export for +filename convention', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        '+login.tsx': 'export default function Login() { return null }',
        '+confirm.tsx': 'export default function Confirm() { return null }',
      })
      const ctx = makeReactCtx(root)
      const tree = reactTree(root)
      const content = generateReactRoutes(tree, ctx)

      expect(content).toContain('export const modalRoutes = [')
      expect(content).toContain('"/login"')
      expect(content).toContain('"/confirm"')
    })

    it('generates ModalPaths type when typedRoutes is enabled', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        '+login.tsx': 'export default function Login() { return null }',
      })
      const ctx = makeReactCtx(root, { typedRoutes: true })
      const tree = reactTree(root)
      const content = generateReactRoutes(tree, ctx)

      expect(content).toContain('export type ModalPaths = "/login"')
    })

    it('does not generate modalRoutes when no +files exist', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'about.tsx': 'export default function A() { return null }',
      })
      const ctx = makeReactCtx(root)
      const tree = reactTree(root)
      const content = generateReactRoutes(tree, ctx)

      expect(content).not.toContain('modalRoutes')
      expect(content).not.toContain('ModalPaths')
    })

    it('collects modals from subdirectories', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
      })
      fs.mkdirSync(path.join(root, 'src/pages/user'), { recursive: true })
      fs.writeFileSync(
        path.join(root, 'src/pages/user/+edit.tsx'),
        'export default function Edit() { return null }',
      )
      const ctx = makeReactCtx(root)
      const tree = reactTree(root)
      const content = generateReactRoutes(tree, ctx)

      expect(content).toContain('modalRoutes')
      expect(content).toContain('"/edit"')
    })
  })

  describe('i18n routes', () => {
    it('generates locale-prefixed paths in RoutePaths', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'about.tsx': 'export default function A() { return null }',
      })
      const ctx = makeReactCtx(root, {
        typedRoutes: true,
        i18n: { locales: ['en', 'zh'], defaultLocale: 'en' },
      })
      const content = generateReactRoutes(reactTree(root), ctx)

      expect(content).toContain('"/"')
      expect(content).toContain('"/zh"')
      expect(content).toContain('"/about"')
      expect(content).toContain('"/zh/about"')
      expect(content).not.toContain('"/en/about"')
    })

    it('generates Locale type and locale constants', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
      })
      const ctx = makeReactCtx(root, {
        typedRoutes: true,
        i18n: { locales: ['en', 'zh', 'ja'], defaultLocale: 'en' },
      })
      const content = generateReactRoutes(reactTree(root), ctx)

      expect(content).toContain('export type Locale = "en" | "zh" | "ja"')
      expect(content).toContain('export const defaultLocale: Locale = "en"')
      expect(content).toContain('export const locales: Locale[] = ["en","zh","ja"]')
    })

    it('prefixes all locales with strategy always', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'about.tsx': 'export default function A() { return null }',
      })
      const ctx = makeReactCtx(root, {
        typedRoutes: true,
        i18n: { locales: ['en', 'zh'], defaultLocale: 'en', strategy: 'always' },
      })
      const content = generateReactRoutes(reactTree(root), ctx)

      expect(content).toContain('"/en"')
      expect(content).toContain('"/zh"')
      expect(content).toContain('"/en/about"')
      expect(content).toContain('"/zh/about"')
      expect(content).not.toMatch(/RoutePaths.*"\/about"/)
    })
  })

  describe('search params', () => {
    it('generates SearchParams interface from page exports', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'user/[id].tsx': `export const searchParams = { tab: 'string', page: 'number' }\nexport default function U() { return null }`,
      })
      const ctx = makeReactCtx(root)
      const content = generateReactRoutes(reactTree(root), ctx)

      expect(content).toContain('export interface SearchParams {')
      expect(content).toContain('"/user/:id": { tab?: string; page?: number }')
    })

    it('does not generate SearchParams when no pages export searchParams', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'about.tsx': 'export default function A() { return null }',
      })
      const ctx = makeReactCtx(root)
      const content = generateReactRoutes(reactTree(root), ctx)

      expect(content).not.toContain('SearchParams')
    })
  })

  describe('route feature types', () => {
    it('generates LoaderRoutes/ActionRoutes when pages export loader/action', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'user/[id].tsx':
          'export function loader() { return {} }\nexport function action() {}\nexport default function U() { return null }',
      })
      const ctx = makeReactCtx(root)
      const tree = reactTree(root)
      tree.children[1].moduleExports = { loader: true, action: true }
      const content = generateReactRoutes(tree, ctx)

      expect(content).toContain('export type LoaderRoutes')
      expect(content).toContain('"/user/:id"')
      expect(content).toContain('export type ActionRoutes')
    })

    it('generates MiddlewareRoutes when pages export middleware', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'dashboard.tsx':
          'export const middleware = []\nexport default function D() { return null }',
      })
      const ctx = makeReactCtx(root)
      const tree = reactTree(root)
      tree.children[0].moduleExports = { middleware: true }
      const content = generateReactRoutes(tree, ctx)

      expect(content).toContain('export type MiddlewareRoutes')
      expect(content).toContain('"/dashboard"')
    })

    it('does not generate feature types when no exports detected', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'about.tsx': 'export default function A() { return null }',
      })
      const ctx = makeReactCtx(root)
      const content = generateReactRoutes(reactTree(root), ctx)

      expect(content).not.toContain('LoaderRoutes')
      expect(content).not.toContain('ActionRoutes')
      expect(content).not.toContain('MiddlewareRoutes')
    })
  })

  describe('route guards types', () => {
    it('generates RouteGuards and GuardedRoutes from meta.guards', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'admin.tsx': 'export const meta = { guards: ["auth", "admin"] }\nexport default function A() { return null }',
      })
      const ctx = makeReactCtx(root)
      const tree = reactTree(root)
      tree.children[0].meta = { guards: ['auth', 'admin'] }
      const content = generateReactRoutes(tree, ctx)

      expect(content).toContain('export interface RouteGuards')
      expect(content).toContain('"/admin"')
      expect(content).toContain('"auth"')
      expect(content).toContain('"admin"')
      expect(content).toContain('export type GuardedRoutes')
    })

    it('does not generate guards section when no meta.guards defined', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'about.tsx': 'export default function A() { return null }',
      })
      const ctx = makeReactCtx(root)
      const content = generateReactRoutes(reactTree(root), ctx)

      expect(content).not.toContain('RouteGuards')
      expect(content).not.toContain('GuardedRoutes')
    })
  })

  describe('redirect types', () => {
    it('generates typedRedirect helper when typedRoutes is enabled', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'user/[id].tsx': 'export default function U() { return null }',
      })
      const ctx = makeReactCtx(root)
      const content = generateReactRoutes(reactTree(root), ctx)

      expect(content).toContain('export type RedirectTarget')
      expect(content).toContain('export function typedRedirect')
    })
  })

  describe('ROUTES constant and TypedParams', () => {
    it('generates ROUTES constant with path keys', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'about.tsx': 'export default function A() { return null }',
        'user/[id].tsx': 'export default function U() { return null }',
      })
      const ctx = makeReactCtx(root)
      const content = generateReactRoutes(reactTree(root), ctx)

      expect(content).toContain('export const ROUTES = {')
      expect(content).toContain('HOME: "/"')
      expect(content).toContain('ABOUT: "/about"')
      expect(content).toContain('USER_$ID: "/user/:id"')
      expect(content).toContain('} as const')
    })

    it('generates TypedParams utility type', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'user/[id].tsx': 'export default function U() { return null }',
      })
      const ctx = makeReactCtx(root)
      const content = generateReactRoutes(reactTree(root), ctx)

      expect(content).toContain('export type TypedParams<P extends DynamicRoutePaths> = RouteParams[P]')
    })
  })

  describe('matchRoute helper', () => {
    it('generates matchRoute function for active navigation', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'user/[id].tsx': 'export default function U() { return null }',
      })
      const ctx = makeReactCtx(root)
      const content = generateReactRoutes(reactTree(root), ctx)

      expect(content).toContain('export function matchRoute')
      expect(content).toContain('pathname: string')
      expect(content).toContain('pattern: RoutePaths')
    })
  })

  describe('breadcrumb ancestors', () => {
    it('generates routeAncestors mapping for breadcrumb navigation', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'user/[id].tsx': 'export default function U() { return null }',
        'about.tsx': 'export default function A() { return null }',
      })
      const ctx = makeReactCtx(root)
      const content = generateReactRoutes(reactTree(root), ctx)

      expect(content).toContain('export const routeAncestors')
      expect(content).toContain('"/": ["/"]')
      expect(content).toContain('"/about": ["/", "/about"]')
    })
  })

  describe('sitemap generation', () => {
    it('generates valid sitemap XML for static routes', async () => {
      const { generateSitemap } = await import('../sitemap')
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'about.tsx': 'export default function A() { return null }',
        'user/[id].tsx': 'export default function U() { return null }',
      })
      const tree = reactTree(root)
      const xml = generateSitemap(tree, { baseUrl: 'https://example.com' })

      expect(xml).toContain('<?xml version="1.0"')
      expect(xml).toContain('<loc>https://example.com/</loc>')
      expect(xml).toContain('<loc>https://example.com/about</loc>')
      expect(xml).not.toContain(':id')
    })

    it('excludes specified paths', async () => {
      const { generateSitemap } = await import('../sitemap')
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'admin.tsx': 'export default function A() { return null }',
      })
      const tree = reactTree(root)
      const xml = generateSitemap(tree, {
        baseUrl: 'https://example.com',
        exclude: ['/admin'],
      })

      expect(xml).toContain('<loc>https://example.com/</loc>')
      expect(xml).not.toContain('/admin')
    })
  })

  describe('SSR manifest', () => {
    it('generates route-manifest.json when ssrManifest is true', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'about.tsx': 'export default function A() { return null }',
      })
      const resolved = resolveOptions(root, {
        framework: 'react',
        ssrManifest: true,
      })
      runGeneration(resolved, () => {}, () => {})

      const manifestPath = resolved.outFile.replace(/\.ts$/, '.manifest.json')
      expect(fs.existsSync(manifestPath)).toBe(true)

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
      expect(manifest.framework).toBe('react')
      expect(manifest.routes).toBeInstanceOf(Array)
      expect(manifest.routes.length).toBeGreaterThan(0)
      expect(manifest.routes.some((r: any) => r.path === '/')).toBe(true)
    })

    it('includes layout nodes and nested children in manifest', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'dashboard/_layout.tsx': 'export default function L() { return null }',
        'dashboard/index.tsx': 'export default function D() { return null }',
        'dashboard/stats.tsx': 'export default function S() { return null }',
      })
      const resolved = resolveOptions(root, {
        framework: 'react',
        ssrManifest: true,
      })
      runGeneration(resolved, () => {}, () => {})

      const manifestPath = resolved.outFile.replace(/\.ts$/, '.manifest.json')
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))

      const dashboardRoute = manifest.routes.find((r: any) =>
        r.component && r.component.includes('_layout'))
      expect(dashboardRoute).toBeDefined()
      expect(dashboardRoute.children).toBeInstanceOf(Array)
      expect(dashboardRoute.children.length).toBeGreaterThan(0)
    })

    it('does not generate manifest when ssrManifest is false', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
      })
      const resolved = resolveOptions(root, { framework: 'react' })
      runGeneration(resolved, () => {}, () => {})

      const manifestPath = resolved.outFile.replace(/\.ts$/, '.manifest.json')
      expect(fs.existsSync(manifestPath)).toBe(false)
    })

    it('includes loader, action, middleware flags in manifest entries', () => {
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'data.tsx': [
          'export async function loader() { return {} }',
          'export async function action() { return {} }',
          'export const middleware = [(req: any) => req]',
          'export default function D() { return null }',
        ].join('\n'),
      })
      const resolved = resolveOptions(root, {
        framework: 'react',
        ssrManifest: true,
      })
      runGeneration(resolved, () => {}, () => {})

      const manifestPath = resolved.outFile.replace(/\.ts$/, '.manifest.json')
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
      const dataRoute = manifest.routes.find((r: any) => r.path === '/data')
      expect(dataRoute).toBeDefined()
      expect(dataRoute.hasLoader).toBe(true)
      expect(dataRoute.hasAction).toBe(true)
      expect(dataRoute.hasMiddleware).toBe(true)
    })

    it('includes meta and prefetch in manifest entries', () => {
      const root = makeProject({
        'index.tsx': `export const meta = { title: 'Home', prefetch: 'intent' }\nexport default function H() { return null }`,
      })
      const resolved = resolveOptions(root, {
        framework: 'react',
        ssrManifest: true,
      })
      runGeneration(resolved, () => {}, () => {})

      const manifestPath = resolved.outFile.replace(/\.ts$/, '.manifest.json')
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
      const homeRoute = manifest.routes.find((r: any) => r.path === '/')
      expect(homeRoute).toBeDefined()
      expect(homeRoute.meta).toBeDefined()
      expect(homeRoute.meta.title).toBe('Home')
      expect(homeRoute.prefetch).toBe('intent')
    })

    it('flattens group nodes without layout or filePath in manifest', () => {
      const root = makeProject({
        '(app)/about.tsx': 'export default function A() { return null }',
        '(app)/contact.tsx': 'export default function C() { return null }',
      })
      const resolved = resolveOptions(root, {
        framework: 'react',
        ssrManifest: true,
      })
      runGeneration(resolved, () => {}, () => {})

      const manifestPath = resolved.outFile.replace(/\.ts$/, '.manifest.json')
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
      expect(manifest.routes.some((r: any) => r.path === '/about')).toBe(true)
      expect(manifest.routes.some((r: any) => r.path === '/contact')).toBe(true)
    })
  })

  describe('route inspector', () => {
    it('renders a tree of all routes', async () => {
      const { inspectRoutes } = await import('../inspect')
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'about.tsx': 'export default function A() { return null }',
        'user/[id].tsx': 'export default function U() { return null }',
      })
      const tree = reactTree(root)
      const output = inspectRoutes(tree, { colors: false })

      expect(output).toContain('/')
      expect(output).toContain('/about')
      expect(output).toContain('/user/:id')
      expect(output).toContain('3 routes')
    })

    it('shows modal routes in the output', async () => {
      const { inspectRoutes } = await import('../inspect')
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
      })
      const tree = reactTree(root)
      tree.modals = [{
        routeId: 'modal:+login',
        path: '/login',
        filePath: '/tmp/pages/+login.tsx',
        hasDefaultExport: true,
      }]
      const output = inspectRoutes(tree, { colors: false })

      expect(output).toContain('Modal Routes:')
      expect(output).toContain('/login')
      expect(output).toContain('1 modals')
    })

    it('renders with colors when requested', async () => {
      const { inspectRoutes } = await import('../inspect')
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
        'about.tsx': 'export default function A() { return null }',
      })
      const tree = reactTree(root)
      const output = inspectRoutes(tree, { colors: true })
      expect(output).toContain('\x1b[32m')
    })

    it('shows not-found marker', async () => {
      const { inspectRoutes } = await import('../inspect')
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
      })
      const tree = reactTree(root)
      tree.children[0].isNotFound = true
      const output = inspectRoutes(tree, { colors: false })
      expect(output).toContain('[404]')
    })

    it('shows group name', async () => {
      const { inspectRoutes } = await import('../inspect')
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
      })
      const tree = reactTree(root)
      tree.children[0].isGroup = true
      tree.children[0].groupName = 'auth'
      const output = inspectRoutes(tree, { colors: false })
      expect(output).toContain('(auth)')
    })

    it('shows search params', async () => {
      const { inspectRoutes } = await import('../inspect')
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
      })
      const tree = reactTree(root)
      tree.children[0].searchParams = { page: 'number', q: 'string' }
      const output = inspectRoutes(tree, { colors: false })
      expect(output).toContain('?page&q')
    })

    it('shows loader/action markers', async () => {
      const { inspectRoutes } = await import('../inspect')
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
      })
      const tree = reactTree(root)
      tree.children[0].moduleExports = { loader: true, action: true }
      const output = inspectRoutes(tree, { colors: false })
      expect(output).toContain('[loader]')
      expect(output).toContain('[action]')
    })

    it('shows parallel slots in the output', async () => {
      const { inspectRoutes } = await import('../inspect')
      const root = makeProject({
        'index.tsx': 'export default function H() { return null }',
      })
      const tree = reactTree(root)
      tree.slots = {
        sidebar: {
          routeId: 'slot:sidebar',
          path: null,
          urlPath: '',
          filePath: null,
          layoutPath: null,
          loadingPath: null,
          errorPath: null,
          hasDefaultExport: false,
          isGroup: false,
          groupName: null,
          children: [{
            routeId: 'page:sidebar/index',
            path: '/',
            urlPath: '/',
            filePath: '/tmp/pages/@sidebar/index.tsx',
            layoutPath: null,
            loadingPath: null,
            errorPath: null,
            hasDefaultExport: true,
            isGroup: false,
            groupName: null,
            children: [],
          }],
        },
      }
      const output = inspectRoutes(tree, { colors: false })

      expect(output).toContain('Parallel Slots:')
      expect(output).toContain('@sidebar')
      expect(output).toContain('1 slots')
    })
  })
})
