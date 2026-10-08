import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import path from 'node:path';
import { startBackend, type ManagedChild } from './spawn.js';

const DEV_URL = process.env.RFS_DEV ? 'http://localhost:3000' : null;
const PROD_FILE = path.join(__dirname, '..', 'renderer', 'index.html');

let backend: ManagedChild | null = null;
let mainWindow: BrowserWindow | null = null;
let quitting = false;

async function waitForBackend(url: string, timeoutMs: number): Promise<boolean> {
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
  // Start the backend before the window so the renderer can hit /api immediately.
  console.log('[electron] starting backend child process…');
  backend = startBackend();

  const ok = await waitForBackend('http://127.0.0.1:4000/health', 20_000);
  if (!ok) {
    console.error('[electron] backend did not answer /health within 20s');
    dialog.showErrorBox(
      'RFS backend failed to start',
      'The backend process did not respond on http://127.0.0.1:4000/health.\n\n' +
        'Check the terminal for [spawn:api] logs. Common causes:\n' +
        '  - Postgres is not running (pnpm backend:dev needs DATABASE_URL reachable)\n' +
        '  - Port 4000 is already in use\n' +
        '  - backend/dist is stale — run: pnpm --filter @rfs/backend build'
    );
    app.quit();
    return;
  }
  console.log('[electron] backend healthy');

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

  if (DEV_URL) void mainWindow.loadURL(DEV_URL);
  else void mainWindow.loadFile(PROD_FILE);
}

app.whenReady().then(() => {
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
  if (!backend) return;
  quitting = true;
  event.preventDefault();
  console.log('[electron] shutting down backend…');
  try { await backend.stop(); } catch (e) { console.error('[electron] stop error:', e); }
  backend = null;
  app.quit();
});

ipcMain.handle('app:version', () => app.getVersion());