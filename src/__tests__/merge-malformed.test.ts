import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { generateReactRoutes } from '../emit/codegen'
import { RouteMergeError, mergeRouteFiles } from '../emit/merge-routes'
import { resolveOptions, runGeneration } from '../generate'
import { scanDir } from '../core/scanner'

describe('malformed routes file safety', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  function makeProject() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-malformed-'))
    dirs.push(root)
    const pagesDir = path.join(root, 'src', 'pages')
    const outFile = path.join(root, 'src', 'routes.ts')
    fs.mkdirSync(pagesDir, { recursive: true })
    fs.writeFileSync(path.join(pagesDir, 'index.tsx'), 'export default function Home() {}')
    const tree = scanDir(pagesDir, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    const fresh = generateReactRoutes(tree, {
      root,
      pagesDir,
      outFile,
      framework: 'react',
      importMode: 'lazy',
      baseRoute: '',
    })
    return { root, outFile, fresh }
  }

  it.each([
    ['empty file', ''],
    ['no routes declaration', 'export const foo = 1\n'],
    ['wrong routes value', 'export const routes = null\n'],
    ['unclosed array', 'export const routes = [{ path: "/" }\n'],
    ['truncated export', 'export const routes'],
  ])('refuses to overwrite %s', (_label, current) => {
    const { fresh } = makeProject()
    expect(() => mergeRouteFiles(fresh, current)).toThrow(RouteMergeError)
  })

  it('leaves a malformed physical file byte-for-byte unchanged', () => {
    const { root, outFile } = makeProject()
    const malformed = 'export const routes = [{ path: "/" }\n// user work in progress\n'
    fs.writeFileSync(outFile, malformed)

    const resolved = resolveOptions(root)
    expect(() => runGeneration(resolved, () => {}, () => {})).toThrow(RouteMergeError)
    expect(fs.readFileSync(outFile, 'utf8')).toBe(malformed)
  })

  it('migrates a syntactically valid legacy empty route array', () => {
    const { fresh } = makeProject()
    const merged = mergeRouteFiles(fresh, 'export const routes = []\nexport default routes\n')
    expect(merged).toContain('./pages/index.tsx')
    expect(merged).toContain('@vite-file-router-manifest')
  })

  it('does not recover a valid prefix from a file with a broken tail', () => {
    const { fresh } = makeProject()
    const malformed = fresh.replace(
      '\nexport default routes',
      '\n  { path: "unfinished"\nexport default routes',
    )
    expect(() => mergeRouteFiles(fresh, malformed)).toThrow(RouteMergeError)
  })
})
