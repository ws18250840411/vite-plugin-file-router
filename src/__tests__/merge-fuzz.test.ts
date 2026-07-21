import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import fc from 'fast-check'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { scanDir } from '../core/scanner'
import { generateReactRoutes } from '../emit/codegen'
import { RouteMergeError, mergeRouteFiles } from '../emit/merge-routes'
import { collectRouteSliceMap, parseRoutesFile } from '../emit/parse-routes-file'

const MANIFEST_RE = /\/\* @vite-file-router-manifest [A-Za-z0-9+/=]+ \*\//

describe('property-based route merge fuzzing', () => {
  let root = ''
  let pagesDir = ''
  let outFile = ''
  let baseline = ''
  let freshWithHelp = ''

  function generate(): string {
    const tree = scanDir(pagesDir, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
    return generateReactRoutes(tree, {
      root,
      pagesDir,
      outFile,
      framework: 'react',
      importMode: 'lazy',
      baseRoute: '',
    })
  }

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-fuzz-'))
    pagesDir = path.join(root, 'src', 'pages')
    outFile = path.join(root, 'src', 'routes.ts')
    fs.mkdirSync(pagesDir, { recursive: true })
    fs.writeFileSync(path.join(pagesDir, 'index.tsx'), 'export default function Home() {}')
    fs.writeFileSync(path.join(pagesDir, 'about.tsx'), 'export default function About() {}')
    baseline = generate()
    fs.writeFileSync(path.join(pagesDir, 'help.tsx'), 'export default function Help() {}')
    freshWithHelp = generate()
  })

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  function removeProperty(content: string, routeId: string, key: string): string {
    const parsed = parseRoutesFile(content)!
    const routes = parsed.routes.flatMap(function flatten(route): typeof parsed.routes {
      return [route, ...route.children.flatMap(flatten)]
    })
    const route = routes.find((item) => item.id === routeId)!
    const property = route.properties.find((item) => item.key === key)
    if (!property) return content
    let end = property.end
    while (end < content.length && (content[end] === ' ' || content[end] === '\t')) end++
    if (content[end] === ',') end++
    if (content[end] === '\r') end++
    if (content[end] === '\n') end++
    return content.slice(0, property.start) + content.slice(end)
  }

  function appendCustomRoute(content: string, salt: number): string {
    const parsed = parseRoutesFile(content)!
    const offset = parsed.array.end - 1
    const custom = [
      '  {',
      '    path: "/manual-' + salt + '",',
      '    lazy: async () => ({ Component: () => null }),',
      '  },',
      '',
    ].join('\n')
    return content.slice(0, offset) + custom + content.slice(offset)
  }

  it('preserves arbitrary valid local edits through structural churn', () => {
    const arbitrary = fc.record({
      path: fc.string({ maxLength: 48 }),
      payload: fc.jsonValue(),
      salt: fc.nat(1_000_000),
      deletePath: fc.boolean(),
      deleteLazy: fc.boolean(),
      customRoute: fc.boolean(),
      manifest: fc.constantFrom('keep', 'drop', 'corrupt'),
    })

    fc.assert(fc.property(arbitrary, (sample) => {
      let current = baseline.replace(
        'path: "/about"',
        () => 'path: ' + JSON.stringify('/' + sample.path),
      )
      if (sample.deletePath) current = removeProperty(current, 'page:about.tsx', 'path')
      if (sample.deleteLazy) current = removeProperty(current, 'page:about.tsx', 'lazy')

      const slice = collectRouteSliceMap(current).get('page:about.tsx')!
      const comment = Buffer.from(JSON.stringify(sample.payload)).toString('base64url').slice(0, 80)
      const editedSlice = slice.replace(
        /\n\s*}$/,
        () => '\n    handle: { fuzz: ' + JSON.stringify(sample.payload) + ' },'
          + '\n    ["fuzz-' + sample.salt + '"]: true,'
          + '\n    // fuzz:' + comment
          + '\n  }',
      )
      current = current.replace(slice, () => editedSlice)
      current = current.replace(
        'export const routes = [',
        () => 'const fuzzAudit' + sample.salt + ' = ' + JSON.stringify(sample.payload)
          + '\n\nexport const routes = [',
      )
      if (sample.customRoute) current = appendCustomRoute(current, sample.salt)
      if (sample.manifest === 'drop') current = current.replace(MANIFEST_RE, '')
      if (sample.manifest === 'corrupt') {
        const corrupt = Buffer.from(JSON.stringify({ version: 2, routes: null })).toString('base64')
        current = current.replace(MANIFEST_RE, '/* @vite-file-router-manifest ' + corrupt + ' */')
      }

      if (!parseRoutesFile(current)) throw new Error(`Fuzz mutation produced invalid input:\n${current}`)

      const merged = mergeRouteFiles(freshWithHelp, current)
      expect(parseRoutesFile(merged)).not.toBeNull()
      expect(merged).toContain('./pages/help.tsx')
      expect(merged).toContain('fuzzAudit' + sample.salt)
      expect(merged).toContain('["fuzz-' + sample.salt + '"]')
      expect(merged).toContain('// fuzz:' + comment)
      if (sample.customRoute) expect(merged).toContain('path: "/manual-' + sample.salt + '"')
      expect(mergeRouteFiles(freshWithHelp, merged)).toBe(merged)
    }), {
      seed: 0x5eed2026,
      numRuns: 500,
      endOnFailure: true,
    })
  }, 30_000)

  it('rejects arbitrary invalid tails instead of returning partial output', () => {
    fc.assert(fc.property(fc.string({ maxLength: 256 }), (tail) => {
      const invalid = baseline + '\n' + JSON.stringify(tail) + ' ???'
      expect(() => mergeRouteFiles(freshWithHelp, invalid)).toThrow(RouteMergeError)
    }), {
      seed: 0xbad2026,
      numRuns: 250,
      endOnFailure: true,
    })
  }, 15_000)
})
