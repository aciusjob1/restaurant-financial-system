import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

const app = createApp();

const OWNER = {
  username: 'pin-test-owner',
  password: 'OwnerPassword!234',
  fullName: 'PIN Test Owner',
  role: 'OWNER' as const,
};

const MANAGER = {
  username: 'pin-test-manager',
  password: 'ManagerPassword!234',
  fullName: 'PIN Test Manager',
  role: 'MANAGER' as const,
};

const WAITER = {
  username: 'pin-test-waiter',
  password: 'WaiterPassword!234',
  fullName: 'PIN Test Waiter',
  role: 'WAITER' as const,
  pin: '135790',
};

const WAITER2 = {
  username: 'pin-test-waiter2',
  password: 'WaiterPassword!234',
  fullName: 'PIN Test Waiter 2',
  role: 'WAITER' as const,
  pin: '246802',
};

const ALL_USERS = [OWNER, MANAGER, WAITER, WAITER2];

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

// Reset the waiter's PIN state between tests, so each test starts from a
// known 'fresh attempt cycle' state.
async function resetPinState(username: string, pin: string) {
  const pinHash = await argon2.hash(pin, { type: argon2.argon2id });
  await prisma.user.update({
    where: { username },
    data: {
      pinHash,
      failedPinAttempts: 0,
      lockedUntil: null,
      pinSetByUserId: null,
      pinSetAt: null,
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
    // Do not mask test failures with teardown errors.
    console.error('[pinAuth teardown] cleanup failed:', e);
  }
});

describe('POST /api/v1/auth/login-pin', () => {
  it('succeeds with a correct PIN and sets an HTTP-only session cookie', async () => {
    await resetPinState(WAITER.username, WAITER.pin);

    const res = await request(app)
      .post('/api/v1/auth/login-pin')
      .send({ username: WAITER.username, pin: WAITER.pin });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.role).toBe('WAITER');
    const setCookie = res.headers['set-cookie']?.[0] ?? '';
    expect(setCookie).toMatch(/rfs_session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
  });

  it('rejects a wrong PIN with uniform 401 and increments the counter', async () => {
    await resetPinState(WAITER.username, WAITER.pin);

    const res = await request(app)
      .post('/api/v1/auth/login-pin')
      .send({ username: WAITER.username, pin: '000000' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');

    const u = await prisma.user.findUniqueOrThrow({ where: { username: WAITER.username } });
    expect(u.failedPinAttempts).toBe(1);
    expect(u.lockedUntil).toBeNull();
  });

  it('increments the counter four times without locking', async () => {
    await resetPinState(WAITER.username, WAITER.pin);

    for (let i = 1; i <= 4; i++) {
      const res = await request(app)
        .post('/api/v1/auth/login-pin')
        .send({ username: WAITER.username, pin: '000000' });
      expect(res.status).toBe(401);
    }

    const u = await prisma.user.findUniqueOrThrow({ where: { username: WAITER.username } });
    expect(u.failedPinAttempts).toBe(4);
    expect(u.lockedUntil).toBeNull();
  });

  it('locks the account on the fifth failed attempt', async () => {
    await resetPinState(WAITER.username, WAITER.pin);

    for (let i = 1; i <= 5; i++) {
      const res = await request(app)
        .post('/api/v1/auth/login-pin')
        .send({ username: WAITER.username, pin: '000000' });
      expect(res.status).toBe(401);
    }

    const u = await prisma.user.findUniqueOrThrow({ where: { username: WAITER.username } });
    expect(u.failedPinAttempts).toBe(5);
    expect(u.lockedUntil).not.toBeNull();
    expect(u.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
  }, 60_000);

  it('rejects a correct PIN while locked and does not change the state', async () => {
    await resetPinState(WAITER.username, WAITER.pin);

    for (let i = 1; i <= 5; i++) {
      await request(app)
        .post('/api/v1/auth/login-pin')
        .send({ username: WAITER.username, pin: '000000' });
    }
    const before = await prisma.user.findUniqueOrThrow({ where: { username: WAITER.username } });
    expect(before.lockedUntil).not.toBeNull();

    const res = await request(app)
      .post('/api/v1/auth/login-pin')
      .send({ username: WAITER.username, pin: WAITER.pin });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');

    const after = await prisma.user.findUniqueOrThrow({ where: { username: WAITER.username } });
    expect(after.failedPinAttempts).toBe(before.failedPinAttempts);
    expect(after.lockedUntil!.getTime()).toBe(before.lockedUntil!.getTime());
  }, 60_000);

  it('rejects a wrong PIN while locked and does not extend the lock', async () => {
    await resetPinState(WAITER.username, WAITER.pin);

    for (let i = 1; i <= 5; i++) {
      await request(app)
        .post('/api/v1/auth/login-pin')
        .send({ username: WAITER.username, pin: '000000' });
    }
    const before = await prisma.user.findUniqueOrThrow({ where: { username: WAITER.username } });

    for (let i = 1; i <= 3; i++) {
      const res = await request(app)
        .post('/api/v1/auth/login-pin')
        .send({ username: WAITER.username, pin: '999999' });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    }

    const after = await prisma.user.findUniqueOrThrow({ where: { username: WAITER.username } });
    expect(after.failedPinAttempts).toBe(before.failedPinAttempts);
    expect(after.lockedUntil!.getTime()).toBe(before.lockedUntil!.getTime());
  }, 60_000);

  it('accepts a correct PIN after the lock expires, resetting the counter', async () => {
    await resetPinState(WAITER.username, WAITER.pin);
    await prisma.user.update({
      where: { username: WAITER.username },
      data: {
        failedPinAttempts: 5,
        lockedUntil: new Date(Date.now() - 60_000),
      },
    });

    const res = await request(app)
      .post('/api/v1/auth/login-pin')
      .send({ username: WAITER.username, pin: WAITER.pin });

    expect(res.status).toBe(200);

    const after = await prisma.user.findUniqueOrThrow({ where: { username: WAITER.username } });
    expect(after.failedPinAttempts).toBe(0);
    expect(after.lockedUntil).toBeNull();
  });

  it('starts a fresh attempt cycle on a wrong PIN after the lock expires', async () => {
    await resetPinState(WAITER.username, WAITER.pin);
    await prisma.user.update({
      where: { username: WAITER.username },
      data: {
        failedPinAttempts: 5,
        lockedUntil: new Date(Date.now() - 60_000),
      },
    });

    const res = await request(app)
      .post('/api/v1/auth/login-pin')
      .send({ username: WAITER.username, pin: '000000' });

    expect(res.status).toBe(401);

    const after = await prisma.user.findUniqueOrThrow({ where: { username: WAITER.username } });
    expect(after.failedPinAttempts).toBe(1);
    expect(after.lockedUntil).toBeNull();
  });

  it('returns uniform 401 for unknown username, without creating a user', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login-pin')
      .send({ username: 'does-not-exist-pin', pin: '123456' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');

    const u = await prisma.user.findUnique({ where: { username: 'does-not-exist-pin' } });
    expect(u).toBeNull();
  });

  it('returns uniform 401 for a user with no PIN set', async () => {
    // WAITER2 has no PIN configured — pinHash is null.
    const res = await request(app)
      .post('/api/v1/auth/login-pin')
      .send({ username: WAITER2.username, pin: '123456' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns uniform 401 for a MANAGER even with a valid PIN', async () => {
    // Give the manager a valid PIN directly, then try to log in via PIN.
    const pinHash = await argon2.hash('999888', { type: argon2.argon2id });
    await prisma.user.update({
      where: { username: MANAGER.username },
      data: { pinHash, failedPinAttempts: 0, lockedUntil: null },
    });

    const res = await request(app)
      .post('/api/v1/auth/login-pin')
      .send({ username: MANAGER.username, pin: '999888' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('POST /api/v1/auth/set-pin', () => {
  it('OWNER can set a WAITER PIN', async () => {
    const owner = await loginAs(OWNER);
    const waiter = await prisma.user.findUniqueOrThrow({ where: { username: WAITER2.username } });

    const res = await owner.post('/api/v1/auth/set-pin').send({
      userId: waiter.id,
      pin: '111222',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // PIN must never appear in the response body.
    expect(JSON.stringify(res.body)).not.toContain('111222');

    const after = await prisma.user.findUniqueOrThrow({ where: { username: WAITER2.username } });
    expect(after.pinHash).not.toBeNull();
    expect(after.pinSetByUserId).not.toBeNull();
    expect(after.pinSetAt).not.toBeNull();
  });

  it('MANAGER can set a WAITER PIN', async () => {
    const manager = await loginAs(MANAGER);
    const waiter = await prisma.user.findUniqueOrThrow({ where: { username: WAITER.username } });

    const res = await manager.post('/api/v1/auth/set-pin').send({
      userId: waiter.id,
      pin: '333444',
    });

    expect(res.status).toBe(200);
  });

  it('WAITER cannot call /set-pin (403)', async () => {
    const waiterAgent = await loginAs(WAITER);
    const target = await prisma.user.findUniqueOrThrow({ where: { username: WAITER2.username } });

    const res = await waiterAgent.post('/api/v1/auth/set-pin').send({
      userId: target.id,
      pin: '555666',
    });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('rejects a non-WAITER target with PIN_ONLY_FOR_WAITERS', async () => {
    const owner = await loginAs(OWNER);
    const manager = await prisma.user.findUniqueOrThrow({ where: { username: MANAGER.username } });

    const res = await owner.post('/api/v1/auth/set-pin').send({
      userId: manager.id,
      pin: '777888',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PIN_ONLY_FOR_WAITERS');
  });

  it('rejects a malformed PIN (not 6 digits)', async () => {
    const owner = await loginAs(OWNER);
    const waiter = await prisma.user.findUniqueOrThrow({ where: { username: WAITER.username } });

    const res = await owner.post('/api/v1/auth/set-pin').send({
      userId: waiter.id,
      pin: '12345', // 5 digits
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a nonexistent target user with USER_NOT_FOUND', async () => {
    const owner = await loginAs(OWNER);

    const res = await owner.post('/api/v1/auth/set-pin').send({
      userId: 'does-not-exist-user-id',
      pin: '888999',
    });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('USER_NOT_FOUND');
  });
});

describe('concurrency: PIN race', () => {
  it('a correct PIN and a wrong PIN fired in parallel never leave the account locked', async () => {
    // This test does not exercise the lockout threshold — the account starts
    // at counter 0, so a single concurrent wrong attempt cannot reach 5.
    // It proves the success path's atomic updateMany does not race with the
    // failure path's increment. A threshold-boundary race (start at counter 4)
    // is a separate test to be added when the boundary itself needs coverage.
    const N = 20;

    for (let i = 0; i < N; i++) {
      await resetPinState(WAITER.username, WAITER.pin);

      const wrong = request(app)
        .post('/api/v1/auth/login-pin')
        .send({ username: WAITER.username, pin: '000000' });
      const right = request(app)
        .post('/api/v1/auth/login-pin')
        .send({ username: WAITER.username, pin: WAITER.pin });

      const [wrongRes, rightRes] = await Promise.all([wrong, right]);

      // Wrong PIN is always rejected.
      expect(wrongRes.status).toBe(401);
      expect(wrongRes.body.code).toBe('INVALID_CREDENTIALS');

      // Correct PIN always succeeds, regardless of the wrong request's
      // position in the race: a single wrong attempt cannot lock an
      // account starting from counter 0.
      expect(rightRes.status).toBe(200);

      // Final state: reachable by one of the two valid serial orderings.
      //   wrong-then-right: counter 0, unlocked
      //   right-then-wrong: counter 1, unlocked
      const finalUser = await prisma.user.findUniqueOrThrow({
        where: { username: WAITER.username },
      });
      expect([0, 1]).toContain(finalUser.failedPinAttempts);
      expect(finalUser.lockedUntil).toBeNull();
    }
    // 20 iterations x 2 parallel logins x argon2 verify = ~40 KDF calls.
    // Under full-suite load (21 files in parallel, most of them now doing
    // real crypto), this exceeds the default 15s. The service is correct —
    // see authService.ts L68-90 (atomic raw SQL increment) and L130-136
    // (single-statement success clear). This test just needs headroom.
  }, 60_000);
});
