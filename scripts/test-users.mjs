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
const MANAGER_USER  = 'phase19f-ui-mgr-' + stamp;
const MANAGER2_USER = 'phase19f-ui-mgr2-' + stamp;
const WAITER_USER   = 'phase19f-ui-w-' + stamp;
const WAITER_PASS   = 'WaiterPassword!234';
const MANAGER_PASS  = 'ManagerPassword!234';
const MANAGER2_PASS = 'ManagerPassword!234';
const NEW_WAITER_PASS = 'RotatedWaiter!2345';
const NEW_WAITER_NAME = 'Renamed By E2E';
const OWNER_CREATED_USER = 'phase19f-ui-own-' + stamp;
const OWNER_CREATED_PASS = 'OwnedByOwner!2345';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

// ---- owner context: setup + verify ----
const ownerCtx = await browser.newContext();
const ownerReq = ownerCtx.request;
const ownerLogin = await ownerReq.post(BACKEND + '/api/v1/auth/login', {
  data: { username: env.SEED_OWNER_USERNAME, password: env.SEED_OWNER_PASSWORD },
});
if (!ownerLogin.ok()) { console.error('owner login failed', ownerLogin.status()); await browser.close(); process.exit(2); }
record('owner login', true, 'http=' + ownerLogin.status());

async function createUser(username, password, fullName, role) {
  const res = await ownerReq.post(BACKEND + '/api/v1/users', {
    data: { username, password, fullName, role },
  });
  if (!res.ok()) { console.error('create ' + username + ' failed', res.status(), await res.text()); process.exit(2); }
  return (await res.json()).user;
}

const managerUser = await createUser(MANAGER_USER, MANAGER_PASS, 'Phase 19f UI Manager', 'MANAGER');
const manager2User = await createUser(MANAGER2_USER, MANAGER2_PASS, 'Phase 19f UI Manager 2', 'MANAGER');
const waiterUser = await createUser(WAITER_USER, WAITER_PASS, 'Phase 19f UI Waiter', 'WAITER');
record('fixture users created', true, 'manager=' + managerUser.id + ' waiter=' + waiterUser.id);

// ============================================================
// MANAGER view
// ============================================================
const mgrCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const mgrLogin = await mgrCtx.request.post(BACKEND + '/api/v1/auth/login', {
  data: { username: MANAGER_USER, password: MANAGER_PASS },
});
if (!mgrLogin.ok()) { console.error('manager login failed', mgrLogin.status()); await browser.close(); process.exit(2); }
record('manager login', true, 'http=' + mgrLogin.status());

const mgrPage = await mgrCtx.newPage();
const mgrErrors = [];
const mgrNetErrors = [];
mgrPage.on('pageerror', e => mgrErrors.push(e.message));
mgrPage.on('response', r => {
  const u = r.url();
  if (u.startsWith(BACKEND) && r.status() >= 400) mgrNetErrors.push(r.status() + ' ' + u);
});

await mgrPage.goto(FRONTEND + '/ops/users', { waitUntil: 'domcontentloaded', timeout: 20000 });
await mgrPage.waitForTimeout(2500);

const mgrBody = await mgrPage.evaluate(() => document.body.innerText);
record('manager sees /ops/users', !mgrBody.includes('Application error') && !mgrBody.includes('Internal Server Error'));
record('sidebar has Users link', mgrBody.includes('Users'));
record('manager sees the users table', mgrBody.includes(MANAGER_USER) && mgrBody.includes(WAITER_USER));
record('manager does NOT see create form', !mgrBody.includes('Create user'));
record('manager does NOT see any Deactivate button', !mgrBody.includes('Deactivate'));

// manager sees Edit on waiter but not on peer manager
const mgrEditWaiterBtn = await mgrPage.getByRole('button', { name: 'Edit user ' + WAITER_USER }).count();
record('manager sees Edit on waiter row', mgrEditWaiterBtn > 0, 'count=' + mgrEditWaiterBtn);
const mgrEditPeerBtn = await mgrPage.getByRole('button', { name: 'Edit user ' + MANAGER2_USER }).count();
record('manager sees NO Edit on peer manager row', mgrEditPeerBtn === 0, 'count=' + mgrEditPeerBtn);

// reset button visibility
const mgrResetWaiterBtn = await mgrPage.getByRole('button', { name: 'Reset password for ' + WAITER_USER }).count();
record('manager sees Reset on waiter row', mgrResetWaiterBtn > 0, 'count=' + mgrResetWaiterBtn);
const mgrResetPeerBtn = await mgrPage.getByRole('button', { name: 'Reset password for ' + MANAGER2_USER }).count();
record('manager sees NO Reset on peer manager row', mgrResetPeerBtn === 0, 'count=' + mgrResetPeerBtn);

// ---- manager edits waiter via UI ----
await mgrPage.getByRole('button', { name: 'Edit user ' + WAITER_USER }).click();
await mgrPage.waitForTimeout(500);

const editHeading = await mgrPage.evaluate(() => document.body.innerText);
record('edit form opens for waiter', editHeading.includes('Edit user: ' + WAITER_USER));

// role field must NOT appear for a manager edit
const roleFieldCount = await mgrPage.getByLabel('Role', { exact: true }).count();
record('manager edit has no Role field', roleFieldCount === 0, 'count=' + roleFieldCount);

await mgrPage.getByLabel('Full name').fill(NEW_WAITER_NAME);
await mgrPage.getByRole('button', { name: 'Save changes' }).click();
await mgrPage.waitForTimeout(1500);

const afterEditBody = await mgrPage.evaluate(() => document.body.innerText);
record('save shows success flash', afterEditBody.includes('User updated'));

const waiterAfterEdit = await ownerReq.get(BACKEND + '/api/v1/users/' + waiterUser.id);
const waiterAfterEditJson = await waiterAfterEdit.json();
record('API: waiter fullName updated', waiterAfterEditJson.user.fullName === NEW_WAITER_NAME, 'val=' + waiterAfterEditJson.user.fullName);

// ---- manager resets waiter password via UI ----
await mgrPage.getByRole('button', { name: 'Reset password for ' + WAITER_USER }).click();
await mgrPage.waitForTimeout(500);

const resetHeading = await mgrPage.evaluate(() => document.body.innerText);
record('reset form opens', resetHeading.includes('Reset password: ' + WAITER_USER));

await mgrPage.getByLabel('New password', { exact: true }).fill(NEW_WAITER_PASS);
await mgrPage.getByRole('button', { name: 'Reset password', exact: true }).click();
await mgrPage.waitForTimeout(1800);

const afterResetBody = await mgrPage.evaluate(() => document.body.innerText);
record('reset shows success flash', afterResetBody.includes('Password reset'));

// waiter sign-in with new password
const oldWaiterLogin = await browser.newContext().then(c => c.request.post(BACKEND + '/api/v1/auth/login', {
  data: { username: WAITER_USER, password: WAITER_PASS },
}));
record('old waiter password rejected', oldWaiterLogin.status() === 401, 'http=' + oldWaiterLogin.status());

const newWaiterLogin = await browser.newContext().then(c => c.request.post(BACKEND + '/api/v1/auth/login', {
  data: { username: WAITER_USER, password: NEW_WAITER_PASS },
}));
record('new waiter password works', newWaiterLogin.status() === 200, 'http=' + newWaiterLogin.status());

record('manager page has no js errors', mgrErrors.length === 0, 'pageErr=' + mgrErrors.length);
if (mgrErrors.length) for (const e of mgrErrors) console.log('    mgr js: ' + e.slice(0, 200));
if (mgrNetErrors.length) for (const ne of mgrNetErrors) console.log('    mgr net: ' + ne);

// ============================================================
// OWNER view
// ============================================================
const ownerPage = await ownerCtx.newPage();
const ownerPageErrors = [];
ownerPage.on('pageerror', e => ownerPageErrors.push(e.message));
ownerPage.on('dialog', d => d.accept());

await ownerPage.goto(FRONTEND + '/ops/users', { waitUntil: 'domcontentloaded', timeout: 20000 });
await ownerPage.waitForTimeout(2500);

const ownerBody = await ownerPage.evaluate(() => document.body.innerText);
record('owner sees create form', ownerBody.includes('Create user'));
record('owner sees Deactivate buttons', ownerBody.includes('Deactivate'));

// owner creates a user via UI
await ownerPage.getByLabel('Username', { exact: true }).fill(OWNER_CREATED_USER);
await ownerPage.getByLabel('Full name', { exact: true }).fill('Created By Owner UI');
await ownerPage.getByRole('combobox').first().selectOption('WAITER');
await ownerPage.getByLabel('Initial password', { exact: true }).fill(OWNER_CREATED_PASS);
await ownerPage.getByRole('button', { name: 'Create user' }).click();
await ownerPage.waitForTimeout(1800);

const afterCreateBody = await ownerPage.evaluate(() => document.body.innerText);
record('create shows success flash', afterCreateBody.includes('User created'));

const newOwnerLogin = await browser.newContext().then(c => c.request.post(BACKEND + '/api/v1/auth/login', {
  data: { username: OWNER_CREATED_USER, password: OWNER_CREATED_PASS },
}));
record('UI-created user can sign in', newOwnerLogin.status() === 200, 'http=' + newOwnerLogin.status());

record('owner page has no js errors', ownerPageErrors.length === 0, 'pageErr=' + ownerPageErrors.length);
if (ownerPageErrors.length) for (const e of ownerPageErrors) console.log('    owner js: ' + e.slice(0, 200));

await browser.close();

console.log('');
const failed = results.filter(r => !r.ok);
console.log((results.length - failed.length) + ' / ' + results.length + ' passed');
if (failed.length) {
  console.log('failed:');
  for (const f of failed) console.log(' - ' + f.name + ' :: ' + (f.detail || ''));
  process.exit(1);
}