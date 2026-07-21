import type { RouteDiagnostic, RouteNode } from '../types'

interface PageEntry {
  urlPath: string
  filePath: string
}

function collectPages(node: RouteNode, pages: PageEntry[] = []): PageEntry[] {
  for (const child of node.children) {
    if (child.filePath && child.urlPath) {
      pages.push({ urlPath: child.urlPath, filePath: child.filePath })
    }
    if (child.children.length > 0) collectPages(child, pages)
  }
  return pages
}

function joinPath(base: string, segment: string): string {
  if (segment.startsWith('/')) return segment || '/'
  if (!segment) return base || '/'
  return `${base === '/' ? '' : base}/${segment}` || '/'
}

function collectVuePages(root: RouteNode): PageEntry[] {
  const pages: PageEntry[] = []

  const visit = (node: RouteNode, layoutBase: string | null, pendingSegments: string[]) => {
    let currentBase = layoutBase
    let currentSegments = pendingSegments

    if (node.layoutPath) {
      const override = node.routeBlock?.path
      const relativePath = [
        ...pendingSegments,
        override ?? node.path ?? '',
      ].filter(Boolean).join('/')
      currentBase = override?.startsWith('/')
        ? override
        : layoutBase === null
          ? (override ? `/${override}` : node.urlPath)
          : joinPath(layoutBase, relativePath)
      currentBase = currentBase || '/'
      currentSegments = []
    }

    for (const child of node.children) {
      if (child.filePath) {
        const override = child.routeBlock?.path
        const urlPath = currentBase === null
          ? override
            ? (override.startsWith('/') ? override : `/${override}`)
            : child.urlPath
          : joinPath(currentBase, [
              ...currentSegments,
              override ?? child.path ?? '',
            ].filter(Boolean).join('/'))
        pages.push({ urlPath, filePath: child.filePath })
        continue
      }

      const nextSegments = child.isGroup || child.layoutPath
        ? currentSegments
        : [...currentSegments, ...(child.path ? [child.path] : [])]
      visit(child, currentBase, nextSegments)
    }
  }

  visit(root, null, [])
  return pages
}

function optionalBasePath(urlPath: string): string | null {
  const match = urlPath.match(/^(.*)\/:[^/]+\?$/)
  if (!match) return null
  return match[1] || '/'
}

export function collectRouteDiagnostics(node: RouteNode, framework?: 'react' | 'vue'): RouteDiagnostic[] {
  const diagnostics: RouteDiagnostic[] = []
  const pages = framework === 'vue' ? collectVuePages(node) : collectPages(node)
  const byPath = new Map<string, PageEntry[]>()
  const byName = new Map<string, string[]>()

  const visitSourceErrors = (current: RouteNode) => {
    if (current.routeBlock?.name) {
      const routes = byName.get(current.routeBlock.name) ?? []
      routes.push(current.filePath ?? current.layoutPath ?? current.routeId)
      byName.set(current.routeBlock.name, routes)
    }
    if (current.scanError) {
      diagnostics.push({
        level: 'error',
        code: current.scanError.includes('<route>') ? 'invalid-route-block' : 'scan-error',
        message: `Failed to parse route source: ${current.scanError}`,
        routes: [current.filePath ?? current.layoutPath ?? current.routeId],
      })
    }
    if (framework === 'react') {
      const source = current.filePath ?? current.layoutPath
      const moduleExports = current.filePath ? current.moduleExports : current.layoutModuleExports
      if (source && current.meta && moduleExports?.handle) {
        diagnostics.push({
          level: 'error',
          code: 'conflicting-route-export',
          message: 'React route modules cannot define both static `meta` and a runtime `handle` export.',
          routes: [source],
        })
      }
      if (current.filePath && !current.hasDefaultExport) {
        diagnostics.push({
          level: 'error',
          code: 'missing-default-export',
          message: 'React page modules must export a default route component.',
          routes: [current.filePath],
        })
      }
      if (current.layoutPath && !current.hasDefaultExport) {
        diagnostics.push({
          level: 'error',
          code: 'missing-default-export',
          message: 'React layout modules must export a default route component.',
          routes: [current.layoutPath],
        })
      }
      if (current.layoutPath && current.loadingPath && !current.loadingHasDefaultExport) {
        diagnostics.push({
          level: 'error',
          code: 'missing-default-export',
          message: 'React loading modules used by layouts must export a default component.',
          routes: [current.loadingPath],
        })
      }
      if (current.layoutPath && current.errorPath && !current.errorHasDefaultExport) {
        diagnostics.push({
          level: 'error',
          code: 'missing-default-export',
          message: 'React error modules used by layouts must export a default component.',
          routes: [current.errorPath],
        })
      }
    }
    for (const child of current.children) visitSourceErrors(child)
  }
  visitSourceErrors(node)

  for (const page of pages) {
    const entries = byPath.get(page.urlPath) ?? []
    entries.push(page)
    byPath.set(page.urlPath, entries)
  }

  for (const [urlPath, entries] of byPath) {
    if (entries.length <= 1) continue
    diagnostics.push({
      level: 'error',
      code: 'duplicate-route',
      message: `Duplicate route "${urlPath}" generated by multiple page files.`,
      routes: entries.map((e) => e.filePath),
    })
  }

  for (const [name, routes] of byName) {
    if (routes.length <= 1) continue
    diagnostics.push({
      level: 'error',
      code: 'duplicate-route',
      message: `Duplicate route name "${name}" generated by multiple Vue route blocks.`,
      routes,
    })
  }

  for (const page of pages) {
    const basePath = optionalBasePath(page.urlPath)
    if (!basePath) continue
    const baseEntries = byPath.get(basePath) ?? []
    if (baseEntries.length === 0) continue
    diagnostics.push({
      level: 'warning',
      code: 'optional-route-overlap',
      message: `Optional route "${page.urlPath}" overlaps with "${basePath}".`,
      routes: [page.filePath, ...baseEntries.map((e) => e.filePath)],
    })
  }

  return diagnostics
}
