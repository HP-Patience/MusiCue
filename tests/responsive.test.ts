import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';

let server: http.Server;
let baseUrl: string;
let browser: Browser;
let page: Page;

describe('responsive frontend layout', () => {
  beforeAll(async () => {
    const app = express();
    app.use(express.static(path.resolve('frontend')));
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('server failed to start');
    baseUrl = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch();
    page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  });

  afterAll(async () => {
    await page?.close();
    await browser?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('fills wide desktop windows without side gutters', async () => {
    await page.setViewportSize({ width: 1180, height: 820 });
    await page.goto(baseUrl);

    const dimensions = await page.evaluate(() => ({
      htmlWidth: document.documentElement.getBoundingClientRect().width,
      bodyWidth: document.body.getBoundingClientRect().width,
      appX: document.querySelector('#app')!.getBoundingClientRect().x,
      appY: document.querySelector('#app')!.getBoundingClientRect().y,
      appWidth: document.querySelector('#app')!.getBoundingClientRect().width,
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
      bodyOverflow: getComputedStyle(document.body).overflow,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      appBorderRadius: getComputedStyle(document.querySelector('#app')!).borderRadius,
      appBorderWidth: getComputedStyle(document.querySelector('#app')!).borderWidth,
    }));

    expect(dimensions.htmlWidth).toBe(1180);
    expect(dimensions.bodyWidth).toBe(1180);
    expect(dimensions.appX).toBe(0);
    expect(dimensions.appY).toBe(0);
    expect(dimensions.appWidth).toBe(1180);
    expect(dimensions.htmlOverflow).toBe('hidden');
    expect(dimensions.bodyOverflow).toBe('hidden');
    expect(dimensions.bodyBackground).toBe('rgba(0, 0, 0, 0)');
    expect(dimensions.appBorderRadius).toBe('18px');
    expect(dimensions.appBorderWidth).toBe('1px');
  });

  it('exposes draggable nav with clickable window controls', async () => {
    await page.setViewportSize({ width: 542, height: 753 });
    await page.goto(baseUrl);

    const controls = await page.evaluate(() => ({
      navRegion: getComputedStyle(document.querySelector('.nav')!).getPropertyValue('-webkit-app-region'),
      actionsRegion: getComputedStyle(document.querySelector('.nav-actions')!).getPropertyValue('-webkit-app-region'),
      minimizeExists: !!document.querySelector('#window-minimize'),
      closeExists: !!document.querySelector('#window-close'),
      swGuardPresent: document.documentElement.outerHTML.includes("location.hostname !== '127.0.0.1'"),
    }));

    expect(controls.navRegion).toBe('drag');
    expect(controls.actionsRegion).toBe('no-drag');
    expect(controls.minimizeExists).toBe(true);
    expect(controls.closeExists).toBe(true);
    expect(controls.swGuardPresent).toBe(true);
  });

  it('supports quick input focus, submit, and escape close', async () => {
    await page.setViewportSize({ width: 760, height: 88 });
    await page.addInitScript(() => {
      (window as any).__quickInputSubmitted = '';
      (window as any).__quickInputClosed = false;
      (window as any).electronQuickInput = {
        submit: (text: string) => { (window as any).__quickInputSubmitted = text; },
        close: () => { (window as any).__quickInputClosed = true; },
        onFocus: (_callback: () => void) => {},
      };
    });
    await page.goto(`${baseUrl}/quick-input.html`);

    const input = page.locator('#quick-input');
    expect(await input.getAttribute('placeholder')).toBe('What can I help you with today?');
    expect(await input.evaluate((el) => document.activeElement === el)).toBe(true);

    await input.fill('播放适合工作的歌');
    await input.press('Enter');
    expect(await page.evaluate(() => (window as any).__quickInputSubmitted)).toBe('播放适合工作的歌');

    await input.press('Escape');
    expect(await page.evaluate(() => (window as any).__quickInputClosed)).toBe(true);
  });

  it('uses full-screen touch layout on phone-sized viewport', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(baseUrl);

    const appBox = await page.locator('#app').boundingBox();
    expect(appBox?.width).toBeGreaterThanOrEqual(389);

    const appStyles = await page.locator('#app').evaluate((el) => {
      const styles = getComputedStyle(el);
      return { borderRadius: styles.borderRadius, borderWidth: styles.borderWidth };
    });
    expect(appStyles.borderRadius).toBe('0px');
    expect(appStyles.borderWidth).toBe('0px');

    const hiddenStyles = await page.evaluate(() => ({
      transportLeft: getComputedStyle(document.querySelector('.transport-left')!).display,
      volume: getComputedStyle(document.querySelector('#volume')!).display,
    }));
    expect(hiddenStyles.transportLeft).toBe('none');
    expect(hiddenStyles.volume).toBe('none');

    const inputBox = await page.locator('#chat-input').boundingBox();
    const sendBox = await page.locator('#send-btn').boundingBox();
    expect(inputBox?.height).toBeGreaterThanOrEqual(48);
    expect(sendBox?.width).toBeGreaterThanOrEqual(44);
    expect(sendBox?.height).toBeGreaterThanOrEqual(44);
  });
});
