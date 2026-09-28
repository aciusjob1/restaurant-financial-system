import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT     = 'C:\\Users\\kmasu\\restaurant-financial-system';
const CHROME   = 'C:\\Users\\kmasu\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe';
const FRONTEND = 'http://localhost:3000';
const BACKEND  = 'http://localhost:4000';

// A far-future business date that no DailyClosing row exists for.
// The backend tests use the 2099-08-XX range; pick a date outside that.
const TEST_DATE = '2099-10-01';

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

const stamp = Date.now();
const WAITER_USERNAME = 'phase19d-ui-w-' + stamp;
const WAITER_PASSWORD = 'WaiterPassword!234';
const CATEGORY_NAME   = 'phase19d-ui-cat-' + stamp;
const DESC            = 'phase19d UI test expense ' + stamp;

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

const ownerCtx = await browser.newContext();
const ownerReq = ownerCtx.request;

const ownerLogin = await ownerReq.post(BACKEND + '/api/v1/auth/login', {
  data: { username: env.SEED_OWNER_USERNAME, password: env.SEED_OWNER_PASSWORD },
});
if (!ownerLogin.ok()) { console.error('owner login failed', ownerLogin.status()); await browser.close(); process.exit(2); }
record('owner login', true, 'http=' + ownerLogin.status());

const catRes = await ownerReq.post(BACKEND + '/api/v1/expense-categories', {
  data: { name: CATEGORY_NAME, description: 'phase19d UI test category' },
});
if (!catRes.ok()) { console.error('category create failed', catRes.status(), await catRes.text()); await browser.close(); process.exit(2); }
const catJson = await catRes.json();
const categoryId = catJson.category.id;
record('test category created', true, 'id=' + categoryId);

const userRes = await ownerReq.post(BACKEND + '/api/v1/users', {
  data: { username: WAITER_USERNAME, password: WAITER_PASSWORD, fullName: 'Phase 19d UI Waiter', role: 'WAITER' },
});
if (!userRes.ok()) { console.error('waiter create failed', userRes.status(), await userRes.text()); await browser.close(); process.exit(2); }
const userJson = await userRes.json();
const waiterId = userJson.user.id;
record('test waiter created', true, 'id=' + waiterId);

const waiterCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const waiterLoginRes = await waiterCtx.request.post(BACKEND + '/api/v1/auth/login', {
  data: { username: WAITER_USERNAME, password: WAITER_PASSWORD },
});
if (!waiterLoginRes.ok()) { console.error('waiter login failed', waiterLoginRes.status()); await browser.close(); process.exit(2); }
record('waiter login', true, 'http=' + waiterLoginRes.status());

const waiterPage = await waiterCtx.newPage();
const pageErrors = [];
waiterPage.on('pageerror', e => pageErrors.push(e.message));

// Capture any 4xx/5xx from backend on this page
const netErrors = [];
waiterPage.on('response', r => {
  const u = r.url();
  if (u.startsWith(BACKEND) && r.status() >= 400) netErrors.push(r.status() + ' ' + u);
});

await waiterPage.goto(FRONTEND + '/kiosk/expenses', { waitUntil: 'domcontentloaded', timeout: 20000 });
await waiterPage.waitForTimeout(2500);

const bodyText = await waiterPage.evaluate(() => document.body.innerText);
const isDenied = bodyText.includes('This is the waiter kiosk');
record('waiter not denied on /kiosk/expenses', !isDenied, isDenied ? 'denied page shown' : '');
record('expense form rendered', bodyText.includes('Record an expense'));
record('expense list rendered', bodyText.includes('My expenses'));

await waiterPage.getByLabel('Business date').fill(TEST_DATE);
await waiterPage.getByLabel('Category').selectOption({ value: categoryId });
await waiterPage.getByLabel('Amount').fill('42.50');
await waiterPage.getByLabel('Payment method').selectOption({ value: 'CASH' });
await waiterPage.getByLabel('Description').fill(DESC);

await waiterPage.getByRole('button', { name: 'Record expense' }).click();
await waiterPage.waitForTimeout(2500);

const afterText = await waiterPage.evaluate(() => document.body.innerText);
record('row appears in waiter list', afterText.includes(DESC));
record('PENDING status visible in list', afterText.includes('PENDING'));
if (netErrors.length) for (const ne of netErrors) console.log('    net: ' + ne);

// ---- owner verify via API ----
const verify = await ownerReq.get(BACKEND + '/api/v1/expenses?businessDate=' + TEST_DATE);
const verifyJson = await verify.json();
const row = verifyJson.expenses.find(e => e.description === DESC);
record('expense row exists via API', !!row, row ? 'id=' + row.id : 'not found');
if (row) {
  record('createdBy is waiter', row.createdBy === waiterId, 'createdBy=' + row.createdBy);
  record('status is PENDING', row.status === 'PENDING', 'status=' + row.status);
  record('submittedAt set', !!row.submittedAt, 'submittedAt=' + row.submittedAt);
}

// ---- owner browser: /ops/expenses ----
const ownerPage = await ownerCtx.newPage();
const ownerErrors = [];
ownerPage.on('pageerror', e => ownerErrors.push(e.message));

await ownerPage.goto(FRONTEND + '/ops/expenses?businessDate=' + TEST_DATE, { waitUntil: 'domcontentloaded', timeout: 20000 });
await ownerPage.waitForTimeout(2500);

const ownerBody = await ownerPage.evaluate(() => document.body.innerText);
record('owner /ops/expenses page loads', !ownerBody.includes('Application error') && !ownerBody.includes('Internal Server Error'));
record('owner sees the waiter expense description', ownerBody.includes(DESC), ownerBody.includes(DESC) ? '' : 'not found in body');
record('owner page has no js errors', ownerErrors.length === 0, 'pageErr=' + ownerErrors.length);

record('waiter page has no js errors', pageErrors.length === 0, 'pageErr=' + pageErrors.length);
if (pageErrors.length) for (const e of pageErrors) console.log('    js: ' + e.slice(0, 200));
if (ownerErrors.length) for (const e of ownerErrors) console.log('    owner js: ' + e.slice(0, 200));

await browser.close();

console.log('');
const failed = results.filter(r => !r.ok);
console.log((results.length - failed.length) + ' / ' + results.length + ' passed');
if (failed.length) {
  console.log('failed:');
  for (const f of failed) console.log(' - ' + f.name + ' :: ' + (f.detail || ''));
  process.exit(1);
}