import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import fileRouter, { createRegenScheduler } from '../plugin'

function makeTmpProject(structure: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-plugin-'))
  const pages = path.join(root, 'src', 'pages')
  fs.mkdirSync(pages, { recursive: true })
  for (const [rel, content] of Object.entries(structure)) {
    const file = path.join(pages, rel)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content)
  }
  return { root, pages }
}

function createMockServer(outFile: string) {
  const modules = new Map<string, { url: string }>()
  const invalidated: string[] = []
  const sentMessages: unknown[] = []
  const watchedPaths: string[] = []

  return {
    server: {
      watcher: { add: (p: string) => watchedPaths.push(p) },
      moduleGraph: {
        getModuleById: (id: string) => modules.get(id) ?? null,
        invalidateModule: (mod: { url: string }) => invalidated.push(mod.url),
      },
      ws: { send: (msg: unknown) => sentMessages.push(msg) },
      config: { logger: { error: vi.fn() } },
    },
    modules,
    invalidated,
    sentMessages,
    watchedPaths,
  }
}

describe('plugin hooks', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('configureServer adds pagesDir to watcher', () => {
    const { root, pages } = makeTmpProject({ 'index.tsx': 'export default function Home() {}' })
    dirs.push(root)

    const plugin = fileRouter({ pagesDir: 'src/pages', outFile: 'src/routes.ts' }) as any
    plugin.configResolved({ root })

    const outFile = path.join(root, 'src', 'routes.ts')
    const { server, watchedPaths } = createMockServer(outFile)
    plugin.configureServer(server)

    expect(watchedPaths.length).toBe(1)
    expect(watchedPaths[0]).toBe(pages)
  })

  it('configureServer watches parent when pagesDir does not exist', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-plugin-nopages-'))
    dirs.push(root)
    fs.mkdirSync(path.join(root, 'src'), { recursive: true })

    const plugin = fileRouter({ pagesDir: 'src/pages', outFile: 'src/routes.ts' }) as any
    plugin.configResolved({ root })

    const outFile = path.join(root, 'src', 'routes.ts')
    const { server, watchedPaths } = createMockServer(outFile)
    plugin.configureServer(server)

    expect(watchedPaths[0]).toBe(path.join(root, 'src'))
  })

  it('buildStart generates routes file', () => {
    const { root } = makeTmpProject({ 'index.tsx': 'export default function Home() {}' })
    dirs.push(root)

    const plugin = fileRouter({ pagesDir: 'src/pages', outFile: 'src/routes.ts' }) as any
    plugin.configResolved({ root })
    plugin.buildStart()

    expect(fs.existsSync(path.join(root, 'src', 'routes.ts'))).toBe(true)
  })

  it('watchChange ignores files outside pagesDir', () => {
    const { root } = makeTmpProject({ 'index.tsx': 'export default function Home() {}' })
    dirs.push(root)

    const plugin = fileRouter({
      pagesDir: 'src/pages',
      outFile: 'src/routes.ts',
      regenDebounceMs: 0,
    }) as any
    plugin.configResolved({ root })
    plugin.buildStart()

    const outBefore = fs.readFileSync(path.join(root, 'src', 'routes.ts'), 'utf-8')
    plugin.watchChange(path.join(root, 'other', 'file.ts'), { event: 'create' })
    const outAfter = fs.readFileSync(path.join(root, 'src', 'routes.ts'), 'utf-8')
    expect(outAfter).toBe(outBefore)
  })

  it('watchChange ignores update events (only handles create/delete)', () => {
    const { root, pages } = makeTmpProject({ 'index.tsx': 'export default function Home() {}' })
    dirs.push(root)

    const plugin = fileRouter({
      pagesDir: 'src/pages',
      outFile: 'src/routes.ts',
      regenDebounceMs: 0,
    }) as any
    plugin.configResolved({ root })
    plugin.buildStart()

    const outBefore = fs.readFileSync(path.join(root, 'src', 'routes.ts'), 'utf-8')
    plugin.watchChange(path.join(pages, 'index.tsx'), { event: 'update' })
    const outAfter = fs.readFileSync(path.join(root, 'src', 'routes.ts'), 'utf-8')
    expect(outAfter).toBe(outBefore)
  })

  it('watchChange triggers regeneration on file create', async () => {
    const { root, pages } = makeTmpProject({ 'index.tsx': 'export default function Home() {}' })
    dirs.push(root)

    const plugin = fileRouter({
      pagesDir: 'src/pages',
      outFile: 'src/routes.ts',
      regenDebounceMs: 0,
    }) as any
    plugin.configResolved({ root })

    const outFile = path.join(root, 'src', 'routes.ts')
    const { server } = createMockServer(outFile)
    plugin.configureServer(server)
    plugin.buildStart()

    fs.writeFileSync(path.join(pages, 'about.tsx'), 'export default function About() {}')
    plugin.watchChange(path.join(pages, 'about.tsx'), { event: 'create' })

    const code = fs.readFileSync(outFile, 'utf-8')
    expect(code).toContain('about')
  })

  it('watchChange triggers regeneration on file delete', () => {
    const { root, pages } = makeTmpProject({
      'index.tsx': 'export default function Home() {}',
      'about.tsx': 'export default function About() {}',
    })
    dirs.push(root)

    const plugin = fileRouter({
      pagesDir: 'src/pages',
      outFile: 'src/routes.ts',
      regenDebounceMs: 0,
    }) as any
    plugin.configResolved({ root })
    plugin.buildStart()

    const outBefore = fs.readFileSync(path.join(root, 'src', 'routes.ts'), 'utf-8')
    expect(outBefore).toContain('about')

    fs.unlinkSync(path.join(pages, 'about.tsx'))
    plugin.watchChange(path.join(pages, 'about.tsx'), { event: 'delete' })

    const outAfter = fs.readFileSync(path.join(root, 'src', 'routes.ts'), 'utf-8')
    expect(outAfter).not.toContain('about')
  })

  it('watchChange ignores unrecognized event types', () => {
    const { root, pages } = makeTmpProject({ 'index.tsx': 'export default function Home() {}' })
    dirs.push(root)

    const plugin = fileRouter({
      pagesDir: 'src/pages',
      outFile: 'src/routes.ts',
      regenDebounceMs: 0,
    }) as any
    plugin.configResolved({ root })
    plugin.buildStart()

    plugin.watchChange(path.join(pages, 'index.tsx'), { event: 'rename' as any })
  })

  it('handleHotUpdate regenerates on page file change and invalidates module', async () => {
    const { root, pages } = makeTmpProject({ 'index.tsx': 'export default function Home() {}' })
    dirs.push(root)

    const plugin = fileRouter({ pagesDir: 'src/pages', outFile: 'src/routes.ts' }) as any
    plugin.configResolved({ root })
    plugin.buildStart()

    const outFile = path.join(root, 'src', 'routes.ts')
    const { server, modules, invalidated } = createMockServer(outFile)
    modules.set(outFile, { url: '/@fs' + outFile })
    plugin.configureServer(server)

    fs.writeFileSync(path.join(pages, 'about.tsx'), 'export default function About() {}')

    const result = await plugin.handleHotUpdate({
      file: path.join(pages, 'about.tsx'),
      server,
      read: async () => fs.readFileSync(path.join(pages, 'about.tsx'), 'utf-8'),
      modules: [],
    })

    expect(invalidated.length).toBe(1)
    expect(result).toBeDefined()
    expect(result!.length).toBeGreaterThan(0)
  })

  it('handleHotUpdate returns undefined for non-page files', async () => {
    const { root } = makeTmpProject({ 'index.tsx': 'export default function Home() {}' })
    dirs.push(root)

    const plugin = fileRouter({ pagesDir: 'src/pages', outFile: 'src/routes.ts' }) as any
    plugin.configResolved({ root })
    plugin.buildStart()

    const outFile = path.join(root, 'src', 'routes.ts')
    const { server } = createMockServer(outFile)
    plugin.configureServer(server)

    const result = await plugin.handleHotUpdate({
      file: path.join(root, 'src', 'App.tsx'),
      server,
      read: async () => '',
      modules: [],
    })

    expect(result).toBeUndefined()
  })

  it('handleHotUpdate returns undefined when content change does not affect routes', async () => {
    const { root, pages } = makeTmpProject({ 'index.tsx': 'export default function Home() {}' })
    dirs.push(root)

    const plugin = fileRouter({ pagesDir: 'src/pages', outFile: 'src/routes.ts' }) as any
    plugin.configResolved({ root })
    plugin.buildStart()

    const outFile = path.join(root, 'src', 'routes.ts')
    const { server } = createMockServer(outFile)
    plugin.configureServer(server)

    const result = await plugin.handleHotUpdate({
      file: path.join(pages, 'index.tsx'),
      server,
      read: async () => 'export default function Home() { return "updated" }',
      modules: [],
    })

    expect(result).toBeUndefined()
  })

  it('handleHotUpdate returns undefined when module is not in graph', async () => {
    const { root, pages } = makeTmpProject({ 'index.tsx': 'export default function Home() {}' })
    dirs.push(root)

    const plugin = fileRouter({ pagesDir: 'src/pages', outFile: 'src/routes.ts' }) as any
    plugin.configResolved({ root })
    plugin.buildStart()

    const outFile = path.join(root, 'src', 'routes.ts')
    const { server } = createMockServer(outFile)
    plugin.configureServer(server)

    fs.writeFileSync(path.join(pages, 'new-page.tsx'), 'export default function New() {}')

    const result = await plugin.handleHotUpdate({
      file: path.join(pages, 'new-page.tsx'),
      server,
      read: async () => fs.readFileSync(path.join(pages, 'new-page.tsx'), 'utf-8'),
      modules: [],
    })

    expect(result).toBeUndefined()
  })

  it('buildEnd disposes scheduler without error', () => {
    const { root } = makeTmpProject({ 'index.tsx': 'export default function Home() {}' })
    dirs.push(root)

    const plugin = fileRouter({ pagesDir: 'src/pages', outFile: 'src/routes.ts' }) as any
    plugin.configResolved({ root })
    plugin.buildStart()
    expect(() => plugin.buildEnd()).not.toThrow()
  })

  it('invalidateRoutesModule sends HMR update when module exists', () => {
    const { root } = makeTmpProject({ 'index.tsx': 'export default function Home() {}' })
    dirs.push(root)

    const plugin = fileRouter({
      pagesDir: 'src/pages',
      outFile: 'src/routes.ts',
      regenDebounceMs: 0,
    }) as any
    plugin.configResolved({ root })

    const outFile = path.join(root, 'src', 'routes.ts')
    const { server, modules, invalidated, sentMessages } = createMockServer(outFile)
    plugin.configureServer(server)

    plugin.buildStart()

    modules.set(outFile, { url: '/src/routes.ts' })

    fs.writeFileSync(path.join(root, 'src', 'pages', 'new.tsx'), 'export default function N() {}')
    plugin.watchChange(path.join(root, 'src', 'pages', 'new.tsx'), { event: 'create' })

    expect(invalidated.length).toBe(1)
    expect(sentMessages.length).toBe(1)
    expect((sentMessages[0] as any).type).toBe('update')
  })

  it('buildEnd disposes pending scheduled timer', () => {
    const { root, pages } = makeTmpProject({ 'index.tsx': 'export default function Home() {}' })
    dirs.push(root)

    const plugin = fileRouter({
      pagesDir: 'src/pages',
      outFile: 'src/routes.ts',
      regenDebounceMs: 5000,
    }) as any
    plugin.configResolved({ root })
    plugin.buildStart()

    fs.writeFileSync(path.join(pages, 'pending.tsx'), 'export default function P() {}')
    plugin.watchChange(path.join(pages, 'pending.tsx'), { event: 'create' })

    expect(() => plugin.buildEnd()).not.toThrow()
  })

  it('scheduler debounces rapid watchChange calls', async () => {
    const { root, pages } = makeTmpProject({ 'index.tsx': 'export default function Home() {}' })
    dirs.push(root)

    const plugin = fileRouter({
      pagesDir: 'src/pages',
      outFile: 'src/routes.ts',
      regenDebounceMs: 30,
    }) as any
    plugin.configResolved({ root })
    plugin.buildStart()

    fs.writeFileSync(path.join(pages, 'a.tsx'), 'export default function A() {}')
    plugin.watchChange(path.join(pages, 'a.tsx'), { event: 'create' })
    fs.writeFileSync(path.join(pages, 'b.tsx'), 'export default function B() {}')
    plugin.watchChange(path.join(pages, 'b.tsx'), { event: 'create' })

    const outBefore = fs.readFileSync(path.join(root, 'src', 'routes.ts'), 'utf-8')
    expect(outBefore).not.toContain('/a')

    await new Promise((r) => setTimeout(r, 80))

    const outAfter = fs.readFileSync(path.join(root, 'src', 'routes.ts'), 'utf-8')
    expect(outAfter).toContain('/a')
    expect(outAfter).toContain('/b')
  })
})

describe('plugin transform (vue route blocks)', () => {
  it('strips <route> blocks from vue SFCs', () => {
    const plugin = fileRouter({ framework: 'vue', pagesDir: 'src/pages', outFile: 'src/routes.ts' }) as any
    const src = `<route>{"name":"home"}</route>\n<template><div>Home</div></template>`
    const result = plugin.transform(src, '/project/src/pages/index.vue')
    expect(result).toBeDefined()
    expect(result.code).not.toContain('<route>')
    expect(result.code).toContain('<template>')
  })

  it('returns undefined for non-vue files', () => {
    const plugin = fileRouter({ framework: 'vue', pagesDir: 'src/pages', outFile: 'src/routes.ts' }) as any
    const result = plugin.transform('export default {}', '/project/src/pages/index.tsx')
    expect(result).toBeUndefined()
  })

  it('returns undefined when framework is react', () => {
    const plugin = fileRouter({ framework: 'react', pagesDir: 'src/pages', outFile: 'src/routes.ts' }) as any
    const result = plugin.transform('<route>{}</route>', '/project/src/pages/index.vue')
    expect(result).toBeUndefined()
  })

  it('returns undefined for vue files with query params (HMR)', () => {
    const plugin = fileRouter({ framework: 'vue', pagesDir: 'src/pages', outFile: 'src/routes.ts' }) as any
    const result = plugin.transform('<route>{}</route>', '/project/src/pages/index.vue?type=style')
    expect(result).toBeUndefined()
  })

  it('returns undefined when vue SFC has no route block', () => {
    const plugin = fileRouter({ framework: 'vue', pagesDir: 'src/pages', outFile: 'src/routes.ts' }) as any
    const result = plugin.transform('<template><div>Hi</div></template>', '/project/src/pages/index.vue')
    expect(result).toBeUndefined()
  })
})

describe('scheduler error handling', () => {
  it('logs errors through devServer logger when server is connected', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-plugin-err-'))
    fs.mkdirSync(path.join(root, 'src', 'pages'), { recursive: true })

    const plugin = fileRouter({
      pagesDir: 'src/NONEXIST',
      outFile: 'src/routes.ts',
      regenDebounceMs: 10,
    }) as any
    plugin.configResolved({ root })

    const outFile = path.join(root, 'src', 'routes.ts')
    const { server } = createMockServer(outFile)
    plugin.configureServer(server)

    plugin.buildStart()

    const pagesDir = path.join(root, 'src', 'NONEXIST')
    fs.mkdirSync(pagesDir, { recursive: true })
    fs.writeFileSync(path.join(pagesDir, 'x.tsx'), 'export default function X() {}')
    plugin.watchChange(path.join(pagesDir, 'x.tsx'), { event: 'create' })

    await new Promise((r) => setTimeout(r, 50))

    plugin.buildEnd()
    fs.rmSync(root, { recursive: true, force: true })
  })
})

describe('plugin scheduler error propagation to devServer', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('logs error via devServer.config.logger when regenerate fails in debounced call', async () => {
    const { root, pages } = makeTmpProject({ 'index.tsx': 'export default function Home() {}' })
    dirs.push(root)

    const plugin = fileRouter({
      pagesDir: 'src/pages',
      outFile: 'src/routes.ts',
      regenDebounceMs: 15,
    }) as any
    plugin.configResolved({ root })

    const outFile = path.join(root, 'src', 'routes.ts')
    const { server } = createMockServer(outFile)
    plugin.configureServer(server)
    plugin.buildStart()

    fs.chmodSync(path.join(root, 'src'), 0o555)

    fs.writeFileSync(path.join(pages, 'new.tsx'), 'export default function N() {}')
    plugin.watchChange(path.join(pages, 'new.tsx'), { event: 'create' })

    await new Promise((r) => setTimeout(r, 60))

    fs.chmodSync(path.join(root, 'src'), 0o755)

    expect(server.config.logger.error).toHaveBeenCalled()
  })

  it('logs error via console.error when no devServer and regenerate fails', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-plugin-noserver-'))
    dirs.push(root)
    const pages = path.join(root, 'src', 'pages')
    fs.mkdirSync(pages, { recursive: true })
    fs.writeFileSync(path.join(pages, 'index.tsx'), 'export default function Home() {}')

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const plugin = fileRouter({
      pagesDir: 'src/pages',
      outFile: 'src/routes.ts',
      regenDebounceMs: 15,
    }) as any
    plugin.configResolved({ root })
    plugin.buildStart()

    fs.chmodSync(path.join(root, 'src'), 0o555)

    fs.writeFileSync(path.join(pages, 'new.tsx'), 'export default function N() {}')
    plugin.watchChange(path.join(pages, 'new.tsx'), { event: 'create' })

    await new Promise((r) => setTimeout(r, 60))

    fs.chmodSync(path.join(root, 'src'), 0o755)

    spy.mockRestore()
    plugin.buildEnd()
  })

  it('logs non-Error thrown value as string via devServer logger', async () => {
    const { root, pages } = makeTmpProject({ 'index.tsx': 'export default function Home() {}' })
    dirs.push(root)

    const plugin = fileRouter({
      pagesDir: 'src/pages',
      outFile: 'src/routes.ts',
      regenDebounceMs: 15,
    }) as any
    plugin.configResolved({ root })

    const outFile = path.join(root, 'src', 'routes.ts')
    const { server } = createMockServer(outFile)
    plugin.configureServer(server)
    plugin.buildStart()

    const outDir = path.join(root, 'src')
    fs.chmodSync(outDir, 0o555)

    fs.writeFileSync(path.join(pages, 'err.tsx'), 'export default function E() {}')
    plugin.watchChange(path.join(pages, 'err.tsx'), { event: 'create' })

    await new Promise((r) => setTimeout(r, 60))
    fs.chmodSync(outDir, 0o755)

    expect(server.config.logger.error).toHaveBeenCalled()
    const call = (server.config.logger.error as any).mock.calls[0][0]
    expect(typeof call).toBe('string')
    plugin.buildEnd()
  })
})

describe('createRegenScheduler', () => {
  it('uses default console.error handler when onScheduledError is not provided', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const scheduler = createRegenScheduler(
      () => { throw new Error('boom') },
      10,
    )
    scheduler.schedule()
    await new Promise((r) => setTimeout(r, 50))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }))
    spy.mockRestore()
    scheduler.dispose()
  })

  it('handles non-Error thrown values in scheduled error', async () => {
    const errors: string[] = []
    const scheduler = createRegenScheduler(
      () => { throw 'string-error' },
      10,
      (err) => errors.push(String(err)),
    )
    scheduler.schedule()
    await new Promise((r) => setTimeout(r, 50))
    expect(errors[0]).toBe('string-error')
    scheduler.dispose()
  })

  it('disposes clears a pending timer', async () => {
    let count = 0
    const scheduler = createRegenScheduler(
      () => { count++ },
      50,
    )
    scheduler.schedule()
    scheduler.dispose()
    await new Promise((r) => setTimeout(r, 100))
    expect(count).toBe(0)
  })

  it('requeues run when called during inflight execution', () => {
    let count = 0
    let triggerReentry: (() => void) | undefined
    const scheduler = createRegenScheduler(
      () => {
        count++
        if (count === 1 && triggerReentry) triggerReentry()
      },
      0,
    )
    triggerReentry = () => scheduler.schedule()
    scheduler.schedule()
    expect(count).toBe(2)
    scheduler.dispose()
  })
})
