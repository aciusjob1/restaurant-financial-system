// Source of truth for E2E user identities. Pure data — no Prisma,
// no dotenv, no side effects. Imported by both global-setup.ts (which
// upserts the users) and helpers/auth.ts (which logs in as them).
//
// The owner user is NOT defined here: it comes from the base seed
// (backend/.env SEED_OWNER_*). global-setup.ts verifies it exists but
// never creates or modifies it.

export type Role = 'owner' | 'manager' | 'waiter';

export type E2eUser = {
  username: string;
  password: string;
  fullName: string;
  role: 'WAITER' | 'MANAGER';
};

export const E2E_USERS: readonly E2eUser[] = [
  {
    username: 'e2e-waiter',
    password: 'E2eWaiter!234',
    fullName: 'E2E Waiter',
    role: 'WAITER',
  },
  {
    username: 'e2e-manager',
    password: 'E2eManager!234',
    fullName: 'E2E Manager',
    role: 'MANAGER',
  },
] as const;

export function findE2eUser(username: string): E2eUser | undefined {
  return E2E_USERS.find((u) => u.username === username);
}