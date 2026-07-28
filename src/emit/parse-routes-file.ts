import { parse } from '@babel/parser'
import { createHash } from 'node:crypto'

/** Normalize import path for stable RouteId comparison. */
export function normalizeRouteId(importPath: string): string {
  return importPath.replace(/\\/g, '/')
}

/** @deprecated Route identity is no longer coupled to a directory named `pages`. */
export function isPagesImport(importPath: string): boolean {
  return importPath.startsWith('.') || importPath.startsWith('/')
}

function parseRoutesModule(content: string) {
  return parse(content, {
    sourceType: 'module',
    allowAwaitOutsideFunction: true,
    attachComment: true,
    tokens: true,
    plugins: ['typescript', 'jsx', 'decorators-legacy'],
  }) as any
}

interface SemanticIndex {
  tokens: any[]
  comments: any[]
}

function lowerBound(items: any[], position: number): number {
  let low = 0
  let high = items.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if ((items[middle].start ?? 0) < position) low = middle + 1
    else high = middle
  }
  return low
}

function rangeFingerprint(index: SemanticIndex, start: number, end: number): string {
  const hash = createHash('sha256')
  for (let position = lowerBound(index.tokens, start); position < index.tokens.length; position++) {
    const token = index.tokens[position]
    if ((token.start ?? end) >= end) break
    if ((token.end ?? start) > end) continue
    hash.update(`${token.type?.label}:${JSON.stringify(token.value ?? token.type?.label)}|`)
  }
  hash.update('\n')
  for (let position = lowerBound(index.comments, start); position < index.comments.length; position++) {
    const comment = index.comments[position]
    if ((comment.start ?? end) >= end) break
    if ((comment.end ?? start) > end) continue
    hash.update(`${comment.type}:${comment.value}|`)
  }
  return hash.digest('base64url').slice(0, 22)
}

function unwrapExpression(node: any): any {
  let current = node
  while (
    current
    && ['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'TypeCastExpression'].includes(current.type)
  ) current = current.expression
  return current
}

function propertyKey(property: any, spreadIndex: number): string | null {
  if (property.type === 'SpreadElement') return `...${spreadIndex}`
  if (property.computed) return `[computed:${spreadIndex}]`
  if (property.key?.type === 'Identifier') return property.key.name
  if (property.key?.type === 'StringLiteral' || property.key?.type === 'NumericLiteral') {
    return String(property.key.value)
  }
  return null
}

function findRoutesDeclaration(ast: any): { declaration: any; array: any } | null {
  for (const statement of ast.program.body) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
    if (declaration?.type !== 'VariableDeclaration') continue
    for (const item of declaration.declarations) {
      if (item.id?.type !== 'Identifier' || item.id.name !== 'routes') continue
      const value = unwrapExpression(item.init)
      if (value?.type === 'ArrayExpression') return { declaration: statement, array: value }
    }
  }
  return null
}

export type TopLevelStatementKind =
  | 'import'
  | 'routes-declaration'
  | 'routes-default-export'
  | 'legacy-generated-type'
  | 'custom'

function topLevelStatementKind(statement: any, routesDeclaration: any): TopLevelStatementKind {
  if (statement === routesDeclaration) return 'routes-declaration'
  if (statement.type === 'ImportDeclaration') return 'import'
  if (
    statement.type === 'ExportDefaultDeclaration'
    && statement.declaration?.type === 'Identifier'
    && statement.declaration.name === 'routes'
  ) return 'routes-default-export'
  const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
  if (
    (declaration?.type === 'TSTypeAliasDeclaration' || declaration?.type === 'TSInterfaceDeclaration')
    && (declaration.id?.name === 'FileRoute' || declaration.id?.name === 'RouteMeta')
  ) return 'legacy-generated-type'
  return 'custom'
}

function markerRouteId(content: string, start: number): string | null {
  const prefix = content.slice(Math.max(0, start - 512), start)
  const match = prefix.match(/\/\*\s*@file-route\s+("(?:\\.|[^"\\])*")\s*\*\/\s*$/)
  if (!match) return null
  try {
    return JSON.parse(match[1])
  } catch {
    return null
  }
}

function importBindings(ast: any): Map<string, string> {
  const bindings = new Map<string, string>()
  for (const statement of ast.program.body) {
    if (statement.type !== 'ImportDeclaration') continue
    const source = normalizeRouteId(statement.source.value)
    for (const specifier of statement.specifiers) bindings.set(specifier.local.name, source)
  }
  return bindings
}

function collectDynamicImports(node: any, paths: string[]): void {
  if (!node || typeof node !== 'object') return
  if (node.type === 'ImportExpression' && node.source?.type === 'StringLiteral') {
    paths.push(normalizeRouteId(node.source.value))
    return
  }
  if (
    node.type === 'CallExpression'
    && node.callee?.type === 'Import'
    && node.arguments?.[0]?.type === 'StringLiteral'
  ) {
    paths.push(normalizeRouteId(node.arguments[0].value))
    return
  }
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'start', 'end', 'leadingComments', 'innerComments', 'trailingComments'].includes(key)) continue
    if (Array.isArray(value)) for (const child of value) collectDynamicImports(child, paths)
    else collectDynamicImports(value, paths)
  }
}

function routeSourceIds(node: any, bindings: Map<string, string>): string[] {
  const paths: string[] = []
  let syncBinding: string | undefined
  for (let index = 0; index < node.properties.length; index++) {
    const property = node.properties[index]
    const key = propertyKey(property, index)
    if (key === 'children') continue
    collectDynamicImports(property, paths)
    if (
      (key === 'Component' || key === 'component')
      && property.type === 'ObjectProperty'
      && property.value?.type === 'Identifier'
    ) syncBinding = property.value.name
  }
  if (syncBinding) {
    const syncSource = bindings.get(syncBinding)
    if (syncSource) paths.push(syncSource)
  }
  return [...new Set(paths)]
}

function routeIdFromObject(node: any, bindings: Map<string, string>): string | null {
  return routeSourceIds(node, bindings)[0] ?? null
}

export interface RoutePropertyDescriptor {
  key: string
  source: string
  trailingComments?: string
  fingerprint: string
  start: number
  end: number
}

export interface AstRouteDescriptor {
  id: string | null
  markerId: string | null
  /** Import-derived identity retained for callers upgrading from pre-marker output. */
  sourceId: string | null
  sourceIds: string[]
  start: number
  end: number
  text: string
  properties: RoutePropertyDescriptor[]
  children: AstRouteDescriptor[]
}

export interface TopLevelStatementDescriptor {
  kind: TopLevelStatementKind
  source: string
  start: number
  end: number
  fingerprint: string
}

export interface ParsedRoutesModule {
  declaration: { start: number; end: number }
  array: { start: number; end: number }
  routes: AstRouteDescriptor[]
  imports: Array<{ source: string; start: number; end: number; text: string; fingerprint: string }>
  statements: TopLevelStatementDescriptor[]
}

function describeRoute(
  node: any,
  content: string,
  bindings: Map<string, string>,
  semanticIndex: SemanticIndex,
): AstRouteDescriptor {
  const properties: RoutePropertyDescriptor[] = []
  const children: AstRouteDescriptor[] = []
  let spreadIndex = 0
  for (let propertyIndex = 0; propertyIndex < node.properties.length; propertyIndex++) {
    const property = node.properties[propertyIndex]
    const key = propertyKey(property, spreadIndex++)
    if (!key) continue
    const leadingStart = (property.leadingComments ?? [])
      .map((comment: any) => comment.start)
      .filter((start: unknown): start is number => typeof start === 'number')
      .reduce((start: number, value: number) => Math.min(start, value), property.start)
    const trailingEnd = propertyIndex === node.properties.length - 1
      ? (property.trailingComments ?? [])
          .map((comment: any) => comment.end)
          .filter((end: unknown): end is number => typeof end === 'number')
          .reduce((end: number, value: number) => Math.max(end, value), property.end)
      : property.end
    const trailingComments = trailingEnd > property.end
      ? content.slice(property.end, trailingEnd).replace(/^[\t ]*,?/, '').trim()
      : ''
    properties.push({
      key,
      source: content.slice(leadingStart, property.end),
      ...(trailingComments ? { trailingComments } : {}),
      fingerprint: rangeFingerprint(semanticIndex, leadingStart, trailingEnd),
      start: leadingStart,
      end: trailingEnd,
    })
    if (key !== 'children' || property.type !== 'ObjectProperty') continue
    const value = unwrapExpression(property.value)
    if (value?.type !== 'ArrayExpression') continue
    for (const element of value.elements) {
      if (element?.type === 'ObjectExpression') children.push(describeRoute(element, content, bindings, semanticIndex))
    }
  }
  const sourceIds = routeSourceIds(node, bindings)
  const sourceId = sourceIds[0] ?? null
  const markerId = markerRouteId(content, node.start)
  return {
    id: markerId ?? sourceId,
    markerId,
    sourceId,
    sourceIds,
    start: node.start,
    end: node.end,
    text: content.slice(node.start, node.end),
    properties,
    children,
  }
}

export function parseRoutesFile(content: string): ParsedRoutesModule | null {
  try {
    const ast = parseRoutesModule(content)
    const found = findRoutesDeclaration(ast)
    if (!found) return null
    const bindings = importBindings(ast)
    const semanticIndex = {
      tokens: ast.tokens ?? [],
      comments: ast.comments ?? [],
    }
    const routes = found.array.elements
      .filter((element: any) => element?.type === 'ObjectExpression')
      .map((element: any) => describeRoute(element, content, bindings, semanticIndex))
    const imports = ast.program.body
      .filter((statement: any) => statement.type === 'ImportDeclaration')
      .map((statement: any) => ({
        source: normalizeRouteId(statement.source.value),
        start: statement.start,
        end: statement.end,
        text: content.slice(statement.start, statement.end),
        fingerprint: rangeFingerprint(semanticIndex, statement.start, statement.end),
      }))
    const statements = ast.program.body.map((statement: any) => ({
      kind: topLevelStatementKind(statement, found.declaration),
      source: content.slice(statement.start, statement.end),
      start: statement.start,
      end: statement.end,
      fingerprint: rangeFingerprint(semanticIndex, statement.start, statement.end),
    }))
    return {
      declaration: { start: found.declaration.start, end: found.declaration.end },
      array: { start: found.array.start, end: found.array.end },
      routes,
      imports,
      statements,
    }
  } catch {
    return null
  }
}

/** Extract dynamic `import("...")` paths from a route object slice. */
export function extractImportPathsFromRouteObject(text: string): string[] {
  try {
    const ast = parseRoutesModule(`const __route = ${text}`)
    const declaration = ast.program.body[0]?.declarations?.[0]
    const paths: string[] = []
    collectDynamicImports(declaration?.init, paths)
    return paths
  } catch {
    return []
  }
}

/** Primary RouteId for a route object — generated marker or page/layout import path. */
export function primaryRouteId(routeText: string, fileContent: string): string | null {
  const marker = markerRouteId(routeText, routeText.indexOf('{'))
  if (marker) return marker
  const dynamic = extractImportPathsFromRouteObject(routeText)[0]
  if (dynamic) return dynamic
  try {
    const file = parseRoutesModule(fileContent)
    const wrapped = parseRoutesModule(`const __route = ${routeText}`)
    const node = wrapped.program.body[0]?.declarations?.[0]?.init
    return node?.type === 'ObjectExpression' ? routeIdFromObject(node, importBindings(file)) : null
  } catch {
    return null
  }
}

export function extractPrelude(content: string): string {
  const parsed = parseRoutesFile(content)
  return parsed ? content.slice(0, parsed.declaration.start) : ''
}

export function extractRoutesArraySection(content: string): {
  prefix: string
  body: string
  suffix: string
} | null {
  const parsed = parseRoutesFile(content)
  if (!parsed) return null
  return {
    prefix: content.slice(0, parsed.array.start + 1),
    body: content.slice(parsed.array.start + 1, parsed.array.end - 1),
    suffix: content.slice(parsed.array.end - 1),
  }
}

/** Split an array body into top-level `{ ... }` route object slices. */
export function splitTopLevelRouteObjects(body: string): string[] {
  try {
    const ast = parseRoutesModule(`const __routes = [${body}]`)
    const array = ast.program.body[0]?.declarations?.[0]?.init
    return (array?.elements ?? [])
      .filter((element: any) => element?.type === 'ObjectExpression')
      .map((element: any) => body.slice(element.start - 'const __routes = ['.length, element.end - 'const __routes = ['.length))
  } catch {
    return []
  }
}

export interface RouteObjectOffset {
  text: string
  start: number
  end: number
}

export function splitTopLevelRouteObjectsWithOffsets(body: string, offsetBase: number): RouteObjectOffset[] {
  const objects = splitTopLevelRouteObjects(body)
  let cursor = 0
  return objects.map((text) => {
    const relative = body.indexOf(text, cursor)
    cursor = relative + text.length
    return { text, start: offsetBase + relative, end: offsetBase + relative + text.length }
  })
}

export interface PositionedRouteSlice {
  id: string | null
  routeId: string | null
  start: number
  end: number
  text: string
  hasChildren: boolean
}

export function collectPositionedRouteSlices(content: string): PositionedRouteSlice[] {
  const parsed = parseRoutesFile(content)
  if (!parsed) return []
  const slices: PositionedRouteSlice[] = []
  const visit = (routes: AstRouteDescriptor[]) => {
    for (const route of routes) {
      slices.push({
        id: route.sourceId ?? route.id,
        routeId: route.id,
        start: route.start,
        end: route.end,
        text: route.text,
        hasChildren: route.children.length > 0,
      })
      visit(route.children)
    }
  }
  visit(parsed.routes)
  return slices
}

export interface RouteChildrenSlice {
  head: string
  children: string[]
  close: string
}

export function extractChildrenSlice(routeText: string): RouteChildrenSlice | null {
  try {
    const ast = parseRoutesModule(`const __route = ${routeText}`)
    const route = ast.program.body[0]?.declarations?.[0]?.init
    if (route?.type !== 'ObjectExpression') return null
    const property = route.properties.find((item: any, index: number) => propertyKey(item, index) === 'children')
    const array = unwrapExpression(property?.value)
    if (array?.type !== 'ArrayExpression') return null
    const prefixLength = 'const __route = '.length
    return {
      head: routeText.slice(0, property.start - prefixLength).trimEnd(),
      children: array.elements
        .filter((element: any) => element?.type === 'ObjectExpression')
        .map((element: any) => routeText.slice(element.start - prefixLength, element.end - prefixLength)),
      close: routeText.slice(property.end - prefixLength).replace(/^,\s*/, ''),
    }
  } catch {
    return null
  }
}

export function collectRouteSliceMap(content: string): Map<string, string> {
  const map = new Map<string, string>()
  const parsed = parseRoutesFile(content)
  if (!parsed) return map
  const visit = (routes: AstRouteDescriptor[]) => {
    for (const route of routes) {
      if (route.id) map.set(route.id, route.text)
      for (const sourceId of route.sourceIds) map.set(sourceId, route.text)
      visit(route.children)
    }
  }
  visit(parsed.routes)
  return map
}

export function extractImportLines(prelude: string): string[] {
  try {
    const ast = parseRoutesModule(prelude)
    return ast.program.body
      .filter((statement: any) => statement.type === 'ImportDeclaration')
      .map((statement: any) => prelude.slice(statement.start, statement.end))
  } catch {
    return []
  }
}
