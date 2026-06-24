import { test, expect } from '@playwright/test'

test('generated vue routes drive navigation', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible()

  await page.getByRole('link', { name: 'About' }).click()
  await expect(page.getByRole('heading', { name: 'About' })).toBeVisible()
})

test('generated vue routes resolve dynamic params', async ({ page }) => {
  await page.goto('/user/42')
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()
  await expect(page.getByTestId('user-id')).toHaveText('42')
})

test('generated vue routes handle 404 catch-all', async ({ page }) => {
  await page.goto('/missing-page')
  await expect(page.getByRole('heading', { name: 'Not Found' })).toBeVisible()
})

test('generated vue routes render root _layout.vue shell', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('root-layout')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible()
})

test('generated vue routes render nested dashboard _layout.vue', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page.getByTestId('root-layout')).toBeVisible()
  await expect(page.getByTestId('dashboard-layout')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Dashboard Home' })).toBeVisible()

  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard Settings' })).toBeVisible()
  await expect(page.getByTestId('dashboard-layout')).toBeVisible()
})

test('generated vue routes apply <route> block meta', async ({ page }) => {
  await page.goto('/showcase')
  await expect(page.getByRole('heading', { name: 'Showcase' })).toBeVisible()
  await expect(page.getByTestId('showcase-meta')).toContainText('requiresAuth')
})
