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
const username = env.SEED_OWNER_USERNAME;
const password = env.SEED_OWNER_PASSWORD;
if (!username || !password) { console.error('missing seed credentials'); process.exit(2); }

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '   [' + detail + ']' : ''));
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page    = await context.newPage();

const pageErrors = [];
const netErrors  = [];
page.on('pageerror', e => pageErrors.push(e.message));
page.on('response', r => {
  const u = r.url();
  if (u.startsWith(BACKEND) && r.status() >= 400) netErrors.push(r.status() + ' ' + u);
});

const loginRes = await context.request.post(BACKEND + '/api/v1/auth/login', { data: { username, password } });
if (!loginRes.ok()) { console.error('login HTTP', loginRes.status()); await browser.close(); process.exit(2); }
console.log('logged in as', username);
console.log('');

const TARGETS = [
  { path: '/dashboard',             name: 'dashboard',              marker: 'Collected' },
  { path: '/ops',                   name: 'ops landing',            marker: 'Collections' },
  { path: '/ops/collections',       name: '/ops/collections',       marker: 'Record a collection' },
  { path: '/ops/handovers',         name: '/ops/handovers',         marker: 'Cash Handovers' },
  { path: '/ops/shifts',            name: '/ops/shifts',            marker: 'Start a shift' },
  { path: '/ops/reconciliations',   name: '/ops/reconciliations',   marker: 'Reconciliations' },
  { path: '/reports/handovers',     name: '/reports/handovers',     marker: 'Handover' },
  { path: '/reports/reconciliations', name: '/reports/reconciliations', marker: 'Reconciliation' },
  { path: '/reports/daily-sales',   name: '/reports/daily-sales',   marker: 'Daily' },
]

for (const t of TARGETS) {
  const beforePe = pageErrors.length;
  const beforeNe = netErrors.length;
  let status = 0;
  try {
    const resp = await page.goto(FRONTEND + t.path, { waitUntil: 'domcontentloaded', timeout: 20000 });
    status = resp ? resp.status() : 0;
    await page.waitForTimeout(1200);
  } catch (e) {
    record(t.name + ' loads', false, 'navigation error: ' + e.message);
    continue;
  }
  const bodyText = await page.evaluate(() => document.body.innerText);
  const hasNextErr = bodyText.includes('Application error') || bodyText.includes('Internal Server Error');
  const hasMarker  = bodyText.toLowerCase().includes(t.marker.toLowerCase());
  const newPe = pageErrors.slice(beforePe);
  const newNe = netErrors.slice(beforeNe);
  const ok = status === 200 && !hasNextErr && hasMarker && newPe.length === 0 && newNe.length === 0;
  const detail = 'http=' + status + ' marker=' + (hasMarker ? 'yes' : 'NO') + ' nextErr=' + (hasNextErr ? 'YES' : 'no') + ' pageErr=' + newPe.length + ' netErr=' + newNe.length;
  record(t.name, ok, detail);
  if (newNe.length > 0) for (const ne of newNe) console.log('      net: ' + ne);
  if (newPe.length > 0) for (const pe of newPe) console.log('      js:  ' + pe.slice(0, 200));
}

await page.goto(FRONTEND + '/ops/collections', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);

const hasShiftSelect = await page.locator('select').count();
record('/ops/collections shift picker rendered', hasShiftSelect >= 2, 'select count=' + hasShiftSelect);

const hasOpenShiftOpt = await page.locator('select option').filter({ hasText: /\d{4}-\d{2}-\d{2}/ }).count();
record('/ops/collections has a dated shift option', hasOpenShiftOpt > 0, 'matching options=' + hasOpenShiftOpt);

const submitBtn = await page.getByRole('button', { name: 'Record collection' }).count();
record('/ops/collections submit button present', submitBtn > 0, 'count=' + submitBtn);

await page.goto(FRONTEND + '/ops/handovers', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);

const recorderForm = await page.locator('form').filter({ hasText: 'Record a handover on behalf' }).count();
record('/ops/handovers Model-1 recorder is gone', recorderForm === 0, 'matching forms=' + recorderForm);

const handoverTable = await page.locator('table').count();
record('/ops/handovers table present', handoverTable > 0, 'tables=' + handoverTable);

await browser.close();

console.log('');
const failed = results.filter(r => !r.ok);
console.log((results.length - failed.length) + ' / ' + results.length + ' passed');
if (failed.length) {
  console.log('failed:');
  for (const f of failed) console.log(' - ' + f.name + ' :: ' + (f.detail || ''));
  process.exit(1);
}