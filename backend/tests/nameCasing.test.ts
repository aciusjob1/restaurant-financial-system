import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { titleCaseName } from '../src/utils/textCase.js';

const app = createApp();

const OWNER = { username: 'casing-owner', password: 'OwnerPassword!234', fullName: 'Casing Owner', role: 'OWNER' as const };
const POSITION_NAME = 'Casing Test Position';

async function cleanup() {
  const employees = await prisma.employee.findMany({
    where: { position: { name: POSITION_NAME } },
    select: { id: true },
  });
  if (employees.length > 0) {
    await prisma.employee.deleteMany({ where: { id: { in: employees.map((e) => e.id) } } });
  }
  await prisma.position.deleteMany({ where: { name: POSITION_NAME } });
  await prisma.session.deleteMany({ where: { user: { username: OWNER.username } } });
  await prisma.user.deleteMany({ where: { username: OWNER.username } });
}

async function makeUser(u: { username: string; password: string; fullName: string; role: 'OWNER' }) {
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

async function loginAs(u: { username: string; password: string }) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ username: u.username, password: u.password });
  expect(res.status).toBe(200);
  return agent;
}

let positionId: string;

beforeAll(async () => {
  await cleanup();
  await makeUser(OWNER);
  const pos = await prisma.position.create({
    data: { name: POSITION_NAME, description: null, defaultSalary: '0.00' },
  });
  positionId = pos.id;
});

afterAll(cleanup);

// ---------------------------------------------------------------------------

describe('titleCaseName', () => {
  const cases: Array<[string, string]> = [
    ['asha michael',              'Asha Michael'],
    ['  asha   michael  ',        'Asha Michael'],
    ['ASHA MICHAEL',              'Asha Michael'],
    ['Asha Michael',              'Asha Michael'],
    ["o'brien",                   "O'Brien"],
    ["mary-jane",                 'Mary-Jane'],
    ['van der berg',              'Van Der Berg'],
    ['mc donald',                 'Mc Donald'],
    ['joseph m. kamau',           'Joseph M. Kamau'],
    ['a',                         'A'],
    ['neema',                     'Neema'],
  ];

  for (const [input, expected] of cases) {
    it(`"${input}" => "${expected}"`, () => {
      expect(titleCaseName(input)).toBe(expected);
    });
  }
});

describe('POST /api/v1/employees - fullName normalization', () => {
  it('persists a lowercased, space-separated name in title case', async () => {
    const agent = await loginAs(OWNER);
    const res = await agent.post('/api/v1/employees').send({
      fullName: '  asha   michael  ',
      positionId,
      startDate: '2026-10-13',
    });
    expect(res.status).toBe(201);
    expect(res.body.employee.fullName).toBe('Asha Michael');

    const row = await prisma.employee.findUniqueOrThrow({
      where: { id: res.body.employee.id },
      select: { fullName: true },
    });
    expect(row.fullName).toBe('Asha Michael');
  });

  it('applies apostrophe and hyphen rules through the endpoint', async () => {
    const agent = await loginAs(OWNER);
    const res = await agent.post('/api/v1/employees').send({
      fullName: "o'brien mary-jane",
      positionId,
      startDate: '2026-10-13',
    });
    expect(res.status).toBe(201);
    expect(res.body.employee.fullName).toBe("O'Brien Mary-Jane");

    const row = await prisma.employee.findUniqueOrThrow({
      where: { id: res.body.employee.id },
      select: { fullName: true },
    });
    expect(row.fullName).toBe("O'Brien Mary-Jane");
  });
});