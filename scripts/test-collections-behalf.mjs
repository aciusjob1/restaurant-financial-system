import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT   = 'C:\\Users\\kmasu\\restaurant-financial-system';
const CHROME = 'C:\\Users\\kmasu\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe';
const FRONTEND = 'http://localhost:3000';
const BACKEND  = 'http://localhost:4000';

function loadEnv(p) {
  const txt = readFileSync(p, 'utf8');
  const out = {};
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^['\x22]|['\x22]$/g, '');
  }
  return out;
}
const env = loadEnv(resolve(ROOT, 'backend/.env'));

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '   [' + detail + ']' : ''));
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ownerCtx = await browser.newContext();
const ownerReq = ownerCtx.request;

const ownerLogin = await ownerReq.post(BACKEND + '/api/v1/auth/login', {
  data: { username: env.SEED_OWNER_USERNAME, password: env.SEED_OWNER_PASSWORD },
});
if (!ownerLogin.ok()) { console.error('owner login', ownerLogin.status()); process.exit(2); }
const ownerMe = await ownerReq.get(BACKEND + '/api/v1/auth/me');
const ownerBody = await ownerMe.json();
const ownerId = ownerBody.user.id;
console.log('owner id =', ownerId);
console.log('');

const stamp = Date.now();
const WAITER_USERNAME = 'phase19c-test-w-' + stamp;
const WAITER_PASSWORD = 'WaiterPassword!234';

const createUser = await ownerReq.post(BACKEND + '/api/v1/users', {
  data: { username: WAITER_USERNAME, password: WAITER_PASSWORD, fullName: 'Phase 19c Test Waiter', role: 'WAITER' },
});
if (!createUser.ok()) { console.error('user create', createUser.status(), await createUser.text()); process.exit(2); }
const newWaiter = await createUser.json();
const waiterId = newWaiter.user.id;
console.log('created test waiter', WAITER_USERNAME, 'id =', waiterId);

const waiterCtx = await browser.newContext();
const waiterReq = waiterCtx.request;
const waiterLogin = await waiterReq.post(BACKEND + '/api/v1/auth/login', {
  data: { username: WAITER_USERNAME, password: WAITER_PASSWORD },
});
if (!waiterLogin.ok()) { console.error('waiter login', waiterLogin.status()); process.exit(2); }

const today = new Date().toISOString().slice(0, 10);
const shiftRes = await waiterReq.post(BACKEND + '/api/v1/shifts', {
  data: { businessDate: today, openingCash: '0.00' },
});
if (!shiftRes.ok()) { console.error('shift create', shiftRes.status(), await shiftRes.text()); process.exit(2); }
const shiftJson = await shiftRes.json();
const shiftId = shiftJson.shift.id;
console.log('created open shift for waiter:', shiftId, 'businessDate=', today);
console.log('');
console.log('--- simulating manager at counter (owner browser session) ---');

const page = await ownerCtx.newPage();
await page.goto(FRONTEND + '/ops/collections', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);

const shiftSelects = page.locator('select');
const selectCount = await shiftSelects.count();
let shiftSelect = null;
let methodSelect = null;
for (let i = 0; i < selectCount; i++) {
  const sel = shiftSelects.nth(i);
  const opts = await sel.locator('option').allTextContents();
  if (opts.some(o => o.includes(today))) { shiftSelect = sel; }
  if (opts.includes('CASH') && opts.includes('MPESA')) { methodSelect = sel; }
}
record('shift picker contains our fresh shift', shiftSelect !== null, 'date=' + today);
record('payment-method picker found', methodSelect !== null);

if (!shiftSelect) { await browser.close(); process.exit(1); }

const shiftOptionValue = await shiftSelect.locator('option', { hasText: 'Phase 19c Test Waiter' }).first().getAttribute('value');
if (!shiftOptionValue) { console.error('shift option value missing'); await browser.close(); process.exit(1); }
await shiftSelect.selectOption(shiftOptionValue);

await page.waitForTimeout(300);

const amountInput = page.locator('input[inputmode=decimal]').first();
await amountInput.fill('2500.00');

await page.getByRole('button', { name: 'Record collection' }).first().click();
await page.waitForTimeout(2500);

const listRes = await ownerReq.get(BACKEND + '/api/v1/collections?shiftId=' + shiftId);
const listJson = await listRes.json();
const created = listJson.collections.find(c => c.amount === '2500.00');
record('collection row appeared via API', !!created, created ? 'id=' + created.id : 'not found');

if (created) {
  record('collection.userId equals waiter (the attributed owner)', created.userId === waiterId, 'userId=' + created.userId);
  record('collection.shiftId equals the waiter shift', created.shiftId === shiftId, 'shiftId=' + created.shiftId);

  const voidRes = await ownerReq.post(BACKEND + '/api/v1/collections/' + created.id + '/void', {
    data: { reason: 'phase19c automated test cleanup' },
  });
  record('cleanup: collection voided', voidRes.ok(), 'http=' + voidRes.status());
}

await browser.close();

console.log('');
const failed = results.filter(r => !r.ok);
console.log((results.length - failed.length) + ' / ' + results.length + ' passed');
if (failed.length) { console.log('failed:'); for (const f of failed) console.log(' - ' + f.name); process.exit(1); }