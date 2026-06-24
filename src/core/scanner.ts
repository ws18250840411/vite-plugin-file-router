import fs from 'node:fs'
import path from 'node:path'

import { hasDefaultExport, readStaticMeta } from './meta-reader'
import { readRouteModuleExports } from './route-module-reader'
import { mergeRouteMeta, readVueRouteBlock } from './vue-route-block'
import { isCatchAllSegment, isGroupDir, joinUrlPath, nameToSegment } from './path-parser'
import type { RouteDiagnostic, RouteNode } from '../types'

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

function buildExtRegex(extensions: string[]): RegExp {
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

function matchExclude(relPath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    const re = new RegExp(
      '^' + pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '<<<GLOBSTAR>>>')
        .replace(/\*/g, '[^/]*')
        .replace(/<<<GLOBSTAR>>>/g, '.*')
      + '$',
    )
    if (re.test(relPath.replace(/\\/g, '/'))) return true
  }
  return false
}

function readPageInfo(filePath: string) {
  try {
    const src = fs.readFileSync(filePath, 'utf-8')
    const routeBlockRaw = readVueRouteBlock(src)
    const meta = mergeRouteMeta(readStaticMeta(src), routeBlockRaw?.meta)
    const { meta: _blockMeta, ...routeBlockRest } = routeBlockRaw ?? {}
    return {
      hasDefaultExport: hasDefaultExport(src),
      meta,
      moduleExports: readRouteModuleExports(src),
      routeBlock: routeBlockRaw ? routeBlockRest : undefined,
    }
  } catch {
    return { hasDefaultExport: false, meta: undefined, moduleExports: undefined, routeBlock: undefined }
  }
}

function emptyNode(urlPath: string): RouteNode {
  return {
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
  urlPath: string,
  info: ReturnType<typeof readPageInfo>,
  importOverride?: 'sync' | 'lazy',
  isNotFound?: boolean,
): RouteNode {
  return {
    path: '',
    urlPath,
    filePath: absPath,
    layoutPath: null,
    loadingPath: null,
    errorPath: null,
    hasDefaultExport: info.hasDefaultExport,
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

export function scanDir(dir: string, urlBase: string, options: ScanOptions): RouteNode {
  const extRe = buildExtRegex(options.extensions)
  const relDir = options.baseRoute ? urlBase.replace(options.baseRoute, '') || '/' : urlBase || '/'

  if (!fs.existsSync(dir)) return emptyNode(urlBase || '/')

  let entries: string[]
  try {
    entries = fs.readdirSync(dir).sort()
  } catch {
    return emptyNode(urlBase || '/')
  }

  let layoutPath: string | null = null
  let loadingPath: string | null = null
  let errorPath: string | null = null

  for (const entry of entries) {
    if (!extRe.test(entry)) continue
    const name = stripExt(entry, extRe)
    const abs = path.join(dir, entry)
    if (name === LAYOUT_FILE) layoutPath = abs
    else if (name === LOADING_FILE) loadingPath = abs
    else if (name === ERROR_FILE) errorPath = abs
  }

  const indexNodes: RouteNode[] = []
  const pageNodes: RouteNode[] = []
  const dirNodes: RouteNode[] = []

  for (const entry of entries) {
    if (entry.startsWith('.')) continue
    const absPath = path.join(dir, entry)
    const relFromPages = path.relative(dir, absPath)

    let stat: fs.Stats
    try {
      stat = fs.statSync(absPath)
    } catch {
      continue
    }

    if (stat.isDirectory()) {
      if (entry.startsWith('_')) continue
      const rel = path.join(relDir === '/' ? '' : relDir, entry).replace(/\\/g, '/')
      if (matchExclude(rel.replace(/^\//, ''), options.exclude)) continue

      const group = isGroupDir(entry)
      const segment = group ? null : nameToSegment(entry)
      const childUrlBase = group
        ? urlBase
        : joinUrlPath(urlBase || '/', segment!)

      const childNode = scanDir(absPath, childUrlBase === '/' ? '' : childUrlBase, options)
      childNode.path = group ? null : entry
      childNode.urlPath = childUrlBase || '/'
      childNode.isGroup = group
      childNode.groupName = group ? entry.slice(1, -1) : null
      dirNodes.push(childNode)
      continue
    }

    if (!extRe.test(entry)) continue
    const rel = path.join(relDir === '/' ? '' : relDir, entry).replace(/\\/g, '/')
    if (matchExclude(rel.replace(/^\//, ''), options.exclude)) continue

    const rawName = stripExt(entry, extRe)
    if (rawName.startsWith('_') || rawName === LOADING_FILE || rawName === ERROR_FILE) continue

    const { cleanName: name, importOverride } = parseImportSuffix(rawName)
    const segment = nameToSegment(name)
    const info = readPageInfo(absPath)

      if (name === 'index') {
        indexNodes.push(makePageNode(absPath, urlBase || '/', info, importOverride))
      } else {
        const isNotFound = segment === '*' || name === 'not-found' || name === '404'
        const pageUrl = isCatchAllSegment(segment)
          ? segment
          : joinUrlPath(urlBase || '/', segment)
        const pageNode = makePageNode(absPath, pageUrl, info, importOverride, isNotFound)
        pageNode.path = segment
        pageNodes.push(pageNode)
      }
  }

  const catchAll = pageNodes.filter((n) => n.path === '*' || n.path === '*?')
  const regular = pageNodes.filter((n) => !isCatchAllSegment(n.path ?? ''))

  const layoutInfo = layoutPath ? readPageInfo(layoutPath) : null

  return {
    path: null,
    urlPath: urlBase || '/',
    filePath: null,
    layoutPath,
    loadingPath,
    errorPath,
    hasDefaultExport: layoutInfo?.hasDefaultExport ?? false,
    ...(layoutInfo?.moduleExports ? { layoutModuleExports: layoutInfo.moduleExports } : {}),
    isGroup: false,
    groupName: null,
    children: [...indexNodes, ...regular, ...dirNodes, ...catchAll],
  }
}

/** Collect all leaf page URL paths for typed routes. */
export function collectUrlPaths(node: RouteNode, paths: string[] = []): string[] {
  if (node.filePath && node.urlPath && !isCatchAllSegment(node.urlPath)) {
    paths.push(node.urlPath)
  }
  for (const child of node.children) collectUrlPaths(child, paths)
  return paths
}

export { collectRouteDiagnostics } from './diagnostics'
