import { describe, it, expect } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import { findAvailablePort } from '../electron/ports.js';

async function occupy(port: number): Promise<http.Server> {
  const server = http.createServer((_req, res) => res.end('busy'));
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  return server;
}

describe('desktop ports', () => {
  it('uses preferred port when available', async () => {
    const port = await findAvailablePort(39895);

    expect(port).toBe(39895);
  });

  it('skips occupied preferred port and never returns 3000', async () => {
    const server = await occupy(39896);

    try {
      const port = await findAvailablePort(39896);

      expect(port).not.toBe(39896);
      expect(port).not.toBe(3000);
      expect(port).toBeGreaterThan(0);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => err ? reject(err) : resolve());
      });
    }
  });

  it('shares project runtime data in desktop development mode', () => {
    const main = fs.readFileSync(new URL('../electron/main.ts', import.meta.url), 'utf8');

    expect(main).toContain("app.isPackaged ? app.getPath('userData') : resourceRoot()");
    expect(main).toContain('process.env.CLAUDIO_DATA_DIR = userData');
  });

  it('wires frameless window controls through preload IPC', () => {
    const main = fs.readFileSync(new URL('../electron/main.ts', import.meta.url), 'utf8');
    const preload = fs.readFileSync(new URL('../electron/preload.cjs', import.meta.url), 'utf8');

    expect(main).toContain('width: 542');
    expect(main).toContain('height: 753');
    expect(main).toContain('resizable: true');
    expect(main).toContain('useContentSize: true');
    expect(main).toContain('frame: false');
    expect(main).toContain('transparent: true');
    expect(main).toContain('autoHideMenuBar: true');
    expect(main).toContain("backgroundColor: '#00000000'");
    expect(main).toContain("preload: path.join(resourceRoot(), 'electron', 'preload.cjs')");
    expect(main).toContain("ipcMain.handle('window:minimize'");
    expect(main).toContain("ipcMain.handle('window:close'");
    expect(main).toContain("ipcMain.handle('window:quit'");
    expect(main).toContain("clearStorageData({ storages: ['serviceworkers', 'cachestorage'] })");
    expect(main).not.toContain('minWidth:');
    expect(main).not.toContain('minHeight:');
    expect(preload).toContain("contextBridge.exposeInMainWorld('electronWindow'");
    expect(preload).toContain("ipcRenderer.invoke('window:minimize')");
    expect(preload).toContain("ipcRenderer.invoke('window:close')");
    expect(preload).toContain("ipcRenderer.invoke('window:quit')");
  });

  it('wires quick input global shortcut and floating window', () => {
    const main = fs.readFileSync(new URL('../electron/main.ts', import.meta.url), 'utf8');
    const preload = fs.readFileSync(new URL('../electron/preload.cjs', import.meta.url), 'utf8');

    expect(main).toContain('globalShortcut');
    expect(main).toContain('CommandOrControl+Shift+Space');
    expect(main).toContain('quickInputWindow');
    expect(main).toContain('alwaysOnTop: true');
    expect(main).toContain('skipTaskbar: true');
    expect(main).toContain("ipcMain.handle('quick-input:submit'");
    expect(main).toContain("ipcMain.handle('quick-input:close'");
    expect(main).toContain("ipcMain.handle('quick-input:set-shortcut'");
    expect(main).toContain("ipcMain.handle('quick-input:set-auto-launch'");
    expect(main).toContain("webContents.send('quick-input:submit'");
    expect(main).toContain('setLoginItemSettings');
    expect(main).toContain('openAtLogin: true');
    expect(main).toContain('globalShortcut.unregisterAll');
    expect(preload).toContain("contextBridge.exposeInMainWorld('electronQuickInput'");
    expect(preload).toContain("ipcRenderer.invoke('quick-input:submit'");
    expect(preload).toContain("ipcRenderer.invoke('quick-input:close'");
    expect(preload).toContain("ipcRenderer.on('quick-input:submit'");
    expect(preload).toContain("ipcRenderer.on('quick-input:focus'");
  });
});
