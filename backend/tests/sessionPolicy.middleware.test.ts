import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  sessionFindUnique: vi.fn(),
  sessionDelete: vi.fn(),
  sessionUpdate: vi.fn(),
  deviceUpdate: vi.fn(),
}));

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    session: {
      findUnique: mocks.sessionFindUnique,
      delete: mocks.sessionDelete,
      update: mocks.sessionUpdate,
    },
    device: { update: mocks.deviceUpdate },
  },
}));

import { requireAuth } from '../src/middleware/auth.js';
import { env } from '../src/config/env.js';

const HOUR = 60 * 60 * 1000;

function makeSession(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    id: 'sess-1',
    userId: 'user-1',
    deviceId: null,
    tokenHash: 'hash',
    ipAddress: null,
    createdAt: new Date(now - 1 * HOUR),
    lastSeenAt: new Date(now - 30 * 1000),
    expiresAt: new Date(now + 11 * HOUR),
    revokedAt: null,
    user: {
      id: 'user-1',
      username: 'owner',
      fullName: 'System Owner',
      role: 'OWNER',
      isActive: true,
      phone: null,
      language: 'en',
      autoApproveExpenses: false,
      autoReviewReconciliations: false,
      autoConfirmHandovers: false,
    },
    device: null,
    ...overrides,
  };
}

function makeReqRes() {
  const req = {
    cookies: { [env.SESSION_COOKIE_NAME]: 'token-abc' },
    ip: '127.0.0.1',
    get: () => 'test-agent',
  } as never;
  const setCalls: Array<{ name: string; val: string; opts: Record<string, unknown> }> = [];
  const clearCalls: Array<{ name: string; opts: Record<string, unknown> }> = [];
  const res = {
    setCalls,
    clearCalls,
    cookie(name: string, val: string, opts: Record<string, unknown>) {
      setCalls.push({ name, val, opts });
    },
    clearCookie(name: string, opts: Record<string, unknown>) {
      clearCalls.push({ name, opts });
    },
  } as never;
  return { req, res, setCalls, clearCalls };
}

function run(req: unknown, res: unknown): Promise<{ err: { status: number; code: string } | null; nextCalled: boolean }> {
  return new Promise((resolve) => {
    let nextCalled = false;
    requireAuth(req as never, res as never, (err?: unknown) => {
      nextCalled = !err;
      resolve({ err: (err as { status: number; code: string } | null) ?? null, nextCalled });
    });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sessionDelete.mockResolvedValue({});
  mocks.sessionUpdate.mockResolvedValue({});
  mocks.deviceUpdate.mockResolvedValue({});
});

describe('requireAuth session policy (mocked prisma, no DB)', () => {
  it('lets an active session through and slides the expiry to now + SESSION_TTL_HOURS', async () => {
    // lastSeen 5 minutes ago: past the 60-second heartbeat throttle, so the
    // renewal branch runs and reissues the cookie.
    mocks.sessionFindUnique.mockResolvedValue(
      makeSession({ lastSeenAt: new Date(Date.now() - 5 * 60 * 1000) })
    );
    const { req, res, setCalls } = makeReqRes();
    const { err, nextCalled } = await run(req, res);

    expect(err).toBeNull();
    expect(nextCalled).toBe(true);
    expect(mocks.sessionDelete).not.toHaveBeenCalled();

    expect(mocks.sessionUpdate).toHaveBeenCalledTimes(1);
    const renewed = mocks.sessionUpdate.mock.calls[0][0] as {
      data: { expiresAt: Date; lastSeenAt: Date };
    };
    const expected = Date.now() + env.SESSION_TTL_HOURS * HOUR;
    expect(renewed.data.expiresAt.getTime()).toBeGreaterThan(expected - 5000);
    expect(renewed.data.expiresAt.getTime()).toBeLessThanOrEqual(expected);

    // Cookie reissued with the same expiry and the security flags intact.
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0].name).toBe(env.SESSION_COOKIE_NAME);
    expect(setCalls[0].opts.httpOnly).toBe(true);
    expect(setCalls[0].opts.sameSite).toBe('lax');
    expect(setCalls[0].opts.path).toBe('/');
    expect((setCalls[0].opts.expires as Date).getTime()).toBe(renewed.data.expiresAt.getTime());
  });

  it('caps the renewed expiry at SESSION_MAX_AGE_HOURS from login', async () => {
    const now = Date.now();
    mocks.sessionFindUnique.mockResolvedValue(
      makeSession({
        createdAt: new Date(now - 20 * HOUR),
        lastSeenAt: new Date(now - 5 * 60 * 1000),
        expiresAt: new Date(now + 4 * HOUR),
      })
    );
    const { req, res, setCalls } = makeReqRes();
    const { err, nextCalled } = await run(req, res);

    expect(err).toBeNull();
    expect(nextCalled).toBe(true);

    const renewed = mocks.sessionUpdate.mock.calls[0][0] as {
      data: { expiresAt: Date };
    };
    const cap = now - 20 * HOUR + env.SESSION_MAX_AGE_HOURS * HOUR;
    expect(renewed.data.expiresAt.getTime()).toBeLessThanOrEqual(cap + 5000);
    expect((setCalls[0].opts.expires as Date).getTime()).toBeLessThanOrEqual(cap + 5000);
  });

  it('terminates an idle session with SESSION_IDLE_TIMEOUT, deletes it and clears the cookie', async () => {
    const now = Date.now();
    mocks.sessionFindUnique.mockResolvedValue(
      makeSession({
        createdAt: new Date(now - 5 * HOUR),
        lastSeenAt: new Date(now - 3 * HOUR), // 3h idle > 2h limit
        expiresAt: new Date(now + 9 * HOUR), // cookie itself still valid
      })
    );
    const { req, res, clearCalls } = makeReqRes();
    const { err, nextCalled } = await run(req, res);

    expect(nextCalled).toBe(false);
    expect(err).toMatchObject({ status: 401, code: 'SESSION_IDLE_TIMEOUT' });
    expect(mocks.sessionDelete).toHaveBeenCalledWith({ where: { id: 'sess-1' } });
    expect(mocks.sessionUpdate).not.toHaveBeenCalled();
    expect(clearCalls).toEqual([
      { name: env.SESSION_COOKIE_NAME, opts: { httpOnly: true, secure: false, sameSite: 'lax', path: '/' } },
    ]);
  });

  it('terminates a session past the absolute cap with SESSION_MAX_AGE even if it was active a moment ago', async () => {
    const now = Date.now();
    mocks.sessionFindUnique.mockResolvedValue(
      makeSession({
        createdAt: new Date(now - 25 * HOUR),
        lastSeenAt: new Date(now - 10 * 1000),
        expiresAt: new Date(now + 5 * HOUR), // legacy row renewed before the cap existed
      })
    );
    const { req, res } = makeReqRes();
    const { err, nextCalled } = await run(req, res);

    expect(nextCalled).toBe(false);
    expect(err).toMatchObject({ status: 401, code: 'SESSION_MAX_AGE' });
    expect(mocks.sessionDelete).toHaveBeenCalledWith({ where: { id: 'sess-1' } });
  });

  it('still reports SESSION_EXPIRED when the cookie expiry itself has passed', async () => {
    mocks.sessionFindUnique.mockResolvedValue(
      makeSession({ expiresAt: new Date(Date.now() - 1000) })
    );
    const { req, res } = makeReqRes();
    const { err, nextCalled } = await run(req, res);

    expect(nextCalled).toBe(false);
    expect(err).toMatchObject({ status: 401, code: 'SESSION_EXPIRED' });
  });

  it('rejects requests without a session cookie before touching the database', async () => {
    const { res } = makeReqRes();
    const req = { cookies: {}, ip: '127.0.0.1', get: () => 'test-agent' } as never;
    const { err, nextCalled } = await run(req, res);

    expect(nextCalled).toBe(false);
    expect(err).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    expect(mocks.sessionFindUnique).not.toHaveBeenCalled();
  });
});
