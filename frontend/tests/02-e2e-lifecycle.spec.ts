import { test, expect, type Page } from '@playwright/test';

const BASE = 'http://127.0.0.1:3000';
const OWNER_PASS = process.env.TEST_OWNER_PASS!;

function todayISO(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    .toISOString()
    .slice(0, 10);
}

async function loginAsOwner(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.getByRole('textbox', { name: 'Username' }).fill('owner');
  await page.getByRole('textbox', { name: 'Password' }).fill(OWNER_PASS);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard');
}

// The PIN pad is server-rendered but its key handlers only exist after
// hydration. Click the first digit and wait for its dot to fill so we know
// handlers are attached before typing the rest.
async function loginViaPin(page: Page, pin: string) {
  await expect(async () => {
    await page.goto(`${BASE}/login/pin`);
    const dots = page.locator('main div[aria-hidden="true"] > span');
    await expect(dots).toHaveCount(6);

    await expect(async () => {
      const filled = await dots.first().evaluate((el) => el.className.includes('bg-slate-900'));
      if (filled) return;
      await page.getByRole('button', { name: pin.charAt(0), exact: true }).click();
      await expect(dots.first()).toHaveClass(/bg-slate-900/, { timeout: 750 });
    }).toPass({ timeout: 10000 });

    await page.keyboard.type(pin.slice(1));
    await expect(page).toHaveURL(/\/kiosk$/, { timeout: 10000 });
  }).toPass({ timeout: 45000 });
}

test.describe.serial('02 - E2E Lifecycle', () => {
  test.setTimeout(120000);

  const ts = Date.now();
  const suffix = String(ts).slice(-6);
  // The backend title-cases fullName ("E2E" -> "E2e"), so the lifecycle
  // must use the name returned by the API, not the name we sent.
  const requestedName = 'E2E Waiter ' + suffix;
  const username = 'e2e' + suffix;
  const bizDate = todayISO();

  let waiterId = '';
  let waiterFullName = '';
  let waiterPin = '';

  test('API Setup: Create User & PIN', async ({ request }) => {
    const loginRes = await request.post(`${BASE}/api/v1/auth/login`, {
      data: { username: 'owner', password: OWNER_PASS },
    });
    if (!loginRes.ok()) throw new Error(`Login failed: ${loginRes.status()} ${await loginRes.text()}`);

    const userRes = await request.post(`${BASE}/api/v1/users`, {
      data: {
        username,
        fullName: requestedName,
        phone: '07' + String(ts).slice(-8),
        role: 'WAITER',
        password: 'dummyPassword123!',
      },
    });
    if (!userRes.ok()) throw new Error(`Failed to create user: ${userRes.status()} ${await userRes.text()}`);
    const user = (await userRes.json()).user;
    waiterId = user.id;
    waiterFullName = user.fullName;

    // PINs are globally unique; retry with a new random PIN on collision.
    for (let attempt = 0; attempt < 5 && !waiterPin; attempt++) {
      const candidate = String(Math.floor(100000 + Math.random() * 900000));
      const pinRes = await request.post(`${BASE}/api/v1/auth/set-pin`, {
        data: { userId: waiterId, pin: candidate },
      });
      if (pinRes.ok()) {
        waiterPin = candidate;
      } else if (pinRes.status() !== 409) {
        throw new Error(`Failed to set PIN: ${pinRes.status()} ${await pinRes.text()}`);
      }
    }
    if (!waiterPin) throw new Error('Failed to set a unique PIN after 5 attempts');
  });

  test('Owner records a Sale via UI', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto(`${BASE}/ops/sales`);

    const salesForm = page.locator('form').first();
    const waiterSelect = salesForm.getByRole('combobox', { name: 'Waiter' });
    await expect(waiterSelect.locator(`option[value="${waiterId}"]`)).toBeAttached({ timeout: 15000 });
    await waiterSelect.selectOption(waiterId);

    await salesForm.locator('input[type="date"]').fill(bizDate);
    await salesForm.getByRole('textbox', { name: 'Total sales' }).fill('5000.00');

    const [res] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/v1/sales-summaries') && r.request().method() === 'POST',
      ),
      salesForm.getByRole('button', { name: /record sales summary/i }).click(),
    ]);
    if (res.status() >= 400) console.log('SALE ERROR:', await res.text());
    expect(res.status()).toBeLessThan(400);
  });

  test('Waiter logs into Kiosk and submits cash via UI', async ({ page }) => {
    await loginViaPin(page, waiterPin);

    const form = page.locator('form').first();
    await expect(form.getByText('5000.00', { exact: true }).first()).toBeVisible({ timeout: 15000 });

    // Layout order: M-Pesa payer, M-Pesa amount, expense description, expense amount.
    const textInputs = form.locator('input[type="text"]');
    await textInputs.nth(0).fill('Mpesa Client');
    await textInputs.nth(1).fill('1000.00');
    await textInputs.nth(2).fill('Milk');
    await textInputs.nth(3).fill('200.00');

    const submit = form.locator('button[type="submit"]');
    await expect(submit).toBeEnabled();

    const [res] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/waiter-collections') && r.request().method() === 'POST',
      ),
      submit.click(),
    ]);
    if (res.status() >= 400) console.log('KIOSK ERROR:', await res.text());
    expect(res.status()).toBeLessThan(400);
    await expect(page.getByText('What you submitted')).toBeVisible({ timeout: 15000 });
  });

  test('Manager approves cash via UI', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto(`${BASE}/ops/cash`);

    const card = page
      .locator('div.rounded-2xl.bg-white.p-4')
      .filter({ hasText: waiterFullName })
      .first();
    await expect(card).toBeVisible({ timeout: 15000 });

    const approveBtn = card.getByRole('button', { name: /Idhinisha|Approve/i });
    const [res] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/v1/daily-cash-receipts') && r.request().method() === 'POST',
      ),
      approveBtn.click(),
    ]);
    if (res.status() >= 400) console.log('APPROVE ERROR:', await res.text());
    expect(res.status()).toBeLessThan(400);
    await expect(card.getByText(/Approved|Imeidhinishwa/)).toBeVisible({ timeout: 15000 });
  });
});
