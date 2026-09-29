import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

const app = createApp();

const MANAGER = {
  username: 'phase19e-manager',
  password: 'ManagerPassword!234',
  fullName: 'Phase 19e Manager',
  role: 'MANAGER' as const,
};

const PWUSER = {
  username: 'phase19e-pwuser',
  password: 'OriginalPass!2345',
  newPassword: 'RotatedPass!56789',
  fullName: 'Phase 19e Password User',
  role: 'MANAGER' as const,
};

const ALL = [MANAGER, PWUSER];

async function cleanup() {
  const usernames = ALL.map((u) => u.username);
  await prisma.session.deleteMany({ where: { user: { username: { in: usernames } } } });
  await prisma.user.deleteMany({ where: { username: { in: usernames } } });
}

async function makeUser(u: { username: string; password: string; fullName: string; role: 'OWNER' | 'MANAGER' | 'WAITER' | 'AUDITOR' }) {
  return prisma.user.create({
    data: {
      username: u.username,
      fullName: u.fullName,
      role: u.role,
      passwordHash: await argon2.hash(u.password, { type: argon2.argon2id }),
      isActive: true,
    },
  });
}

beforeAll(async () => {
  await cleanup();
  for (const u of ALL) await makeUser(u);
});

afterAll(cleanup);

async function loginAs(u: { username: string; password: string }) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ username: u.username, password: u.password });
  expect(res.status).toBe(200);
  return agent;
}

describe('PATCH /api/v1/auth/me - profile', () => {
  it('MANAGER edits own fullName; GET /me reflects it', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.patch('/api/v1/auth/me').send({ fullName: 'Renamed Manager' });
    expect(res.status).toBe(200);
    expect(res.body.user.fullName).toBe('Renamed Manager');

    const me = await m.get('/api/v1/auth/me');
    expect(me.body.user.fullName).toBe('Renamed Manager');
  });

  it('MANAGER edits own phone', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.patch('/api/v1/auth/me').send({ phone: '+255700000000' });
    expect(res.status).toBe(200);
    expect(res.body.user.phone).toBe('+255700000000');
  });

  it('MANAGER clears phone to null', async () => {
    const m = await loginAs(MANAGER);
    await m.patch('/api/v1/auth/me').send({ phone: '+255700000000' });
    const res = await m.patch('/api/v1/auth/me').send({ phone: null });
    expect(res.status).toBe(200);
    expect(res.body.user.phone).toBeNull();
  });

  it('rejects role in body with 400 (strict)', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.patch('/api/v1/auth/me').send({ role: 'OWNER' });
    expect(res.status).toBe(400);
  });

  it('rejects isActive in body with 400 (strict)', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.patch('/api/v1/auth/me').send({ isActive: false });
    expect(res.status).toBe(400);
  });

  it('empty body is a 200 no-op', async () => {
    const m = await loginAs(MANAGER);
    const before = await m.get('/api/v1/auth/me');
    const res = await m.patch('/api/v1/auth/me').send({});
    expect(res.status).toBe(200);
    expect(res.body.user.fullName).toBe(before.body.user.fullName);
  });

  it('unauthenticated PATCH /me is rejected (401)', async () => {
    const res = await request(app).patch('/api/v1/auth/me').send({ fullName: 'Hacker' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/auth/change-password', () => {
  beforeEach(async () => {
    await prisma.user.update({
      where: { username: PWUSER.username },
      data: { passwordHash: await argon2.hash(PWUSER.password, { type: argon2.argon2id }) },
    });
  });

  it('changes password with correct current; old fails; new works', async () => {
    const u = await loginAs(PWUSER);
    const res = await u.post('/api/v1/auth/change-password').send({
      currentPassword: PWUSER.password,
      newPassword: PWUSER.newPassword,
    });
    expect(res.status).toBe(200);

    const oldLogin = await request(app).post('/api/v1/auth/login').send({
      username: PWUSER.username, password: PWUSER.password,
    });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app).post('/api/v1/auth/login').send({
      username: PWUSER.username, password: PWUSER.newPassword,
    });
    expect(newLogin.status).toBe(200);
  });

  it('wrong current password returns 400 INVALID_PASSWORD', async () => {
    const u = await loginAs(PWUSER);
    const res = await u.post('/api/v1/auth/change-password').send({
      currentPassword: 'NotTheRightPassword!',
      newPassword: PWUSER.newPassword,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PASSWORD');
  });

  it('new password too short returns 400', async () => {
    const u = await loginAs(PWUSER);
    const res = await u.post('/api/v1/auth/change-password').send({
      currentPassword: PWUSER.password,
      newPassword: 'short',
    });
    expect(res.status).toBe(400);
  });

  it('unauthenticated change-password returns 401', async () => {
    const res = await request(app).post('/api/v1/auth/change-password').send({
      currentPassword: 'x',
      newPassword: 'y',
    });
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/v1/auth/me - language', () => {
  afterAll(async () => {
    await prisma.user.update({
      where: { username: MANAGER.username },
      data: { language: null },
    });
  });

  it('GET /me exposes language (null by default)', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.get('/api/v1/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user).toHaveProperty('language');
    expect(res.body.user.language).toBeNull();
  });

  it('PATCH /me with language sw returns 200; GET /me reflects', async () => {
    const m = await loginAs(MANAGER);
    const patch = await m.patch('/api/v1/auth/me').send({ language: 'sw' });
    expect(patch.status).toBe(200);
    expect(patch.body.user.language).toBe('sw');

    const get = await m.get('/api/v1/auth/me');
    expect(get.body.user.language).toBe('sw');
  });

  it('PATCH /me with language en returns 200', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.patch('/api/v1/auth/me').send({ language: 'en' });
    expect(res.status).toBe(200);
    expect(res.body.user.language).toBe('en');
  });

  it('PATCH /me with language null clears the preference', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.patch('/api/v1/auth/me').send({ language: null });
    expect(res.status).toBe(200);
    expect(res.body.user.language).toBeNull();
  });

  it('PATCH /me rejects an unknown language code (400)', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.patch('/api/v1/auth/me').send({ language: 'fr' });
    expect(res.status).toBe(400);
  });
});
