import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

const app = createApp();

const OWNER = { username: 'phase13-owner', password: 'OwnerPassword!234', fullName: 'Phase 13 Owner', role: 'OWNER' as const };
const MANAGER = { username: 'phase13-manager', password: 'ManagerPassword!234', fullName: 'Phase 13 Manager', role: 'MANAGER' as const };
const WAITER = { username: 'phase13-waiter', password: 'WaiterPassword!234', fullName: 'Phase 13 Waiter', role: 'WAITER' as const };
const AUDITOR = { username: 'phase13-auditor', password: 'AuditorPassword!234', fullName: 'Phase 13 Auditor', role: 'AUDITOR' as const };
const ALL = [OWNER, MANAGER, WAITER, AUDITOR];

const TEST_CATEGORY = 'Phase13 Test Category';

async function cleanup() {
  const usernames = ALL.map((u) => u.username);

  await prisma.material.deleteMany({
    where: {
      OR: [
        { createdByUser: { username: { in: usernames } } },
        { category: { name: TEST_CATEGORY } },
      ],
    },
  });
  await prisma.materialCategory.deleteMany({
    where: {
      OR: [
        { createdByUser: { username: { in: usernames } } },
        { name: TEST_CATEGORY },
      ],
    },
  });

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

describe('Material categories — CRUD', () => {
  let categoryId: string;

  it('MANAGER creates a category; OWNER lists it', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/material-categories').send({
      name: TEST_CATEGORY,
      description: 'Phase 13 test category',
    });
    expect(res.status).toBe(201);
    expect(res.body.category.name).toBe(TEST_CATEGORY);
    categoryId = res.body.category.id;

    const o = await loginAs(OWNER);
    const list = await o.get('/api/v1/material-categories');
    expect(list.status).toBe(200);
    expect(list.body.categories.some((c: { id: string }) => c.id === categoryId)).toBe(true);
  });

  it('rejects a duplicate category name (409)', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/material-categories').send({ name: TEST_CATEGORY });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NAME_TAKEN');
  });

  it('MANAGER disables the category; includeInactive=true reveals it', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.patch(`/api/v1/material-categories/${categoryId}`).send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.category.isActive).toBe(false);

    const visible = await m.get('/api/v1/material-categories');
    expect(visible.body.categories.some((c: { id: string }) => c.id === categoryId)).toBe(false);

    const all = await m.get('/api/v1/material-categories?includeInactive=true');
    expect(all.body.categories.some((c: { id: string }) => c.id === categoryId)).toBe(true);

    // Re-enable for material creation tests
    await m.patch(`/api/v1/material-categories/${categoryId}`).send({ isActive: true });
  });

  it('WAITER cannot create categories (403)', async () => {
    const w = await loginAs(WAITER);
    const res = await w.post('/api/v1/material-categories').send({ name: 'Phase13 Waiter Cat' });
    expect(res.status).toBe(403);
  });

  it('AUDITOR can read but not write categories', async () => {
    const a = await loginAs(AUDITOR);
    const list = await a.get('/api/v1/material-categories');
    expect(list.status).toBe(200);
    const create = await a.post('/api/v1/material-categories').send({ name: 'Phase13 Auditor Cat' });
    expect(create.status).toBe(403);
  });
});

describe('Materials — creation and updates', () => {
  let categoryId: string;
  let materialId: string;

  beforeAll(async () => {
    const m = await loginAs(MANAGER);
    const cat = await m.post('/api/v1/material-categories').send({
      name: 'Phase13 Materials Cat',
    });
    categoryId = cat.body.category.id;
  });

  afterAll(async () => {
    await prisma.material.deleteMany({ where: { categoryId } });
    await prisma.materialCategory.deleteMany({ where: { id: categoryId } });
  });

  it('MANAGER creates a material; MAT-#### is returned', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/materials').send({
      name: 'Phase13 Flour',
      categoryId,
      unit: 'kg',
      currentPrice: '2500.00',
      minimumStock: '50.00',
      notes: 'White flour',
    });
    expect(res.status).toBe(201);
    expect(res.body.material.materialNumber).toMatch(/^MAT-\d{4,}$/);
    expect(res.body.material.name).toBe('Phase13 Flour');
    expect(res.body.material.unit).toBe('kg');
    expect(res.body.material.currentPrice).toBe('2500.00');
    expect(res.body.material.minimumStock).toBe('50.00');
    materialId = res.body.material.id;
  });

  it('same material name is allowed twice (name not unique)', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/materials').send({
      name: 'Phase13 Flour',
      categoryId,
      unit: 'g',
      currentPrice: '3.00',
    });
    expect(res.status).toBe(201);
    expect(res.body.material.name).toBe('Phase13 Flour');
  });

  it('rejects a nonexistent category (400)', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/materials').send({
      name: 'Phase13 NoCat',
      categoryId: 'nonexistent-id',
      unit: 'kg',
      currentPrice: '100.00',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_CATEGORY');
  });

  it('rejects a negative minimum stock (400)', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/materials').send({
      name: 'Phase13 NegMin',
      categoryId,
      unit: 'kg',
      currentPrice: '100.00',
      minimumStock: '-1.00',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('MANAGER updates the material', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.patch(`/api/v1/materials/${materialId}`).send({
      currentPrice: '2750.00',
      minimumStock: '60.00',
    });
    expect(res.status).toBe(200);
    expect(res.body.material.currentPrice).toBe('2750.00');
    expect(res.body.material.minimumStock).toBe('60.00');
  });

  it('MANAGER disables the material; includeInactive=true reveals it', async () => {
    const m = await loginAs(MANAGER);
    await m.patch(`/api/v1/materials/${materialId}`).send({ isActive: false });

    const visible = await m.get('/api/v1/materials');
    expect(visible.body.materials.some((x: { id: string }) => x.id === materialId)).toBe(false);

    const all = await m.get('/api/v1/materials?includeInactive=true');
    expect(all.body.materials.some((x: { id: string }) => x.id === materialId)).toBe(true);
  });
});

describe('Materials — filters and permissions', () => {
  let categoryId: string;

  beforeAll(async () => {
    const m = await loginAs(MANAGER);
    const cat = await m.post('/api/v1/material-categories').send({
      name: 'Phase13 Filter Cat',
    });
    categoryId = cat.body.category.id;

    await m.post('/api/v1/materials').send({
      name: 'Phase13 Filter Sugar',
      categoryId,
      unit: 'kg',
      currentPrice: '3000.00',
    });
    await m.post('/api/v1/materials').send({
      name: 'Phase13 Filter Salt',
      categoryId,
      unit: 'kg',
      currentPrice: '500.00',
    });
  });

  afterAll(async () => {
    await prisma.material.deleteMany({ where: { categoryId } });
    await prisma.materialCategory.deleteMany({ where: { id: categoryId } });
  });

  it('filters by categoryId', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.get(`/api/v1/materials?categoryId=${categoryId}`);
    expect(res.status).toBe(200);
    expect(res.body.materials.every((x: { categoryId: string }) => x.categoryId === categoryId)).toBe(true);
  });

  it('filters by search string', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.get('/api/v1/materials?search=Filter Sugar');
    expect(res.status).toBe(200);
    expect(res.body.materials.some((x: { name: string }) => x.name === 'Phase13 Filter Sugar')).toBe(true);
  });

  it('WAITER cannot read or write materials (403)', async () => {
    const w = await loginAs(WAITER);
    const read = await w.get('/api/v1/materials');
    expect(read.status).toBe(403);
    const create = await w.post('/api/v1/materials').send({
      name: 'Phase13 Blocked',
      categoryId,
      unit: 'kg',
      currentPrice: '100.00',
    });
    expect(create.status).toBe(403);
  });

  it('AUDITOR can read but not write materials', async () => {
    const a = await loginAs(AUDITOR);
    const list = await a.get('/api/v1/materials');
    expect(list.status).toBe(200);
    const create = await a.post('/api/v1/materials').send({
      name: 'Phase13 Auditor',
      categoryId,
      unit: 'kg',
      currentPrice: '100.00',
    });
    expect(create.status).toBe(403);
  });
});