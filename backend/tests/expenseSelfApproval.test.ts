import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

const app = createApp();

const OWNER   = { username: 'phase17-owner',   password: 'OwnerPass!234',   fullName: 'Phase17 Owner',   role: 'OWNER' as const };
const MANAGER = { username: 'phase17-manager', password: 'ManagerPass!234', fullName: 'Phase17 Manager', role: 'MANAGER' as const };
const ALL = [OWNER, MANAGER];

const D = '2024-08-01';
const TEST_CAT = 'Phase17 Self-Approval Category';

async function cleanup() {
  const usernames = ALL.map((u) => u.username);
  await prisma.expense.deleteMany({
    where: {
      OR: [
        { createdByUser:  { username: { in: usernames } } },
        { paidByUser:     { username: { in: usernames } } },
        { approvedByUser: { username: { in: usernames } } },
        { category:       { name: TEST_CAT } },
      ],
    },
  });
  await prisma.expenseCategory.deleteMany({ where: { name: TEST_CAT } });
  await prisma.session.deleteMany({ where: { user: { username: { in: usernames } } } });
  await prisma.user.deleteMany({ where: { username: { in: usernames } } });
}

async function makeUser(u: typeof OWNER | typeof MANAGER) {
  return prisma.user.create({
    data: {
      username: u.username, fullName: u.fullName, role: u.role,
      passwordHash: await argon2.hash(u.password, { type: argon2.argon2id }),
      isActive: true,
    },
  });
}

async function loginAs(u: { username: string; password: string }) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ username: u.username, password: u.password });
  expect(res.status).toBe(200);
  return agent;
}

let ownerId: string;
let managerId: string;
let categoryId: string;

beforeAll(async () => {
  await cleanup();
  const o = await makeUser(OWNER);
  const m = await makeUser(MANAGER);
  ownerId = o.id;
  managerId = m.id;

  const mgr = await loginAs(MANAGER);
  const cat = await mgr.post('/api/v1/expense-categories').send({ name: TEST_CAT });
  expect(cat.status).toBe(201);
  categoryId = cat.body.category.id;
});

afterAll(cleanup);

describe('Expense self-approval — OWNER exception', () => {
  it('OWNER creates, submits, and approves their own expense', async () => {
    const o = await loginAs(OWNER);

    const created = await o.post('/api/v1/expenses').send({
      businessDate: D, categoryId, amount: '100.00', paymentMethod: 'CASH',
      description: 'owner own approval test',
    });
    expect(created.status).toBe(201);
    expect(created.body.expense.status).toBe('DRAFT');
    expect(created.body.expense.paidByUserId).toBeNull();
    const id = created.body.expense.id;

    const submitted = await o.post(`/api/v1/expenses/${id}/submit`).send({});
    expect(submitted.status).toBe(200);
    expect(submitted.body.expense.status).toBe('PENDING');

    const approved = await o.post(`/api/v1/expenses/${id}/approve`).send({});
    expect(approved.status).toBe(200);
    expect(approved.body.expense.status).toBe('APPROVED');
    expect(approved.body.expense.approvedBy).toBe(ownerId);
    expect(approved.body.expense.selfApproved).toBe(true);
  });

  it('MANAGER still cannot approve their own expense (409 SELF_APPROVAL)', async () => {
    const m = await loginAs(MANAGER);

    const created = await m.post('/api/v1/expenses').send({
      businessDate: D, categoryId, amount: '50.00', paymentMethod: 'CASH',
      description: 'manager own approval test',
    });
    expect(created.status).toBe(201);
    const id = created.body.expense.id;

    await m.post(`/api/v1/expenses/${id}/submit`).send({});

    const approved = await m.post(`/api/v1/expenses/${id}/approve`).send({});
    expect(approved.status).toBe(409);
    expect(approved.body.code).toBe('SELF_APPROVAL');
  });

  it('OWNER approves a MANAGER-created expense; selfApproved is false', async () => {
    const m = await loginAs(MANAGER);
    const created = await m.post('/api/v1/expenses').send({
      businessDate: D, categoryId, amount: '200.00', paymentMethod: 'CASH',
      description: 'cross-approval test',
    });
    expect(created.status).toBe(201);
    const id = created.body.expense.id;
    expect(created.body.expense.createdBy).toBe(managerId);

    await m.post(`/api/v1/expenses/${id}/submit`).send({});

    const o = await loginAs(OWNER);
    const approved = await o.post(`/api/v1/expenses/${id}/approve`).send({});
    expect(approved.status).toBe(200);
    expect(approved.body.expense.approvedBy).toBe(ownerId);
    expect(approved.body.expense.selfApproved).toBe(false);
  });
});

describe('Expense paidByUserId', () => {
  it('create with explicit paidByUserId stores and returns it', async () => {
    const m = await loginAs(MANAGER);
    const created = await m.post('/api/v1/expenses').send({
      businessDate: D, categoryId, amount: '10.00', paymentMethod: 'CASH',
      description: 'paid-by set', paidByUserId: ownerId,
    });
    expect(created.status).toBe(201);
    expect(created.body.expense.paidByUserId).toBe(ownerId);
  });

  it('create without paidByUserId leaves it null', async () => {
    const m = await loginAs(MANAGER);
    const created = await m.post('/api/v1/expenses').send({
      businessDate: D, categoryId, amount: '20.00', paymentMethod: 'CASH',
      description: 'paid-by unset',
    });
    expect(created.status).toBe(201);
    expect(created.body.expense.paidByUserId).toBeNull();
  });

  it('create with nonexistent paidByUserId returns 400 INVALID_PAID_BY', async () => {
    const m = await loginAs(MANAGER);
    const created = await m.post('/api/v1/expenses').send({
      businessDate: D, categoryId, amount: '30.00', paymentMethod: 'CASH',
      description: 'bad paid-by', paidByUserId: 'no-such-user-id',
    });
    expect(created.status).toBe(400);
    expect(created.body.code).toBe('INVALID_PAID_BY');
  });
});