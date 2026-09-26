import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

const app = createApp();

const OWNER = { username: 'phase14-owner', password: 'OwnerPassword!234', fullName: 'Phase 14 Owner', role: 'OWNER' as const };
const MANAGER = { username: 'phase14-manager', password: 'ManagerPassword!234', fullName: 'Phase 14 Manager', role: 'MANAGER' as const };
const WAITER = { username: 'phase14-waiter', password: 'WaiterPassword!234', fullName: 'Phase 14 Waiter', role: 'WAITER' as const };
const AUDITOR = { username: 'phase14-auditor', password: 'AuditorPassword!234', fullName: 'Phase 14 Auditor', role: 'AUDITOR' as const };
const ALL = [OWNER, MANAGER, WAITER, AUDITOR];

const D_ITEMS = '2099-02-01';
const D_POST = '2099-02-02';
const D_MISMATCH = '2099-02-03';
const D_LOCKED = '2099-02-04';

const TEST_SUPPLIER = 'Phase14 Test Supplier';
const TEST_CAT = 'Phase14 Test Category';
const TEST_MAT_1 = 'Phase14 Flour';
const TEST_MAT_2 = 'Phase14 Sugar';

async function cleanup() {
  const usernames = ALL.map((u) => u.username);

  // Delete purchase items (via cascade from invoices), then invoices.
  await prisma.purchaseItem.deleteMany({
    where: {
      OR: [
        { purchaseInvoice: { supplier: { name: TEST_SUPPLIER } } },
        { purchaseInvoice: { createdByUser: { username: { in: usernames } } } },
      ],
    },
  });
  await prisma.paymentAllocation.deleteMany({
    where: {
      OR: [
        { purchaseInvoice: { supplier: { name: TEST_SUPPLIER } } },
        { supplierPayment: { supplier: { name: TEST_SUPPLIER } } },
      ],
    },
  });
  await prisma.supplierPayment.deleteMany({
    where: { supplier: { name: TEST_SUPPLIER } },
  });
  await prisma.purchaseInvoice.deleteMany({
    where: {
      OR: [
        { supplier: { name: TEST_SUPPLIER } },
        { createdByUser: { username: { in: usernames } } },
      ],
    },
  });
  await prisma.supplier.deleteMany({
    where: { OR: [{ name: TEST_SUPPLIER }, { createdByUser: { username: { in: usernames } } }] },
  });

  await prisma.stockMovement.deleteMany({
    where: {
      OR: [
        { createdByUser: { username: { in: usernames } } },
        { material: { category: { name: TEST_CAT } } },
      ],
    },
  });
  await prisma.material.deleteMany({
    where: { OR: [{ createdByUser: { username: { in: usernames } } }, { category: { name: TEST_CAT } }] },
  });
  await prisma.materialCategory.deleteMany({
    where: { OR: [{ createdByUser: { username: { in: usernames } } }, { name: TEST_CAT }] },
  });

  const allDates = [D_ITEMS, D_POST, D_MISMATCH, D_LOCKED].map(
    (d) => new Date(`${d}T00:00:00.000Z`)
  );
  await prisma.dailyClosing.deleteMany({ where: { businessDate: { in: allDates } } });

  await prisma.expense.deleteMany({ where: { createdByUser: { username: { in: usernames } } } });
  await prisma.cashHandover.deleteMany({ where: { fromUser: { username: { in: usernames } } } });
  await prisma.reconciliation.deleteMany({ where: { user: { username: { in: usernames } } } });
  await prisma.collection.deleteMany({ where: { user: { username: { in: usernames } } } });
  await prisma.shift.deleteMany({ where: { user: { username: { in: usernames } } } });
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

let supplierId: string;
let categoryId: string;
let flourId: string;
let sugarId: string;

beforeAll(async () => {
  await cleanup();
  for (const u of ALL) await makeUser(u);

  const mgr = await loginAs(MANAGER);

  const sup = await mgr.post('/api/v1/suppliers').send({ name: TEST_SUPPLIER });
  supplierId = sup.body.supplier.id;

  const cat = await mgr.post('/api/v1/material-categories').send({ name: TEST_CAT });
  categoryId = cat.body.category.id;

  const flour = await mgr.post('/api/v1/materials').send({
    name: TEST_MAT_1, categoryId, unit: 'kg', currentPrice: '2000.00',
  });
  flourId = flour.body.material.id;

  const sugar = await mgr.post('/api/v1/materials').send({
    name: TEST_MAT_2, categoryId, unit: 'kg', currentPrice: '1500.00',
  });
  sugarId = sugar.body.material.id;
});

afterAll(cleanup);

async function loginAs(u: { username: string; password: string }) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ username: u.username, password: u.password });
  expect(res.status).toBe(200);
  return agent;
}

describe('Purchase items — replace', () => {
  let invoiceId: string;

  it('creates a DRAFT invoice', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/purchase-invoices').send({
      supplierId,
      invoiceNumber: 'PI14-A',
      date: D_ITEMS,
      businessDate: D_ITEMS,
      total: '100000.00',  // will be overwritten by PUT items
    });
    expect(res.status).toBe(201);
    invoiceId = res.body.invoice.id;
  });

  it('PUT items replaces them and updates the invoice total', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.put(`/api/v1/purchase-invoices/${invoiceId}/items`).send({
      items: [
        { materialId: flourId, quantity: '25.000', unitPrice: '2000.00' },  // 50,000
        { materialId: sugarId, quantity: '20.000', unitPrice: '1500.00' },  // 30,000
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    const byMaterial = new Map(res.body.items.map((i: { materialId: string; total: string }) => [i.materialId, i.total]));
    expect(byMaterial.get(flourId)).toBe('50000.00');
    expect(byMaterial.get(sugarId)).toBe('30000.00');

    // Invoice total was rewritten to sum(items) = 80,000.
    const fresh = await m.get(`/api/v1/purchase-invoices/${invoiceId}`);
    expect(fresh.body.invoice.total).toBe('80000.00');
    expect(fresh.body.invoice.subtotal).toBe('80000.00');
  });

  it('PUT is a full replace — passing one item removes the other', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.put(`/api/v1/purchase-invoices/${invoiceId}/items`).send({
      items: [
        { materialId: flourId, quantity: '25.000', unitPrice: '2000.00' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);

    const fresh = await m.get(`/api/v1/purchase-invoices/${invoiceId}`);
    expect(fresh.body.invoice.total).toBe('50000.00');
    expect(fresh.body.items).toHaveLength(1);
  });

  it('rejects an inactive material (400)', async () => {
    const m = await loginAs(MANAGER);
    // Disable sugar, then try to include it.
    await m.patch(`/api/v1/materials/${sugarId}`).send({ isActive: false });

    const res = await m.put(`/api/v1/purchase-invoices/${invoiceId}/items`).send({
      items: [
        { materialId: flourId, quantity: '10.000', unitPrice: '2000.00' },
        { materialId: sugarId, quantity: '5.000', unitPrice: '1500.00' },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MATERIAL_INACTIVE');

    // Re-enable for subsequent tests.
    await m.patch(`/api/v1/materials/${sugarId}`).send({ isActive: true });
  });

  it('rejects a zero quantity (400)', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.put(`/api/v1/purchase-invoices/${invoiceId}/items`).send({
      items: [{ materialId: flourId, quantity: '0.000', unitPrice: '2000.00' }],
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects items on a POSTED invoice (409)', async () => {
    const m = await loginAs(MANAGER);
    // Set one good item, then post.
    await m.put(`/api/v1/purchase-invoices/${invoiceId}/items`).send({
      items: [{ materialId: flourId, quantity: '25.000', unitPrice: '2000.00' }],
    });
    const post = await m.post(`/api/v1/purchase-invoices/${invoiceId}/post`).send({});
    expect(post.status).toBe(200);
    expect(post.body.invoice.status).toBe('POSTED');

    const res = await m.put(`/api/v1/purchase-invoices/${invoiceId}/items`).send({
      items: [{ materialId: flourId, quantity: '1.000', unitPrice: '1.00' }],
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NOT_EDITABLE');
  });
});

describe('Purchase items — posting rules', () => {
  it('rejects posting an invoice with no items (409 NO_ITEMS)', async () => {
    const m = await loginAs(MANAGER);
    const inv = await m.post('/api/v1/purchase-invoices').send({
      supplierId,
      invoiceNumber: 'PI14-B',
      date: D_POST,
      businessDate: D_POST,
      total: '1000.00',
    });
    expect(inv.status).toBe(201);

    const post = await m.post(`/api/v1/purchase-invoices/${inv.body.invoice.id}/post`).send({});
    expect(post.status).toBe(409);
    expect(post.body.code).toBe('NO_ITEMS');

    // Cleanup
    await m.delete(`/api/v1/purchase-invoices/${inv.body.invoice.id}`);
  });

  it('rejects posting when item totals do not match the invoice total (409)', async () => {
    const m = await loginAs(MANAGER);
    const inv = await m.post('/api/v1/purchase-invoices').send({
      supplierId,
      invoiceNumber: 'PI14-C',
      date: D_MISMATCH,
      businessDate: D_MISMATCH,
      total: '100000.00',
    });
    expect(inv.status).toBe(201);
    const invoiceId = inv.body.invoice.id;

    // PUT items sets the total to the sum. Then manually change total via PATCH.
    await m.put(`/api/v1/purchase-invoices/${invoiceId}/items`).send({
      items: [{ materialId: flourId, quantity: '10.000', unitPrice: '2000.00' }],
    });
    // Force the invoice total to differ from the item total.
    await prisma.purchaseInvoice.update({
      where: { id: invoiceId },
      data: { total: '50000.00' },
    });

    const post = await m.post(`/api/v1/purchase-invoices/${invoiceId}/post`).send({});
    expect(post.status).toBe(409);
    expect(post.body.code).toBe('LINE_TOTAL_MISMATCH');

    // Cleanup
    await m.delete(`/api/v1/purchase-invoices/${invoiceId}`);
  });

  it('posting updates Material.currentPrice to the item unitPrice', async () => {
    const m = await loginAs(MANAGER);

    // Create an invoice on a fresh date with one item.
    const inv = await m.post('/api/v1/purchase-invoices').send({
      supplierId,
      invoiceNumber: 'PI14-D',
      date: D_LOCKED,
      businessDate: D_LOCKED,
      total: '1.00',
    });
    const invoiceId = inv.body.invoice.id;

    await m.put(`/api/v1/purchase-invoices/${invoiceId}/items`).send({
      items: [
        { materialId: flourId, quantity: '30.000', unitPrice: '2750.00' },
      ],
    });

    const before = await m.get(`/api/v1/materials/${flourId}`);
    // Flour was set to 2000.00 at seed time (or updated by a previous test).
    // It should NOT equal 2750.00 yet.
    expect(before.body.material.currentPrice).not.toBe('2750.00');

    const post = await m.post(`/api/v1/purchase-invoices/${invoiceId}/post`).send({});
    expect(post.status).toBe(200);

    const after = await m.get(`/api/v1/materials/${flourId}`);
    expect(after.body.material.currentPrice).toBe('2750.00');
  });

  it('cancelling a POSTED invoice does NOT roll back Material.currentPrice', async () => {
    const m = await loginAs(MANAGER);

    const inv = await m.post('/api/v1/purchase-invoices').send({
      supplierId,
      invoiceNumber: 'PI14-E',
      date: D_LOCKED,
      businessDate: D_LOCKED,
      total: '1.00',
    });
    const invoiceId = inv.body.invoice.id;

    await m.put(`/api/v1/purchase-invoices/${invoiceId}/items`).send({
      items: [{ materialId: sugarId, quantity: '10.000', unitPrice: '9999.00' }],
    });
    await m.post(`/api/v1/purchase-invoices/${invoiceId}/post`).send({});

    const mid = await m.get(`/api/v1/materials/${sugarId}`);
    expect(mid.body.material.currentPrice).toBe('9999.00');

    const cancel = await m.post(`/api/v1/purchase-invoices/${invoiceId}/cancel`).send({
      reason: 'cancel does not roll back price',
    });
    expect(cancel.status).toBe(200);

    const after = await m.get(`/api/v1/materials/${sugarId}`);
    expect(after.body.material.currentPrice).toBe('9999.00');
  });
});

describe('Purchase items — permissions', () => {
  it('WAITER cannot read or write items (403)', async () => {
    const m = await loginAs(MANAGER);
    const inv = await m.post('/api/v1/purchase-invoices').send({
      supplierId,
      invoiceNumber: 'PI14-F',
      date: D_ITEMS,
      businessDate: D_ITEMS,
      total: '1.00',
    });
    const id = inv.body.invoice.id;

    const w = await loginAs(WAITER);
    const read = await w.get(`/api/v1/purchase-invoices/${id}/items`);
    expect(read.status).toBe(403);
    const write = await w.put(`/api/v1/purchase-invoices/${id}/items`).send({
      items: [{ materialId: flourId, quantity: '1.000', unitPrice: '1.00' }],
    });
    expect(write.status).toBe(403);

    await m.delete(`/api/v1/purchase-invoices/${id}`);
  });

  it('AUDITOR can read items but not write them', async () => {
    const m = await loginAs(MANAGER);
    const inv = await m.post('/api/v1/purchase-invoices').send({
      supplierId,
      invoiceNumber: 'PI14-G',
      date: D_ITEMS,
      businessDate: D_ITEMS,
      total: '1.00',
    });
    const id = inv.body.invoice.id;
    await m.put(`/api/v1/purchase-invoices/${id}/items`).send({
      items: [{ materialId: flourId, quantity: '1.000', unitPrice: '2000.00' }],
    });

    const a = await loginAs(AUDITOR);
    const read = await a.get(`/api/v1/purchase-invoices/${id}/items`);
    expect(read.status).toBe(200);
    expect(read.body.items).toHaveLength(1);

    const write = await a.put(`/api/v1/purchase-invoices/${id}/items`).send({
      items: [{ materialId: flourId, quantity: '2.000', unitPrice: '2000.00' }],
    });
    expect(write.status).toBe(403);

    await m.delete(`/api/v1/purchase-invoices/${id}`);
  });
});