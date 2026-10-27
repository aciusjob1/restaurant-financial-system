import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { computePinLookup } from '../src/lib/pinLookup.js';

const app = createApp();

// Disjoint PIN literals from pinAuth.test.ts (135790, 246802, 111222,
// 333444, 555666, 777888, 888999) so parallel test files can never
// collide on the pinLookup unique index.
const OWNER = {
  username: 'pinonly-owner',
  password: 'OwnerPassword!234',
  fullName: 'PIN-Only Owner',
  role: 'OWNER' as const,
};
const MANAGER = {
  username: 'pinonly-manager',
  password: 'ManagerPassword!234',
  fullName: 'PIN-Only Manager',
  role: 'MANAGER' as const,
};
const WAITER = {
  username: 'pinonly-waiter',
  password: 'WaiterPassword!234',
  fullName: 'PIN-Only Waiter',
  role: 'WAITER' as const,
  pin: '404040',
};
const WAITER2 = {
  username: 'pinonly-waiter2',
  password: 'WaiterPassword!234',
  fullName: 'PIN-Only Waiter 2',
  role: 'WAITER' as const,
  pin: '505050',
};
const WAITER3 = {
  username: 'pinonly-waiter3',
  password: 'WaiterPassword!234',
  fullName: 'PIN-Only Waiter 3',
  role: 'WAITER' as const,
  pin: '606060',
};

const ALL_USERS = [OWNER, MANAGER, WAITER, WAITER2, WAITER3];

async function cleanup() {
  const usernames = ALL_USERS.map((u) => u.username);
  await prisma.session.deleteMany({ where: { user: { username: { in: usernames } } } });
  await prisma.user.deleteMany({ where: { username: { in: usernames } } });
}

async function loginAs(u: { username: string; password: string }) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({
    username: u.username,
    password: u.password,
  });
  expect(res.status).toBe(200);
  return agent;
}

// Direct DB seeding of the PIN state, including pinLookup. Used for
// tests that need to bypass the set-pin endpoint.
async function setPinDirect(
  username: string,
  pin: string,
  extra: { lockedUntil?: Date | null; failedPinAttempts?: number } = {}
) {
  const pinHash = await argon2.hash(pin, { type: argon2.argon2id });
  const pinLookup = computePinLookup(pin);
  await prisma.user.update({
    where: { username },
    data: {
      pinHash,
      pinLookup,
      failedPinAttempts: extra.failedPinAttempts ?? 0,
      lockedUntil: extra.lockedUntil ?? null,
      pinSetByUserId: null,
      pinSetAt: null,
    },
  });
}

async function clearPinState(username: string) {
  await prisma.user.update({
    where: { username },
    data: {
      pinHash: null,
      pinLookup: null,
      failedPinAttempts: 0,
      lockedUntil: null,
    },
  });
}

beforeAll(async () => {
  await cleanup();
  for (const u of ALL_USERS) {
    await prisma.user.create({
      data: {
        username: u.username,
        fullName: u.fullName,
        passwordHash: await argon2.hash(u.password, { type: argon2.argon2id }),
        role: u.role,
        isActive: true,
      },
    });
  }
});

afterAll(async () => {
  try {
    await cleanup();
  } catch (e) {
    console.error('[pinAuthOnly teardown] cleanup failed:', e);
  }
});

describe('POST /api/v1/auth/login-pin-only', () => {
  it('succeeds with a correct PIN and returns the same shape as login-pin', async () => {
    await setPinDirect(WAITER.username, WAITER.pin);
    const waiter = await prisma.user.findUniqueOrThrow({ where: { username: WAITER.username } });

    const res = await request(app)
      .post('/api/v1/auth/login-pin-only')
      .send({ pin: WAITER.pin });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      user: {
        id: waiter.id,
        username: WAITER.username,
        fullName: WAITER.fullName,
        role: 'WAITER',
        language: null,
      },
    });
    // Login also sets the rfs_device cookie first, so find the session cookie
    // by name instead of relying on header order.
    const cookies = (res.headers['set-cookie'] ?? []) as unknown as string[];
    const setCookie = cookies.find((c) => c.startsWith('rfs_session=')) ?? '';
    expect(setCookie).not.toBe('');
    expect(setCookie).toMatch(/HttpOnly/i);
  });

  it('returns uniform 401 for an unknown PIN', async () => {
    await setPinDirect(WAITER.username, WAITER.pin);

    const res = await request(app)
      .post('/api/v1/auth/login-pin-only')
      .send({ pin: '999999' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns uniform 401 when pinLookup is null (legacy waiter)', async () => {
    // Simulate a waiter whose PIN was set before pinLookup existed:
    // pinHash present, pinLookup null.
    const pinHash = await argon2.hash(WAITER.pin, { type: argon2.argon2id });
    await prisma.user.update({
      where: { username: WAITER.username },
      data: { pinHash, pinLookup: null, failedPinAttempts: 0, lockedUntil: null },
    });

    const res = await request(app)
      .post('/api/v1/auth/login-pin-only')
      .send({ pin: WAITER.pin });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns uniform 401 when the account is locked', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await setPinDirect(WAITER.username, WAITER.pin, {
      lockedUntil: tomorrow,
      failedPinAttempts: 5,
    });

    const res = await request(app)
      .post('/api/v1/auth/login-pin-only')
      .send({ pin: WAITER.pin });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');

    // Lock state is untouched by the rejected attempt.
    const after = await prisma.user.findUniqueOrThrow({ where: { username: WAITER.username } });
    expect(after.failedPinAttempts).toBe(5);
    expect(after.lockedUntil).not.toBeNull();
  });

  it('returns uniform 401 for an inactive waiter', async () => {
    await setPinDirect(WAITER.username, WAITER.pin);
    await prisma.user.update({
      where: { username: WAITER.username },
      data: { isActive: false },
    });

    try {
      const res = await request(app)
        .post('/api/v1/auth/login-pin-only')
        .send({ pin: WAITER.pin });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    } finally {
      await prisma.user.update({
        where: { username: WAITER.username },
        data: { isActive: true },
      });
    }
  });

  it('returns uniform 401 for a MANAGER with a pinLookup set', async () => {
    // Seed the manager with a pinHash + pinLookup directly. The role
    // filter in authenticateByPinOnly must exclude them regardless.
    await setPinDirect(MANAGER.username, '121212');

    try {
      const res = await request(app)
        .post('/api/v1/auth/login-pin-only')
        .send({ pin: '121212' });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    } finally {
      await clearPinState(MANAGER.username);
    }
  });

  it('a wrong PIN does not increment any user failedPinAttempts', async () => {
    // Seed two PINs so there is state that could be wrongly mutated.
    await setPinDirect(WAITER.username, WAITER.pin);
    await setPinDirect(WAITER2.username, WAITER2.pin);

    const before1 = await prisma.user.findUniqueOrThrow({ where: { username: WAITER.username } });
    const before2 = await prisma.user.findUniqueOrThrow({ where: { username: WAITER2.username } });

    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post('/api/v1/auth/login-pin-only')
        .send({ pin: '000000' });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    }

    const after1 = await prisma.user.findUniqueOrThrow({ where: { username: WAITER.username } });
    const after2 = await prisma.user.findUniqueOrThrow({ where: { username: WAITER2.username } });

    expect(after1.failedPinAttempts).toBe(before1.failedPinAttempts);
    expect(after1.lockedUntil).toBeNull();
    expect(after2.failedPinAttempts).toBe(before2.failedPinAttempts);
    expect(after2.lockedUntil).toBeNull();
  });

  it('a correct PIN after an expired lock clears the counter and lock', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await setPinDirect(WAITER.username, WAITER.pin, {
      lockedUntil: yesterday,
      failedPinAttempts: 5,
    });

    const res = await request(app)
      .post('/api/v1/auth/login-pin-only')
      .send({ pin: WAITER.pin });

    expect(res.status).toBe(200);

    const after = await prisma.user.findUniqueOrThrow({ where: { username: WAITER.username } });
    expect(after.failedPinAttempts).toBe(0);
    expect(after.lockedUntil).toBeNull();
  });
});

describe('POST /api/v1/auth/set-pin — pinLookup side effects', () => {
  it('writes pinLookup on the target waiter', async () => {
    await clearPinState(WAITER2.username);
    const owner = await loginAs(OWNER);
    const target = await prisma.user.findUniqueOrThrow({ where: { username: WAITER2.username } });

    const res = await owner.post('/api/v1/auth/set-pin').send({
      userId: target.id,
      pin: '707070',
    });

    expect(res.status).toBe(200);

    const after = await prisma.user.findUniqueOrThrow({ where: { username: WAITER2.username } });
    expect(after.pinLookup).not.toBeNull();
    expect(after.pinLookup).toBe(computePinLookup('707070'));
  });

  it('rejects a duplicate PIN with 409 PIN_ALREADY_IN_USE', async () => {
    // WAITER holds '808080'; WAITER3 must not be able to take it.
    await setPinDirect(WAITER.username, '808080');
    await clearPinState(WAITER3.username);

    const owner = await loginAs(OWNER);
    const target = await prisma.user.findUniqueOrThrow({ where: { username: WAITER3.username } });

    const res = await owner.post('/api/v1/auth/set-pin').send({
      userId: target.id,
      pin: '808080',
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PIN_ALREADY_IN_USE');

    // WAITER3's state is untouched.
    const after = await prisma.user.findUniqueOrThrow({ where: { username: WAITER3.username } });
    expect(after.pinHash).toBeNull();
    expect(after.pinLookup).toBeNull();
  });

  it('resetting a waiter PIN swaps the lookup so the old PIN no longer works', async () => {
    await clearPinState(WAITER2.username);
    const owner = await loginAs(OWNER);
    const target = await prisma.user.findUniqueOrThrow({ where: { username: WAITER2.username } });

    // First PIN
    const set1 = await owner.post('/api/v1/auth/set-pin').send({
      userId: target.id,
      pin: '343434',
    });
    expect(set1.status).toBe(200);

    const ok1 = await request(app)
      .post('/api/v1/auth/login-pin-only')
      .send({ pin: '343434' });
    expect(ok1.status).toBe(200);

    // Reset
    const set2 = await owner.post('/api/v1/auth/set-pin').send({
      userId: target.id,
      pin: '454545',
    });
    expect(set2.status).toBe(200);

    // Old PIN no longer resolves
    const old = await request(app)
      .post('/api/v1/auth/login-pin-only')
      .send({ pin: '343434' });
    expect(old.status).toBe(401);
    expect(old.body.code).toBe('INVALID_CREDENTIALS');

    // New PIN works
    const fresh = await request(app)
      .post('/api/v1/auth/login-pin-only')
      .send({ pin: '454545' });
    expect(fresh.status).toBe(200);
  });

  it('set-pin clears failedPinAttempts and lockedUntil on the target', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await setPinDirect(WAITER3.username, WAITER3.pin, {
      lockedUntil: tomorrow,
      failedPinAttempts: 5,
    });

    const owner = await loginAs(OWNER);
    const target = await prisma.user.findUniqueOrThrow({ where: { username: WAITER3.username } });

    const res = await owner.post('/api/v1/auth/set-pin').send({
      userId: target.id,
      pin: '232323',
    });
    expect(res.status).toBe(200);

    const after = await prisma.user.findUniqueOrThrow({ where: { username: WAITER3.username } });
    expect(after.failedPinAttempts).toBe(0);
    expect(after.lockedUntil).toBeNull();
    expect(after.pinLookup).toBe(computePinLookup('232323'));
  });
});