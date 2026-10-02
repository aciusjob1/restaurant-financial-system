import { chromium } from 'playwright-core';
import { readFileSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import os from 'node:os';

const ROOT = 'C:\\Users\\kmasu\\restaurant-financial-system';
const BASE = 'http://localhost:3000';

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

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail: detail || '' });
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '   [' + detail + ']' : ''));
}

async function launchBrowser() {
  for (const attempt of [{ channel: 'msedge' }, { channel: 'chrome' }, {}]) {
    try {
      return await chromium.launch({ headless: true, ...attempt });
    } catch (e) {
      console.log('  launch attempt failed:', JSON.stringify(attempt), '-', e.message.split('\n')[0]);
    }
  }
  throw new Error('could not launch any browser');
}

const browser = await launchBrowser();
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();

let tmpDownload = null;

try {
  // 1. login — wait for hydration before touching the form
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  // Next dev hydration lands a beat after networkidle; 1s is generous, cheap, reliable.
  await page.waitForTimeout(1000);
  record('login page loaded + hydrated', page.url().includes('/login'));

  await page.locator('form input:not([type="password"])').first().fill(env.SEED_OWNER_USERNAME);
  await page.locator('form input[type="password"]').first().fill(env.SEED_OWNER_PASSWORD);
  await page.waitForTimeout(300);

  // Submit. Poll for URL change with a loop — more tolerant than waitForURL when
  // the SPA does client-side routing without a full navigation event.
  await page.locator('form button[type="submit"]').click();

  let loginOk = false;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(500);
    const u = page.url();
    if (!u.includes('/login')) { loginOk = true; break; }
    // If we bounced to /login? with a native submit, break early to fail fast.
    if (u.includes('/login?')) break;
  }
  record('login succeeded', loginOk, 'url=' + page.url());

  if (!loginOk) {
    // Show what the page says — error message if any
    const errText = await page.locator('.text-red-600, [class*="red"]').allInnerTexts().catch(() => []);
    console.log('  page error text:', JSON.stringify(errText).slice(0, 300));
    throw new Error('login did not complete');
  }

  // 2. navigate to backup page
  await page.goto(BASE + '/ops/settings/backup', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  record('backup page loaded', page.url().endsWith('/ops/settings/backup'), 'url=' + page.url());

  // 3. section headings
  record('"Back up now" section renders',
    (await page.locator('h2', { hasText: /Back up now|Hifadhi sasa/ }).count()) > 0);
  record('"Existing backups" section renders',
    (await page.locator('h2', { hasText: /Existing backups|Hifadhi zilizopo/ }).count()) > 0);
  record('"Backup destination" section renders',
    (await page.locator('h2', { hasText: /Backup destination|Marudio ya hifadhi/ }).count()) > 0);
  record('"Automatic backups" section renders',
    (await page.locator('h2', { hasText: /Automatic backups|Hifadhi za kiotomatiki/ }).count()) > 0);

  const rowCountBefore = await page.locator('table tbody tr').count();
  console.log('  (existing backup rows: ' + rowCountBefore + ')');

  // 4. Create backup
  const createBtn = page.locator('button', { hasText: /Create backup|Unda hifadhi/ });
  record('Create backup button found', (await createBtn.count()) > 0);
  if ((await createBtn.count()) === 0) throw new Error('no create button');

  await createBtn.first().click();

  let rowCountAfter = rowCountBefore;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(500);
    rowCountAfter = await page.locator('table tbody tr').count();
    if (rowCountAfter >= rowCountBefore + 1) break;
  }
  record('backup created (list gained a row)',
    rowCountAfter >= rowCountBefore + 1,
    'before=' + rowCountBefore + ' after=' + rowCountAfter);

  // 5. Download
  const downloadLinks = page.locator('table tbody a', { hasText: /Download|Pakua/ });
  record('Download link present on row', (await downloadLinks.count()) > 0);

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 20000 }),
    downloadLinks.first().click(),
  ]);
  const suggested = download.suggestedFilename();
  record('download triggered', !!suggested && suggested.endsWith('.json'), 'filename=' + suggested);

  tmpDownload = join(os.tmpdir(), 'rfs-e2e-' + Date.now() + '.json');
  await download.saveAs(tmpDownload);
  const content = JSON.parse(readFileSync(tmpDownload, 'utf8'));
  record('downloaded file is valid JSON', typeof content === 'object' && content !== null);
  record('meta.version === "1"', content.meta && content.meta.version === '1', 'version=' + (content.meta && content.meta.version));
  const tableCount = content.data ? Object.keys(content.data).length : 0;
  record('data contains 23 tables', tableCount === 23, 'tables=' + tableCount);
  record('meta.rowCount is a number', typeof (content.meta && content.meta.rowCount) === 'number', 'rowCount=' + (content.meta && content.meta.rowCount));

  // 6. Restore modal + guards
  const restoreBtn = page.locator('table tbody button', { hasText: /Restore|Rejesha/ });
  record('Restore button present (OWNER)', (await restoreBtn.count()) > 0);
  if ((await restoreBtn.count()) > 0) {
    await restoreBtn.first().click();
    await page.waitForTimeout(500);

    const modalTitle = page.locator('h3', { hasText: /Restore from backup|Rejesha kutoka hifadhi/ });
    record('restore modal opened', (await modalTitle.count()) > 0);

    const reasonInput = page.locator('input[placeholder*="Reason"], input[placeholder*="Sababu"]');
    const confirmInput = page.locator('input[placeholder*="RESTORE"]');
    const finalBtn = page.locator('button', { hasText: /Restore now|Rejesha sasa/ });

    record('reason input present', (await reasonInput.count()) > 0);
    record('confirm input present', (await confirmInput.count()) > 0);

    record('restore disabled with empty fields', await finalBtn.isDisabled());

    await reasonInput.fill('abc');
    await confirmInput.fill('RESTORE');
    await page.waitForTimeout(250);
    record('restore disabled with reason < 5 chars', await finalBtn.isDisabled());

    await reasonInput.fill('validating only');
    await confirmInput.fill('restore');
    await page.waitForTimeout(250);
    record('restore disabled with lowercase "restore"', await finalBtn.isDisabled());

    await confirmInput.fill('RESTORE');
    await page.waitForTimeout(250);
    record('restore ENABLED with valid inputs', !(await finalBtn.isDisabled()));

    const cancelBtn = page.locator('button', { hasText: /Cancel|Ghairi/ });
    await cancelBtn.click();
    await page.waitForTimeout(600);
    record('modal closed on Cancel', (await modalTitle.count()) === 0);

    record('restore NOT executed (destructive — skipped by design)', true, 'confirm button never clicked');
  }
} catch (e) {
  console.error('TEST ERROR:', e.message);
  try { await page.screenshot({ path: join(os.tmpdir(), 'rfs-e2e-fail.png'), fullPage: true }); } catch {}
} finally {
  if (tmpDownload) { try { unlinkSync(tmpDownload); } catch {} }
  await browser.close();
}

console.log('');
const failed = results.filter(r => !r.ok);
console.log((results.length - failed.length) + ' / ' + results.length + ' passed');
if (failed.length) {
  console.log('failed:');
  for (const f of failed) console.log(' - ' + f.name + ' :: ' + f.detail);
  process.exit(1);
}