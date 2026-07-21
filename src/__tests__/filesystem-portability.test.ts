import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { resolveOptions, runGeneration } from '../generate'

describe('filesystem portability', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
  })

  function project(files: Record<string, string>) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-filesystem-'))
    roots.push(root)
    const pagesDir = path.join(root, 'src', 'pages')
    for (const [relative, source] of Object.entries(files)) {
      const file = path.join(pagesDir, relative)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, source)
    }
    const resolved = resolveOptions(root)
    runGeneration(resolved, () => {}, () => {})
    return { root, pagesDir, outFile: resolved.outFile, resolved }
  }

  it('detects an editor-style atomic page replacement', () => {
    const value = project({
      'index.tsx': 'export default function Home() {}',
    })
    const page = path.join(value.pagesDir, 'index.tsx')
    const replacement = path.join(value.pagesDir, '.index.tsx.swp')
    fs.writeFileSync(
      replacement,
      'export const meta = { atomicSave: true }; export default function Home() {}',
    )
    fs.renameSync(replacement, page)

    expect(runGeneration(value.resolved, () => {}, () => {}).changed).toBe(true)
    expect(fs.readFileSync(value.outFile, 'utf8')).toContain('atomicSave: true')
  })

  it('handles a case-only page rename without retaining the old route', () => {
    const value = project({
      'Report.tsx': 'export default function Report() {}',
    })
    const original = path.join(value.pagesDir, 'Report.tsx')
    const intermediate = path.join(value.pagesDir, '__case_rename__.tsx')
    const renamed = path.join(value.pagesDir, 'report.tsx')
    fs.renameSync(original, intermediate)
    fs.renameSync(intermediate, renamed)

    runGeneration(value.resolved, () => {}, () => {})
    const routes = fs.readFileSync(value.outFile, 'utf8')
    expect(routes).toContain('page:report.tsx')
    expect(routes).toContain('path: "/report"')
    expect(routes).not.toContain('page:Report.tsx')
    expect(routes).not.toContain('path: "/Report"')
  })

  it('recovers after the pages directory is deleted and recreated', () => {
    const value = project({
      'index.tsx': 'export default function Home() {}',
      'about.tsx': 'export default function About() {}',
    })
    fs.rmSync(value.pagesDir, { recursive: true, force: true })

    runGeneration(value.resolved, () => {}, () => {})
    expect(fs.readFileSync(value.outFile, 'utf8')).not.toContain('./pages/index.tsx')

    fs.mkdirSync(value.pagesDir, { recursive: true })
    fs.writeFileSync(
      path.join(value.pagesDir, 'index.tsx'),
      'export const meta = { restored: true }; export default function Home() {}',
    )
    runGeneration(value.resolved, () => {}, () => {})
    const restored = fs.readFileSync(value.outFile, 'utf8')
    expect(restored).toContain('./pages/index.tsx')
    expect(restored).toContain('restored: true')
  })

  it('normalizes generated imports and excludes nested private directories', () => {
    const value = project({
      'space dir/report.tsx': 'export default function Report() {}',
      '_private/ignored.tsx': 'export default function Ignored() {}',
    })
    const resolved = resolveOptions(value.root, { exclude: ['**/_private/**', '_private/**'] })
    runGeneration(resolved, () => {}, () => {})
    const routes = fs.readFileSync(value.outFile, 'utf8')

    expect(routes).toContain('./pages/space dir/report.tsx')
    expect(routes).not.toContain('\\')
    expect(routes).not.toContain('ignored.tsx')
  })
})
