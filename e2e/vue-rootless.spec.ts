import { expect, test } from '@playwright/test'

test('rootless directory layout renders through its full absolute path', async ({ page }) => {
  await page.goto('/admin/settings')
  await expect(page.getByTestId('settings-layout')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Rootless Settings' })).toBeVisible()
})

test('rootless route-group layout renders at the application root', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page.getByTestId('group-layout')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Rootless Dashboard' })).toBeVisible()
})
