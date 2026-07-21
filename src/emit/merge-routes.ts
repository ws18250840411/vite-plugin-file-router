import {
  type AstRouteDescriptor,
  type RoutePropertyDescriptor,
  parseRoutesFile,
} from './parse-routes-file'

const MANIFEST_RE = /\n?\/\*\s*@vite-file-router-manifest\s+([A-Za-z0-9+/=]+)\s*\*\/\s*$/
const MANIFEST_VERSION = 2

interface RouteBaseline {
  properties: Record<string, string>
  children: string[]
}

interface GeneratedManifest {
  version: number
  routes: Record<string, RouteBaseline>
  imports: string[]
  statements: string[]
}

export class RouteMergeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RouteMergeError'
  }
}

function flattenRoutes(routes: AstRouteDescriptor[], map = new Map<string, AstRouteDescriptor>()) {
  for (const route of routes) {
    if (route.id) map.set(route.id, route)
    flattenRoutes(route.children, map)
  }
  return map
}

function indexRouteAliases(routes: AstRouteDescriptor[], map = new Map<string, AstRouteDescriptor>()) {
  for (const route of routes) {
    if (route.id) map.set(route.id, route)
    for (const sourceId of route.sourceIds) map.set(sourceId, route)
    indexRouteAliases(route.children, map)
  }
  return map
}

function matchingRoute(
  route: AstRouteDescriptor,
  routes: Map<string, AstRouteDescriptor>,
): AstRouteDescriptor | undefined {
  return (route.id ? routes.get(route.id) : undefined)
    ?? route.sourceIds.map((sourceId) => routes.get(sourceId)).find(Boolean)
}

function routeBaseline(route: AstRouteDescriptor): RouteBaseline {
  return {
    properties: Object.fromEntries(
      route.properties
        .filter((property) => property.key !== 'children')
        .map((property) => [property.key, property.fingerprint]),
    ),
    children: route.children.flatMap((child) => child.id ? [child.id] : []),
  }
}

interface StatementDescriptor {
  source: string
  fingerprint: string
}

function customStatements(parsed: ReturnType<typeof parseRoutesFile>): StatementDescriptor[] {
  if (!parsed) return []
  return parsed.statements
    .filter((statement) => statement.kind === 'custom')
    .map((statement) => ({ source: statement.source, fingerprint: statement.fingerprint }))
}

function createManifest(content: string): GeneratedManifest {
  const parsed = parseRoutesFile(content)
  if (!parsed) throw new RouteMergeError('Freshly generated routes could not be parsed.')
  assertUniqueMarkers(parsed.routes, 'Generated routes')
  const routes: Record<string, RouteBaseline> = {}
  for (const [id, route] of flattenRoutes(parsed.routes)) routes[id] = routeBaseline(route)
  return {
    version: MANIFEST_VERSION,
    routes,
    imports: parsed.imports.map((item) => item.fingerprint),
    statements: customStatements(parsed).map((statement) => statement.fingerprint),
  }
}

function encodeManifest(manifest: GeneratedManifest): string {
  return Buffer.from(JSON.stringify(manifest), 'utf8').toString('base64')
}

function readManifest(content: string): GeneratedManifest | null {
  const match = content.match(MANIFEST_RE)
  if (!match) return null
  try {
    const manifest = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8')) as unknown
    return isGeneratedManifest(manifest) ? manifest : null
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isGeneratedManifest(value: unknown): value is GeneratedManifest {
  if (!isRecord(value) || value.version !== MANIFEST_VERSION) return false
  if (!isRecord(value.routes) || !Array.isArray(value.imports) || !Array.isArray(value.statements)) return false
  if (!value.imports.every((item) => typeof item === 'string')) return false
  if (!value.statements.every((item) => typeof item === 'string')) return false
  return Object.values(value.routes).every((route) => {
    if (!isRecord(route) || !isRecord(route.properties) || !Array.isArray(route.children)) return false
    return Object.values(route.properties).every((item) => typeof item === 'string')
      && route.children.every((item) => typeof item === 'string')
  })
}

function stripManifest(content: string): string {
  return content.replace(MANIFEST_RE, '').trimEnd() + '\n'
}

function appendManifest(content: string, manifest: GeneratedManifest): string {
  return `${stripManifest(content)}\n/* @vite-file-router-manifest ${encodeManifest(manifest)} */\n`
}

export function attachGeneratedManifest(content: string): string {
  const base = stripManifest(content)
  return appendManifest(base, createManifest(base))
}

function commonIndent(lines: string[]): number {
  const values = lines
    .filter((line) => line.trim())
    .map((line) => line.match(/^\s*/)?.[0].length ?? 0)
  return values.length ? Math.min(...values) : 0
}

function reindent(source: string, indent: string): string {
  const lines = source.trim().split('\n')
  const remove = commonIndent(lines.slice(1))
  return lines
    .map((line, index) => {
      if (!line.trim()) return ''
      return indent + (index === 0 ? line.trimStart() : line.slice(Math.min(remove, line.length)))
    })
    .join('\n')
}

function propertyMap(route: AstRouteDescriptor | undefined): Map<string, RoutePropertyDescriptor> {
  return new Map((route?.properties ?? []).map((property) => [property.key, property]))
}

function resolveProperties(
  fresh: AstRouteDescriptor,
  current: AstRouteDescriptor | undefined,
  baseline: RouteBaseline | undefined,
): { properties: RoutePropertyDescriptor[]; deleted: Set<string> } {
  const freshMap = propertyMap(fresh)
  const currentMap = propertyMap(current)
  const resolved: RoutePropertyDescriptor[] = []
  const seen = new Set<string>()
  const deleted = new Set<string>()

  if (current) {
    for (const property of current.properties) {
      if (property.key === 'children') continue
      const oldFingerprint = baseline?.properties[property.key]
      const next = freshMap.get(property.key)
      const userChanged = !baseline || oldFingerprint === undefined || property.fingerprint !== oldFingerprint
      if (userChanged) resolved.push(property)
      else if (next) resolved.push(next)
      seen.add(property.key)
    }
    if (baseline) {
      for (const key of Object.keys(baseline.properties)) {
        if (!currentMap.has(key)) deleted.add(key)
      }
    }
  }

  for (const property of fresh.properties) {
    if (property.key === 'children' || seen.has(property.key) || deleted.has(property.key)) continue
    resolved.push(property)
  }
  return { properties: resolved, deleted }
}

function renderCustomRoute(route: AstRouteDescriptor, indent: string): string {
  return reindent(route.text, indent)
}

function renderRoute(
  fresh: AstRouteDescriptor,
  current: AstRouteDescriptor | undefined,
  baseline: GeneratedManifest | null,
  currentMap: Map<string, AstRouteDescriptor>,
  indent: string,
): string {
  const childIndent = indent + '  '
  const resolved = resolveProperties(fresh, current, fresh.id ? baseline?.routes[fresh.id] : undefined)
  const lines = [`${indent}/* @file-route ${JSON.stringify(fresh.id ?? 'generated:anonymous')} */`, `${indent}{`]

  for (const property of resolved.properties) {
    const rendered = reindent(property.source, childIndent)
    lines.push(rendered.endsWith(',') ? rendered : `${rendered},`)
    if (property.trailingComments) lines.push(reindent(property.trailingComments, childIndent))
  }

  const freshChildIds = new Set(fresh.children.flatMap((child) => child.id ? [child.id] : []))
  const baselineChildIds = new Set(fresh.id ? baseline?.routes[fresh.id]?.children ?? [] : [])
  const freshChildAliases = new Set(fresh.children.flatMap((child) => child.sourceIds))
  const customChildren = (current?.children ?? []).filter((child) => {
    return !child.id || (
      !freshChildIds.has(child.id)
      && !baselineChildIds.has(child.id)
      && !child.sourceIds.some((sourceId) => freshChildAliases.has(sourceId))
      && !child.markerId
    )
  })
  if (fresh.children.length > 0 || customChildren.length > 0) {
    lines.push(`${childIndent}children: [`)
    for (const child of fresh.children) {
      const currentChild = matchingRoute(child, currentMap)
      if (child.id && baselineChildIds.has(child.id) && !currentChild) continue
      const rendered = renderRoute(
        child,
        currentChild,
        baseline,
        currentMap,
        childIndent + '  ',
      )
      lines.push(rendered + ',')
    }

    for (const customChild of customChildren) {
      lines.push(renderCustomRoute(customChild, childIndent + '  ') + ',')
    }
    lines.push(`${childIndent}],`)
  }

  lines.push(`${indent}}`)
  return lines.join('\n')
}

function preservedImports(
  currentContent: string,
  fresh: NonNullable<ReturnType<typeof parseRoutesFile>>,
  current: NonNullable<ReturnType<typeof parseRoutesFile>>,
  baseline: GeneratedManifest | null,
): string[] {
  const freshFingerprints = new Set(fresh.imports.map((item) => item.fingerprint))
  const baselineImports = new Set(baseline?.imports ?? [])
  return current.imports
    .filter((item) => {
      const value = item.fingerprint
      if (freshFingerprints.has(value)) return false
      if (baseline) return !baselineImports.has(value)
      const isSimpleGenerated = /^import\s+(?:\{\s*default\s+as\s+)?[A-Za-z_$][\w$]*/.test(item.text)
        && item.source.startsWith('.')
      return !isSimpleGenerated || /\bfrom\s+['"](?!.*(?:pages|screens|routes)\/)/.test(item.text)
    })
    .map((item) => currentContent.slice(item.start, item.end))
}

function preservedStatements(
  current: NonNullable<ReturnType<typeof parseRoutesFile>>,
  baseline: GeneratedManifest | null,
): string[] {
  const baselineStatements = new Set(baseline?.statements ?? [])
  return customStatements(current)
    .filter((statement) => !baseline || !baselineStatements.has(statement.fingerprint))
    .map((statement) => statement.source)
}

/**
 * Three-way AST merge: baseline identifies user edits, current supplies exact user source,
 * and fresh supplies route structure plus untouched generated fields.
 */
export function mergeRouteFiles(freshContent: string, oldContent: string): string {
  if (freshContent === oldContent) return oldContent
  const freshBase = stripManifest(freshContent)
  const currentBase = stripManifest(oldContent)
  const freshManifest = readManifest(freshContent) ?? createManifest(freshBase)
  const fresh = parseRoutesFile(freshBase)
  const current = parseRoutesFile(currentBase)
  if (!fresh) throw new RouteMergeError('Freshly generated routes could not be parsed.')
  if (!current) {
    throw new RouteMergeError('Existing routes file is not valid JavaScript/TypeScript; refusing to overwrite it.')
  }

  assertUniqueMarkers(fresh.routes, 'Generated routes')
  assertUniqueMarkers(current.routes, 'Existing routes file')

  const baseline = readManifest(oldContent)
  const currentMap = indexRouteAliases(current.routes)
  const extraImports = preservedImports(currentBase, fresh, current, baseline)
  const extraStatements = preservedStatements(current, baseline)

  const beforeDeclaration = freshBase.slice(0, fresh.declaration.start).trimEnd()
  const declarationHead = freshBase.slice(fresh.declaration.start, fresh.array.start + 1)
  const suffix = freshBase.slice(fresh.array.end - 1)
  const additions = [...extraImports, ...extraStatements]
  const prelude = additions.length
    ? `${beforeDeclaration}\n${additions.join('\n')}\n\n`
    : `${beforeDeclaration}\n\n`
  const rendered: string[] = []
  for (const route of fresh.routes) {
    const currentRoute = matchingRoute(route, currentMap)
    if (route.id && baseline?.routes[route.id] && !currentRoute) continue
    rendered.push(renderRoute(
      route,
      currentRoute,
      baseline,
      currentMap,
      '  ',
    ))
  }
  const freshTopLevelIds = new Set(fresh.routes.flatMap((route) => route.id ? [route.id] : []))
  const freshTopLevelAliases = new Set(fresh.routes.flatMap((route) => route.sourceIds))
  const baselineTopLevelIds = new Set(baseline
    ? current.routes.flatMap((route) => route.id && baseline.routes[route.id] ? [route.id] : [])
    : [])
  for (const route of current.routes) {
    if (
      route.markerId
      || (route.id && (freshTopLevelIds.has(route.id) || baselineTopLevelIds.has(route.id)))
      || route.sourceIds.some((sourceId) => freshTopLevelAliases.has(sourceId))
    ) continue
    rendered.push(renderCustomRoute(route, '  '))
  }
  const renderedRoutes = rendered.join(',\n')

  const result = appendManifest(`${prelude}${declarationHead}\n${renderedRoutes}\n${suffix}`, freshManifest)
  if (!parseRoutesFile(stripManifest(result))) {
    throw new RouteMergeError('Merged routes would not be valid JavaScript/TypeScript; refusing to overwrite the existing file.')
  }
  return result
}

function assertUniqueMarkers(routes: AstRouteDescriptor[], label: string): void {
  const seen = new Set<string>()
  const visit = (items: AstRouteDescriptor[]) => {
    for (const route of items) {
      if (route.markerId) {
        if (seen.has(route.markerId)) {
          throw new RouteMergeError(`${label} contains duplicate @file-route marker ${JSON.stringify(route.markerId)}.`)
        }
        seen.add(route.markerId)
      }
      visit(route.children)
    }
  }
  visit(routes)
}
