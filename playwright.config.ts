import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  projects: [
    {
      name: 'react',
      testMatch: 'react*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:5199',
      },
    },
    {
      name: 'vue',
      testMatch: 'vue*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:5200',
      },
    },
  ],
  webServer: {
    command: 'node e2e/serve.mjs',
    url: 'http://localhost:5298/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
