import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// Frontend-only checks use mocked auth config and WebSocket responses, never real accounts.
export default defineConfig({
  testDir: '.',
  testMatch: 'password-signup.spec.ts',
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:18425',
    locale: 'en-US',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
  webServer: {
    command: 'npm run dev -- --port 18425',
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    url: 'http://localhost:18425',
    reuseExistingServer: true,
  },
});
