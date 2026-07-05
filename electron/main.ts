import { app, BrowserWindow, Menu, Tray, ipcMain, session, globalShortcut, screen } from 'electron';
import type http from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { findAvailablePort } from './ports.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const require_ = createRequire(import.meta.url);

// Import from dist/server.js using runtime path (compiled to dist-electron/electron/,
// so ../../ reaches project root)
const { start } = require_('../../dist/server.js') as {
  start: (opts?: { port?: number }) => Promise<{ server: http.Server; shutdown: () => Promise<void> }>;
};

let window: BrowserWindow | null = null;
let quickInputWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let ncmProcess: ChildProcess | null = null;
let shutdownServer: (() => Promise<void>) | null = null;
let quitting = false;
let quickInputAccelerator = 'CommandOrControl+Shift+Space';

function resourceRoot(): string {
  return app.isPackaged ? path.join(process.resourcesPath, 'app') : path.resolve(__dirname, '../..');
}

function dataDir(): string {
  const dir = app.isPackaged ? app.getPath('userData') : resourceRoot();
  fs.mkdirSync(path.join(dir, 'logs'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'user'), { recursive: true });
  return dir;
}

function startNcmApi(port: number): void {
  const root = resourceRoot();
  const apiDir = path.join(root, 'api-enhanced');
  if (!fs.existsSync(apiDir)) return;

  const log = fs.openSync(path.join(dataDir(), 'logs', 'ncm-api.log'), 'a');
  ncmProcess = spawn(process.execPath, ['app.js'], {
    cwd: apiDir,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: String(port) },
    stdio: ['ignore', log, log],
    windowsHide: true,
  });
}

async function createWindow(url: string): Promise<void> {
  window = new BrowserWindow({
    width: 542,
    height: 753,
    useContentSize: true,
    resizable: true,
    frame: false,
    transparent: true,
    autoHideMenuBar: true,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(resourceRoot(), 'electron', 'preload.cjs'),
    },
  });

  window.once('ready-to-show', () => window?.show());
  window.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    window?.hide();
  });

  await window.loadURL(url);
}

async function createQuickInputWindow(url: string): Promise<void> {
  quickInputWindow = new BrowserWindow({
    width: 760,
    height: 88,
    useContentSize: true,
    resizable: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    autoHideMenuBar: true,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(resourceRoot(), 'electron', 'preload.cjs'),
    },
  });

  quickInputWindow.on('blur', () => quickInputWindow?.hide());
  quickInputWindow.on('closed', () => { quickInputWindow = null; });

  await quickInputWindow.loadURL(url);
}

function positionQuickInputWindow(): void {
  if (!quickInputWindow) return;

  const bounds = quickInputWindow.getBounds();
  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPoint);
  const { workArea } = display;

  quickInputWindow.setBounds({
    x: Math.round(workArea.x + (workArea.width - bounds.width) / 2),
    y: Math.round(workArea.y + Math.min(workArea.height * 0.22, 220)),
    width: bounds.width,
    height: bounds.height,
  });
}

function toggleQuickInputWindow(): void {
  if (!quickInputWindow) return;

  if (quickInputWindow.isVisible()) {
    quickInputWindow.hide();
    return;
  }

  positionQuickInputWindow();
  quickInputWindow.show();
  quickInputWindow.focus();
  quickInputWindow.webContents.send('quick-input:focus');
}

function registerQuickInputShortcut(accelerator: string): boolean {
  globalShortcut.unregister(quickInputAccelerator);
  quickInputAccelerator = accelerator || 'CommandOrControl+Shift+Space';
  const registered = globalShortcut.register(quickInputAccelerator, toggleQuickInputWindow);
  if (!registered) console.warn(`[quick-input] failed to register ${quickInputAccelerator}`);
  return registered;
}

function createTray(): void {
  const iconPath = path.join(resourceRoot(), 'frontend', 'icons', 'tray-icon.png');
  tray = new Tray(iconPath);
  tray.setToolTip('Claudio');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示 Claudio', click: () => window?.show() },
    { label: '悬浮输入', click: () => toggleQuickInputWindow() },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]));
  tray.on('click', () => window?.show());
}

ipcMain.handle('window:minimize', () => {
  window?.minimize();
});

ipcMain.handle('window:close', () => {
  window?.close();
});

ipcMain.handle('window:quit', () => {
  quitting = true;
  app.quit();
});

ipcMain.handle('quick-input:close', () => {
  quickInputWindow?.hide();
});

ipcMain.handle('quick-input:submit', (_event, text: string) => {
  const value = typeof text === 'string' ? text.trim() : '';
  if (!value) return { ok: false };

  quickInputWindow?.hide();
  window?.webContents.send('quick-input:submit', value);
  return { ok: true };
});

ipcMain.handle('quick-input:set-shortcut', (_event, accelerator: string) => {
  const registered = registerQuickInputShortcut(accelerator);
  return { ok: registered, accelerator: quickInputAccelerator };
});

ipcMain.handle('quick-input:set-auto-launch', (_event, enabled: boolean) => {
  app.setLoginItemSettings({ openAtLogin: !!enabled, path: process.execPath });
  return { ok: true, enabled: !!enabled };
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);

  const claudioPort = await findAvailablePort(3005);
  const ncmPort = await findAvailablePort(3001);
  const userData = dataDir();
  const resources = resourceRoot();

  process.env.PORT = String(claudioPort);
  process.env.NCM_API = `http://127.0.0.1:${ncmPort}`;
  process.env.CLAUDIO_DATA_DIR = userData;
  process.env.CLAUDIO_RESOURCE_DIR = resources;

  startNcmApi(ncmPort);
  const started = await start({ port: claudioPort });
  shutdownServer = started.shutdown;

  await session.defaultSession.clearCache();
  await session.defaultSession.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] });

  createTray();
  await createWindow(`http://127.0.0.1:${claudioPort}`);
  await createQuickInputWindow(`http://127.0.0.1:${claudioPort}/quick-input.html`);
  app.setLoginItemSettings({ openAtLogin: true, path: process.execPath });
  registerQuickInputShortcut(quickInputAccelerator);
});

app.on('before-quit', async () => {
  quitting = true;
  if (ncmProcess) {
    ncmProcess.kill();
    ncmProcess = null;
  }
  if (shutdownServer) {
    await shutdownServer();
    shutdownServer = null;
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {});
