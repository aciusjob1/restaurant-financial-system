import { app, dialog } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  pgDataDir,
  pgLogFile,
  findPostgresBin,
  initdb,
  startPostgres,
  psql,
  isDataDirInitialized,
  waitForPostgres,
  stopPostgres,
} from './postgres.js';

const exec = promisify(execFile);

const PG_PORT = 5433;

function getAppDir(): string {
  return app.getPath('userData');
}
function getEnvFile(): string {
  return path.join(getAppDir(), '.env');
}
function getMarker(): string {
  return path.join(getAppDir(), '.installed');
}
function getFirstRunLog(): string {
  return path.join(getAppDir(), 'first-run.log');
}

function log(msg: string): void {
  const line = '[' + new Date().toISOString() + '] ' + msg;
  console.log(line);
  try {
    fs.appendFileSync(getFirstRunLog(), line + '\n');
  } catch {
    /* ignore */
  }
}

export type FirstRunResult = {
  alreadyInstalled: boolean;
  pgPassword?: string;
};

function genSecret(): string {
  return crypto.randomBytes(48).toString('base64url');
}

function genPgPassword(): string {
  return crypto.randomBytes(24).toString('base64').replace(/[+/=]/g, 'X');
}

function writeEnvFile(values: Record<string, string>): void {
  const lines = Object.entries(values)
    .map(([k, v]) => k + '=' + v)
    .join('\n');
  fs.writeFileSync(getEnvFile(), lines + '\n', { mode: 0o600 });
}

function loadEnvFile(): void {
  if (!fs.existsSync(getEnvFile())) return;
  const content = fs.readFileSync(getEnvFile(), 'utf8');
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2];
  }
}

export async function deployMigrations(): Promise<void> {
  const backendDir = path.join(process.resourcesPath, 'backend-deployed');
  const prismaCli = path.join(backendDir, 'node_modules', 'prisma', 'build', 'index.js');
  const schemaPath = path.join(backendDir, 'prisma', 'schema.prisma');

  if (!fs.existsSync(prismaCli)) {
    throw new Error('Prisma CLI not found at ' + prismaCli);
  }
  if (!fs.existsSync(schemaPath)) {
    throw new Error('Prisma schema not found at ' + schemaPath);
  }

  log('[first-run] running prisma migrate deploy');
  await exec(
    process.execPath,
    [prismaCli, 'migrate', 'deploy', '--schema', schemaPath],
    {
      cwd: backendDir,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      windowsHide: true,
    }
  );
  log('[first-run] migrations complete');

  // Apply raw SQL (seed categories, sequences, indexes). The Prisma
  // migrations only create the table shape — system-keyed categories
  // (SALARY, DAILY) live in SQL and would be missing otherwise.
  const rawSqlScript = path.join(backendDir, 'scripts', 'apply-raw-sql.mjs');
  if (fs.existsSync(rawSqlScript)) {
    log('[first-run] applying raw SQL');
    await exec(
      process.execPath,
      [rawSqlScript],
      {
        cwd: backendDir,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        windowsHide: true,
      }
    );
    log('[first-run] raw SQL applied');
  }
}

async function createDatabase(pgPassword: string): Promise<void> {
  const conn = 'postgresql://rfs:' + pgPassword + '@127.0.0.1:' + PG_PORT + '/postgres';
  try {
    await psql(conn, 'CREATE DATABASE rfs');
    log('[first-run] database "rfs" created');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('already exists')) throw err;
    log('[first-run] database "rfs" already exists');
  }
}

async function promptOwnerPassword(): Promise<{ username: string; password: string }> {
  const username = 'owner';
  // 20 hex chars (80 bits entropy) — every character is visually
  // unambiguous ([0-9a-f]), no risk of the last character being
  // cut off by the dialog, and no base64url chars (-_+/=) that
  // could render oddly in different fonts.
  const password = crypto.randomBytes(10).toString('hex');

  await dialog.showMessageBox({
    type: 'info',
    title: 'RFS - Owner Account',
    message: 'Your owner account has been created.',
    detail:
      'Username: ' + username + '\n' +
      'Password: ' + password + '\n\n' +
      'Write this down. You will use it to log in and change it.',
    buttons: ['I saved it'],
  });

  return { username, password };
}

async function createOwnerUser(username: string, password: string): Promise<void> {
  const backendDir = path.join(process.resourcesPath, 'backend-deployed');
  const scriptPath = path.join(backendDir, 'dist', 'scripts', 'createOwner.js');

  if (!fs.existsSync(scriptPath)) {
    throw new Error('createOwner.js not found at ' + scriptPath + '. Run pnpm --filter @rfs/backend build to generate it.');
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is not set — cannot create owner');
  }

  log('[first-run] creating owner user');
  await exec(
    process.execPath,
    [scriptPath],
    {
      cwd: backendDir,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        NODE_ENV: 'production',
        DATABASE_URL: dbUrl,
        OWNER_USER: username,
        OWNER_PW: password,
      },
      windowsHide: true,
    }
  );
  log('[first-run] owner user created');
}



export async function firstRun(): Promise<FirstRunResult> {
  if (fs.existsSync(getMarker())) {
    log('[first-run] already installed, loading existing config');
    loadEnvFile();
    return { alreadyInstalled: true };
  }

  log('[first-run] first launch detected, starting setup wizard');

  const sessionSecret = genSecret();
  const pinLookupSecret = genSecret();
  const pgPassword = genPgPassword();

  const storageDir = path.join(getAppDir(), 'storage').replace(/\\/g, '/');
  
  writeEnvFile({
    NODE_ENV: 'production',
    PORT: '4000',
    PG_PORT: String(PG_PORT),
    SESSION_SECRET: sessionSecret,
    PIN_LOOKUP_SECRET: pinLookupSecret,
    DATABASE_URL: 'postgresql://rfs:' + pgPassword + '@127.0.0.1:' + PG_PORT + '/rfs?schema=public',
    BACKUP_LOCAL_PATH: storageDir + '/backups',
    ATTACHMENTS_ROOT: storageDir + '/attachments',
  });
  loadEnvFile();

  try {
    findPostgresBin();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await dialog.showMessageBox({
      type: 'error',
      title: 'RFS - PostgreSQL Required',
      message: 'PostgreSQL 16 is required but was not found.',
      detail: msg + '\n\nAfter installing, relaunch RFS to continue setup.',
      buttons: ['OK'],
    });
    throw err;
  }

  const dataDir = pgDataDir(getAppDir());
  const marker = getMarker();

  // If pgdata exists but .installed doesn't, the previous wizard run
  // failed partway. Rename pgdata (preserve data) and start fresh.
  if (fs.existsSync(dataDir) && !fs.existsSync(marker)) {
    const backupName = 'pgdata.failed-' + Date.now();
    const backupPath = path.join(path.dirname(dataDir), backupName);
    log('[first-run] partial install detected — renaming pgdata to ' + backupName);
    try { await stopPostgres(dataDir); } catch { /* ignore */ }
    let renamed = false;
    try { fs.renameSync(dataDir, backupPath); renamed = true; } catch (e) {
      log('[first-run] warning: could not rename pgdata: ' + String(e));
    }
    if (!renamed) {
      log('[first-run] could not rename — refusing to delete; aborting');
      throw new Error('Cannot recover from partial install. Move or delete ' + dataDir + ' manually.');
    }
    // The old .env has a password that no longer matches the fresh initdb
    try { fs.unlinkSync(getEnvFile()); } catch { /* ignore */ }
  }
  const logFile = pgLogFile(getAppDir());
  if (!isDataDirInitialized(dataDir)) {
    log('[first-run] initializing Postgres data directory');
    await initdb(dataDir, pgPassword);
    log('[first-run] initdb complete');
  } else {
    log('[first-run] Postgres data directory already initialized');
  }

  log('[first-run] starting Postgres on port ' + PG_PORT);
  await startPostgres(dataDir, logFile, PG_PORT);

  log('[first-run] waiting for Postgres to accept connections');
  await waitForPostgres(
    'postgresql://rfs:' + pgPassword + '@127.0.0.1:' + PG_PORT + '/postgres',
    30_000
  );
  log('[first-run] Postgres is ready');

  await createDatabase(pgPassword);
  await deployMigrations();

  const { username, password } = await promptOwnerPassword();
  await createOwnerUser(username, password);

  fs.writeFileSync(getMarker(), new Date().toISOString());
  log('[first-run] setup complete');
  return { alreadyInstalled: false, pgPassword };
}