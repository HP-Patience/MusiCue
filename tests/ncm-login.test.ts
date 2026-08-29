import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

let server: http.Server;
let shutdown: () => Promise<void>;
let browser: Browser;
let page: Page;
let baseUrl: string;

beforeAll(async () => {
  process.env.DB_PATH = path.join(os.tmpdir(), `claudio-ncm-login-${Date.now()}.db`);
  const { start } = await import('../src/server.js');
  const result = await start({ port: 0 });
  server = result.server;
  shutdown = result.shutdown;
  const addr = server.address() as any;
  baseUrl = `http://localhost:${addr.port}`;
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();
  await page.route('**/api/status/ncm', route => route.fulfill({ json: { online: false, vipType: 0 } }));
  await page.route('**/api/ncm/login/qr/key', route => route.fulfill({ json: { data: { unikey: 'test-key' } } }));
  await page.route('**/api/ncm/login/qr/create', route => route.fulfill({ json: { data: { qrimg: 'data:image/png;base64,iVBORw0KGgo=' } } }));
  await page.route('**/api/ncm/login/qr/check', route => route.fulfill({ json: { code: 801 } }));
});

afterAll(async () => {
  await browser.close();
  if (shutdown) await shutdown();
});

beforeEach(async () => {
  await fetch(`${baseUrl}/api/ncm/logout`, { method: 'POST' });
});

async function openLoginModal() {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#ncm-login-btn');
  await page.click('#ncm-login-btn');
  await page.waitForSelector('#ncm-login-modal.open');
}

async function closeModalViaX() {
  const isOpen = await page.$('#ncm-login-modal.open');
  if (!isOpen) return;
  await page.click('#ncm-login-close');
  await page.waitForTimeout(300);
}

describe('NCM Login UI', { timeout: 15000 }, () => {
  it('shows LOGIN button in nav', async () => {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#ncm-login-btn');
    const text = await page.textContent('#ncm-login-btn');
    expect(text).toBe('LOGIN');
  });

  it('login status endpoint returns false when no cookie', async () => {
    const res = await fetch(`${baseUrl}/api/ncm/login/status`);
    const data = await res.json() as any;
    expect(data.loggedIn).toBe(false);
  });

  it('opens login modal on click, shows QR tab by default', async () => {
    await openLoginModal();

    const qrTab = await page.$('.login-tab.active[data-login-tab="qr"]');
    expect(qrTab).not.toBeNull();

    const qrDisplay = await page.$eval('#login-qr-panel', el => (el as HTMLElement).style.display);
    expect(qrDisplay).not.toBe('none');

    const pwdDisplay = await page.$eval('#login-pwd-panel', el => (el as HTMLElement).style.display);
    expect(pwdDisplay).toBe('none');

    await closeModalViaX();
  });

  it('switches to password tab on click', async () => {
    await openLoginModal();

    await page.click('.login-tab[data-login-tab="pwd"]');
    await page.waitForTimeout(200);

    const pwdTab = await page.$('.login-tab.active[data-login-tab="pwd"]');
    expect(pwdTab).not.toBeNull();

    const qrDisplay = await page.$eval('#login-qr-panel', el => (el as HTMLElement).style.display);
    expect(qrDisplay).toBe('none');

    const pwdDisplay = await page.$eval('#login-pwd-panel', el => (el as HTMLElement).style.display);
    expect(pwdDisplay).not.toBe('none');

    await closeModalViaX();
  });

  it('closes modal on X button', async () => {
    await openLoginModal();
    await page.click('#ncm-login-close');
    await page.waitForTimeout(300);
    const modal = await page.$('#ncm-login-modal.open');
    expect(modal).toBeNull();
  });

  it('closes modal on Escape key', async () => {
    await openLoginModal();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const modal = await page.$('#ncm-login-modal.open');
    expect(modal).toBeNull();
  });

  it('reopens modal and shows placeholder while QR loads', async () => {
    await openLoginModal();
    const qrPlaceholder = await page.$('#qr-placeholder');
    expect(qrPlaceholder).not.toBeNull();
    await closeModalViaX();
  });

  it('logout endpoint works', async () => {
    const res = await fetch(`${baseUrl}/api/ncm/logout`, { method: 'POST' });
    const data = await res.json() as any;
    expect(data.ok).toBe(true);

    const statusRes = await fetch(`${baseUrl}/api/ncm/login/status`);
    const statusData = await statusRes.json() as any;
    expect(statusData.loggedIn).toBe(false);
  });

  it('config endpoint includes ncmLoggedIn field', async () => {
    const res = await fetch(`${baseUrl}/api/config`);
    const data = await res.json() as any;
    expect(data).toHaveProperty('ncmLoggedIn');
    expect(typeof data.ncmLoggedIn).toBe('boolean');
  });

  it('password login shows validation error for empty fields', async () => {
    await openLoginModal();
    await page.click('.login-tab[data-login-tab="pwd"]');
    await page.waitForTimeout(200);

    await page.click('#pwd-login-btn');
    await page.waitForTimeout(300);

    const status = await page.textContent('#pwd-login-status');
    expect(status).toContain('请输入手机号和密码');

    await closeModalViaX();
  });
});
