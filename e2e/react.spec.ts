import { test, expect } from '@playwright/test'

test('generated react routes drive navigation', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible()

  await page.getByRole('link', { name: 'About' }).click()
  await expect(page.getByRole('heading', { name: 'About' })).toBeVisible()
})

test('generated react routes handle 404 catch-all', async ({ page }) => {
  await page.goto('/does-not-exist')
  await expect(page.getByRole('heading', { name: 'Not Found' })).toBeVisible()
})

test('generated react routes render root _layout.tsx shell', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('root-layout')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible()
})

test('generated react routes render nested dashboard _layout.tsx', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page.getByTestId('root-layout')).toBeVisible()
  await expect(page.getByTestId('dashboard-layout')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Dashboard Home' })).toBeVisible()

  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard Settings' })).toBeVisible()
})

test('generated react routes render showcase page', async ({ page }) => {
  await page.goto('/showcase')
  await expect(page.getByRole('heading', { name: 'Showcase' })).toBeVisible()
  await expect(page.getByTestId('showcase-note')).toContainText('/showcase')
})

test('generated react routes wire loader export into lazy route', async ({ page }) => {
  await page.goto('/stats')
  await expect(page.getByRole('heading', { name: 'Stats' })).toBeVisible()
  await expect(page.getByTestId('stats-note')).toBeVisible()
})
