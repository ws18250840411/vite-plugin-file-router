import fs from 'node:fs'
import path from 'node:path'

import { inferOutputLanguage } from './core/output-language'
import { collectRouteDiagnostics, collectUrlPaths, scanDir } from './core/scanner'
import { normalizeBaseRoute } from './core/path-parser'
import { generateReactRoutes, generateVueRoutes } from './emit/codegen'
import { mergeRouteFiles } from './emit/merge-routes'
import type { FileRouterOptions, GenerateContext, OutputLanguage, RouteNode } from './types'

const EMPTY_ROOT: RouteNode = {
  path: null,
  urlPath: '/',
  filePath: null,
  layoutPath: null,
  loadingPath: null,
  errorPath: null,
  hasDefaultExport: false,
  isGroup: false,
  groupName: null,
  children: [],
}

export interface ResolvedOptions {
  pagesDir: string
  outFile: string
  framework: 'react' | 'vue'
  extensions: string[]
  exclude: string[]
  baseRoute: string
  importMode: 'lazy' | 'sync'
  outputLanguage: OutputLanguage
  transformRoutes?: FileRouterOptions['transformRoutes']
  logDiagnostics: boolean
}

export function resolveOptions(root: string, options: FileRouterOptions = {}): ResolvedOptions {
  const framework = options.framework ?? 'react'
  const outFile = path.resolve(root, options.outFile ?? 'src/routes.ts')
  const outputLanguage = options.outputLanguage ?? inferOutputLanguage(outFile)

  return {
    pagesDir: path.resolve(root, options.pagesDir ?? 'src/pages'),
    outFile,
    framework,
    extensions: options.extensions ?? (framework === 'vue' ? ['vue'] : ['tsx', 'ts', 'jsx', 'js']),
    exclude: options.exclude ?? [],
    baseRoute: normalizeBaseRoute(options.baseRoute ?? ''),
    importMode: options.importMode ?? 'lazy',
    outputLanguage,
    transformRoutes: options.transformRoutes,
    logDiagnostics: options.logDiagnostics ?? true,
  }
}

export function scanPages(resolved: ResolvedOptions): RouteNode {
  if (!fs.existsSync(resolved.pagesDir)) return { ...EMPTY_ROOT }

  let root = scanDir(resolved.pagesDir, resolved.baseRoute, {
    extensions: resolved.extensions,
    exclude: resolved.exclude,
    baseRoute: resolved.baseRoute,
  })

  if (resolved.transformRoutes) {
    const result = resolved.transformRoutes(root)
    if (result) return result
  }
  return root
}

export function generateRouteFiles(resolved: ResolvedOptions, rootNode: RouteNode): {
  routesContent: string
} {
  const ctx: GenerateContext = {
    root: path.dirname(resolved.outFile),
    pagesDir: resolved.pagesDir,
    outFile: resolved.outFile,
    framework: resolved.framework,
    importMode: resolved.importMode,
    baseRoute: resolved.baseRoute,
    outputLanguage: resolved.outputLanguage,
    globalLoadingPath: rootNode.loadingPath,
    globalErrorPath: rootNode.errorPath,
  }

  const routesContent = resolved.framework === 'vue'
    ? generateVueRoutes(rootNode, ctx)
    : generateReactRoutes(rootNode, ctx)

  return { routesContent }
}

export function writeRouteFiles(
  resolved: ResolvedOptions,
  routesContent: string,
): boolean {
  const prev = fs.existsSync(resolved.outFile)
    ? fs.readFileSync(resolved.outFile, 'utf-8')
    : null

  const next = prev ? mergeRouteFiles(routesContent, prev) : routesContent

  if (prev === next) return false

  fs.mkdirSync(path.dirname(resolved.outFile), { recursive: true })
  fs.writeFileSync(resolved.outFile, next, 'utf-8')

  return true
}

export function runGeneration(
  resolved: ResolvedOptions,
  log: (msg: string) => void = console.log,
  warn: (msg: string) => void = console.warn,
): { rootNode: RouteNode; changed: boolean } {
  const rootNode = scanPages(resolved)

  if (resolved.logDiagnostics) {
    for (const d of collectRouteDiagnostics(rootNode)) {
      const fn = d.level === 'error' ? warn : warn
      fn(`[vite-plugin-file-router] ${d.level}: ${d.message}\n  ${d.routes.join('\n  ')}`)
    }
  }

  const { routesContent } = generateRouteFiles(resolved, rootNode)
  const changed = writeRouteFiles(resolved, routesContent)

  if (changed) {
    log(`[vite-plugin-file-router] Generated ${path.relative(process.cwd(), resolved.outFile)}`)
  }

  return { rootNode, changed }
}
