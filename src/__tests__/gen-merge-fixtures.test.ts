import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { generateReactRoutes } from '../emit/codegen'
import { mergeRouteFiles } from '../emit/merge-routes'
import { collectRouteSliceMap } from '../emit/parse-routes-file'
import { scanDir } from '../core/scanner'

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'merge')

function normalize(content: string): string {
  return content.replace(/\r\n/g, '\n').trimEnd() + '\n'
}

function patchMarker(content: string, routeId: string, marker: string): string {
  const slice = collectRouteSliceMap(content).get(routeId) ?? ''
  const block = slice.includes('handle:')
    ? slice.replace(/handle: \{[^}]+\}/, `handle: { marker: "${marker}" }`)
    : slice.replace(
        /(path: [^\n]+,|index: true,|lazy:)/,
        `handle: { marker: "${marker}" },\n        $1`,
      )
  const positioned = content.indexOf(slice)
  return content.slice(0, positioned) + block + content.slice(positioned + slice.length)
}

function assertGolden(name: string, content: string): void {
  const file = path.join(FIXTURES, name)
  const normalized = normalize(content)
  if (process.env.UPDATE_MERGE_FIXTURES === '1') {
    fs.writeFileSync(file, normalized)
    return
  }
  expect(normalize(fs.readFileSync(file, 'utf8'))).toBe(normalized)
}

describe('generated merge fixtures', () => {
  it('matches golden files', () => {
    fs.mkdirSync(FIXTURES, { recursive: true })

    function makeProject(pages: Record<string, string>) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-fix-'))
      const pagesDir = path.join(root, 'src', 'pages')
      fs.mkdirSync(pagesDir, { recursive: true })
      for (const [rel, src] of Object.entries(pages)) {
        const file = path.join(pagesDir, rel)
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, src)
      }
      const outFile = path.join(root, 'src', 'routes.ts')
      const tree = scanDir(pagesDir, '', { extensions: ['tsx'], exclude: [], baseRoute: '' })
      const fresh = generateReactRoutes(tree, {
        root,
        pagesDir,
        outFile,
        framework: 'react',
        importMode: 'lazy',
        baseRoute: '',
      })
      return { pagesDir, fresh }
    }

    function regen(pagesDir: string) {
      const root = path.dirname(path.dirname(pagesDir))
      const outFile = path.join(root, 'src', 'routes.ts')
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

    {
      const { pagesDir, fresh } = makeProject({
        'index.tsx': 'export default function Home() {}',
        'about.tsx': 'export default function About() {}',
      })
      const edited = patchMarker(fresh, './pages/about.tsx', 'snap-about')
      fs.writeFileSync(path.join(pagesDir, 'help.tsx'), 'export default function Help() {}')
      assertGolden('plain-after-merge.ts', mergeRouteFiles(regen(pagesDir), edited))
    }

    {
      const { pagesDir, fresh } = makeProject({
        '_layout.tsx': 'export default () => null',
        'index.tsx': 'export default () => null',
        'about.tsx': 'export default () => null',
      })
      let edited = patchMarker(fresh, './pages/_layout.tsx', 'snap-layout')
      edited = patchMarker(edited, './pages/about.tsx', 'snap-about')
      fs.writeFileSync(path.join(pagesDir, 'help.tsx'), 'export default function Help() {}')
      assertGolden('layout-after-merge.ts', mergeRouteFiles(regen(pagesDir), edited))
    }

    {
      const { pagesDir, fresh } = makeProject({
        '_layout.tsx': 'export default () => null',
        'index.tsx': 'export default () => null',
        'about.tsx': 'export default () => null',
        'contact.tsx': 'export default () => null',
        'dashboard/_layout.tsx': 'export default () => null',
        'dashboard/index.tsx': 'export default () => null',
        'dashboard/settings.tsx': 'export default () => null',
      })
      let edited = patchMarker(fresh, './pages/dashboard/_layout.tsx', 'snap-dash')
      edited = patchMarker(edited, './pages/dashboard/settings.tsx', 'snap-settings')
      fs.unlinkSync(path.join(pagesDir, 'contact.tsx'))
      fs.writeFileSync(path.join(pagesDir, 'dashboard', 'profile.tsx'), 'export default () => null')
      assertGolden('dashboard-after-merge.ts', mergeRouteFiles(regen(pagesDir), edited))
    }
  })
})
