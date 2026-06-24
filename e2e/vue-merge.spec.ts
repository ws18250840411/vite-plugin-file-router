import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { test, expect } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const demoRoot = path.resolve(__dirname, '../demo/vue')
const routesFile = path.join(demoRoot, 'src/routes.ts')
const pagesDir = path.join(demoRoot, 'src/pages')
const mergePageFile = path.join(pagesDir, 'merge-e2e.vue')
const indexPageFile = path.join(pagesDir, 'index.vue')

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForRoutes(
  predicate: (content: string) => boolean,
  timeoutMs = 30_000,
  intervalMs = 200,
): Promise<string> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(routesFile)) {
      const content = fs.readFileSync(routesFile, 'utf-8')
      if (predicate(content)) return content
    }
    await sleep(intervalMs)
  }
  throw new Error(`Timeout waiting for routes.ts condition (${routesFile})`)
}

async function waitForRoutesStable(
  predicate: (content: string) => boolean,
  stableMs = 800,
  timeoutMs = 30_000,
): Promise<string> {
  const start = Date.now()
  let lastContent = ''
  let stableSince = 0

  while (Date.now() - start < timeoutMs) {
    if (!fs.existsSync(routesFile)) {
      stableSince = 0
      await sleep(100)
      continue
    }

    const content = fs.readFileSync(routesFile, 'utf-8')
    if (!predicate(content)) {
      lastContent = content
      stableSince = 0
      await sleep(150)
      continue
    }

    if (content !== lastContent) {
      lastContent = content
      stableSince = Date.now()
      await sleep(100)
      continue
    }

    if (stableSince > 0 && Date.now() - stableSince >= stableMs) {
      return content
    }

    await sleep(100)
  }

  throw new Error(`Timeout waiting for stable routes.ts (${routesFile})`)
}

async function resetRoutesFromPages() {
  if (fs.existsSync(routesFile)) fs.unlinkSync(routesFile)
  const now = new Date()
  fs.utimesSync(indexPageFile, now, now)
  await waitForRoutesStable(
    (text) =>
      text.includes('./pages/about.vue')
      && !text.includes('e2eMerge')
      && !text.includes('./pages/merge-e2e.vue'),
  )
}

async function waitForDevUrl(url: string, timeoutMs = 30_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      // dev server still compiling
    }
    await sleep(200)
  }
  throw new Error(`Timeout waiting for dev url ${url}`)
}

async function applyMergeScenario(): Promise<string> {
  let routes = fs.readFileSync(routesFile, 'utf-8')
  if (!routes.includes('e2eMerge')) {
    routes = routes.replace(
      'meta: { title: "About" }',
      'meta: { e2eMerge: "keep-about", title: "About" }',
    )
    fs.writeFileSync(routesFile, routes)
  }

  fs.writeFileSync(
    mergePageFile,
    `<script setup lang="ts">
import DemoPage from '../components/DemoPage.vue'
</script>

<template>
  <div data-testid="merge-e2e-page">
    <DemoPage
      title="Merge E2E"
      lead="Added at runtime to verify Vue merge under Vite watch."
      :badges="[{ label: 'route', value: '/merge-e2e' }]"
    />
  </div>
</template>
`,
  )

  return waitForRoutesStable(
    (text) => text.includes('e2eMerge: "keep-about"') && text.includes('./pages/merge-e2e.vue'),
  )
}

test.describe('vue merge hot update', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(async () => {
    if (fs.existsSync(mergePageFile)) fs.unlinkSync(mergePageFile)
    await resetRoutesFromPages()
  })

  test.afterEach(async () => {
    if (fs.existsSync(mergePageFile)) fs.unlinkSync(mergePageFile)
    await resetRoutesFromPages()
  })

  test('preserves hand-edited about meta when a new page is added under dev watch', async () => {
    const merged = await applyMergeScenario()

    expect(merged).toContain('e2eMerge: "keep-about"')
    expect(merged).toMatch(/path: "about",[\s\S]*?e2eMerge: "keep-about"/)
    expect(merged).toContain('./pages/merge-e2e.vue')
    expect(merged).toMatch(/path: "merge-e2e"/)
  })

  test('navigates merged vue routes in the browser after routes.ts regen', async ({ page }) => {
    await waitForDevUrl('http://localhost:5200/')
    await expect(async () => {
      await page.goto('/', { waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('root-layout')).toBeVisible({ timeout: 5_000 })
    }).toPass({ timeout: 30_000 })

    await applyMergeScenario()
    await waitForDevUrl('http://localhost:5200/merge-e2e')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('root-layout')).toBeVisible({ timeout: 15_000 })

    await expect(async () => {
      await page.goto('/merge-e2e', { waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('merge-e2e-page')).toBeVisible({ timeout: 10_000 })
    }).toPass({ timeout: 30_000 })

    await expect(async () => {
      await page.goto('/about', { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('heading', { name: 'About' })).toBeVisible({ timeout: 10_000 })
    }).toPass({ timeout: 20_000 })
  })
})
