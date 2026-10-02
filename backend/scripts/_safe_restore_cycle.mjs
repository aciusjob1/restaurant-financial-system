import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = 'C:\\Users\\kmasu\\restaurant-financial-system';
const API = 'http://localhost:4000';

function loadEnv(p) {
  const txt = readFileSync(p, 'utf8');
  const out = {};
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}
const env = loadEnv(resolve(ROOT, 'backend/.env'));

// ---------------------------------------------------------------
// session cookie — extracted once, reused by every api() call
// ---------------------------------------------------------------
let cookieHeader = '';

async function login() {
  const r = await fetch(API + '/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: env.SEED_OWNER_USERNAME,
      password: env.SEED_OWNER_PASSWORD,
    }),
  });
  if (!r.ok) throw new Error('login failed: ' + r.status + ' ' + (await r.text()));
  const raw = r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')].filter(Boolean);
  cookieHeader = raw.map((c) => c.split(';')[0]).join('; ');
  if (!cookieHeader) throw new Error('login returned no session cookie');
}

async function api(method, path, body) {
  const opts = { method, headers: { 'Cookie': cookieHeader } };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(API + path, opts);
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { ok: r.ok, status: r.status, json, text };
}

// ---------------------------------------------------------------
// tracking — for fail-fast recovery hints
// ---------------------------------------------------------------
const state = {
  backupA: null,
  backupB: null,
  settingsBefore: null,
  sentinel: 'RESTORE-TEST-' + Date.now(),
};

function hintRecovery() {
  console.error('');
  console.error('=================================================');
  console.error('RECOVERY HINT');
  console.error('=================================================');
  if (state.backupB) {
    console.error('Pre-restore snapshot from the failing restore:');
    console.error('  ' + state.backupB);
    console.error('  To restore it manually:');
    console.error('  POST ' + API + '/api/v1/backups/' + state.backupB + '/restore');
    console.error('       body { "confirm": "RESTORE", "reason": "manual recovery" }');
  } else {
    console.error('No pre-restore snapshot recorded — the failure occurred before any');
    console.error('destructive step, so the database was not modified by this run.');
  }
  if (state.backupA) {
    console.error('');
    console.error('Backup A (the primary snapshot this test created):');
    console.error('  ' + state.backupA);
  }
  console.error('');
  console.error('Last known settings state (before any change):');
  console.error('  ' + JSON.stringify(state.settingsBefore));
  console.error('Sentinel value used by this run:');
  console.error('  ' + state.sentinel);
  console.error('=================================================');
}

// ---------------------------------------------------------------
// tiny assert helper — records pass/fail with detail
// ---------------------------------------------------------------
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail: detail || '' });
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '   [' + detail + ']' : ''));
  if (!ok) {
    hintRecovery();
    throw new Error('assertion failed: ' + name);
  }
}

// ---------------------------------------------------------------
// main
// ---------------------------------------------------------------
try {
  console.log('=== safe restore cycle ===');
  console.log('');

  // Step 1 — login
  await login();
  console.log('  logged in as', env.SEED_OWNER_USERNAME);

  // Step 2 — baseline settings
  {
    const r = await api('GET', '/api/v1/settings');
    check('GET /settings 200', r.ok && r.status === 200, 'status=' + r.status);
    state.settingsBefore = r.json.settings;
    console.log('  baseline settings:', JSON.stringify(state.settingsBefore));
  }

  // Step 3 — create backup A
  {
    const r = await api('POST', '/api/v1/backups');
    check('POST /backups 201', r.ok && r.status === 201, 'status=' + r.status);
    state.backupA = r.json.backup.filename;
    console.log('  backup A =', state.backupA);
    console.log('  backup A rows =', r.json.backup.rowCount);
  }

  // Step 4 — confirm A is listed
  {
    const r = await api('GET', '/api/v1/backups');
    check('GET /backups 200', r.ok && r.status === 200, 'status=' + r.status);
    const found = r.json.backups.some((b) => b.filename === state.backupA);
    check('backup A is listed', found);
  }

  // Step 5 — set sentinel
  {
    const r = await api('PATCH', '/api/v1/settings', {
      settings: { 'restaurant.name': state.sentinel },
    });
    check('PATCH /settings 200', r.ok && r.status === 200, 'status=' + r.status);
  }

  // Step 6 — confirm sentinel took
  {
    const r = await api('GET', '/api/v1/settings');
    check('GET /settings 200 (after sentinel)', r.ok && r.status === 200, 'status=' + r.status);
    const got = r.json.settings['restaurant.name'];
    check('sentinel is set', got === state.sentinel, 'restaurant.name=' + JSON.stringify(got));
  }

  // Step 7 — PRIMARY RESTORE
  console.log('');
  console.log('  ---- primary restore (destructive) ----');
  {
    const r = await api('POST', '/api/v1/backups/' + state.backupA + '/restore', {
      confirm: 'RESTORE',
      reason: 'safe restore cycle — step 7',
    });
    if (!r.ok) {
      // If the failure response names a pre-restore snapshot, use it as our hint.
      try {
        const j = r.json;
        if (j && j.result && j.result.preRestoreBackup) state.backupB = j.result.preRestoreBackup;
      } catch {}
      hintRecovery();
      throw new Error('restore A failed: ' + r.status + ' ' + r.text.slice(0, 400));
    }
    check('POST /backups/<A>/restore 200', true, 'status=' + r.status);
    state.backupB = r.json.result.preRestoreBackup;
    console.log('  pre-restore snapshot B =', state.backupB);
    console.log('  restored rows =', r.json.result.rowCount);
    check('response includes preRestoreBackup filename', !!state.backupB);
    check('response includes sequencesReset list',
      Array.isArray(r.json.result.sequencesReset),
      'count=' + (r.json.result.sequencesReset ? r.json.result.sequencesReset.length : 0));
  }

  // Restore wiped every Session row (backups exclude Session by design).
  // Re-login before continuing.
  await login();

  // Step 8 — sentinel is gone
  {
    const r = await api('GET', '/api/v1/settings');
    check('GET /settings 200 (after restore)', r.ok && r.status === 200, 'status=' + r.status);
    const got = r.json.settings['restaurant.name'];
    const baselineName = state.settingsBefore['restaurant.name'] ?? '';
    check('settings after restore A match baseline',
      (got ?? '') === baselineName,
      'expected=' + JSON.stringify(baselineName) + ' got=' + JSON.stringify(got));
    const keys = Object.keys(r.json.settings || {});
    console.log('  settings after restore:', JSON.stringify(r.json.settings));
    check('settings keys match baseline count',
      keys.length === Object.keys(state.settingsBefore || {}).length,
      'before=' + Object.keys(state.settingsBefore || {}).length + ' after=' + keys.length);
  }

  // Step 9 — restore the pre-snapshot
  console.log('');
  console.log('  ---- restore pre-snapshot (destructive) ----');
  {
    const r = await api('POST', '/api/v1/backups/' + state.backupB + '/restore', {
      confirm: 'RESTORE',
      reason: 'safe restore cycle — step 9 (return to pre-test state)',
    });
    if (!r.ok) {
      hintRecovery();
      throw new Error('restore B failed: ' + r.status + ' ' + r.text.slice(0, 400));
    }
    check('POST /backups/<B>/restore 200', true, 'status=' + r.status);
    console.log('  rows restored =', r.json.result.rowCount);
  }

  // Restore wiped every Session row again — re-login.
  await login();

  // Step 10 — sentinel is BACK
  {
    const r = await api('GET', '/api/v1/settings');
    check('GET /settings 200 (after restore B)', r.ok && r.status === 200, 'status=' + r.status);
    const got = r.json.settings['restaurant.name'];
    check('sentinel restored from pre-snapshot', got === state.sentinel,
      'restaurant.name=' + JSON.stringify(got));
  }

  // Step 11 — clean up the sentinel
  {
    const r = await api('PATCH', '/api/v1/settings', {
      settings: { 'restaurant.name': '' },
    });
    check('PATCH /settings cleanup 200', r.ok && r.status === 200, 'status=' + r.status);
  }

  // Step 12 — final state matches baseline
  {
    const r = await api('GET', '/api/v1/settings');
    check('GET /settings 200 (final)', r.ok && r.status === 200, 'status=' + r.status);
    const got = r.json.settings['restaurant.name'];
    check('final restaurant.name is empty (matches baseline)',
      got === '' || got === undefined,
      'restaurant.name=' + JSON.stringify(got));
  }

  // Step 13 — inventory of backups now on disk
  {
    const r = await api('GET', '/api/v1/backups');
    check('GET /backups 200 (final)', r.ok && r.status === 200, 'status=' + r.status);
    console.log('  backups now on disk:');
    for (const b of r.json.backups) {
      console.log('    ' + b.filename + '   (' + b.sizeBytes + ' bytes, ' + (b.generatedAt || '?') + ')');
    }
    const hasA = r.json.backups.some((b) => b.filename === state.backupA);
    const hasB = r.json.backups.some((b) => b.filename === state.backupB);
    check('backup A still present', hasA);
    check('backup B still present', hasB);
  }

  console.log('');
  const failed = results.filter((r) => !r.ok);
  console.log((results.length - failed.length) + ' / ' + results.length + ' passed');
  if (failed.length) {
    console.log('failed:');
    for (const f of failed) console.log(' - ' + f.name + ' :: ' + f.detail);
    process.exit(1);
  }
  console.log('');
  console.log('NOTE: this run created two backups that were not deleted:');
  console.log('  ' + state.backupA + '   (pre-test state)');
  console.log('  ' + state.backupB + '   (state with the sentinel set, before restore A)');
  console.log('  Both are legitimate artifacts. Keep or delete as you see fit.');
} catch (e) {
  console.error('');
  console.error('RUN ABORTED:', e.message);
  // Best-effort cleanup: reset restaurant.name to whatever it was at start.
  // If the DB is in a broken state this will fail silently — the caller
  // still has the recovery hint above to act on.
  try {
    const baseline = (state.settingsBefore && state.settingsBefore['restaurant.name']) || '';
    await login();
    await api('PATCH', '/api/v1/settings', { settings: { 'restaurant.name': baseline } });
    console.error('cleanup: restaurant.name restored to ' + JSON.stringify(baseline));
  } catch (cleanupErr) {
    console.error('cleanup failed (non-fatal):', cleanupErr.message);
  }
  process.exit(2);
}