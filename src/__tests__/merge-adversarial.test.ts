import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { scanDir } from '../core/scanner'
import { generateReactRoutes } from '../emit/codegen'
import { RouteMergeError, mergeRouteFiles } from '../emit/merge-routes'
import { collectRouteSliceMap } from '../emit/parse-routes-file'
import { resolveOptions, runGeneration, writeRouteFiles } from '../generate'

describe('adversarial routes file edits', () => {
  const dirs: string[] = []

  afterEach(() => {
    vi.restoreAllMocks()
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  function project(files: Record<string, string>) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-adversarial-'))
    dirs.push(root)
    const pagesDir = path.join(root, 'src', 'pages')
    const outFile = path.join(root, 'src', 'routes.ts')
    for (const [relative, source] of Object.entries(files)) {
      const file = path.join(pagesDir, relative)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, source)
    }
    return { root, pagesDir, outFile }
  }

  function generate(value: ReturnType<typeof project>): string {
    const tree = scanDir(value.pagesDir, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    return generateReactRoutes(tree, {
      root: value.root,
      pagesDir: value.pagesDir,
      outFile: value.outFile,
      framework: 'react',
      importMode: 'lazy',
      baseRoute: '',
    })
  }

  function addPage(
    value: ReturnType<typeof project>,
    name: string,
    source = 'export default function Page() {}',
  ) {
    fs.writeFileSync(path.join(value.pagesDir, name), source)
  }

  it('rejects duplicate route markers instead of applying edits to the wrong page', () => {
    const value = project({
      'about.tsx': 'export default function About() {}',
      'contact.tsx': 'export default function Contact() {}',
    })
    const fresh = generate(value)
    const corrupted = fresh.replace(
      '/* @file-route "page:contact.tsx" */',
      '/* @file-route "page:about.tsx" */',
    )

    expect(() => mergeRouteFiles(fresh, corrupted)).toThrow(/duplicate @file-route marker/)
  })

  it('treats a structurally invalid manifest as missing and keeps valid user edits', () => {
    const value = project({
      'about.tsx': 'export default function About() {}',
    })
    const fresh = generate(value)
    const invalidManifest = Buffer.from(JSON.stringify({
      version: 2,
      routes: null,
      imports: 'not-an-array',
      statements: [],
    })).toString('base64')
    const current = fresh
      .replace('path: "/about"', 'path: "/company"')
      .replace(
        /\/\* @vite-file-router-manifest [A-Za-z0-9+/=]+ \*\//,
        '/* @vite-file-router-manifest ' + invalidManifest + ' */',
      )
    addPage(value, 'help.tsx')

    const merged = mergeRouteFiles(generate(value), current)
    expect(merged).toContain('path: "/company"')
    expect(merged).toContain('./pages/help.tsx')
  })

  it('preserves computed properties and a final standalone comment', () => {
    const value = project({
      'about.tsx': 'export default function About() {}',
    })
    const fresh = generate(value)
    const slice = collectRouteSliceMap(fresh).get('page:about.tsx')!
    const editedSlice = slice.replace(
      /\n\s*}$/,
      "\n    ['manual-extra']: { enabled: true },\n    // final user note\n  }",
    )
    const current = fresh.replace(slice, editedSlice)
    addPage(value, 'help.tsx')

    const merged = mergeRouteFiles(generate(value), current)
    expect(merged).toContain("['manual-extra']: { enabled: true }")
    expect(merged).toContain('// final user note')
    expect(merged).toContain('./pages/help.tsx')
  })

  it('refuses a future generated import collision and leaves the physical file unchanged', () => {
    const value = project({
      'index.tsx': 'export default function Home() {}',
    })
    const baseline = generate(value)
    const current = baseline.replace(
      "import type { RouteObject } from 'react-router-dom'",
      "import type { RouteObject } from 'react-router-dom'\nimport HelpPage from './manual-help'",
    )
    fs.writeFileSync(value.outFile, current)
    addPage(value, 'help.sync.tsx')

    const resolved = resolveOptions(value.root)
    expect(() => runGeneration(resolved, () => {}, () => {})).toThrow(RouteMergeError)
    expect(fs.readFileSync(value.outFile, 'utf8')).toBe(current)
  })

  it('cleans the temporary file and preserves the original when atomic rename fails', () => {
    const value = project({
      'index.tsx': 'export default function Home() {}',
    })
    const baseline = generate(value)
    fs.writeFileSync(value.outFile, baseline)
    addPage(value, 'help.tsx')
    const fresh = generate(value)
    const resolved = resolveOptions(value.root)
    vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw new Error('simulated rename failure')
    })

    expect(() => writeRouteFiles(resolved, fresh)).toThrow('simulated rename failure')
    expect(fs.readFileSync(value.outFile, 'utf8')).toBe(baseline)
    expect(fs.readdirSync(path.dirname(value.outFile)).some((name) => name.endsWith('.tmp'))).toBe(false)
  })

  it('keeps the last good routes file for a broken page and recovers after the page is fixed', () => {
    const value = project({
      'index.tsx': 'export default function Home() {}',
    })
    const resolved = resolveOptions(value.root)
    runGeneration(resolved, () => {}, () => {})
    const lastGood = fs.readFileSync(value.outFile, 'utf8')

    fs.writeFileSync(path.join(value.pagesDir, 'index.tsx'), 'export default function {')
    expect(() => runGeneration(resolved, () => {}, () => {})).toThrow(/Route generation failed/)
    expect(fs.readFileSync(value.outFile, 'utf8')).toBe(lastGood)

    fs.writeFileSync(
      path.join(value.pagesDir, 'index.tsx'),
      'export const meta = { recovered: true }; export default function Home() {}',
    )
    expect(runGeneration(resolved, () => {}, () => {}).changed).toBe(true)
    expect(fs.readFileSync(value.outFile, 'utf8')).toContain('recovered: true')
  })

  it('serializes a competing process and merges the edit written while waiting', async () => {
    const value = project({
      'about.tsx': 'export default function About() {}',
    })
    const baseline = generate(value)
    fs.writeFileSync(value.outFile, baseline)
    addPage(value, 'help.tsx')
    const fresh = generate(value)
    const lockFile = value.outFile + '.vite-file-router.lock'
    const childScript = [
      "const fs = require('node:fs')",
      'const lockFile = process.argv[1]',
      'const outFile = process.argv[2]',
      "const token = 'child-' + process.pid",
      "const descriptor = fs.openSync(lockFile, 'wx')",
      "fs.writeFileSync(descriptor, JSON.stringify({ pid: process.pid, token, createdAt: Date.now() }), 'utf8')",
      'fs.closeSync(descriptor)',
      "const current = fs.readFileSync(outFile, 'utf8').replace('path: \"/about\"', 'path: \"/company\"')",
      "const temp = outFile + '.child.tmp'",
      "fs.writeFileSync(temp, current, 'utf8')",
      'fs.renameSync(temp, outFile)',
      "process.stdout.write('ready\\n')",
      "setTimeout(() => { fs.unlinkSync(lockFile); process.exit(0) }, 200)",
    ].join(';')
    const child = spawn(process.execPath, ['-e', childScript, lockFile, value.outFile], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const exit = once(child, 'exit')
    await once(child.stdout!, 'data')

    const startedAt = Date.now()
    expect(writeRouteFiles(resolveOptions(value.root), fresh)).toBe(true)
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(100)
    const [exitCode] = await exit
    expect(exitCode).toBe(0)

    const merged = fs.readFileSync(value.outFile, 'utf8')
    expect(merged).toContain('path: "/company"')
    expect(merged).toContain('./pages/help.tsx')
    expect(fs.existsSync(lockFile)).toBe(false)
  })

  it('cleans a lock file when lock initialization itself fails', () => {
    const value = project({
      'index.tsx': 'export default function Home() {}',
    })
    const fresh = generate(value)
    const lockFile = value.outFile + '.vite-file-router.lock'
    vi.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => {
      throw new Error('simulated lock write failure')
    })

    expect(() => writeRouteFiles(resolveOptions(value.root), fresh)).toThrow('simulated lock write failure')
    expect(fs.existsSync(lockFile)).toBe(false)
  })
})
