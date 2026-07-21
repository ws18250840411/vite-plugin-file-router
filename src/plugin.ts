import fs from 'node:fs'
import path from 'node:path'

import type { Plugin, ViteDevServer } from 'vite'

import { invalidateScanCache } from './core/scanner'
import { stripVueRouteBlocks } from './core/vue-route-block'
import { resolveOptions, runGeneration } from './generate'
import type { FileRouterOptions } from './types'

export interface RegenScheduler {
  schedule: () => void
  runNow: () => void
  dispose: () => void
}

/** @internal Exported for unit tests. */
export function createRegenScheduler(
  run: () => void,
  debounceMs = 50,
  onScheduledError: (error: unknown) => void = (error) => console.error(error),
): RegenScheduler {
  let timer: ReturnType<typeof setTimeout> | undefined
  let inFlight = false
  let rerun = false

  const flush = () => {
    if (inFlight) {
      rerun = true
      return
    }
    inFlight = true
    try {
      do {
        rerun = false
        run()
      } while (rerun)
    } finally {
      inFlight = false
    }
  }

  const schedule = () => {
    if (debounceMs <= 0) {
      flush()
      return
    }
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      try {
        flush()
      } catch (error) {
        onScheduledError(error)
      }
    }, debounceMs)
  }

  const dispose = () => {
    if (timer) clearTimeout(timer)
    timer = undefined
  }

  const runNow = () => {
    if (timer) clearTimeout(timer)
    timer = undefined
    flush()
  }

  return { schedule, runNow, dispose }
}

function isUnderPages(file: string, pagesDir: string): boolean {
  const rel = path.relative(pagesDir, file)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

function invalidateRoutesModule(server: ViteDevServer, outFile: string) {
  const mod = server.moduleGraph.getModuleById(outFile)
  if (!mod) return
  server.moduleGraph.invalidateModule(mod)
  server.ws.send({
    type: 'update',
    updates: [{
      type: 'js-update',
      path: mod.url,
      acceptedPath: mod.url,
      timestamp: Date.now(),
    }],
  })
}

export default function fileRouter(options: FileRouterOptions = {}): Plugin {
  let projectRoot = ''
  let devServer: ViteDevServer | undefined
  let resolved = resolveOptions(process.cwd(), options)
  let pagesDir = resolved.pagesDir
  let outFile = resolved.outFile
  const debounceMs = options.regenDebounceMs ?? 50

  const regenerate = (server?: ViteDevServer) => {
    resolved = resolveOptions(projectRoot || process.cwd(), options)
    pagesDir = resolved.pagesDir
    outFile = resolved.outFile

    const { changed } = runGeneration(resolved)
    if (changed && server) invalidateRoutesModule(server, outFile)
    return changed
  }

  const scheduler = createRegenScheduler(() => {
    regenerate(devServer)
  }, debounceMs, (error) => {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
    if (devServer) devServer.config.logger.error(message)
    else console.error(message)
  })

  return {
    name: 'vite-plugin-file-router',
    enforce: 'pre',

    transform(code, id) {
      if ((options.framework ?? 'react') !== 'vue' || !id.endsWith('.vue') || id.includes('?')) return undefined
      const stripped = stripVueRouteBlocks(code, id)
      return stripped === code ? undefined : { code: stripped, map: null }
    },

    configResolved(config) {
      projectRoot = config.root
      resolved = resolveOptions(projectRoot, options)
      pagesDir = resolved.pagesDir
      outFile = resolved.outFile
    },

    buildStart() {
      scheduler.runNow()
    },

    configureServer(server) {
      devServer = server
      server.watcher.add(fs.existsSync(pagesDir) ? pagesDir : path.dirname(pagesDir))
    },

    watchChange(file, change) {
      if (change.event !== 'create' && change.event !== 'update' && change.event !== 'delete') return
      if (!isUnderPages(file, pagesDir)) return
      if (change.event === 'update') return
      scheduler.schedule()
    },

    async handleHotUpdate({ file, server, read, modules }) {
      if (isUnderPages(file, pagesDir)) {
        await read()
        invalidateScanCache(file)
        const changed = regenerate()
        if (!changed) return undefined
        const mod = server.moduleGraph.getModuleById(outFile)
        if (mod) server.moduleGraph.invalidateModule(mod)
        return mod ? [...new Set([...modules, mod])] : undefined
      }
      return undefined
    },

    buildEnd() {
      scheduler.dispose()
    },
  }
}
