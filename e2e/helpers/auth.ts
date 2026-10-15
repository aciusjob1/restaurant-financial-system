import * as dotenv from 'dotenv';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { findE2eUser, type Role } from './users';

// Match global-setup.ts: load backend/.env from the repo root so
// SEED_OWNER_* are available. Playwright runs with CWD = repo root.
dotenv.config({ path: resolve(process.cwd(), 'backend', '.env') });

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(
      `[e2e] Missing env var ${name}. Ensure backend/.env exists and is ` +
        `populated (see backend/.env.example).`
    );
  }
  return v;
}

export type Creds = { username: string; password: string };

export const CREDS: Record<Role, Creds> = {
  owner: {
    username: requireEnv('SEED_OWNER_USERNAME'),
    password: requireEnv('SEED_OWNER_PASSWORD'),
  },
  manager: (() => {
    const u = findE2eUser('e2e-manager');
    if (!u) throw new Error('[e2e] e2e-manager not defined in helpers/users.ts');
    return { username: u.username, password: u.password };
  })(),
  waiter: (() => {
    const u = findE2eUser('e2e-waiter');
    if (!u) throw new Error('[e2e] e2e-waiter not defined in helpers/users.ts');
    return { username: u.username, password: u.password };
  })(),
};

export const POST_LOGIN_URL: Record<Role, RegExp> = {
  owner: /\/dashboard/,
  manager: /\/dashboard/,
  waiter: /\/kiosk/,
};

/**
 * Logs in via the UI. Never logs the password.
 *
 * After the login redirect resolves, waits for the shell to mount.
 * OpsShell fetches /auth/me and shows a "checking access" placeholder
 * until it resolves; without this wait, subsequent locators may run
 * against that placeholder. The waiter/kiosk route has no such shell,
 * so the wait applies only to owner and manager.
 */
export async function loginAs(page: Page, role: Role): Promise<void> {
  const c = CREDS[role];
  await page.goto('/login');
  await page.getByLabel(/username/i).fill(c.username);
  await page.getByLabel(/^password$/i).fill(c.password);
  await page.getByRole('button', { name: /sign in|ingia/i }).click();
  await page.waitForURL(POST_LOGIN_URL[role], { timeout: 15_000 });

  if (role === 'owner' || role === 'manager') {
    // The OpsShell renders a <nav> once /auth/me resolves.
    await page.getByRole('navigation').first().waitFor({
      state: 'visible',
      timeout: 15_000,
    });
  }
}