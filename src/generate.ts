import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'

import { inferOutputLanguage } from './core/output-language'
import { collectRouteDiagnostics, scanDir } from './core/scanner'
import { normalizeBaseRoute } from './core/path-parser'
import { generateReactRoutes, generateVueRoutes } from './emit/codegen'
import { mergeRouteFiles } from './emit/merge-routes'
import type { FileRouterOptions, GenerateContext, OutputLanguage, RouteNode } from './types'

const EMPTY_ROOT: RouteNode = {
  routeId: 'dir:empty',
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
  failOnRouteError: boolean
}

const generationSignatures = new Map<string, string>()
const OUTPUT_LOCK_TIMEOUT_MS = 15_000
const OUTPUT_LOCK_STALE_MS = 60_000
const OUTPUT_LOCK_RETRY_MS = 20

interface OutputLockRecord {
  pid: number
  token: string
  createdAt: number
}

function sleepSync(milliseconds: number): void {
  /* Blocks the event loop for up to `milliseconds`. Only called during brief
     cross-process output lock contention (20 ms retry intervals); acceptable
     in practice because the lock is held only for the duration of a single
     atomic file rename. */
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)
}

function readOutputLock(lockFile: string): OutputLockRecord | null {
  try {
    const value = JSON.parse(fs.readFileSync(lockFile, 'utf8')) as Partial<OutputLockRecord>
    return Number.isInteger(value.pid) && typeof value.token === 'string' && typeof value.createdAt === 'number'
      ? value as OutputLockRecord
      : null
  } catch {
    return null
  }
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

function removeStaleOutputLock(lockFile: string): boolean {
  let stat: fs.Stats
  try {
    stat = fs.statSync(lockFile)
  } catch {
    return true
  }
  const age = Date.now() - stat.mtimeMs
  const record = readOutputLock(lockFile)
  const stale = age >= OUTPUT_LOCK_STALE_MS
    || (age >= OUTPUT_LOCK_RETRY_MS * 2 && record !== null && !processExists(record.pid))
  if (!stale) return false
  try {
    fs.unlinkSync(lockFile)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT'
  }
}

function acquireOutputLock(outFile: string): () => void {
  const lockFile = `${outFile}.vite-file-router.lock`
  const deadline = Date.now() + OUTPUT_LOCK_TIMEOUT_MS
  const record: OutputLockRecord = { pid: process.pid, token: randomUUID(), createdAt: Date.now() }

  while (true) {
    let descriptor: number | undefined
    let created = false
    try {
      descriptor = fs.openSync(lockFile, 'wx')
      created = true
      fs.writeFileSync(descriptor, JSON.stringify(record), 'utf8')
      fs.closeSync(descriptor)
      descriptor = undefined
      return () => {
        const current = readOutputLock(lockFile)
        if (current?.token !== record.token) return
        try {
          fs.unlinkSync(lockFile)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
      }
    } catch (error) {
      if (descriptor !== undefined) fs.closeSync(descriptor)
      if (created) {
        try {
          fs.unlinkSync(lockFile)
        } catch {
          // The original lock initialization error is more actionable.
        }
      }
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'EEXIST') throw error
      if (removeStaleOutputLock(lockFile)) continue
      if (Date.now() >= deadline) {
        throw new Error(`[vite-plugin-file-router] Timed out waiting for output lock: ${lockFile}`)
      }
      sleepSync(OUTPUT_LOCK_RETRY_MS)
    }
  }
}

function generationSignature(resolved: ResolvedOptions, rootNode: RouteNode): string {
  const input = JSON.stringify({
    framework: resolved.framework,
    importMode: resolved.importMode,
    baseRoute: resolved.baseRoute,
    outputLanguage: resolved.outputLanguage,
    pagesDir: resolved.pagesDir,
    outFile: resolved.outFile,
    rootNode,
  })
  return createHash('sha256').update(input).digest('base64url')
}

export function resolveOptions(root: string, options: FileRouterOptions = {}): ResolvedOptions {
  const framework = options.framework ?? 'react'
  const outFile = path.resolve(root, options.outFile ?? 'src/routes.ts')
  const outputLanguage = options.outputLanguage ?? inferOutputLanguage(outFile)
  const pagesDir = path.resolve(root, options.pagesDir ?? 'src/pages')
  const relativeOutput = path.relative(pagesDir, outFile)
  if (relativeOutput === '' || (!relativeOutput.startsWith('..') && !path.isAbsolute(relativeOutput))) {
    throw new TypeError('`outFile` must be outside `pagesDir` to avoid recursive route generation.')
  }
  if (path.extname(outFile).toLowerCase() === '.cjs') {
    throw new TypeError('Generated client routes are ESM; use a .ts, .js, or .mjs outFile.')
  }

  return {
    pagesDir,
    outFile,
    framework,
    extensions: options.extensions ?? (framework === 'vue' ? ['vue'] : ['tsx', 'ts', 'jsx', 'js']),
    exclude: options.exclude ?? [],
    baseRoute: normalizeBaseRoute(options.baseRoute ?? ''),
    importMode: options.importMode ?? 'lazy',
    outputLanguage,
    transformRoutes: options.transformRoutes,
    logDiagnostics: options.logDiagnostics ?? true,
    failOnRouteError: options.failOnRouteError ?? true,
  }
}

export function scanPages(resolved: ResolvedOptions): RouteNode {
  if (!fs.existsSync(resolved.pagesDir)) return { ...EMPTY_ROOT, children: [] }

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

  const rawContent = resolved.framework === 'vue'
    ? generateVueRoutes(rootNode, ctx)
    : generateReactRoutes(rootNode, ctx)

  return { routesContent: rawContent }
}

export function writeRouteFiles(
  resolved: ResolvedOptions,
  routesContent: string,
): boolean {
  fs.mkdirSync(path.dirname(resolved.outFile), { recursive: true })
  const releaseLock = acquireOutputLock(resolved.outFile)
  try {
    const prev = fs.existsSync(resolved.outFile)
      ? fs.readFileSync(resolved.outFile, 'utf-8')
      : null

    const next = prev !== null ? mergeRouteFiles(routesContent, prev) : routesContent

    if (prev === next) return false

    const tempFile = `${resolved.outFile}.${process.pid}.${randomUUID()}.tmp`
    try {
      fs.writeFileSync(tempFile, next, { encoding: 'utf8', flush: true })
      fs.renameSync(tempFile, resolved.outFile)
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile)
    }

    return true
  } finally {
    releaseLock()
  }
}

export function runGeneration(
  resolved: ResolvedOptions,
  log: (msg: string) => void = console.log,
  warn: (msg: string) => void = console.warn,
): { rootNode: RouteNode; changed: boolean } {
  const rootNode = scanPages(resolved)

  const diagnostics = collectRouteDiagnostics(rootNode, resolved.framework)
  if (resolved.logDiagnostics) {
    for (const d of diagnostics) {
      const fn = d.level === 'error' ? warn : log
      fn(`[vite-plugin-file-router] ${d.level}: ${d.message}\n  ${d.routes.join('\n  ')}`)
    }
  }

  const errors = diagnostics.filter((diagnostic) => diagnostic.level === 'error')
  if (resolved.failOnRouteError && errors.length > 0) {
    throw new Error(`[vite-plugin-file-router] Route generation failed with ${errors.length} error(s).`)
  }

  const signature = generationSignature(resolved, rootNode)
  if (generationSignatures.get(resolved.outFile) === signature && fs.existsSync(resolved.outFile)) {
    return { rootNode, changed: false }
  }

  const { routesContent } = generateRouteFiles(resolved, rootNode)
  const changed = writeRouteFiles(resolved, routesContent)
  generationSignatures.set(resolved.outFile, signature)

  if (changed) {
    log(`[vite-plugin-file-router] Generated ${path.relative(process.cwd(), resolved.outFile)}`)
  }

  return { rootNode, changed }
}
