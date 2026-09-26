import { defineConfig } from 'vitest/config';

process.env.NODE_ENV = 'test';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    pool: 'forks',
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});