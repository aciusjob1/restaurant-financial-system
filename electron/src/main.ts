import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import path from 'node:path';
import getPort from 'get-port';
import { startBackend, startFrontend, type ManagedChild } from './spawn.js';

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
  console.log('[electron] picking ports…');
  const apiPort = await getPort({ port: [4000, 4100, 4200, 4300, 4400] });
  const webPort = await getPort({ port: [3000, 3100, 3200, 3300, 3400] });
  console.log('[electron] api=' + apiPort + ' web=' + webPort);

  // Backend first — the frontend will talk to it.
  console.log('[electron] starting backend…');
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
        '  - backend/dist is stale — run: pnpm --filter @rfs/backend build'
    );
    app.quit();
    return;
  }
  console.log('[electron] backend healthy');

  // Frontend next.
  console.log('[electron] starting frontend…');
  frontend = startFrontend(webPort);
  const webOk = await waitForHttp('http://127.0.0.1:' + webPort + '/login', 60_000);
  if (!webOk) {
    console.error('[electron] frontend did not answer /login in 60s');
    dialog.showErrorBox(
      'RFS frontend failed to start',
      'The Next.js dev server did not respond on http://127.0.0.1:' + webPort + '/login.\n\n' +
        'Check the terminal for [spawn:web] logs.\n' +
        'Common causes:\n' +
        '  - frontend build error (compile failure)\n' +
        '  - frontend/node_modules missing — run: pnpm install'
    );
    app.quit();
    return;
  }
  console.log('[electron] frontend ready');

  // Env var so the renderer knows which API port to call.
  // Note: NEXT_PUBLIC_API_BASE_URL is baked into the frontend bundle at
  // dev-server start, so this env only affects the window URL — the
  // frontend's API base still comes from frontend/.env.local. Phase 3/4
  // will wire this properly for packaged runs.
  process.env.RFS_API_PORT = String(apiPort);

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
  if (!backend && !frontend) return;
  quitting = true;
  event.preventDefault();
  console.log('[electron] shutting down children…');
  // Frontend first, then backend.
  if (frontend) { try { await frontend.stop(); } catch (e) { console.error('[electron] frontend stop:', e); } frontend = null; }
  if (backend)  { try { await backend.stop();  } catch (e) { console.error('[electron] backend stop:',  e); } backend = null; }
  app.quit();
});

ipcMain.handle('app:version', () => app.getVersion());