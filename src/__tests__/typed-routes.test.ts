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
})
