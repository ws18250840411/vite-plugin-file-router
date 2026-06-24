import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { mergeRouteFiles } from '../emit/merge-routes'
import {
  collectPositionedRouteSlices,
  collectRouteSliceMap,
} from '../emit/parse-routes-file'
import {
  generateRouteFiles,
  resolveOptions,
  runGeneration,
  scanPages,
} from '../generate'
import type { RouteNode } from '../types'

function walkNodes(node: RouteNode, visit: (node: RouteNode) => void) {
  visit(node)
  for (const child of node.children) walkNodes(child, visit)
}

function findPageNode(root: RouteNode, pageName: string): RouteNode | undefined {
  let found: RouteNode | undefined
  walkNodes(root, (node) => {
    if (node.filePath?.endsWith(pageName)) found = node
  })
  return found
}

function regenWithTransform(
  root: string,
  pagesDir: string,
  transformRoutes?: (root: RouteNode) => RouteNode | void,
) {
  const outFile = path.join(root, 'src', 'routes.ts')
  const resolved = resolveOptions(root, {
    pagesDir: 'src/pages',
    outFile: 'src/routes.ts',
    transformRoutes,
  })
  const rootNode = scanPages(resolved)
  const { routesContent } = generateRouteFiles(resolved, rootNode)
  return { resolved, routesContent, outFile }
}

function replaceRouteBlock(content: string, routeId: string, block: string): string {
  const slice = collectPositionedRouteSlices(content).find((s) => s.id === routeId)
  if (!slice) throw new Error(`missing route ${routeId}`)
  return content.slice(0, slice.start) + block + content.slice(slice.end)
}

function patchHandle(content: string, routeId: string, marker: string): string {
  const slice = collectRouteSliceMap(content).get(routeId) ?? ''
  if (!slice) throw new Error(`route missing: ${routeId}`)
  const block = slice.includes('handle:')
    ? slice.replace(/handle: \{[^}]+\}/, `handle: { userMarker: "${marker}" }`)
    : slice.replace(
        /(path: [^\n]+,|index: true,|lazy:)/,
        `handle: { userMarker: "${marker}" },\n        $1`,
      )
  return replaceRouteBlock(content, routeId, block)
}

describe('transformRoutes + merge', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  function makeProject(pages: Record<string, string>) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfr-transform-'))
    dirs.push(root)
    const pagesDir = path.join(root, 'src', 'pages')
    fs.mkdirSync(pagesDir, { recursive: true })
    for (const [rel, content] of Object.entries(pages)) {
      const file = path.join(pagesDir, rel)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, content)
    }
    return { root, pagesDir }
  }

  const tagAboutFromTransform = (root: RouteNode) => {
    const about = findPageNode(root, 'about.tsx')
    if (about) about.meta = { ...about.meta, transformTag: 'from-transform' }
    return root
  }

  it('applies transformRoutes output on first generation', () => {
    const { root } = makeProject({
      'index.tsx': 'export default function Home() {}',
      'about.tsx': 'export default function About() {}',
    })
    const { routesContent, outFile } = regenWithTransform(root, '', tagAboutFromTransform)

    expect(routesContent).toContain('transformTag: "from-transform"')
    expect(routesContent).toContain('./pages/about.tsx')

    fs.writeFileSync(outFile, routesContent)
    const { routesContent: second } = regenWithTransform(root, '', tagAboutFromTransform)
    expect(mergeRouteFiles(second, routesContent)).toBe(routesContent)
  })

  it('local-wins over transformRoutes handle when user edited the same page', () => {
    const { root } = makeProject({
      'index.tsx': 'export default function Home() {}',
      'about.tsx': 'export default function About() {}',
      'contact.tsx': 'export default function Contact() {}',
    })

    const { routesContent } = regenWithTransform(root, '', tagAboutFromTransform)
    const edited = patchHandle(routesContent, './pages/about.tsx', 'user-wins')

    fs.writeFileSync(path.join(root, 'src', 'pages', 'help.tsx'), 'export default function Help() {}')
    const { routesContent: fresh } = regenWithTransform(root, '', tagAboutFromTransform)
    const merged = mergeRouteFiles(fresh, edited)

    expect(merged).toContain('userMarker: "user-wins"')
    expect(merged).not.toContain('transformTag: "from-transform"')
    expect(merged).toContain('./pages/help.tsx')
    expect(merged).toContain('./pages/contact.tsx')
  })

  it('drops a page removed by transformRoutes even when user edited it', () => {
    const { root } = makeProject({
      'index.tsx': 'export default function Home() {}',
      'about.tsx': 'export default function About() {}',
      'help.tsx': 'export default function Help() {}',
    })

    const { routesContent } = regenWithTransform(root, '', tagAboutFromTransform)
    const edited = patchHandle(routesContent, './pages/help.tsx', 'keep-help')

    const removeHelp = (tree: RouteNode) => {
      walkNodes(tree, (node) => {
        node.children = node.children.filter((child) => !child.filePath?.endsWith('help.tsx'))
      })
      return tree
    }

    const { routesContent: fresh } = regenWithTransform(root, '', removeHelp)
    const merged = mergeRouteFiles(fresh, edited)

    expect(merged).not.toContain('./pages/help.tsx')
    expect(merged).not.toContain('userMarker: "keep-help"')
    expect(merged).toContain('./pages/about.tsx')
  })

  it('uses transformRoutes sibling order when user reordered routes.ts', () => {
    const { root } = makeProject({
      'index.tsx': 'export default function Home() {}',
      'about.tsx': 'export default function About() {}',
      'contact.tsx': 'export default function Contact() {}',
    })

    const swapAboutContact = (tree: RouteNode) => {
      const pages = tree.children.filter((child) => child.filePath)
      const about = pages.find((p) => p.filePath?.endsWith('about.tsx'))
      const contact = pages.find((p) => p.filePath?.endsWith('contact.tsx'))
      if (!about || !contact) return tree
      const others = tree.children.filter((child) => child !== about && child !== contact)
      tree.children = [...others, contact, about]
      return tree
    }

    const { routesContent: baseline } = regenWithTransform(root, '', tagAboutFromTransform)
    const aboutIdx = baseline.indexOf('./pages/about.tsx')
    const contactIdx = baseline.indexOf('./pages/contact.tsx')
    expect(aboutIdx).toBeGreaterThan(-1)
    expect(contactIdx).toBeGreaterThan(aboutIdx)

    const edited = patchHandle(baseline, './pages/about.tsx', 'order-test')
    const { routesContent: fresh } = regenWithTransform(root, '', swapAboutContact)
    const merged = mergeRouteFiles(fresh, edited)

    const mergedAbout = merged.indexOf('./pages/about.tsx')
    const mergedContact = merged.indexOf('./pages/contact.tsx')
    expect(mergedContact).toBeLessThan(mergedAbout)
    expect(merged).toContain('userMarker: "order-test"')
  })

  it('runGeneration merges transform output with preserved user edits', () => {
    const { root } = makeProject({
      'index.tsx': 'export default function Home() {}',
      'about.tsx': 'export default function About() {}',
    })
    const outFile = path.join(root, 'src', 'routes.ts')

    const { routesContent } = regenWithTransform(root, '', tagAboutFromTransform)
    const edited = patchHandle(routesContent, './pages/about.tsx', 'run-gen')
    fs.writeFileSync(outFile, edited)

    fs.writeFileSync(path.join(root, 'src', 'pages', 'news.tsx'), 'export default function News() {}')
    const resolved = resolveOptions(root, {
      pagesDir: 'src/pages',
      outFile: 'src/routes.ts',
      transformRoutes: tagAboutFromTransform,
    })
    runGeneration(resolved, () => {}, () => {})

    const written = fs.readFileSync(outFile, 'utf-8')
    expect(written).toContain('userMarker: "run-gen"')
    expect(written).toContain('./pages/news.tsx')
    expect(written).not.toContain('transformTag: "from-transform"')
  })
})
