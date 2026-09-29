import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT     = 'C:\\Users\\kmasu\\restaurant-financial-system';
const CHROME   = 'C:\\Users\\kmasu\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe';
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

const stamp = Date.now();
const WAITER_USER = 'phase19g-ui-w-' + stamp;
const WAITER_PASS = 'WaiterPassword!234';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

// ---- owner context for fixture setup ----
const ownerCtx = await browser.newContext();
const ownerReq = ownerCtx.request;
const ownerLogin = await ownerReq.post(BACKEND + '/api/v1/auth/login', {
  data: { username: env.SEED_OWNER_USERNAME, password: env.SEED_OWNER_PASSWORD },
});
if (!ownerLogin.ok()) { console.error('owner login failed', ownerLogin.status()); await browser.close(); process.exit(2); }
record('owner login', true, 'http=' + ownerLogin.status());

const u = await ownerReq.post(BACKEND + '/api/v1/users', {
  data: { username: WAITER_USER, password: WAITER_PASS, fullName: 'Phase 19g UI Waiter', role: 'WAITER' },
});
if (!u.ok()) { console.error('waiter create failed', u.status(), await u.text()); await browser.close(); process.exit(2); }
record('waiter fixture created', true, 'user=' + WAITER_USER);

// ---- fresh browser context, no cookies ----
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
page.on('response', async (r) => {
  if (r.url().includes('/auth/login')) {
    let body = '';
    try { body = (await r.text()).slice(0, 300); } catch {}
    console.log('    LOGIN RESP: ' + r.status() + ' body=' + body);
  }
  if (r.url().endsWith('/auth/me')) {
    console.log('    ME RESP: ' + r.status());
  }
});

// ---- login page - English by default ----
await page.goto(FRONTEND + '/login', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(1500);

const swBtnCount = await page.getByRole('button', { name: 'Switch to Swahili' }).count();
record('login page has SW picker button', swBtnCount > 0, 'count=' + swBtnCount);

const enHeadingCount = await page.getByRole('heading', { name: 'Sign in' }).count();
record('login page starts in English (Sign in heading)', enHeadingCount > 0, 'count=' + enHeadingCount);

// ---- switch to Swahili ----
await page.getByRole('button', { name: 'Switch to Swahili' }).first().click();
await page.waitForTimeout(600);

const swHeadingCount = await page.getByRole('heading', { name: 'Ingia' }).count();
record('after SW click, heading becomes Ingia', swHeadingCount > 0, 'count=' + swHeadingCount);

const swUserLabelCount = await page.getByLabel('Jina la mtumiaji').count();
record('after SW click, username label is Swahili', swUserLabelCount > 0, 'count=' + swUserLabelCount);

const swPassLabelCount = await page.getByLabel('Nenosiri').count();
record('after SW click, password label is Swahili', swPassLabelCount > 0, 'count=' + swPassLabelCount);

// ---- cookie was written ----
const cookiesBefore = await ctx.cookies();
const langCookieBefore = cookiesBefore.find(c => c.name === 'rfs_lang');
record('rfs_lang cookie set to sw', langCookieBefore && langCookieBefore.value === 'sw', 'val=' + (langCookieBefore ? langCookieBefore.value : 'missing'));

// ---- log in from the Swahili login page ----
await page.getByLabel('Jina la mtumiaji').fill(WAITER_USER);
await page.getByLabel('Nenosiri').fill(WAITER_PASS);
await page.getByRole('button', { name: 'Ingia' }).click();
await page.waitForURL('**/kiosk', { timeout: 8000 }).catch(() => {});
if (!page.url().includes('/kiosk')) {
  const dbg = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log('    DEBUG body after submit: ' + JSON.stringify(dbg));
}

record('waiter reached /kiosk', page.url().includes('/kiosk'), 'url=' + page.url());

// Wait for KioskShell to finish its own /auth/me and render the nav.
await page.waitForFunction(() => {
  const t = document.body.innerText;
  return t.includes('Zamu') || t.includes('Shift');
}, { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(500);

// ---- kiosk chrome in Swahili ----
const kioskBodySw = await page.evaluate(() => document.body.innerText);
record('kiosk nav shows Zamu (Shift)', kioskBodySw.includes('Zamu'), '');
record('kiosk nav shows Matumizi (Expenses)', kioskBodySw.includes('Matumizi'), '');
record('kiosk sign-out is Toka', kioskBodySw.includes('Toka'), '');

// ---- switch to English from kiosk ----
await page.getByRole('button', { name: 'Switch to English' }).first().click();
await page.waitForTimeout(600);

const kioskBodyEn = await page.evaluate(() => document.body.innerText);
record('after EN click, nav shows Shift', kioskBodyEn.includes('Shift'), '');
record('after EN click, nav shows Expenses', kioskBodyEn.includes('Expenses'), '');

const cookiesAfter = await ctx.cookies();
const langCookieAfter = cookiesAfter.find(c => c.name === 'rfs_lang');
record('rfs_lang cookie updated to en', langCookieAfter && langCookieAfter.value === 'en', 'val=' + (langCookieAfter ? langCookieAfter.value : 'missing'));

// ---- reload, still English ----
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => {
  const t = document.body.innerText;
  return t.includes('Zamu') || t.includes('Shift');
}, { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(500);
const kioskBodyReload = await page.evaluate(() => document.body.innerText);
record('after reload, nav still shows Shift', kioskBodyReload.includes('Shift'), '');

// ---- error checks ----
record('no js errors', pageErrors.length === 0, 'pageErr=' + pageErrors.length);
if (pageErrors.length) for (const e of pageErrors) console.log('    js: ' + e.slice(0, 200));

await browser.close();

console.log('');
const failed = results.filter(r => !r.ok);
console.log((results.length - failed.length) + ' / ' + results.length + ' passed');
if (failed.length) {
  console.log('failed:');
  for (const f of failed) console.log(' - ' + f.name + ' :: ' + (f.detail || ''));
  process.exit(1);
}