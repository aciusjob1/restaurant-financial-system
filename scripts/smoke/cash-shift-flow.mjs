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
function has(hay, needle) {
  return hay.toLowerCase().includes(needle.toLowerCase());
}

const SMOKE_WAITER_USERNAME = 'smoke-waiter-19j1';
const SMOKE_WAITER_PASSWORD = 'Smoke!Waiter19j1';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

// ============================================================
// Owner context
// ============================================================
const ownerCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const ownerReq = ownerCtx.request;
const ownerLogin = await ownerReq.post(BACKEND + '/api/v1/auth/login', {
  data: { username: env.SEED_OWNER_USERNAME, password: env.SEED_OWNER_PASSWORD },
});
if (!ownerLogin.ok()) { console.error('owner login failed', ownerLogin.status()); await browser.close(); process.exit(2); }
record('owner login', true, 'http=' + ownerLogin.status());

// ============================================================
// Ensure a waiter exists (seed only creates OWNER)
// ============================================================
let waiterReady = false;
try {
  const listRes = await ownerReq.get(BACKEND + '/api/v1/users');
  if (listRes.ok()) {
    const body = await listRes.json();
    const users = body.users || [];
    const existing = users.find((u) => u.username === SMOKE_WAITER_USERNAME);
    if (existing) {
      console.log('  smoke waiter exists: ' + existing.id + ' role=' + existing.role);
      waiterReady = true;
    }
  }
  if (!waiterReady) {
    const createRes = await ownerReq.post(BACKEND + '/api/v1/users', {
      data: {
        username: SMOKE_WAITER_USERNAME,
        fullName: 'Smoke Waiter 19j1',
        password: SMOKE_WAITER_PASSWORD,
        role: 'WAITER',
      },
    });
    if (createRes.ok()) {
      const b = await createRes.json();
      console.log('  smoke waiter created: ' + b.user.id);
      waiterReady = true;
    } else {
      const txt = (await createRes.text()).slice(0, 250);
      console.log('  smoke waiter create FAILED ' + createRes.status() + ' ' + txt);
    }
  }
} catch (e) {
  console.log('  waiter setup error: ' + (e && e.message ? e.message : e));
}
record('waiter available for seed', waiterReady);

if (!waiterReady) {
  console.error('cannot proceed without a waiter; aborting');
  await browser.close();
  process.exit(2);
}

// ============================================================
// Waiter context (fresh cookies)
// ============================================================
const waiterCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const waiterReq = waiterCtx.request;
const waiterLogin = await waiterReq.post(BACKEND + '/api/v1/auth/login', {
  data: { username: SMOKE_WAITER_USERNAME, password: SMOKE_WAITER_PASSWORD },
});
if (!waiterLogin.ok()) { console.error('waiter login failed', waiterLogin.status()); await browser.close(); process.exit(2); }
record('waiter login', true, 'http=' + waiterLogin.status());

// ============================================================
// Seed actionable shift today (waiter-owned, awaiting_review)
// ============================================================
const today = new Date().toISOString().slice(0, 10);
let seedOk = false;
let seededShiftId = null;
let seededReconId = null;

let waiterShift = null;
try {
  const sr = await waiterReq.get(BACKEND + '/api/v1/shifts');
  const ss = (await sr.json()).shifts || [];
  waiterShift = ss.find((s) => s.businessDate === today && s.status !== 'CLOSED') || null;
} catch {}

if (waiterShift) {
  seededShiftId = waiterShift.id;
  console.log('  seed: reusing waiter shift=' + seededShiftId + ' status=' + waiterShift.status);
} else {
  const shiftRes = await waiterReq.post(BACKEND + '/api/v1/shifts', {
    data: { businessDate: today, openingCash: '0.00' },
  });
  if (!shiftRes.ok()) {
    const txt = (await shiftRes.text()).slice(0, 200);
    console.log('  seed FAIL: shift create ' + shiftRes.status() + ' ' + txt);
  } else {
    seededShiftId = (await shiftRes.json()).shift.id;
    console.log('  seed: shift=' + seededShiftId + ' status=OPEN');
    const collRes = await waiterReq.post(BACKEND + '/api/v1/collections', {
      data: { shiftId: seededShiftId, paymentMethod: 'CASH', amount: '100.00' },
    });
    if (!collRes.ok()) console.log('  seed warn: collection ' + collRes.status());
  }
}

if (seededShiftId) {
  const sr2 = await waiterReq.get(BACKEND + '/api/v1/shifts/' + seededShiftId);
  let shiftStatus = sr2.ok() ? (await sr2.json()).shift.status : 'UNKNOWN';
  console.log('  seed: current shift status=' + shiftStatus);

  if (shiftStatus === 'OPEN') {
    const t1 = await waiterReq.post(BACKEND + '/api/v1/shifts/' + seededShiftId + '/transition', {
      data: { to: 'SUBMITTED' },
    });
    if (!t1.ok()) console.log('  seed warn: shift transition ' + t1.status());
    else shiftStatus = 'SUBMITTED';
  }

  let existingRecon = null;
  try {
    const rr = await waiterReq.get(BACKEND + '/api/v1/reconciliations?shiftId=' + seededShiftId);
    const rs = (await rr.json()).reconciliations || [];
    if (rs.length > 0) existingRecon = rs[0];
  } catch {}

  if (existingRecon) {
    seededReconId = existingRecon.id;
    console.log('  seed: reusing recon=' + seededReconId + ' status=' + existingRecon.status);
  } else {
    const reconRes = await waiterReq.post(BACKEND + '/api/v1/reconciliations', {
      data: { shiftId: seededShiftId },
    });
    if (!reconRes.ok()) {
      const txt = (await reconRes.text()).slice(0, 200);
      console.log('  seed warn: recon create ' + reconRes.status() + ' ' + txt);
    } else {
      seededReconId = (await reconRes.json()).reconciliation.id;
      console.log('  seed: recon=' + seededReconId + ' status=DRAFT');
    }
  }

  if (seededReconId) {
    const pRes = await waiterReq.patch(BACKEND + '/api/v1/reconciliations/' + seededReconId, {
      data: { actualCash: '100.00', actualMobile: '0.00', notes: null },
    });
    if (!pRes.ok()) console.log('  seed warn: recon patch ' + pRes.status());

    const rr2 = await waiterReq.get(BACKEND + '/api/v1/reconciliations/' + seededReconId);
    const currentReconStatus = rr2.ok() ? (await rr2.json()).reconciliation.status : 'UNKNOWN';
    if (currentReconStatus === 'DRAFT') {
      const subRes = await waiterReq.post(BACKEND + '/api/v1/reconciliations/' + seededReconId + '/submit', {
        data: {},
      });
      if (!subRes.ok()) console.log('  seed warn: recon submit ' + subRes.status());
      else { seedOk = true; console.log('  seed OK: shift=' + seededShiftId + ' recon=' + seededReconId + ' -> awaiting_review'); }
    } else if (currentReconStatus === 'SUBMITTED' || currentReconStatus === 'REVIEWED') {
      seedOk = true;
      console.log('  seed OK (reused): recon status=' + currentReconStatus);
    }
  }
}
record('seed actionable shift today', seedOk, seedOk ? '' : 'see warnings above');

// ============================================================
// ids for detail-page banner checks
// ============================================================
let shiftId = null;
let reconId = null;
try {
  const sr = await ownerReq.get(BACKEND + '/api/v1/shifts');
  const ss = (await sr.json()).shifts || [];
  if (ss.length > 0) shiftId = ss[0].id;
  const rr = await ownerReq.get(BACKEND + '/api/v1/reconciliations');
  const rs = (await rr.json()).reconciliations || [];
  if (rs.length > 0) reconId = rs[0].id;
} catch {}
console.log('  fixture: shiftId=' + (shiftId || 'none') + ' reconId=' + (reconId || 'none'));

const page = await ownerCtx.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));

await page.goto(FRONTEND + '/ops/cash', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForFunction(() => document.body.innerText.includes('Cash & Shift Work for Today'), { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1800);
const cashBody = await page.evaluate(() => document.body.innerText);
record('/ops/cash loads', !cashBody.includes('Application error'));
record('/ops/cash shows title', has(cashBody, 'Cash & Shift Work for Today'));
record('/ops/cash shows Shifts today', has(cashBody, 'Shifts today'));
record('/ops/cash shows Close today heading', has(cashBody, 'Close today'));
record('/ops/cash shows Advanced toggle', has(cashBody, 'Show advanced tools') || has(cashBody, 'Hide advanced tools'));

await page.goto(FRONTEND + '/ops/cash/shift-flow', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(1500);
const afterRedirect = page.url();
record('/ops/cash/shift-flow redirects to /ops/cash', afterRedirect.replace(/\/$/, '').endsWith('/ops/cash'), 'url=' + afterRedirect);

const bannerNeedle = 'This is a history view';
const bannerPages = ['/ops/shifts', '/ops/reconciliations', '/ops/handovers'];
if (shiftId) bannerPages.push('/ops/shifts/' + shiftId);
if (reconId) bannerPages.push('/ops/reconciliations/' + reconId);
for (const p of bannerPages) {
  await page.goto(FRONTEND + p, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(1200);
  const b = await page.evaluate(() => document.body.innerText);
  record(p + ' shows secondary banner', has(b, bannerNeedle));
}

await page.goto(FRONTEND + '/ops/cash', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForFunction(() => document.body.innerText.includes('Cash & Shift Work for Today'), { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(2200);

const actionLabels = ['Confirm', 'Approve', 'Send back', 'Close shift'];
let clicked = null;
for (const label of actionLabels) {
  const btn = page.locator('button', { hasText: new RegExp('^' + label + '$') }).first();
  const count = await btn.count();
  if (count > 0) {
    const visible = await btn.isVisible().catch(() => false);
    if (visible) { clicked = { label, btn }; break; }
  }
}

if (!clicked) {
  record('inline action button visible', false, 'no actionable button found after seed');
} else {
  record('inline action button visible (' + clicked.label + ')', true);
  const urlBefore = page.url();
  await clicked.btn.click().catch(() => {});
  await page.waitForTimeout(1800);
  const urlAfter = page.url();
  record('inline action ' + clicked.label + ' did not navigate', urlBefore === urlAfter, 'from=' + urlBefore + ' to=' + urlAfter);
  const afterBody = await page.evaluate(() => document.body.innerText);
  record('page still renders after inline action', has(afterBody, 'Cash & Shift Work for Today'));
}

const cashHrefs = await page.evaluate(() =>
  Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href')).filter(Boolean)
);
const detailLinksVisible = cashHrefs.filter((h) => h.startsWith('/ops/shifts/') || h.startsWith('/ops/reconciliations/') || h.startsWith('/ops/handovers/'));
record('/ops/cash does not link to detail pages for day-end', detailLinksVisible.length === 0, 'found=' + detailLinksVisible.length);

record('no js errors', pageErrors.length === 0, 'count=' + pageErrors.length);
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