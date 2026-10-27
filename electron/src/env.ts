import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

// CRITICAL: Do NOT call app.getPath() at module scope.
// app is undefined until Electron initializes. Compute inside functions.

function getEnvFile(): string {
  return path.join(app.getPath('userData'), '.env');
}

export function ensureEnvFile(): void {
  const userData = app.getPath('userData');
  const envFile = getEnvFile();

  if (!fs.existsSync(userData)) {
    fs.mkdirSync(userData, { recursive: true });
  }

  if (!fs.existsSync(envFile)) {
    console.log('[env] No .env found. Creating default .env for first run...');
    const defaultEnv = [
      'NODE_ENV=production',
      'PORT=4000',
      'DATABASE_URL=postgresql://rfs:rfs_dev_password@localhost:5432/rfs?schema=public',
      'SESSION_SECRET=temporary-secret-at-least-32-chars-long-aaaa',
      'PIN_LOOKUP_SECRET=temporary-secret-at-least-32-chars-long-bbbb',
    ].join('\n') + '\n';

    fs.writeFileSync(envFile, defaultEnv, { mode: 0o600 });
  }
}

export function loadEnv(): void {
  const envFile = getEnvFile();
  if (!fs.existsSync(envFile)) return;

  console.log('[env] Loading environment from', envFile);
  const content = fs.readFileSync(envFile, 'utf8');
  for (const line of content.split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) {
      process.env[match[1]] = match[2];
    }
  }
}