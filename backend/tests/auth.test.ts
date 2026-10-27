import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

const TEST_USER = {
  username: 'auth-test-user',
  password: 'CorrectHorseBatteryStaple!',
  fullName: 'Auth Test User',
};

const app = createApp();

async function cleanup() {
  await prisma.session.deleteMany({ where: { user: { username: TEST_USER.username } } });
  await prisma.user.deleteMany({ where: { username: TEST_USER.username } });
}

beforeAll(async () => {
  await cleanup();
  await prisma.user.create({
    data: {
      username: TEST_USER.username,
      fullName: TEST_USER.fullName,
      passwordHash: await argon2.hash(TEST_USER.password, { type: argon2.argon2id }),
      role: 'OWNER',
      isActive: true,
    },
  });
});

afterAll(cleanup);

describe('POST /api/v1/auth/login', () => {
  it('rejects invalid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: TEST_USER.username, password: 'wrong-password-123' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('logs in with correct credentials and sets an HTTP-only cookie', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: TEST_USER.username, password: TEST_USER.password });
    expect(res.status).toBe(200);
    // Login also sets the rfs_device cookie first, so find the session cookie
    // by name instead of relying on header order.
    const cookies = (res.headers['set-cookie'] ?? []) as unknown as string[];
    const setCookie = cookies.find((c) => c.startsWith('rfs_session=')) ?? '';
    expect(setCookie).not.toBe('');
    expect(setCookie).toMatch(/HttpOnly/i);
  });

  it('rejects malformed bodies via Zod', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ username: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/v1/auth/me', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the current user when authenticated', async () => {
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/login')
      .send({ username: TEST_USER.username, password: TEST_USER.password });
    const res = await agent.get('/api/v1/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe(TEST_USER.username);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('clears the session and rejects subsequent /me', async () => {
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/login')
      .send({ username: TEST_USER.username, password: TEST_USER.password });
    const logout = await agent.post('/api/v1/auth/logout');
    expect(logout.status).toBe(200);
    const after = await agent.get('/api/v1/auth/me');
    expect(after.status).toBe(401);
  });
});