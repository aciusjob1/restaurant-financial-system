import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

const app = createApp();

const OWNER   = { username: 'sysacc-owner',   password: 'OwnerPass!234', role: 'OWNER'   as const };
const MANAGER = { username: 'sysacc-manager', password: 'MgrPass!234',   role: 'MANAGER' as const };
const WAITER  = { username: 'sysacc-waiter',  password: 'WaitPass!234',  role: 'WAITER'  as const };
const ALL = [OWNER.username, MANAGER.username, WAITER.username];

async function cleanup() {
  await prisma.session.deleteMany({ where: { user: { username: { in: ALL } } } });
  await prisma.user.deleteMany({ where: { username: { in: ALL } } });
}

async function seed() {
  await cleanup();
  for (const u of [OWNER, MANAGER, WAITER]) {
    await prisma.user.create({
      data: {
        username: u.username,
        fullName: u.username,
        role: u.role,
        passwordHash: await argon2.hash(u.password, { type: argon2.argon2id }),
        isActive: true,
      },
    });
  }
}

beforeAll(seed);
afterAll(cleanup);

async function loginAs(u: { username: string; password: string }) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ username: u.username, password: u.password });
  expect(res.status).toBe(200);
  return agent;
}

describe('GET /api/v1/system/access', () => {
  it('401 when unauthenticated', async () => {
    const res = await request(app).get('/api/v1/system/access');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('403 when WAITER', async () => {
    const agent = await loginAs(WAITER);
    const res = await agent.get('/api/v1/system/access');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('200 for MANAGER, body has candidates + confident only', async () => {
    const agent = await loginAs(MANAGER);
    const res = await agent.get('/api/v1/system/access');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.candidates)).toBe(true);
    expect(typeof res.body.confident).toBe('boolean');
    expect(res.body.user).toBeUndefined();
    expect(res.body.session).toBeUndefined();
    expect(res.body.token).toBeUndefined();
    expect(res.body.sessionToken).toBeUndefined();
  });

  it('200 for OWNER, same shape', async () => {
    const agent = await loginAs(OWNER);
    const res = await agent.get('/api/v1/system/access');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.candidates)).toBe(true);
    expect(typeof res.body.confident).toBe('boolean');
  });
});