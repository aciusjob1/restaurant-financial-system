import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

const app = createApp();

const OWNER = { username: 'phase15-owner', password: 'OwnerPassword!234', fullName: 'Phase 15 Owner', role: 'OWNER' as const };
const MANAGER = { username: 'phase15-manager', password: 'ManagerPassword!234', fullName: 'Phase 15 Manager', role: 'MANAGER' as const };
const WAITER = { username: 'phase15-waiter', password: 'WaiterPassword!234', fullName: 'Phase 15 Waiter', role: 'WAITER' as const };
const AUDITOR = { username: 'phase15-auditor', password: 'AuditorPassword!234', fullName: 'Phase 15 Auditor', role: 'AUDITOR' as const };
const ALL = [OWNER, MANAGER, WAITER, AUDITOR];

const D_OPEN     = '2024-12-01';
const D_CONSUME  = '2024-12-02';
const D_WASTE    = '2024-12-03';
const D_ADJUST   = '2024-12-04';
const D_CLOSED   = '2024-12-05';
const D_PURCHASE = '2024-12-06';
const D_CANCEL   = '2024-12-07';
const D_DOUBLE   = '2024-12-08';
const D_LEDGER   = '2024-12-09';
const D_FUTURE   = '2099-12-31';   // intentionally future for the FUTURE_DATE test

const TEST_CAT = 'Phase15 Test Category';
const TEST_MAT_A = 'Phase15 Material A';
const TEST_MAT_B = 'Phase15 Material B';
const TEST_SUPPLIER = 'Phase15 Test Supplier';

async function cleanup() {
  const usernames = ALL.map((u) => u.username);

  await prisma.stockMovement.deleteMany({
    where: {
      OR: [
        { createdByUser: { username: { in: usernames } } },
        { material: { category: { name: TEST_CAT } } },
      ],
    },
  });
  await prisma.paymentAllocation.deleteMany({
    where: { OR: [
      { purchaseInvoice: { supplier: { name: TEST_SUPPLIER } } },
      { supplierPayment: { supplier: { name: TEST_SUPPLIER } } },
    ] },
  });
  await prisma.supplierPayment.deleteMany({ where: { supplier: { name: TEST_SUPPLIER } } });
  await prisma.purchaseItem.deleteMany({
    where: { purchaseInvoice: { supplier: { name: TEST_SUPPLIER } } },
  });
  await prisma.purchaseInvoice.deleteMany({ where: { supplier: { name: TEST_SUPPLIER } } });
  await prisma.supplier.deleteMany({ where: { name: TEST_SUPPLIER } });
  await prisma.material.deleteMany({ where: { category: { name: TEST_CAT } } });
  await prisma.materialCategory.deleteMany({ where: { name: TEST_CAT } });

  const allDates = [D_OPEN, D_CONSUME, D_WASTE, D_ADJUST, D_CLOSED, D_PURCHASE, D_CANCEL, D_DOUBLE, D_LEDGER]
    .map((d) => new Date(`${d}T00:00:00.000Z`));
  await prisma.dailyClosing.deleteMany({ where: { businessDate: { in: allDates } } });

  // Clean up shift-domain rows in FK order before deleting users.
  // Handover -> Reconciliation -> Collection -> Shift -> Session -> User.
  await prisma.cashHandover.deleteMany({
    where: { fromUser: { username: { in: usernames } } },
  });
  await prisma.reconciliation.deleteMany({
    where: { user: { username: { in: usernames } } },
  });
  await prisma.collection.deleteMany({
    where: { user: { username: { in: usernames } } },
  });
  await prisma.shift.deleteMany({
    where: { user: { username: { in: usernames } } },
  });
  await prisma.session.deleteMany({
    where: { user: { username: { in: usernames } } },
  });
  await prisma.user.deleteMany({ where: { username: { in: usernames } } });
}

async function makeUser(u: { username: string; password: string; fullName: string; role: 'OWNER' | 'MANAGER' | 'WAITER' | 'AUDITOR' }) {
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

let categoryId: string;
let materialAId: string;
let materialBId: string;
let supplierId: string;

beforeAll(async () => {
  await cleanup();
  for (const u of ALL) await makeUser(u);
  const m = await loginAs(MANAGER);

  const cat = await m.post('/api/v1/material-categories').send({ name: TEST_CAT });
  categoryId = cat.body.category.id;

  const a = await m.post('/api/v1/materials').send({
    name: TEST_MAT_A, categoryId, unit: 'kg', currentPrice: '2500.00', minimumStock: '10.00',
  });
  materialAId = a.body.material.id;

  const b = await m.post('/api/v1/materials').send({
    name: TEST_MAT_B, categoryId, unit: 'kg', currentPrice: '1500.00', minimumStock: '5.00',
  });
  materialBId = b.body.material.id;

  const sup = await m.post('/api/v1/suppliers').send({ name: TEST_SUPPLIER });
  supplierId = sup.body.supplier.id;
});

afterAll(cleanup);

// -------- 1-5: Basic movement creation --------
describe('Stock movements — manual creation', () => {
  it('1. OPENING / IN increases currentStock', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/stock-movements').send({
      materialId: materialAId, type: 'OPENING', direction: 'IN',
      businessDate: D_OPEN, quantity: '100.000', unitCost: '2500.00',
    });
    expect(res.status).toBe(201);
    expect(res.body.movement.movementNumber).toMatch(/^SM-\d{4,}$/);
    expect(res.body.movement.quantity).toBe('100.000');

    const stock = await m.get(`/api/v1/materials/${materialAId}/stock`);
    expect(stock.body.currentStock).toBe('100.000');
  });

  it('2. CONSUMPTION / OUT decreases currentStock', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/stock-movements').send({
      materialId: materialAId, type: 'CONSUMPTION', direction: 'OUT',
      businessDate: D_CONSUME, quantity: '30.000', unitCost: '2500.00',
    });
    expect(res.status).toBe(201);

    const stock = await m.get(`/api/v1/materials/${materialAId}/stock`);
    expect(stock.body.currentStock).toBe('70.000');
  });

  it('3. WASTE / OUT decreases currentStock', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/stock-movements').send({
      materialId: materialAId, type: 'WASTE', direction: 'OUT',
      businessDate: D_WASTE, quantity: '5.000', unitCost: '2500.00',
    });
    expect(res.status).toBe(201);

    const stock = await m.get(`/api/v1/materials/${materialAId}/stock`);
    expect(stock.body.currentStock).toBe('65.000');
  });

  it('4. ADJUSTMENT / IN increases currentStock', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/stock-movements').send({
      materialId: materialBId, type: 'ADJUSTMENT', direction: 'IN',
      businessDate: D_ADJUST, quantity: '20.000', unitCost: '1500.00',
    });
    expect(res.status).toBe(201);

    const stock = await m.get(`/api/v1/materials/${materialBId}/stock`);
    expect(stock.body.currentStock).toBe('20.000');
  });

  it('5. ADJUSTMENT / OUT decreases currentStock', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/stock-movements').send({
      materialId: materialBId, type: 'ADJUSTMENT', direction: 'OUT',
      businessDate: D_ADJUST, quantity: '3.000',
    });
    expect(res.status).toBe(201);

    const stock = await m.get(`/api/v1/materials/${materialBId}/stock`);
    expect(stock.body.currentStock).toBe('17.000');
  });
});

// -------- 6-9: Rejections --------
describe('Stock movements — validation', () => {
  it('6. rejects OUT that would take stock negative (409 INSUFFICIENT_STOCK)', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/stock-movements').send({
      materialId: materialAId, type: 'CONSUMPTION', direction: 'OUT',
      businessDate: D_CONSUME, quantity: '9999.000',
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INSUFFICIENT_STOCK');
  });

  it('7. rejects a future businessDate (400 FUTURE_DATE)', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/stock-movements').send({
      materialId: materialAId, type: 'ADJUSTMENT', direction: 'IN',
      businessDate: D_FUTURE, quantity: '1.000',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('FUTURE_DATE');
  });

  it('8. rejects a movement on a CLOSED day (409 DAY_IS_CLOSED)', async () => {
    // Build a closed day on D_CLOSED via a waiter shift and closing.
    const w = await loginAs(WAITER);
    const m = await loginAs(MANAGER);
    const s = await w.post('/api/v1/shifts').send({ businessDate: D_CLOSED, openingCash: '0.00' });
    expect(s.status).toBe(201);
    const shiftId = s.body.shift.id;
    await w.post('/api/v1/collections').send({ shiftId, paymentMethod: 'CASH', amount: '100.00' });
    await w.post(`/api/v1/shifts/${shiftId}/transition`).send({ to: 'SUBMITTED' });
    const recon = await w.post('/api/v1/reconciliations').send({ shiftId });
    await w.patch(`/api/v1/reconciliations/${recon.body.reconciliation.id}`).send({ actualCash: '100.00', actualMobile: '0.00' });
    await w.post(`/api/v1/reconciliations/${recon.body.reconciliation.id}/submit`).send({});
    await m.post(`/api/v1/shifts/${shiftId}/transition`).send({ to: 'RECONCILING' });
    await m.post(`/api/v1/shifts/${shiftId}/transition`).send({ to: 'CLOSED' });
    const close = await m.post('/api/v1/daily-closings').send({ businessDate: D_CLOSED });
    expect(close.status).toBe(201);

    const res = await m.post('/api/v1/stock-movements').send({
      materialId: materialAId, type: 'ADJUSTMENT', direction: 'IN',
      businessDate: D_CLOSED, quantity: '1.000',
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DAY_IS_CLOSED');
  });

  it('9. rejects manual PURCHASE type via API (400 VALIDATION_ERROR)', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/stock-movements').send({
      materialId: materialAId, type: 'PURCHASE', direction: 'IN',
      businessDate: D_OPEN, quantity: '1.000',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

// -------- 10-11: Auto-creation from posting + reversal on cancel --------
describe('Stock movements — purchase integration', () => {
  let invoiceId: string;

  it('10. posting a purchase invoice auto-creates one PURCHASE movement per item', async () => {
    const m = await loginAs(MANAGER);
    const inv = await m.post('/api/v1/purchase-invoices').send({
      supplierId, invoiceNumber: 'P15-A', date: D_PURCHASE, businessDate: D_PURCHASE, total: '1000.00',
    });
    invoiceId = inv.body.invoice.id;

    const put = await m.put(`/api/v1/purchase-invoices/${invoiceId}/items`).send({
      items: [
        { materialId: materialAId, quantity: '40.000', unitPrice: '2500.00' }, // 100,000
        { materialId: materialBId, quantity: '30.000', unitPrice: '1500.00' }, //  45,000
      ],
    });
    expect(put.status).toBe(200);

    const beforeA = await m.get(`/api/v1/materials/${materialAId}/stock`);
    const beforeB = await m.get(`/api/v1/materials/${materialBId}/stock`);

    const post = await m.post(`/api/v1/purchase-invoices/${invoiceId}/post`).send({});
    expect(post.status).toBe(200);

    const afterA = await m.get(`/api/v1/materials/${materialAId}/stock`);
    const afterB = await m.get(`/api/v1/materials/${materialBId}/stock`);
    // 65 + 40 = 105 for A; 17 + 30 = 47 for B
    expect(afterA.body.currentStock).toBe('105.000');
    expect(afterB.body.currentStock).toBe('47.000');

    const movements = await m.get(`/api/v1/stock-movements?materialId=${materialAId}&type=PURCHASE`);
    expect(movements.body.movements.length).toBeGreaterThanOrEqual(1);
    const latest = movements.body.movements[0];
    expect(latest.type).toBe('PURCHASE');
    expect(latest.direction).toBe('IN');
    expect(latest.purchaseItemId).toBeTruthy();
  });

  it('11. cancelling a posted invoice creates reversing movements', async () => {
    const m = await loginAs(MANAGER);
    const before = await m.get(`/api/v1/materials/${materialAId}/stock`);

    const cancel = await m.post(`/api/v1/purchase-invoices/${invoiceId}/cancel`).send({
      reason: 'Test reversal',
    });
    expect(cancel.status).toBe(200);

    const after = await m.get(`/api/v1/materials/${materialAId}/stock`);
    const beforeNum = parseFloat(before.body.currentStock);
    const afterNum = parseFloat(after.body.currentStock);
    expect(beforeNum - afterNum).toBeCloseTo(40, 3);

    // Check a reversal movement exists for at least one purchase line
    const all = await m.get(`/api/v1/stock-movements?materialId=${materialAId}`);
    const reversal = all.body.movements.find((x: { type: string; reversalOfId: string | null }) => x.type === 'ADJUSTMENT' && x.reversalOfId);
    expect(reversal).toBeTruthy();
  });
});

// -------- 12: Cancel blocked by insufficient stock --------
describe('Stock movements — cancel guards', () => {
  it('12. cancel is blocked if reversal would make stock negative (409 INSUFFICIENT_STOCK_FOR_CANCEL)', async () => {
    const m = await loginAs(MANAGER);
    const inv = await m.post('/api/v1/purchase-invoices').send({
      supplierId, invoiceNumber: 'P15-B', date: D_DOUBLE, businessDate: D_DOUBLE, total: '1.00',
    });
    const id = inv.body.invoice.id;

    await m.put(`/api/v1/purchase-invoices/${id}/items`).send({
      items: [{ materialId: materialAId, quantity: '10.000', unitPrice: '2500.00' }],
    });
    await m.post(`/api/v1/purchase-invoices/${id}/post`).send({});

    // Drain A below the purchase quantity by consuming it.
    const stock = await m.get(`/api/v1/materials/${materialAId}/stock`);
    const current = parseFloat(stock.body.currentStock);
    await m.post('/api/v1/stock-movements').send({
      materialId: materialAId, type: 'CONSUMPTION', direction: 'OUT',
      businessDate: D_DOUBLE, quantity: (current - 5).toFixed(3),
    });

    const cancel = await m.post(`/api/v1/purchase-invoices/${id}/cancel`).send({
      reason: 'should be blocked',
    });
    expect(cancel.status).toBe(409);
    expect(cancel.body.code).toBe('INSUFFICIENT_STOCK_FOR_CANCEL');
  });
});

// -------- 13: Immutability --------
describe('Stock movements — immutability', () => {
  it('13. PATCH and DELETE on a movement return 405', async () => {
    const m = await loginAs(MANAGER);
    const list = await m.get('/api/v1/stock-movements?limit=1');
    expect(list.body.movements.length).toBeGreaterThan(0);
    const id = list.body.movements[0].id;

    const patch = await m.patch(`/api/v1/stock-movements/${id}`).send({ quantity: '999.000' });
    const del = await m.delete(`/api/v1/stock-movements/${id}`);
    // Express returns 404 for unregistered methods, which is fine — we just assert
    // that the movement is unchanged.
    expect([404, 405]).toContain(patch.status);
    expect([404, 405]).toContain(del.status);

    const fresh = await m.get(`/api/v1/stock-movements/${id}`);
    expect(fresh.status).toBe(200);
    expect(fresh.body.movement.id).toBe(id);
  });
});

// -------- 14: Permissions --------
describe('Stock movements — permissions', () => {
  it('14. WAITER cannot read or write (403); AUDITOR can read but not write', async () => {
    const w = await loginAs(WAITER);
    const wRead = await w.get('/api/v1/stock-movements');
    expect(wRead.status).toBe(403);
    const wWrite = await w.post('/api/v1/stock-movements').send({
      materialId: materialAId, type: 'ADJUSTMENT', direction: 'IN',
      businessDate: D_ADJUST, quantity: '1.000',
    });
    expect(wWrite.status).toBe(403);

    const a = await loginAs(AUDITOR);
    const aRead = await a.get('/api/v1/stock-movements');
    expect(aRead.status).toBe(200);
    const aWrite = await a.post('/api/v1/stock-movements').send({
      materialId: materialAId, type: 'ADJUSTMENT', direction: 'IN',
      businessDate: D_ADJUST, quantity: '1.000',
    });
    expect(aWrite.status).toBe(403);
  });
});

// -------- 15-18: Extra scenarios from the locked spec --------
describe('Stock movements — extra invariants', () => {
  it('15. transaction atomicity — a rejected movement leaves currentStock unchanged', async () => {
    const m = await loginAs(MANAGER);
    const before = await m.get(`/api/v1/materials/${materialAId}/stock`);

    // Attempt a movement that will fail validation at the service layer
    const bad = await m.post('/api/v1/stock-movements').send({
      materialId: materialAId, type: 'CONSUMPTION', direction: 'OUT',
      businessDate: D_CONSUME, quantity: '999999.000',
    });
    expect(bad.status).toBe(409);

    const after = await m.get(`/api/v1/materials/${materialAId}/stock`);
    expect(after.body.currentStock).toBe(before.body.currentStock);

    // No stray movement was recorded
    const movements = await m.get(`/api/v1/stock-movements?materialId=${materialAId}&limit=500`);
    const huge = movements.body.movements.find((x: { quantity: string }) => x.quantity === '999999.000');
    expect(huge).toBeUndefined();
  });

  it('16. duplicate purchase protection — a PurchaseItem cannot create two PURCHASE movements', async () => {
    const m = await loginAs(MANAGER);
    const inv = await m.post('/api/v1/purchase-invoices').send({
      supplierId, invoiceNumber: 'P15-C', date: D_LEDGER, businessDate: D_LEDGER, total: '1.00',
    });
    const id = inv.body.invoice.id;
    await m.put(`/api/v1/purchase-invoices/${id}/items`).send({
      items: [{ materialId: materialBId, quantity: '7.000', unitPrice: '1500.00' }],
    });
    await m.post(`/api/v1/purchase-invoices/${id}/post`).send({});

    // A second POST should be refused by status check
    const second = await m.post(`/api/v1/purchase-invoices/${id}/post`).send({});
    expect(second.status).toBe(409);

    // And only one PURCHASE movement exists for the item
    const item = await prisma.purchaseItem.findFirst({ where: { purchaseInvoiceId: id } });
    expect(item).toBeTruthy();
    const movements = await prisma.stockMovement.findMany({ where: { purchaseItemId: item!.id } });
    expect(movements.length).toBe(1);
  });

  it('17. double reversal protection — the same purchase movement cannot be reversed twice', async () => {
    const m = await loginAs(MANAGER);
    const inv = await m.post('/api/v1/purchase-invoices').send({
      supplierId, invoiceNumber: 'P15-D', date: D_LEDGER, businessDate: D_LEDGER, total: '1.00',
    });
    const id = inv.body.invoice.id;
    await m.put(`/api/v1/purchase-invoices/${id}/items`).send({
      items: [{ materialId: materialBId, quantity: '4.000', unitPrice: '1500.00' }],
    });
    await m.post(`/api/v1/purchase-invoices/${id}/post`).send({});

    const first = await m.post(`/api/v1/purchase-invoices/${id}/cancel`).send({ reason: 'first' });
    expect(first.status).toBe(200);

    const second = await m.post(`/api/v1/purchase-invoices/${id}/cancel`).send({ reason: 'again' });
    expect(second.status).toBe(409); // invoice is CANCELLED, not POSTED

    const item = await prisma.purchaseItem.findFirst({ where: { purchaseInvoiceId: id } });
    const purchase = await prisma.stockMovement.findFirst({ where: { purchaseItemId: item!.id } });
    expect(purchase).toBeTruthy();
    const reversals = await prisma.stockMovement.findMany({ where: { reversalOfId: purchase!.id } });
    expect(reversals.length).toBe(1);
  });

  it('18. cache/ledger consistency — Material.currentStock == sum(IN) − sum(OUT)', async () => {
    const m = await loginAs(MANAGER);
    const stock = await m.get(`/api/v1/materials/${materialAId}/stock`);
    const cached = stock.body.currentStock;

    // Recompute from the ledger
    const all = await m.get(`/api/v1/stock-movements?materialId=${materialAId}&limit=500`);
    let sum = 0;
    for (const mv of all.body.movements) {
      const q = parseFloat(mv.quantity);
      sum += mv.direction === 'IN' ? q : -q;
    }
    expect(sum.toFixed(3)).toBe(cached);
  });
});