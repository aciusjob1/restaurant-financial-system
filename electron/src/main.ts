import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';

const DEV_URL = process.env.RFS_DEV ? 'http://localhost:3000' : null;
const PROD_FILE = path.join(__dirname, '..', 'renderer', 'index.html');

function createWindow() {
  const win = new BrowserWindow({
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

  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (DEV_URL) void win.loadURL(DEV_URL);
  else void win.loadFile(PROD_FILE);
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('app:version', () => app.getVersion());