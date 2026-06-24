import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resolveOptions, runGeneration } from '../generate'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const demoRoot = path.resolve(__dirname, '../../demo/react')
const routesFile = path.join(demoRoot, 'src/routes.ts')
const pagesDir = path.join(demoRoot, 'src/pages')
const contactPage = path.join(pagesDir, 'contact.tsx')

const resolved = resolveOptions(demoRoot, {
  pagesDir: 'src/pages',
  outFile: 'src/routes.ts',
})

describe('demo/react merge', () => {
  let savedRoutes: string | null = null

  beforeEach(() => {
    if (fs.existsSync(routesFile)) savedRoutes = fs.readFileSync(routesFile, 'utf-8')
    if (fs.existsSync(contactPage)) fs.unlinkSync(contactPage)
    runGeneration(resolved, () => {}, () => {})
  })

  afterEach(() => {
    if (fs.existsSync(contactPage)) fs.unlinkSync(contactPage)
    if (savedRoutes !== null) {
      fs.writeFileSync(routesFile, savedRoutes)
    } else if (fs.existsSync(routesFile)) {
      fs.unlinkSync(routesFile)
      runGeneration(resolved, () => {}, () => {})
    }
    savedRoutes = null
  })

  it('preserves hand-edited about route when contact page is added', () => {
    const baseline = fs.readFileSync(routesFile, 'utf-8')
    expect(baseline).toContain('./pages/about.tsx')

    const edited = baseline.replace(
      'handle: { title: "About" }',
      'handle: { title: "About", demoMerge: true }',
    )
    fs.writeFileSync(routesFile, edited)

    fs.writeFileSync(
      contactPage,
      `import DemoPage from '../components/DemoPage'\nexport default function Contact() {\n  return <DemoPage title="Contact" lead="merge demo" badges={[]} />\n}\n`,
    )

    runGeneration(resolved, () => {}, () => {})

    const next = fs.readFileSync(routesFile, 'utf-8')
    expect(next).toContain('demoMerge: true')
    expect(next).toContain('./pages/contact.tsx')
    expect(next).not.toMatch(/,\s*,/)
  })
})
