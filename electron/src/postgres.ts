import { app } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

const exec = promisify(execFile);

const PG_BIN = 'C:\\Program Files\\PostgreSQL\\16\\bin';

export function pgDataDir(appDataDir: string): string {
  return path.join(appDataDir, 'pgdata');
}

export function pgLogFile(appDataDir: string): string {
  return path.join(appDataDir, 'pg.log');
}

export function findPostgresBin(): string {
  // Use the bundled binaries in packaged mode, otherwise dev path
  const binPath = app.isPackaged
    ? path.join(process.resourcesPath, 'pgsql', 'bin')
    : PG_BIN;

  if (!fs.existsSync(path.join(binPath, 'pg_ctl.exe'))) {
    throw new Error(
      'PostgreSQL binaries not found at ' + binPath +
      '. Please reinstall the application.'
    );
  }
  return binPath;
}

export async function initdb(
  dataDir: string,
  superuserPassword: string
): Promise<void> {
  const parentDir = path.dirname(dataDir);
  fs.mkdirSync(parentDir, { recursive: true });

  const pwFile = path.join(parentDir, '.initdb-pw');
  fs.writeFileSync(pwFile, superuserPassword, { mode: 0o600 });

  try {
    await exec(
      path.join(findPostgresBin(), 'initdb.exe'),
      [
        '-D', dataDir,
        '-U', 'rfs',
        '--pwfile', pwFile,
        '--auth-local=scram-sha-256',
        '--auth-host=scram-sha-256',
        '-E', 'UTF8',
      ],
      { windowsHide: true }
    );
  } finally {
    try { fs.unlinkSync(pwFile); } catch { /* ignore */ }
  }
}

export async function startPostgres(
  dataDir: string,
  logFile: string,
  port: number
): Promise<void> {
  const { execFileSync } = await import('node:child_process');
  try {
    execFileSync(
      path.join(findPostgresBin(), 'pg_ctl.exe'),
      ['-D', dataDir, '-l', logFile, '-o', `"-p ${port}"`, 'start'],
      {
        windowsHide: true,
        timeout: 15_000,
        stdio: 'ignore',
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.toLowerCase().includes('etimedout') && !msg.toLowerCase().includes('timeout')) {
      throw err;
    }
  }
}

export async function stopPostgres(dataDir: string): Promise<void> {
  try {
    await exec(
      path.join(findPostgresBin(), 'pg_ctl.exe'),
      ['-D', dataDir, 'stop', '-m', 'fast'],
      { windowsHide: true }
    );
  } catch { /* already stopped */ }
}

export async function psql(
  connectionString: string,
  sql: string
): Promise<string> {
  // Argument order: flags FIRST, then -d <conn> LAST.
  const { stdout } = await exec(
    path.join(findPostgresBin(), 'psql.exe'),
    ['-t', '-A', '-c', sql, '-d', connectionString],
    { windowsHide: true }
  );
  return stdout.trim();
}

export async function waitForPostgres(
  connectionString: string,
  timeoutMs: number
): Promise<void> {
  const start = Date.now();
  let lastError: unknown = null;
  while (Date.now() - start < timeoutMs) {
    try {
      await psql(connectionString, 'SELECT 1');
      return;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(
    'Postgres did not become ready within ' +
      timeoutMs +
      'ms. Last error: ' +
      (lastError instanceof Error ? lastError.message : String(lastError))
  );
}

export function isDataDirInitialized(dataDir: string): boolean {
  return (
    fs.existsSync(dataDir) &&
    fs.existsSync(path.join(dataDir, 'PG_VERSION'))
  );
}