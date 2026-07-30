import { describe, expect, it } from 'vitest'

import { collectRouteDiagnostics } from '../core/diagnostics'
import type { RouteNode } from '../types'

function makeNode(overrides: Partial<RouteNode> = {}): RouteNode {
  return {
    routeId: 'root',
    path: null,
    urlPath: '',
    filePath: null,
    layoutPath: null,
    loadingPath: null,
    errorPath: null,
    hasDefaultExport: true,
    isGroup: false,
    groupName: null,
    children: [],
    ...overrides,
  }
}

function makePage(urlPath: string, filePath: string, overrides: Partial<RouteNode> = {}): RouteNode {
  return makeNode({
    routeId: `page:${filePath}`,
    path: urlPath.split('/').pop() || '/',
    urlPath,
    filePath,
    children: [],
    ...overrides,
  })
}

describe('path-parser edge cases', () => {
  it('normalizeBaseRoute handles base without leading slash', async () => {
    const { normalizeBaseRoute } = await import('../core/path-parser')
    expect(normalizeBaseRoute('app')).toBe('/app')
    expect(normalizeBaseRoute('app/')).toBe('/app')
  })

  it('normalizeBaseRoute handles base with leading slash', async () => {
    const { normalizeBaseRoute } = await import('../core/path-parser')
    expect(normalizeBaseRoute('/app')).toBe('/app')
    expect(normalizeBaseRoute('/app/')).toBe('/app')
  })

  it('normalizeBaseRoute returns empty for root', async () => {
    const { normalizeBaseRoute } = await import('../core/path-parser')
    expect(normalizeBaseRoute('/')).toBe('')
    expect(normalizeBaseRoute('')).toBe('')
  })
})

describe('resolveOptions validation', () => {
  it('throws when outFile is inside pagesDir', async () => {
    const { resolveOptions } = await import('../generate')
    expect(() => resolveOptions('/tmp/proj', {
      pagesDir: 'src/pages',
      outFile: 'src/pages/routes.ts',
    })).toThrow('outside')
  })

  it('throws for .cjs outFile', async () => {
    const { resolveOptions } = await import('../generate')
    expect(() => resolveOptions('/tmp/proj', {
      outFile: 'src/routes.cjs',
    })).toThrow('ESM')
  })
})

describe('collectRouteDiagnostics', () => {
  it('reports duplicate routes', () => {
    const root = makeNode({
      children: [
        makePage('/about', '/pages/about.tsx'),
        makePage('/about', '/pages/about-copy.tsx'),
      ],
    })
    const diags = collectRouteDiagnostics(root, 'react')
    expect(diags.some((d) => d.code === 'duplicate-route')).toBe(true)
  })

  it('reports optional route overlap', () => {
    const root = makeNode({
      children: [
        makePage('/blog', '/pages/blog.tsx'),
        makePage('/blog/:slug?', '/pages/blog/[[slug]].tsx'),
      ],
    })
    const diags = collectRouteDiagnostics(root, 'react')
    expect(diags.some((d) => d.code === 'optional-route-overlap')).toBe(true)
  })

  it('reports scan errors', () => {
    const root = makeNode({
      children: [
        makePage('/broken', '/pages/broken.tsx', {
          scanError: 'Unexpected token',
        }),
      ],
    })
    const diags = collectRouteDiagnostics(root, 'react')
    expect(diags.some((d) => d.code === 'scan-error')).toBe(true)
  })

  it('reports invalid route block error', () => {
    const root = makeNode({
      children: [
        makePage('/broken', '/pages/broken.vue', {
          scanError: 'Failed to parse <route> block: invalid JSON',
        }),
      ],
    })
    const diags = collectRouteDiagnostics(root, 'vue')
    expect(diags.some((d) => d.code === 'invalid-route-block')).toBe(true)
  })

  it('reports missing default export on page', () => {
    const root = makeNode({
      children: [
        makePage('/noexport', '/pages/noexport.tsx', {
          hasDefaultExport: false,
        }),
      ],
    })
    const diags = collectRouteDiagnostics(root, 'react')
    expect(diags.some((d) => d.code === 'missing-default-export')).toBe(true)
  })

  it('reports missing default export on layout', () => {
    const root = makeNode({
      children: [
        makeNode({
          routeId: 'layout:dashboard',
          layoutPath: '/pages/dashboard/_layout.tsx',
          hasDefaultExport: false,
          urlPath: '/dashboard',
          children: [
            makePage('/dashboard/index', '/pages/dashboard/index.tsx'),
          ],
        }),
      ],
    })
    const diags = collectRouteDiagnostics(root, 'react')
    expect(diags.some((d) => d.code === 'missing-default-export' && d.routes[0].includes('_layout'))).toBe(true)
  })

  it('reports conflicting meta and handle export', () => {
    const root = makeNode({
      children: [
        makePage('/conflict', '/pages/conflict.tsx', {
          meta: { title: 'test' },
          moduleExports: { handle: true },
        }),
      ],
    })
    const diags = collectRouteDiagnostics(root, 'react')
    expect(diags.some((d) => d.code === 'conflicting-route-export')).toBe(true)
  })

  it('reports missing default on loading module', () => {
    const root = makeNode({
      children: [
        makeNode({
          routeId: 'layout:section',
          layoutPath: '/pages/section/_layout.tsx',
          loadingPath: '/pages/section/loading.tsx',
          loadingHasDefaultExport: false,
          hasDefaultExport: true,
          urlPath: '/section',
          children: [],
        }),
      ],
    })
    const diags = collectRouteDiagnostics(root, 'react')
    expect(diags.some((d) => d.code === 'missing-default-export' && d.routes[0].includes('loading'))).toBe(true)
  })

  it('reports missing default on error module', () => {
    const root = makeNode({
      children: [
        makeNode({
          routeId: 'layout:section',
          layoutPath: '/pages/section/_layout.tsx',
          errorPath: '/pages/section/error.tsx',
          errorHasDefaultExport: false,
          hasDefaultExport: true,
          urlPath: '/section',
          children: [],
        }),
      ],
    })
    const diags = collectRouteDiagnostics(root, 'react')
    expect(diags.some((d) => d.code === 'missing-default-export' && d.routes[0].includes('error'))).toBe(true)
  })

  it('returns empty diagnostics for valid tree', () => {
    const root = makeNode({
      children: [
        makePage('/', '/pages/index.tsx'),
        makePage('/about', '/pages/about.tsx'),
      ],
    })
    const diags = collectRouteDiagnostics(root, 'react')
    expect(diags).toHaveLength(0)
  })

  it('reports duplicate Vue route names', () => {
    const root = makeNode({
      children: [
        makePage('/a', '/pages/a.vue', { routeBlock: { name: 'home' } }),
        makePage('/b', '/pages/b.vue', { routeBlock: { name: 'home' } }),
      ],
    })
    const diags = collectRouteDiagnostics(root, 'vue')
    expect(diags.some((d) => d.code === 'duplicate-route' && d.message.includes('name'))).toBe(true)
  })

  it('handles Vue routes with layout paths and nested children', () => {
    const root = makeNode({
      children: [
        makeNode({
          routeId: 'layout:admin',
          path: 'admin',
          layoutPath: '/pages/admin/_layout.vue',
          hasDefaultExport: true,
          urlPath: '/admin',
          children: [
            makePage('/admin/dashboard', '/pages/admin/dashboard.vue'),
            makePage('/admin/users', '/pages/admin/users.vue'),
          ],
        }),
      ],
    })
    const diags = collectRouteDiagnostics(root, 'vue')
    expect(diags).toHaveLength(0)
  })

  it('handles Vue route blocks with path overrides', () => {
    const root = makeNode({
      children: [
        makeNode({
          routeId: 'layout:section',
          path: 'section',
          layoutPath: '/pages/section/_layout.vue',
          hasDefaultExport: true,
          urlPath: '/custom',
          routeBlock: { path: '/custom' },
          children: [
            makePage('/custom/page', '/pages/section/page.vue'),
          ],
        }),
      ],
    })
    const diags = collectRouteDiagnostics(root, 'vue')
    expect(diags).toHaveLength(0)
  })

  it('handles route groups in diagnostics', () => {
    const root = makeNode({
      children: [
        makeNode({
          routeId: 'group:auth',
          path: null,
          urlPath: '',
          isGroup: true,
          groupName: 'auth',
          children: [
            makePage('/login', '/pages/(auth)/login.tsx'),
            makePage('/register', '/pages/(auth)/register.tsx'),
          ],
        }),
      ],
    })
    const diags = collectRouteDiagnostics(root, 'react')
    expect(diags).toHaveLength(0)
  })
})
