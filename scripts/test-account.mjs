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
const USERNAME = 'phase19e-ui-' + stamp;
const PASSWORD = 'OriginalPass!2345';
const NEW_PASSWORD = 'RotatedPass!56789';
const NEW_FULLNAME = 'Renamed By UI Test';
const NEW_PHONE = '+255700123456';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

// owner ctx for setup + verify
const ownerCtx = await browser.newContext();
const ownerReq = ownerCtx.request;
const ownerLogin = await ownerReq.post(BACKEND + '/api/v1/auth/login', {
  data: { username: env.SEED_OWNER_USERNAME, password: env.SEED_OWNER_PASSWORD },
});
if (!ownerLogin.ok()) { console.error('owner login failed', ownerLogin.status()); await browser.close(); process.exit(2); }
record('owner login', true, 'http=' + ownerLogin.status());

const createUser = await ownerReq.post(BACKEND + '/api/v1/users', {
  data: { username: USERNAME, password: PASSWORD, fullName: 'Phase 19e UI Manager', role: 'MANAGER' },
});
if (!createUser.ok()) { console.error('user create failed', createUser.status(), await createUser.text()); await browser.close(); process.exit(2); }
const userJson = await createUser.json();
const userId = userJson.user.id;
record('test manager created', true, 'id=' + userId);

// ---- user browser context ----
const userCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const userLogin = await userCtx.request.post(BACKEND + '/api/v1/auth/login', {
  data: { username: USERNAME, password: PASSWORD },
});
if (!userLogin.ok()) { console.error('user login failed', userLogin.status()); await browser.close(); process.exit(2); }
record('test manager login', true, 'http=' + userLogin.status());

const page = await userCtx.newPage();
const pageErrors = [];
const netErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
page.on('response', r => {
  const u = r.url();
  if (u.startsWith(BACKEND) && r.status() >= 400) netErrors.push(r.status() + ' ' + u);
});

await page.goto(FRONTEND + '/ops/account', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(2500);

const body1 = await page.evaluate(() => document.body.innerText);
record('account page rendered', body1.includes('Profile') && body1.includes('Change password'));
record('sidebar has Account link', body1.includes('Account'));

// read current values into the form
const currentFullName = await page.getByLabel('Full name').inputValue();
record('form shows current fullName', currentFullName === 'Phase 19e UI Manager', 'val=' + currentFullName);
const currentUsername = await page.getByLabel('Username').inputValue();
record('form shows current username', currentUsername === USERNAME, 'val=' + currentUsername);
const currentRole = await page.getByLabel('Role').inputValue();
record('form shows current role', currentRole === 'MANAGER', 'val=' + currentRole);

// ---- edit profile ----
await page.getByLabel('Full name').fill(NEW_FULLNAME);
await page.getByLabel('Phone (optional)').fill(NEW_PHONE);
await page.getByRole('button', { name: 'Save profile' }).click();
await page.waitForTimeout(1500);

const body2 = await page.evaluate(() => document.body.innerText);
record('profile saved toast appears', body2.includes('Profile saved'));

// API verify
const meRes = await userCtx.request.get(BACKEND + '/api/v1/auth/me');
const me = await meRes.json();
record('API: fullName updated', me.user.fullName === NEW_FULLNAME, 'val=' + me.user.fullName);
record('API: phone updated', me.user.phone === NEW_PHONE, 'val=' + me.user.phone);

// reload to confirm persistence
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
const reloadedFullName = await page.getByLabel('Full name').inputValue();
record('after reload, fullName persists in form', reloadedFullName === NEW_FULLNAME, 'val=' + reloadedFullName);

// ---- clear phone (null case) ----
await page.getByLabel('Phone (optional)').fill('');
await page.getByRole('button', { name: 'Save profile' }).click();
await page.waitForTimeout(1200);
const me2Res = await userCtx.request.get(BACKEND + '/api/v1/auth/me');
const me2 = await me2Res.json();
record('API: phone cleared to null', me2.user.phone === null, 'val=' + me2.user.phone);

// ---- password change: mismatch rejected client-side ----
await page.getByLabel('Current password', { exact: true }).fill(PASSWORD);
await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
await page.getByLabel('Confirm new password', { exact: true }).fill('DifferentPassword!99');
await page.getByRole('button', { name: 'Change password' }).click();
await page.waitForTimeout(800);
const body3 = await page.evaluate(() => document.body.innerText);
record('mismatch flagged client-side', body3.includes('do not match'));

// ---- password change: wrong current rejected ----
await page.getByLabel('Current password', { exact: true }).fill('NotTheRightOne!111');
await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
await page.getByLabel('Confirm new password', { exact: true }).fill(NEW_PASSWORD);
await page.getByRole('button', { name: 'Change password' }).click();
await page.waitForTimeout(1500);
const body4 = await page.evaluate(() => document.body.innerText);
record('wrong current password shows error', body4.includes('INVALID_PASSWORD'), body4.includes('INVALID_PASSWORD') ? '' : 'not in body');

// ---- password change: success path ----
await page.getByLabel('Current password', { exact: true }).fill(PASSWORD);
await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
await page.getByLabel('Confirm new password', { exact: true }).fill(NEW_PASSWORD);
await page.getByRole('button', { name: 'Change password' }).click();
await page.waitForTimeout(2500);

const urlAfter = page.url();
record('redirected to login after password change', urlAfter.includes('/login'), 'url=' + urlAfter);

// ---- old password no longer works, new one does ----
const oldLogin = await browser.newContext().then(c => c.request.post(BACKEND + '/api/v1/auth/login', {
  data: { username: USERNAME, password: PASSWORD },
}));
record('old password rejected', oldLogin.status() === 401, 'http=' + oldLogin.status());

const newLogin = await browser.newContext().then(c => c.request.post(BACKEND + '/api/v1/auth/login', {
  data: { username: USERNAME, password: NEW_PASSWORD },
}));
record('new password works', newLogin.status() === 200, 'http=' + newLogin.status());

// ---- final error checks ----
if (netErrors.length) for (const ne of netErrors) console.log('    net: ' + ne);
if (pageErrors.length) for (const pe of pageErrors) console.log('    js: ' + pe.slice(0, 200));
record('no js errors on account page', pageErrors.length === 0, 'pageErr=' + pageErrors.length);

await browser.close();

console.log('');
const failed = results.filter(r => !r.ok);
console.log((results.length - failed.length) + ' / ' + results.length + ' passed');
if (failed.length) {
  console.log('failed:');
  for (const f of failed) console.log(' - ' + f.name + ' :: ' + (f.detail || ''));
  process.exit(1);
}