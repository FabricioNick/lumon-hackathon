import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  workers: 4,
  timeout: 30000,
  use: { baseURL: 'http://localhost:5189', headless: true },
  webServer: {
    command: 'npm run dev -- --host localhost --port 5189',
    url: 'http://localhost:5189',
    reuseExistingServer: false,
    env: {
      VITE_API_BASE_URL: 'http://localhost:5189/api/v1',
      VITE_WS_BASE_URL: 'ws://localhost:5189/api/v1',
    },
  },
})
