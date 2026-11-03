import { defineConfig } from 'vitest/config';

// Unit tests that mock prisma and must never touch a database. The default
// vitest.config.ts loads tests/setup.ts + globalSetup.ts, both of which run
// SQL; this config exists so DB-free tests can run against any environment.
process.env.NODE_ENV = 'test';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/sessionPolicy.middleware.test.ts', 'tests/deviceBlocking.unit.test.ts'],
    pool: 'forks',
    testTimeout: 15000,
  },
});
