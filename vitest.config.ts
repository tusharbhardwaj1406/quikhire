import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: { include: ['tests/db/**/*.test.ts', 'tests/unit/**/*.test.ts'], fileParallelism: false, testTimeout: 20000,
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54322/quikhire_test' } },
});
