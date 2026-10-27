import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

const app = createApp();

const OWNER = { username: 'devblock-owner', password: 'OwnerPass!234', fullName: 'Dev Block Owner', role: 'OWNER' as const };
const MANAGER = { username: 'devblock-manager', password: 'MgrPass!234', fullName: 'Dev Block Manager', role: 'MANAGER' as const };
const WAITER = { username: 'devblock-waiter', password: 'WaitPass!234', fullName: 'Dev Block Waiter', role: 'WAITER' as const };
const ALL = [OWNER, MANAGER, WAITER];

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { username: { in: ALL.map((u) => u.username) } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length > 0) {
    await prisma.session.deleteMany({ where: { userId: { in: ids } } });
    await prisma.device.deleteMany({ where: { createdBy: { in: ids } } });
  }
  await prisma.user.deleteMany({ where: { username: { in: ALL.map((u) => u.username) } } });
}

async function seed() {
  await cleanup();
  for (const u of ALL) {
    await prisma.user.create({
      data: {
        username: u.username,
        fullName: u.fullName,
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
  const res = await agent.post('/api/v1/auth/login').send({
    username: u.username,
    password: u.password,
  });
  expect(res.status).toBe(200);
  return agent;
}

describe('Device blocking', () => {
  it('rejects block-all for non-owners', async () => {
    const anon = await request(app).post('/api/v1/system/devices/block-all').send({});
    expect(anon.status).toBe(401);

    const manager = await loginAs(MANAGER);
    const resM = await manager.post('/api/v1/system/devices/block-all').send({});
    expect(resM.status).toBe(403);
    expect(resM.body.code).toBe('FORBIDDEN');

    const waiter = await loginAs(WAITER);
    const resW = await waiter.post('/api/v1/system/devices/block-all').send({});
    expect(resW.status).toBe(403);
  });

  it('blocking one device revokes its sessions, denies requests, and denies login', async () => {
    const owner = await loginAs(OWNER);
    const waiter = await loginAs(WAITER);

    // Read the device that this specific agent is using. Another waiter
    // session may exist from an earlier test, so do not guess with findFirst.
    const waiterMe = await waiter.get('/api/v1/auth/me');
    expect(waiterMe.status).toBe(200);
    const waiterDeviceId = waiterMe.body.user.deviceId as string;
    const waiterSessionId = waiterMe.body.user.sessionId as string;
    expect(waiterDeviceId).toBeTruthy();
    expect(waiterSessionId).toBeTruthy();

    const block = await owner
      .post(`/api/v1/system/devices/${waiterDeviceId}/access`)
      .send({ status: 'BLOCKED', reason: 'certification block' });
    expect(block.status).toBe(200);
    expect(block.body.device.status).toBe('BLOCKED');
    expect(block.body.revokedSessions).toBe(1);

    const me = await waiter.get('/api/v1/auth/me');
    expect(me.status).toBe(401);
    // Blocking revokes the session first, so the next request is signed out.
    expect(me.body.code).toBe('SESSION_REVOKED');

    const reLogin = await waiter.post('/api/v1/auth/login').send({
      username: WAITER.username,
      password: WAITER.password,
    });
    expect(reLogin.status).toBe(403);
    expect(reLogin.body.code).toBe('DEVICE_BLOCKED');

    const restore = await owner
      .post(`/api/v1/system/devices/${waiterDeviceId}/access`)
      .send({ status: 'ALLOWED' });
    expect(restore.status).toBe(200);
    expect(restore.body.device.status).toBe('ALLOWED');

    const reLoginAllowed = await waiter.post('/api/v1/auth/login').send({
      username: WAITER.username,
      password: WAITER.password,
    });
    expect(reLoginAllowed.status).toBe(200);
  });
});
