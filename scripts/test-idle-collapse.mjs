import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT     = 'C:\\Users\\kmasu\\restaurant-financial-system';
const CHROME   = 'C:\\Users\\kmasu\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe';
const FRONTEND = 'http://localhost:3000';
const BACKEND  = 'http://localhost:4000';
const KEY      = 'dashboard-shell-collapsed';

function loadEnv(p) {
  const txt = readFileSync(p, 'utf8');
  const out = {};
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = loadEnv(resolve(ROOT, 'backend/.env'));
const username = env.SEED_OWNER_USERNAME;
const password = env.SEED_OWNER_PASSWORD;
if (!username || !password) { console.error('Missing seed credentials'); process.exit(2); }

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '   [' + detail + ']' : ''}`);
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page    = await context.newPage();
page.on('pageerror', e => console.log('  [page error]', e.message));

console.log('login as', username);
const loginRes = await context.request.post(`${BACKEND}/api/v1/auth/login`, {
  data: { username, password },
});
if (!loginRes.ok()) {
  console.error('  login HTTP', loginRes.status());
  console.error('  body:', (await loginRes.text()).slice(0, 400));
  await browser.close(); process.exit(2);
}
console.log('  login ok');

await page.goto(`${FRONTEND}/dashboard`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('aside', { timeout: 15000 });
await page.waitForTimeout(1200);

const rail = page.locator('aside').first();
const width = async () => Math.round((await rail.boundingBox()).width);
const lsVal = async () => page.evaluate(k => window.localStorage.getItem(k), KEY);
const toggle = page.locator('aside button[aria-label]').first();

// Ensure start state is expanded
let label0 = await toggle.getAttribute('aria-label').catch(() => null);
if (label0 === 'Expand sidebar') {
  await toggle.click();
  await page.waitForTimeout(400);
}
record('start: rail is expanded', (await width()) > 200, `w=${await width()}px`);

// 1. baseline activity
console.log('check 1: 13s of mouse activity');
const t0 = Date.now();
while (Date.now() - t0 < 13000) {
  await page.mouse.move(500 + Math.random() * 400, 300 + Math.random() * 300);
  await page.waitForTimeout(1200);
}
record('check 1: rail stays expanded during activity', (await width()) > 200, `w=${await width()}px`);

// 2. idle collapse
console.log('check 2: 12s idle wait');
await page.waitForTimeout(12000);
record('check 2: rail collapses after ~10s idle', (await width()) < 100, `w=${await width()}px`);

// 3. wake
console.log('check 3: wake with mousemove');
await page.mouse.move(800, 500);
await page.waitForTimeout(400);
record('check 3: rail re-expands on activity', (await width()) > 200, `w=${await width()}px`);

// 4. localStorage untouched
const ls4 = await lsVal();
record('check 4: localStorage preference unchanged', ls4 === '0', `value=${ls4}`);

// 5. toggle while idle (dispatch synthetic click to avoid firing mousemove)
console.log('check 5: idle again, click toggle without mousemove');
await page.waitForTimeout(12000);
const wBefore = await width();
record('check 5a: rail is idle-collapsed before click', wBefore < 100, `w=${wBefore}px`);
await page.locator('aside button[aria-label="Expand sidebar"]').dispatchEvent('click');
await page.waitForTimeout(400);
const wAfter = await width();
const ls5 = await lsVal();
record('check 5b: rail expands after toggle', wAfter > 200, `w=${wAfter}px`);
record('check 5c: preference not overwritten', ls5 === '0', `value=${ls5}`);

// Dashboard checks
console.log('dashboard checks');
const collected = await page.getByText('Collected', { exact: false }).first().isVisible().catch(() => false);
record('dash a: Collected card present', collected);

await page.setViewportSize({ width: 1280, height: 900 });
await page.waitForTimeout(700);
const labels = ['Sales', 'Collected', 'Expenses', 'Cash Difference', 'Handovers', 'Supplier Balance'];
const positions = [];
for (const L of labels) {
  const el = page.getByText(L, { exact: true }).first();
  const box = await el.boundingBox().catch(() => null);
  positions.push({ L, y: box ? Math.round(box.y) : null });
}
const found   = positions.filter(p => p.y !== null);
const oneRow  = found.length === labels.length && found.every(p => Math.abs(p.y - found[0].y) < 30);
record('dash b: 6 cards on one row at 1280px', oneRow, found.map(p => `${p.L}=${p.y}`).join(' '));

await browser.close();
console.log('');
const failed = results.filter(r => !r.ok);
console.log(`${results.length - failed.length} / ${results.length} passed`);
if (failed.length) {
  console.log('failed:');
  for (const f of failed) console.log(' -', f.name, f.detail || '');
  process.exit(1);
}