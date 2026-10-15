import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

// These tests exercise API authorization directly from the browser
// session — the same cookie, the same origin, the same fetch the app
// uses. The point is to prove the API enforces the same role gates
// the UI does, and to lock in fixes that close gaps where the UI hid
// a page but the API did not gate it.
//
// The endpoints probed here are the ones whose routes carry a
// requireRole gate (or that were missing one and have been fixed).
// They do not touch business data; they only prove that 403-vs-200
// is decided by role.

test('waiter cannot list all daily cash receipts', async ({ page }) => {
  await loginAs(page, 'waiter');

  const result = await page.evaluate(async () => {
    const r = await fetch('/api/v1/daily-cash-receipts?businessDate=2020-01-01', {
      credentials: 'include',
    });
    return { status: r.status };
  });

  expect(result.status).toBe(403);
});

test('manager can list daily cash receipts', async ({ page }) => {
  await loginAs(page, 'manager');

  const result = await page.evaluate(async () => {
    const r = await fetch('/api/v1/daily-cash-receipts?businessDate=2020-01-01', {
      credentials: 'include',
    });
    return { status: r.status };
  });

  expect(result.status).toBe(200);
});

test('waiter cannot read a purchase invoice by id', async ({ page }) => {
  await loginAs(page, 'waiter');

  // The ID does not need to exist — the requireRole gate fires before
  // the handler runs, so the response is 403 regardless of whether the
  // record exists. If the gate were missing, the handler would run and
  // return 404 for a missing ID.
  const result = await page.evaluate(async () => {
    const r = await fetch('/api/v1/purchase-invoices/nonexistent-id', {
      credentials: 'include',
    });
    return { status: r.status };
  });

  expect(result.status).toBe(403);
});

test('waiter cannot read a salary record by id', async ({ page }) => {
  await loginAs(page, 'waiter');

  const result = await page.evaluate(async () => {
    const r = await fetch('/api/v1/salaries/nonexistent-id', {
      credentials: 'include',
    });
    return { status: r.status };
  });

  expect(result.status).toBe(403);
});