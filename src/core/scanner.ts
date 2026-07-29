import { ROUTE_MODULE_EXPORT_NAMES } from './constants'
import fs from 'node:fs'
import path from 'node:path'

import { collectRuntimeExports, parseModule, readStaticMetaFromAst } from './module-ast'
import { mergeRouteMeta, readVueRouteBlockResult } from './vue-route-block'
import { isCatchAllSegment, isGroupDir, joinUrlPath, nameToSegment } from './path-parser'
import type { RouteNode } from '../types'

const LOADING_SUFFIXES: [string, 'sync' | 'lazy'][] = [['.sync', 'sync'], ['.lazy', 'lazy']]
const LAYOUT_FILE = '_layout'
const LOADING_FILE = 'loading'
const ERROR_FILE = 'error'

export interface ScanOptions {
  extensions: string[]
  exclude: string[]
  baseRoute: string
  warn?: (message: string) => void
}

interface ScanContext {
  extensionPattern: RegExp
  excludePatterns: RegExp[]
}

function buildExtRegex(extensions: string[]): RegExp {
  if (extensions.length === 0) throw new TypeError('`extensions` must contain at least one extension.')
  const escaped = extensions.map((e) => e.replace(/^\./, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(`\\.(${escaped.join('|')})$`, 'i')
}

function stripExt(name: string, extRe: RegExp): string {
  return name.replace(extRe, '')
}

function parseImportSuffix(rawName: string): { cleanName: string; importOverride?: 'sync' | 'lazy' } {
  let name = rawName
  let importOverride: 'sync' | 'lazy' | undefined
  for (const [suffix, value] of LOADING_SUFFIXES) {
    if (name.endsWith(suffix)) {
      importOverride = value
      name = name.slice(0, -suffix.length)
      break
    }
  }
  return { cleanName: name, ...(importOverride ? { importOverride } : {}) }
}

function compileExcludePatterns(patterns: string[]): RegExp[] {
  return patterns.map((pattern) => new RegExp(
    '^' + pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '<<<GLOBSTAR>>>')
      .replace(/\*/g, '[^/]*')
      .replace(/<<<GLOBSTAR>>>/g, '.*')
    + '$',
  ))
}

function matchExclude(relPath: string, patterns: RegExp[]): boolean {
  const normalized = relPath.replace(/\\/g, '/')
  return patterns.some((pattern) => pattern.test(normalized))
}

type PageInfo = ReturnType<typeof analyzePageSource>

const PAGE_INFO_CACHE_LIMIT = 50_000
const pageInfoCache = new Map<string, { signature: string; info: PageInfo }>()

export function invalidateScanCache(filePath?: string): void {
  if (filePath) pageInfoCache.delete(filePath)
  else pageInfoCache.clear()
}

function fileSignature(filePath: string): string {
  const stat = fs.statSync(filePath, { bigint: true })
  return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`
}

function analyzePageSource(filePath: string, src: string) {
  try {
    const isVue = filePath.toLowerCase().endsWith('.vue')
    const routeResult = isVue ? readVueRouteBlockResult(src, filePath) : {}
    const moduleSources = isVue ? routeResult.moduleSources ?? [routeResult.moduleSource ?? ''] : [src]
    const parsedModules = moduleSources.map((source) => parseModule(source, filePath))
    const runtimeExports = new Set(parsedModules.flatMap((parsed) => [...collectRuntimeExports(parsed)]))
    const moduleExports = Object.fromEntries(
      ROUTE_MODULE_EXPORT_NAMES.filter((name) => runtimeExports.has(name)).map((name) => [name, true]),
    )
    const routeBlockRaw = routeResult.block
    const exportedMeta = parsedModules.reduce(
      (meta, parsed) => ({ ...meta, ...readStaticMetaFromAst(parsed) }),
      {} as Record<string, unknown>,
    )
    const meta = mergeRouteMeta(Object.keys(exportedMeta).length ? exportedMeta : undefined, routeBlockRaw?.meta)
    const { meta: _blockMeta, ...routeBlockRest } = routeBlockRaw ?? {}
    return {
      hasDefaultExport: isVue || runtimeExports.has('default'),
      meta,
      moduleExports: Object.keys(moduleExports).length > 0 ? moduleExports : undefined,
      routeBlock: routeBlockRaw ? routeBlockRest : undefined,
      scanError: routeResult.error,
    }
  } catch (error) {
    return {
      hasDefaultExport: false,
      meta: undefined,
      moduleExports: undefined,
      routeBlock: undefined,
      scanError: error instanceof Error ? error.message : String(error),
    }
  }
}

function readPageInfo(filePath: string): PageInfo {
  let signature: string
  try {
    signature = fileSignature(filePath)
  } catch (error) {
    return {
      hasDefaultExport: false,
      meta: undefined,
      moduleExports: undefined,
      routeBlock: undefined,
      scanError: error instanceof Error ? error.message : String(error),
    }
  }

  const cached = pageInfoCache.get(filePath)
  if (cached?.signature === signature) {
    pageInfoCache.delete(filePath)
    pageInfoCache.set(filePath, cached)
    return cached.info
  }

  let source: string
  try {
    source = fs.readFileSync(filePath, 'utf-8')
  } catch (error) {
    return {
      hasDefaultExport: false,
      meta: undefined,
      moduleExports: undefined,
      routeBlock: undefined,
      scanError: error instanceof Error ? error.message : String(error),
    }
  }

  const info = analyzePageSource(filePath, source)
  pageInfoCache.set(filePath, { signature, info })
  while (pageInfoCache.size > PAGE_INFO_CACHE_LIMIT) {
    const oldest = pageInfoCache.keys().next().value
    if (oldest === undefined) break
    pageInfoCache.delete(oldest)
  }
  return info
}

function emptyNode(urlPath: string, routeId = 'dir:.'): RouteNode {
  return {
    routeId,
    path: null,
    urlPath,
    filePath: null,
    layoutPath: null,
    loadingPath: null,
    errorPath: null,
    hasDefaultExport: false,
    isGroup: false,
    groupName: null,
    children: [],
  }
}

function makePageNode(
  absPath: string,
  routeId: string,
  urlPath: string,
  info: PageInfo,
  importOverride?: 'sync' | 'lazy',
  isNotFound?: boolean,
): RouteNode {
  return {
    routeId,
    path: '',
    urlPath,
    filePath: absPath,
    layoutPath: null,
    loadingPath: null,
    errorPath: null,
    hasDefaultExport: info.hasDefaultExport,
    ...(info.scanError ? { scanError: info.scanError } : {}),
    ...(info.meta ? { meta: info.meta } : {}),
    ...(info.moduleExports ? { moduleExports: info.moduleExports } : {}),
    ...(info.routeBlock ? { routeBlock: info.routeBlock } : {}),
    ...(importOverride ? { importOverride } : {}),
    ...(isNotFound ? { isNotFound: true } : {}),
    isGroup: false,
    groupName: null,
    children: [],
  }
}

function normalizeRelative(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '') || '.'
}

function scanDirInternal(
  dir: string,
  urlBase: string,
  options: ScanOptions,
  scanRoot: string,
  context: ScanContext,
): RouteNode {
  const extRe = context.extensionPattern
  const relDir = normalizeRelative(path.relative(scanRoot, dir))
  const directoryRouteId = `dir:${relDir}`

  if (!fs.existsSync(dir)) return emptyNode(urlBase || '/', directoryRouteId)

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))
  } catch {
    return emptyNode(urlBase || '/', directoryRouteId)
  }

  let layoutPath: string | null = null
  let loadingPath: string | null = null
  let errorPath: string | null = null
  let layoutImportOverride: 'sync' | 'lazy' | undefined
  const conventionFiles = new Map<string, string[]>()

  for (const dirent of entries) {
    const entry = dirent.name
    if (!dirent.isFile()) continue
    if (!extRe.test(entry)) continue
    const parsedName = parseImportSuffix(stripExt(entry, extRe))
    const name = parsedName.cleanName
    const abs = path.join(dir, entry)
    if (name === LAYOUT_FILE || name === LOADING_FILE || name === ERROR_FILE) {
      const files = conventionFiles.get(name) ?? []
      files.push(abs)
      conventionFiles.set(name, files)
    }
    if (name === LAYOUT_FILE) {
      layoutPath = abs
      layoutImportOverride = parsedName.importOverride
    }
    else if (name === LOADING_FILE) loadingPath = abs
    else if (name === ERROR_FILE) errorPath = abs
  }

  const indexNodes: RouteNode[] = []
  const pageNodes: RouteNode[] = []
  const dirNodes: RouteNode[] = []

  for (const dirent of entries) {
    const entry = dirent.name
    if (entry.startsWith('.')) continue
    const absPath = path.join(dir, entry)
    if (dirent.isSymbolicLink()) continue

    if (dirent.isDirectory()) {
      if (entry.startsWith('_')) continue
      const rel = normalizeRelative(path.relative(scanRoot, absPath))
      if (matchExclude(rel, context.excludePatterns)) continue

      const group = isGroupDir(entry)
      const segment = group ? null : nameToSegment(entry)
      const childUrlBase = group
        ? urlBase
        : joinUrlPath(urlBase || '/', segment!)

      const childNode = scanDirInternal(absPath, childUrlBase === '/' ? '' : childUrlBase, options, scanRoot, context)
      childNode.path = segment
      childNode.urlPath = childUrlBase || '/'
      childNode.isGroup = group
      childNode.groupName = group ? entry.slice(1, -1) : null
      dirNodes.push(childNode)
      continue
    }

    if (!dirent.isFile()) continue
    if (!extRe.test(entry)) continue
    const rel = normalizeRelative(path.relative(scanRoot, absPath))
    if (matchExclude(rel, context.excludePatterns)) continue

    const rawName = stripExt(entry, extRe)
    if (rawName.startsWith('_') || rawName === LOADING_FILE || rawName === ERROR_FILE) continue

    const { cleanName: name, importOverride } = parseImportSuffix(rawName)
    const segment = nameToSegment(name)
    const info = readPageInfo(absPath)

    if (name === 'index') {
      indexNodes.push(makePageNode(absPath, `page:${rel}`, urlBase || '/', info, importOverride))
    } else {
      const isNotFound = segment === '*' || name === 'not-found' || name === '404'
      const pageUrl = joinUrlPath(urlBase || '/', segment)
      const pageNode = makePageNode(absPath, `page:${rel}`, pageUrl, info, importOverride, isNotFound)
      pageNode.path = segment
      pageNodes.push(pageNode)
    }
  }

  const catchAll = pageNodes.filter((n) => n.path === '*' || n.path === '*?')
  const regular = pageNodes.filter((n) => !isCatchAllSegment(n.path ?? ''))

  const layoutInfo = layoutPath ? readPageInfo(layoutPath) : null
  const loadingInfo = loadingPath ? readPageInfo(loadingPath) : null
  const errorInfo = errorPath ? readPageInfo(errorPath) : null
  const conventionErrors = [...conventionFiles]
    .filter(([, files]) => files.length > 1)
    .map(([name, files]) => `Multiple ${name} convention files found: ${files.join(', ')}`)
  const scanError = [layoutInfo?.scanError, loadingInfo?.scanError, errorInfo?.scanError, ...conventionErrors]
    .filter(Boolean)
    .join('\n') || undefined

  return {
    routeId: layoutPath
      ? `layout:${normalizeRelative(path.relative(scanRoot, layoutPath))}`
      : directoryRouteId,
    path: null,
    urlPath: urlBase || '/',
    filePath: null,
    layoutPath,
    loadingPath,
    errorPath,
    hasDefaultExport: layoutInfo?.hasDefaultExport ?? false,
    ...(loadingInfo ? { loadingHasDefaultExport: loadingInfo.hasDefaultExport } : {}),
    ...(errorInfo ? { errorHasDefaultExport: errorInfo.hasDefaultExport } : {}),
    ...(scanError ? { scanError } : {}),
    ...(layoutInfo?.meta ? { meta: layoutInfo.meta } : {}),
    ...(layoutInfo?.routeBlock ? { routeBlock: layoutInfo.routeBlock } : {}),
    ...(layoutInfo?.moduleExports ? { layoutModuleExports: layoutInfo.moduleExports } : {}),
    ...(layoutImportOverride ? { layoutImportOverride } : {}),
    isGroup: false,
    groupName: null,
    children: [...indexNodes, ...regular, ...dirNodes, ...catchAll],
  }
}

export function scanDir(dir: string, urlBase: string, options: ScanOptions): RouteNode {
  const context: ScanContext = {
    extensionPattern: buildExtRegex(options.extensions),
    excludePatterns: compileExcludePatterns(options.exclude),
  }
  return scanDirInternal(dir, urlBase, options, dir, context)
}

/** Collect all leaf page URL paths for typed routes. */
export function collectUrlPaths(node: RouteNode, paths: string[] = []): string[] {
  if (node.filePath && node.urlPath && !node.isNotFound && !isCatchAllSegment(node.path ?? '')) {
    paths.push(node.urlPath)
  }
  for (const child of node.children) collectUrlPaths(child, paths)
  return paths
}

export { collectRouteDiagnostics } from './diagnostics'
