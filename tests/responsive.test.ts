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

  it('leaves a transparent desktop gutter for the window shadow', async () => {
    await page.setViewportSize({ width: 1180, height: 820 });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

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
    expect(dimensions.appX).toBe(4);
    expect(dimensions.appY).toBe(4);
    expect(dimensions.appWidth).toBe(1172);
    expect(dimensions.htmlOverflow).toBe('hidden');
    expect(dimensions.bodyOverflow).toBe('hidden');
    expect(dimensions.bodyBackground).toBe('rgba(0, 0, 0, 0)');
    expect(dimensions.appBorderRadius).toBe('18px');
    expect(dimensions.appBorderWidth).toBe('1px');
  });

  it('exposes draggable nav with clickable window controls', async () => {
    await page.setViewportSize({ width: 542, height: 753 });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

    const controls = await page.evaluate(() => ({
      navRegion: getComputedStyle(document.querySelector('.nav')!).getPropertyValue('-webkit-app-region'),
      actionsRegion: getComputedStyle(document.querySelector('.nav-actions')!).getPropertyValue('-webkit-app-region'),
      pinExists: !!document.querySelector('#window-pin'),
      minimizeExists: !!document.querySelector('#window-minimize'),
      closeExists: !!document.querySelector('#window-close'),
      swGuardPresent: document.documentElement.outerHTML.includes("location.hostname !== '127.0.0.1'"),
    }));

    expect(controls.navRegion).toBe('drag');
    expect(controls.actionsRegion).toBe('no-drag');
    expect(controls.pinExists).toBe(true);
    expect(controls.minimizeExists).toBe(true);
    expect(controls.closeExists).toBe(true);
    expect(controls.swGuardPresent).toBe(true);
  });

  it('grows the active panel with the window instead of leaving blank space', async () => {
    await page.setViewportSize({ width: 620, height: 753 });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    const shortHeight = await page.locator('#chat-panel').evaluate(el => el.getBoundingClientRect().height);
    await page.setViewportSize({ width: 620, height: 800 });
    const tallHeight = await page.locator('#chat-panel').evaluate(el => el.getBoundingClientRect().height);

    expect(tallHeight - shortHeight).toBeGreaterThanOrEqual(45);
  });

  it('opens the vertical volume control and supports wheel adjustment', async () => {
    await page.setViewportSize({ width: 576, height: 753 });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    const button = page.locator('#volume-btn');
    const slider = page.locator('#volume');
    await button.hover();
    expect(await page.locator('#volume-popover').isVisible()).toBe(true);
    const before = Number(await slider.inputValue());
    await button.dispatchEvent('wheel', { deltaY: -100 });
    expect(Number(await slider.inputValue())).toBe(Math.min(100, before + 5));
  });

  it('keeps chat position stable while the fixed lyric area changes content state', async () => {
    await page.setViewportSize({ width: 620, height: 800 });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    const metrics = await page.evaluate(() => {
      const lyrics = document.querySelector('#lyrics-container');
      const chat = document.querySelector('.chat-section');
      lyrics.style.display = '';
      lyrics.classList.remove('empty');
      const visible = { lyricHeight: lyrics.getBoundingClientRect().height, chatTop: chat.getBoundingClientRect().top };
      lyrics.classList.add('empty');
      const loading = { lyricHeight: lyrics.getBoundingClientRect().height, chatTop: chat.getBoundingClientRect().top };
      return { visible, loading };
    });

    expect(metrics.visible.lyricHeight).toBe(76);
    expect(metrics.loading.lyricHeight).toBe(76);
    expect(metrics.loading.chatTop).toBe(metrics.visible.chatTop);
  });

  it('scrolls a long playlist collection without shrinking cards', async () => {
    const playlists = Array.from({ length: 12 }, (_, index) => ({
      id: index + 1,
      name: `Playlist ${index + 1}`,
      trackCount: 20 + index,
      coverImgUrl: '',
    }));
    await page.route('**/api/config', route => route.fulfill({ json: { ncmLoggedIn: true } }));
    await page.route('**/api/ncm/login/status', route => route.fulfill({ json: { loggedIn: true, vipType: 0 } }));
    await page.route('**/api/status/ncm', route => route.fulfill({ json: { online: true } }));
    await page.route('**/api/ncm/playlists', route => route.fulfill({ json: { playlists } }));
    await page.route('**/api/ncm/playlist/1', route => route.fulfill({ json: {
      playlist: playlists[0],
      tracks: Array.from({ length: 12 }, (_, index) => ({
        id: index + 1,
        name: `Track ${index + 1}`,
        artist: `Artist ${index + 1}`,
      })),
    } }));
    await page.route('**/api/favorites', route => route.fulfill({ json: { favorites: [] } }));
    await page.route('**/api/messages', route => route.fulfill({ json: { messages: [] } }));
    await page.setViewportSize({ width: 576, height: 753 });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#ncm-login-btn')?.classList.contains('logged-in'));
    await page.click('.chat-tab[data-tab="playlists"]');
    await page.locator('.playlist-card').nth(11).waitFor();

    const metrics = await page.locator('#playlists-panel').evaluate((panel) => {
      const cards = [...panel.querySelectorAll('.playlist-card')];
      return {
        clientHeight: panel.clientHeight,
        scrollHeight: panel.scrollHeight,
        minCardHeight: Math.min(...cards.map(card => card.getBoundingClientRect().height)),
      };
    });
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
    expect(metrics.minCardHeight).toBeGreaterThan(50);

    const lastCard = page.locator('.playlist-card').last();
    await lastCard.scrollIntoViewIfNeeded();
    expect(await lastCard.isVisible()).toBe(true);

    const firstCard = page.locator('.playlist-card').first();
    await firstCard.scrollIntoViewIfNeeded();
    await firstCard.click();
    await page.locator('.playlist-track-item').nth(11).waitFor();
    const detailMetrics = await page.locator('#playlists-panel').evaluate((panel) => {
      const tracks = panel.querySelector('.playlist-tracks');
      return {
        panelClientHeight: panel.clientHeight,
        panelScrollHeight: panel.scrollHeight,
        tracksOverflow: tracks ? getComputedStyle(tracks).overflowY : '',
      };
    });
    expect(detailMetrics.panelScrollHeight).toBeGreaterThan(detailMetrics.panelClientHeight);
    expect(detailMetrics.tracksOverflow).toBe('visible');
    const lastTrack = page.locator('.playlist-track-item').last();
    await lastTrack.scrollIntoViewIfNeeded();
    expect(await lastTrack.isVisible()).toBe(true);
  });

  it('keeps playlist playback state consistent across navigation and exit', async () => {
    await page.setViewportSize({ width: 620, height: 800 });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    const result = await page.evaluate(async () => window.eval(`(async () => {
      const { state } = await import('/js/state.js');
      const core = await import('/js/audio-core.js');
      const one = { songId: '1', name: 'One', artist: 'A', url: 'data:audio/mp3;base64,' };
      state.queue = [];
      state.currentTrack = one;
      state.isPlaylistMode = true;
      state.playlistModeMeta = { id: 1, name: 'Single' };
      state.playlistQueue = [one];
      state.playMode = 'list';

      const regular = { songId: '9', name: 'Regular', artist: 'R', url: 'data:audio/mp3;base64,' };
      core.playTrack(regular);
      const regularExitedPlaylist = !state.isPlaylistMode && state.playlistQueue.length === 0;
      core.playNowInQueue(regular);
      core.playNowInQueue({ ...regular });
      const duplicateCount = state.queue.filter(item => item.songId === regular.songId).length;

      state.isPlaylistMode = true;
      state.playlistModeMeta = { id: 2, name: 'Delete' };
      state.playlistQueue = [one, { ...regular, songId: '2' }];
      core.removePlaylistTrack('2');
      const deleteSynced = state.playlistQueue.length === 1 && state.playlistQueue[0].songId === '1';

      state.queue = [regular];
      state.currentTrack = one;
      state.isPlaylistMode = true;
      state.playlistModeMeta = { id: 3, name: 'Exit' };
      state.playlistQueue = [one];
      core.exitPlaylistMode({ silent: true });
      const exitPreservedCurrent = state.queue[0]?.songId === '1' && !state.isPlaylistMode;
      return { regularExitedPlaylist, duplicateCount, deleteSynced, exitPreservedCurrent };
    })()`));

    expect(result).toEqual({
      regularExitedPlaylist: true,
      duplicateCount: 1,
      deleteSynced: true,
      exitPreservedCurrent: true,
    });
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
    await page.goto(`${baseUrl}/quick-input.html`, { waitUntil: 'domcontentloaded' });

    const input = page.locator('#quick-input');
    expect(await input.getAttribute('placeholder')).toBe('Say something to the DJ.');
    expect(await input.evaluate((el) => document.activeElement === el)).toBe(true);

    await input.fill('播放适合工作的歌');
    await input.press('Enter');
    expect(await page.evaluate(() => (window as any).__quickInputSubmitted)).toBe('播放适合工作的歌');

    await input.press('Escape');
    expect(await page.evaluate(() => (window as any).__quickInputClosed)).toBe(true);
  });

  it('uses full-screen touch layout on phone-sized viewport', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

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
      volumeButton: getComputedStyle(document.querySelector('#volume-btn')!).display,
    }));
    expect(hiddenStyles.transportLeft).toBe('none');
    expect(hiddenStyles.volumeButton).toBe('flex');

    const inputBox = await page.locator('#chat-input').boundingBox();
    const sendBox = await page.locator('#send-btn').boundingBox();
    expect(inputBox?.height).toBeGreaterThanOrEqual(48);
    expect(sendBox?.width).toBeGreaterThanOrEqual(44);
    expect(sendBox?.height).toBeGreaterThanOrEqual(44);
  });
});
