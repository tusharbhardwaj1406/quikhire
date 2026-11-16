import { defineConfig } from '@playwright/test';

// End-to-end tests run the production build against a local Postgres and the Supabase Auth test stub.
// See docs/TESTING.md for how to start the stack.
export default defineConfig({
  testDir: 'tests/e2e', timeout: 120_000, workers: 1, reporter: [['list']],
  use: { baseURL: 'http://localhost:3000', launchOptions: { executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
});
