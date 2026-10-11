import * as dotenv from 'dotenv';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

// Playwright runs with CWD = repo root (the directory containing
// playwright.config.ts). The app's env lives in backend/.env. Load it
// explicitly so SEED_OWNER_* and DATABASE_URL are available. PrismaClient
// is instantiated inside globalSetup (not at module scope) so it reads
// process.env after dotenv has populated it.
//
// Module note: this file is loaded as CommonJS by Playwright's TS
// transpiler — the root package.json does not set "type": "module" — so
// `import.meta.url` is not available. Use process.cwd() instead.
dotenv.config({ path: resolve(process.cwd(), 'backend', '.env') });

const E2E_USERS = [
  {
    username: 'e2e-waiter',
    password: 'E2eWaiter!234',
    fullName: 'E2E Waiter',
    role: 'WAITER' as const,
  },
  {
    username: 'e2e-manager',
    password: 'E2eManager!234',
    fullName: 'E2E Manager',
    role: 'MANAGER' as const,
  },
];

/**
 * Playwright global setup.
 *
 * Rules:
 * - The base seed (owner user, from prisma/seed.ts) must already exist.
 *   If not, abort with a clear message pointing to `pnpm backend:seed`.
 *   We do NOT create the owner here — silently creating an owner with a
 *   known password would mask a missing bootstrap step.
 * - The dedicated E2E users (e2e-waiter, e2e-manager) are upserted
 *   idempotently. Re-running does not delete them or touch any other user.
 * - Business data (shifts, collections, handovers, etc.) is cleaned up
 *   per-spec, not here. This file owns users only.
 *
 * Concurrency: playwright.config.ts runs with workers=1 and
 * fullyParallel=false, so specs run sequentially. Shared users are safe
 * under that constraint. If parallelism is ever enabled, revisit.
 */
export default async function globalSetup() {
  const prisma = new PrismaClient();
  try {
    const ownerUsername = process.env.SEED_OWNER_USERNAME?.trim();
    if (!ownerUsername) {
      throw new Error(
        '[e2e] SEED_OWNER_USERNAME is not set. Ensure backend/.env exists and ' +
          'contains the SEED_OWNER_* keys.'
      );
    }

    const owner = await prisma.user.findUnique({
      where: { username: ownerUsername },
    });
    if (!owner) {
      throw new Error(
        `[e2e] Base seed user "${ownerUsername}" does not exist.\n` +
          `      E2E tests require the base seed. Run: pnpm backend:seed`
      );
    }
    console.log(`[e2e] Verified base seed user: ${owner.username} (${owner.role})`);

    for (const u of E2E_USERS) {
      const passwordHash = await argon2.hash(u.password, { type: argon2.argon2id });
      await prisma.user.upsert({
        where: { username: u.username },
        update: {
          fullName: u.fullName,
          role: u.role,
          passwordHash,
          isActive: true,
        },
        create: {
          username: u.username,
          fullName: u.fullName,
          role: u.role,
          passwordHash,
          isActive: true,
        },
      });
      console.log(`[e2e] Upserted user: ${u.username} (${u.role})`);
    }
  } finally {
    await prisma.$disconnect();
  }
}