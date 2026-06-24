import fs from 'node:fs'
import path from 'node:path'

import type { Plugin, ViteDevServer } from 'vite'

import { resolveOptions, runGeneration } from './generate'
import type { FileRouterOptions } from './types'

export interface RegenScheduler {
  schedule: () => void
  runNow: () => void
  dispose: () => void
}

/** @internal Exported for unit tests. */
export function createRegenScheduler(run: () => void, debounceMs = 50): RegenScheduler {
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
      flush()
    }, debounceMs)
  }

  const dispose = () => {
    if (timer) clearTimeout(timer)
    timer = undefined
  }

  return { schedule, runNow: flush, dispose }
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
  }, debounceMs)

  return {
    name: 'vite-plugin-file-router',
    enforce: 'pre',

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
      if (fs.existsSync(pagesDir)) {
        server.watcher.add(pagesDir)
      }
    },

    watchChange(file, change) {
      if (change.event !== 'create' && change.event !== 'update' && change.event !== 'delete') return
      if (!isUnderPages(file, pagesDir)) return
      scheduler.schedule()
    },

    handleHotUpdate({ file, server }) {
      if (isUnderPages(file, pagesDir)) {
        scheduler.runNow()
        const mod = server.moduleGraph.getModuleById(outFile)
        return mod ? [mod] : []
      }
      return undefined
    },

    buildEnd() {
      scheduler.dispose()
    },
  }
}
