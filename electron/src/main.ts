import fs from 'node:fs';
import path from 'node:path';

const BOOT_LOG = path.join(process.env.APPDATA || '.', 'RFS-BOOT.log');
function bootLog(msg: string) {
  try {
    fs.appendFileSync(BOOT_LOG, '[' + new Date().toISOString() + '] ' + msg + '\n');
  } catch { /* nothing to do */ }
}
bootLog('main.js loaded, pid=' + process.pid);

process.on('uncaughtException', (err) => {
  bootLog('UNCAUGHT EXCEPTION: ' + (err && err.stack ? err.stack : String(err)));
});
process.on('unhandledRejection', (reason) => {
  bootLog('UNHANDLED REJECTION: ' + String(reason));
});
import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import { pickPort } from './port.js';
import { startBackend, startFrontend, type ManagedChild } from './spawn.js';
import { ensureEnvFile, loadEnv } from './env.js';
import { firstRun, deployMigrations, type FirstRunResult } from './first-run.js';
import { stopPostgres, pgDataDir, pgLogFile, startPostgres, isDataDirInitialized } from './postgres.js';
import { app as electronApp } from 'electron';

let backend: ManagedChild | null = null;
let frontend: ManagedChild | null = null;
let mainWindow: BrowserWindow | null = null;
let quitting = false;

async function waitForHttp(url: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function createWindow() {
  console.log('[electron] picking ports...');
  const apiPort = await pickPort([4000, 4100, 4200, 4300, 4400]);
  const webPort = await pickPort([3000, 3100, 3200, 3300, 3400]);
  console.log('[electron] api=' + apiPort + ' web=' + webPort);

  console.log('[electron] starting backend...');
  backend = startBackend(apiPort);
  const apiOk = await waitForHttp('http://127.0.0.1:' + apiPort + '/health', 20_000);
  if (!apiOk) {
    console.error('[electron] backend did not answer /health in 20s');
    dialog.showErrorBox(
      'RFS backend failed to start',
      'The backend did not respond on http://127.0.0.1:' + apiPort + '/health.\n\n' +
        'Check the terminal for [spawn:api] logs.\n' +
        'Common causes:\n' +
        '  - Postgres is not running\n' +
        '  - backend/dist is stale - run: pnpm --filter @rfs/backend build'
    );
    app.quit();
    return;
  }
  console.log('[electron] backend healthy');

  process.env.RFS_API_PORT = String(apiPort);

  console.log('[electron] starting frontend...');
  frontend = startFrontend(webPort);
  const webOk = await waitForHttp('http://127.0.0.1:' + webPort + '/login', 60_000);
  if (!webOk) {
    console.error('[electron] frontend did not answer /login in 60s');
    dialog.showErrorBox(
      'RFS frontend failed to start',
      'The Next.js server did not respond on http://127.0.0.1:' + webPort + '/login.\n\n' +
        'Check the terminal for [spawn:web] logs.\n' +
        'Common causes:\n' +
        '  - frontend build error (compile failure)\n' +
        '  - frontend/node_modules missing - run: pnpm install'
    );
    app.quit();
    return;
  }
  console.log('[electron] frontend ready');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  await mainWindow.loadURL('http://127.0.0.1:' + webPort + '/login');
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  console.log('[electron] another instance is already running, quitting');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(async () => {
  if (!gotLock) return; // second instance, don't run the wizard
  bootLog('whenReady fired');
  ensureEnvFile();
  loadEnv();

  let firstRunResult: FirstRunResult | null = null;
  try {
    bootLog('calling firstRun');
    firstRunResult = await firstRun();
    bootLog('firstRun returned');
    loadEnv(); // reload in case firstRun wrote a fresh .env
  } catch (err) {
    console.error('[electron] first-run failed:', err);
    return; // dialog was already shown
  }

      // Ensure Postgres is running on EVERY launch
    try {
      const dataDir = pgDataDir(app.getPath('userData'));
      if (isDataDirInitialized(dataDir)) {
        const { execFileSync } = await import('node:child_process');
        const pgCtl = app.isPackaged
          ? path.join(process.resourcesPath, 'pgsql', 'bin', 'pg_ctl.exe')
          : 'pg_ctl';

        let isRunning = false;
        try {
          execFileSync(pgCtl, ['-D', dataDir, 'status'], { windowsHide: true });
          isRunning = true;
        } catch {
          isRunning = false;
        }

        if (!isRunning) {
          bootLog('[electron] starting Postgres on subsequent launch');
          await startPostgres(dataDir, pgLogFile(app.getPath('userData')), 5433);
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    } catch (err) {
      console.error('[electron] failed to start Postgres:', err);
    }

    // firstRun() only migrates a fresh install; its .installed marker
    // short-circuits that path forever after. Apply pending migrations on
    // every packaged launch so upgrades pick up new migrations.
    if (app.isPackaged && firstRunResult?.alreadyInstalled) {
      try {
        bootLog('[electron] applying migrations');
        await deployMigrations();
        bootLog('[electron] migrations applied');
      } catch (err) {
        bootLog('[electron] migration failed: ' + String(err));
        dialog.showErrorBox(
          'RFS update failed',
          'Database migrations could not be applied, so RFS will close.\n\n' +
            'Check %APPDATA%\\@rfs\\electron\\first-run.log for details.'
        );
        app.quit();
        return;
      }
    }

    void createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async (event) => {
  if (quitting) return;
  if (!backend && !frontend) return;
  quitting = true;
  event.preventDefault();
  console.log('[electron] shutting down children...');
  if (frontend) { try { await frontend.stop(); } catch (e) { console.error('[electron] frontend stop:', e); } frontend = null; }
  if (backend)  { try { await backend.stop();  } catch (e) { console.error('[electron] backend stop:',  e); } backend = null; }
  try { await stopPostgres(pgDataDir(app.getPath('userData'))); } catch (e) { console.error('[electron] postgres stop:', e); }
  app.quit();
});

ipcMain.handle('app:version', () => app.getVersion());