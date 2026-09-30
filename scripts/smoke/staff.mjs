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

const SMOKE_MGR_USERNAME = 'smoke-mgr-19j2';
const SMOKE_MGR_PASSWORD = 'Smoke!Mgr19j2a';
const UNIQUE_SUFFIX = String(Date.now()).slice(-7);
const HIRE_EMP_NAME = 'Smoke Hire 19j2-' + UNIQUE_SUFFIX;
const HIRE_LOGIN_USER = 'smoke-hire-19j2-' + UNIQUE_SUFFIX;
const HIRE_LOGIN_PW = 'Smoke!Hire19j2';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

// -------- OWNER session --------
const ownerCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const ownerReq = ownerCtx.request;
const ownerLogin = await ownerReq.post(BACKEND + '/api/v1/auth/login', {
  data: { username: env.SEED_OWNER_USERNAME, password: env.SEED_OWNER_PASSWORD },
});
if (!ownerLogin.ok()) { console.error('owner login failed', ownerLogin.status()); await browser.close(); process.exit(2); }
record('owner login', true, 'http=' + ownerLogin.status());

// -------- cleanup leftovers from prior runs --------
async function ensureClean() {
  try {
    const sr = await ownerReq.get(BACKEND + '/api/v1/shifts');
    const shifts = (await sr.json()).shifts || [];
    // clean employees matching HIRE_EMP_NAME (no shifts involved)
  } catch {}
  const er = await ownerReq.get(BACKEND + '/api/v1/employees');
  if (er.ok()) {
    const emps = (await er.json()).employees || [];
    const targets = emps.filter((e) => e.fullName === HIRE_EMP_NAME);
    for (const t of targets) {
      if (t.isActive) {
        await ownerReq.post(BACKEND + '/api/v1/employees/' + t.id + '/deactivate').catch(() => {});
      }
    }
  }
  const ur = await ownerReq.get(BACKEND + '/api/v1/users');
  if (ur.ok()) {
    const usrs = (await ur.json()).users || [];
    const smokes = usrs.filter((u) => u.username === HIRE_LOGIN_USER);
    for (const s of smokes) {
      if (s.isActive) {
        await ownerReq.patch(BACKEND + '/api/v1/users/' + s.id, { data: { isActive: false } }).catch(() => {});
      }
    }
  }
}
await ensureClean();

// -------- MANAGER fixture for role-gate assertion --------
let mgrReady = false;
try {
  const list = await ownerReq.get(BACKEND + '/api/v1/users');
  if (list.ok()) {
    const usrs = (await list.json()).users || [];
    const found = usrs.find((u) => u.username === SMOKE_MGR_USERNAME);
    if (found && found.isActive) mgrReady = true;
  }
  if (!mgrReady) {
    const res = await ownerReq.post(BACKEND + '/api/v1/users', {
      data: { username: SMOKE_MGR_USERNAME, fullName: 'Smoke Manager 19j2', password: SMOKE_MGR_PASSWORD, role: 'MANAGER' },
    });
    if (res.ok()) {
      mgrReady = true;
    } else if (res.status() === 409) {
      // Manager exists but is inactive — reactivate via PATCH
      const list2 = await ownerReq.get(BACKEND + '/api/v1/users');
      const usrs2 = list2.ok() ? (await list2.json()).users || [] : [];
      const mgr = usrs2.find((u) => u.username === SMOKE_MGR_USERNAME);
      if (mgr) {
        const react = await ownerReq.patch(BACKEND + '/api/v1/users/' + mgr.id, { data: { isActive: true } });
        mgrReady = react.ok();
        if (!react.ok()) console.log('  mgr reactivate failed ' + react.status());
      }
    } else {
      console.log('  mgr create failed ' + res.status());
    }
  }
} catch (e) { console.log('  mgr setup error: ' + (e && e.message ? e.message : e)); }
record('manager available for role-gate check', mgrReady);

// -------- frontend assertions as OWNER --------
const page = await ownerCtx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

// A. /ops/employees redirects to /ops/staff
await page.goto(FRONTEND + '/ops/employees', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(1500);
const empRedirectUrl = page.url();
record('/ops/employees redirects to /ops/staff', empRedirectUrl.replace(/\/$/, '').endsWith('/ops/staff'), 'url=' + empRedirectUrl);

// B. /ops/staff loads
await page.goto(FRONTEND + '/ops/staff', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForFunction(() => document.body.innerText.includes('Add a staff member'), { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1200);
const staffBody1 = await page.evaluate(() => document.body.innerText);
record('/ops/staff loads', !staffBody1.includes('Application error'));
record('/ops/staff shows create heading', has(staffBody1, 'Add a staff member'));
record('/ops/staff shows Give login checkbox (OWNER)', has(staffBody1, 'Give kiosk / login access'));

// C. sidebar: Staff present, Employees/Positions/Users absent as top-level nav links
const sidebarHrefs = await page.evaluate(() =>
  Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href')).filter(Boolean)
);
record('sidebar has /ops/staff', sidebarHrefs.includes('/ops/staff'), 'hrefs=' + sidebarHrefs.filter(h => h.startsWith('/ops/')).join(','));
record('sidebar no longer has /ops/employees', !sidebarHrefs.includes('/ops/employees'));
record('sidebar no longer has /ops/positions', !sidebarHrefs.includes('/ops/positions'));
record('sidebar no longer has /ops/users', !sidebarHrefs.includes('/ops/users'));

// D. /ops/users still loads (secondary surface) and shows the banner
await page.goto(FRONTEND + '/ops/users', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(1200);
const usersBody = await page.evaluate(() => document.body.innerText);
record('/ops/users loads', !usersBody.includes('Application error'));
record('/ops/users shows secondary banner', has(usersBody, 'This is a history view'));

// E0. Fetch an active position to use as positionId
const posRes = await ownerReq.get(BACKEND + '/api/v1/positions');
const positions = posRes.ok() ? (await posRes.json()).positions || [] : [];
const activePosition = positions.find((p) => p.isActive);
record('active position available for hire test', !!activePosition);
const activePositionId = activePosition ? activePosition.id : null;

// E. Hire with login - API-first to verify the atomic backend, then UI to verify wiring
// E1. API: create employee + login in one call
const hireRes = await ownerReq.post(BACKEND + '/api/v1/employees', {
  data: {
    fullName: HIRE_EMP_NAME,
    phone: '+255722000001',
    positionId: activePositionId,
    startDate: '2026-09-30',
    login: { username: HIRE_LOGIN_USER, password: HIRE_LOGIN_PW, role: 'WAITER' },
  },
});
let hiredEmployeeId = null;
let hiredUserId = null;
if (hireRes.ok()) {
  const b = await hireRes.json();
  hiredEmployeeId = b.employee.id;
  hiredUserId = b.employee.userId;
  record('API: create employee with login', true, 'emp=' + hiredEmployeeId + ' user=' + hiredUserId);
  record('API: employee has userId (linked)', !!hiredUserId);
} else {
  const t = (await hireRes.text()).slice(0, 200);
  record('API: create employee with login', false, hireRes.status() + ' ' + t);
}

// E2. login as the new waiter to prove the login works
if (hiredUserId) {
  const waiterCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const waiterLoginRes = await waiterCtx.request.post(BACKEND + '/api/v1/auth/login', {
    data: { username: HIRE_LOGIN_USER, password: HIRE_LOGIN_PW },
  });
  record('new hire can log in', waiterLoginRes.ok(), 'http=' + waiterLoginRes.status());
  await waiterCtx.close();
}

// E3. frontend: /ops/staff shows the login username in the row
if (hiredEmployeeId) {
  await page.goto(FRONTEND + '/ops/staff', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(1500);
  const body = await page.evaluate(() => document.body.innerText);
  record('/ops/staff shows new hire name', has(body, HIRE_EMP_NAME));
  record('/ops/staff shows new hire login column', has(body, HIRE_LOGIN_USER));
}

// F. Atomic deactivate
if (hiredEmployeeId) {
  const deactRes = await ownerReq.post(BACKEND + '/api/v1/employees/' + hiredEmployeeId + '/deactivate');
  record('API: atomic deactivate returns 200', deactRes.ok(), 'http=' + deactRes.status());

  const er = await ownerReq.get(BACKEND + '/api/v1/employees');
  const emps = er.ok() ? (await er.json()).employees : [];
  const emp = emps.find((e) => e.id === hiredEmployeeId);
  record('employee isActive=false after deactivate', emp && emp.isActive === false);

  const ur = await ownerReq.get(BACKEND + '/api/v1/users');
  const usrs = ur.ok() ? (await ur.json()).users : [];
  const usr = usrs.find((u) => u.id === hiredUserId);
  record('linked user isActive=false after deactivate', usr && usr.isActive === false);

  // Session must be revoked: login as that user should fail
  const fwdCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const fwdLogin = await fwdCtx.request.post(BACKEND + '/api/v1/auth/login', {
    data: { username: HIRE_LOGIN_USER, password: HIRE_LOGIN_PW },
  });
  record('deactivated user cannot log in', !fwdLogin.ok(), 'http=' + fwdLogin.status());
  await fwdCtx.close();
}

// G. MANAGER role gate: no Give login checkbox
if (mgrReady) {
  const mgrCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const mgrReq = mgrCtx.request;
  const mgrLoginRes = await mgrReq.post(BACKEND + '/api/v1/auth/login', {
    data: { username: SMOKE_MGR_USERNAME, password: SMOKE_MGR_PASSWORD },
  });
  if (mgrLoginRes.ok()) {
    const mgrPage = await mgrCtx.newPage();
    await mgrPage.goto(FRONTEND + '/ops/staff', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await mgrPage.waitForFunction(() => document.body.innerText.includes('Add a staff member'), { timeout: 15000 }).catch(() => {});
    await mgrPage.waitForTimeout(1200);
    const mBody = await mgrPage.evaluate(() => document.body.innerText);
    record('MANAGER does not see Give-login checkbox', !has(mBody, 'Give kiosk / login access'));
  } else {
    console.log('  SKIP  manager login failed');
  }
  await mgrCtx.close();
} else {
  console.log('  SKIP  manager unavailable');
}

record('no js errors', pageErrors.length === 0, 'count=' + pageErrors.length);
if (pageErrors.length) for (const e of pageErrors) console.log('    js: ' + e.slice(0, 200));

await browser.close();

console.log('');
const failed = results.filter((r) => !r.ok);
console.log((results.length - failed.length) + ' / ' + results.length + ' passed');
if (failed.length) {
  console.log('failed:');
  for (const f of failed) console.log(' - ' + f.name + ' :: ' + (f.detail || ''));
  process.exit(1);
}