import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('frontend polish', () => {
  it('defines panel, toast, progress, and loading animations', () => {
    const css = fs.readFileSync(path.resolve('frontend/style.css'), 'utf-8');

    expect(css).toContain('.panel.active');
    expect(css).toContain('transition: opacity .2s, transform .2s');
    expect(css).toContain('@keyframes toastIn');
    expect(css).toContain('@keyframes toastOut');
    expect(css).toContain('.progress-container:hover');
    expect(css).toContain('.typing-dots');
  });

  it('chat module renders a loading state while waiting for the API', () => {
    const source = fs.readFileSync(path.resolve('frontend/js/chat.js'), 'utf-8');

    expect(source).toContain('addLoadingMessage');
    expect(source).toContain('removeLoadingMessage');
    expect(source).toContain('typing-dots');
  });

  it('defines a history tab and panel container', () => {
    const html = fs.readFileSync(path.resolve('frontend/index.html'), 'utf-8');

    expect(html).toContain('data-tab="history"');
    expect(html).toContain('id="history-panel"');
  });

  it('wires the history panel through main and dom modules', () => {
    const domSource = fs.readFileSync(path.resolve('frontend/js/dom.js'), 'utf-8');
    const mainSource = fs.readFileSync(path.resolve('frontend/js/main.js'), 'utf-8');

    expect(domSource).toContain('historyPanel');
    expect(mainSource).toContain("from './history-panel.js'");
    expect(mainSource).toContain("target === 'history'");
    expect(mainSource).toContain('renderHistoryPanel');
  });

  it('history panel implements loading, empty, failure, pagination, and replay states', () => {
    const source = fs.readFileSync(path.resolve('frontend/js/history-panel.js'), 'utf-8');

    expect(source).toContain('/api/history?page=');
    expect(source).toContain('暂无播放记录');
    expect(source).toContain('加载历史失败');
    expect(source).toContain('history-pagination');
    expect(source).toContain('/api/play/by-id');
  });

  it('audio core records history only after the actual play promise resolves', () => {
    const source = fs.readFileSync(path.resolve('frontend/js/audio-core.js'), 'utf-8');

    expect(source).toContain('function recordPlayback(item)');
    expect(source).toContain('let playRequestToken = 0');
    expect(source).toContain('audio.play()');
    expect(source).toContain('.then(() => {');
    expect(source).toContain('recordPlayback(item)');
    const playTrackStart = source.indexOf('export function playTrack(item,');
    const playTrackSource = source.slice(playTrackStart, source.indexOf('function updateMediaSession(item)'));
    const helperSource = source.slice(source.indexOf('function recordConfirmedPlayback(item, token, expectedUrl)'), playTrackStart);
    expect(playTrackSource).toContain('const audioUrl = resolveAudioUrl(item.url)');
    expect(playTrackSource).toContain('audio.src = audioUrl');
    expect(playTrackSource).toContain('recordConfirmedPlayback(item, token, audio.src)');
    expect(helperSource).toContain('.then(() => {');
    expect(helperSource.indexOf('.then(() => {')).toBeLessThan(helperSource.indexOf('recordPlayback(item)'));
  });

  it('single-repeat replay records history after the actual replay promise resolves', () => {
    const source = fs.readFileSync(path.resolve('frontend/js/audio-core.js'), 'utf-8');
    const helperStart = source.indexOf('function recordConfirmedPlayback(item, token, expectedUrl)');
    const helperEnd = source.indexOf('export function playTrack(item)');
    const helperSource = source.slice(helperStart, helperEnd);
    const replayStart = source.indexOf('function replayCurrentTrack()');
    const replayEnd = source.indexOf('let _fetchingFm = false');
    const replaySource = source.slice(replayStart, replayEnd);

    expect(helperStart).toBeGreaterThanOrEqual(0);
    expect(helperSource).toContain('audio.play()');
    expect(helperSource).toContain('.then(() => {');
    expect(helperSource).toContain('token === playRequestToken');
    expect(helperSource).toContain('state.currentTrack === item');
    expect(helperSource).toContain('audio.src === expectedUrl');
    expect(helperSource).toContain('recordPlayback(item)');
    expect(helperSource.indexOf('.then(() => {')).toBeLessThan(helperSource.indexOf('recordPlayback(item)'));
    expect(replaySource).toContain('const token = ++playRequestToken');
    expect(replaySource).toContain('const audioUrl = audio.src');
    expect(replaySource).toContain('return recordConfirmedPlayback(item, token, audioUrl)');
    expect(replaySource).not.toContain('audio.play().catch(() => {})');
  });

  it('lets tab panels fill the available height during async content swaps', () => {
    const css = fs.readFileSync(path.resolve('frontend/style.css'), 'utf-8');

    expect(css).toMatch(/\.panel\s*\{[\s\S]*flex:\s*1 1 auto;[\s\S]*height:\s*auto;[\s\S]*max-height:\s*none;/);
    expect(css).not.toContain('height: 320px');
  });

  it('stats panel bypasses browser cache when reading reports', () => {
    const source = fs.readFileSync(path.resolve('frontend/js/stats-panel.js'), 'utf-8');

    expect(source).toContain("cache: 'no-store'");
  });

  it('keeps missing stats reports manual', () => {
    const source = fs.readFileSync(path.resolve('frontend/js/stats-panel.js'), 'utf-8');

    expect(source).toContain('const generateSelectedReport = async () =>');
    expect(source).not.toContain('if (!data.insight) void generateSelectedReport()');
    expect(source).toContain('if (!r.ok) throw new Error');
  });

  it('keeps window controls inline and disables progress hover resizing', () => {
    const css = fs.readFileSync(path.resolve('frontend/style.css'), 'utf-8');

    expect(css).toMatch(/\.nav-actions\s*\{[\s\S]*display:\s*flex;[\s\S]*align-items:\s*center;[\s\S]*gap:\s*4px;/);
    const progressHover = css.slice(css.indexOf('.progress-container:hover'), css.indexOf('.typing-dots'));
    expect(progressHover).toContain('cursor: pointer');
    expect(progressHover).not.toContain('height:');
  });

  it('places settings toggles in one row and keeps the modal open after save', () => {
    const css = fs.readFileSync(path.resolve('frontend/style.css'), 'utf-8');
    const html = fs.readFileSync(path.resolve('frontend/index.html'), 'utf-8');
    const settings = fs.readFileSync(path.resolve('frontend/js/settings.js'), 'utf-8');

    expect(css).toMatch(/\.settings-toggle-row\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,/);
    expect(css).toMatch(/\.toggle-switch\s*\{[\s\S]*width:\s*42px;[\s\S]*height:\s*24px;/);
    expect(html).toContain('class="connection-test-row"');
    expect(settings).toContain('syncDesktopConfig');
    expect(settings).toContain('setShortcut');
    expect(settings).toContain('setAutoLaunch');
    expect(settings).toContain("dom.settingsStatus.textContent = '✓ 已保存'");
  });

  it('uses generated brand icons for app, tray, and navbar', () => {
    const html = fs.readFileSync(path.resolve('frontend/index.html'), 'utf-8');
    const css = fs.readFileSync(path.resolve('frontend/style.css'), 'utf-8');
    const main = fs.readFileSync(path.resolve('electron/main.ts'), 'utf-8');

    expect(fs.existsSync(path.resolve('frontend/icons/icon-512.png'))).toBe(true);
    expect(fs.existsSync(path.resolve('frontend/icons/tray-icon.png'))).toBe(true);
    expect(fs.existsSync(path.resolve('frontend/icons/nav-logo.png'))).toBe(true);
    expect(html).toContain('/icons/music-note.svg');
    expect(html).toContain('href="/icons/music-note.svg"');
    expect(css).toContain('.nav-avatar img');
    expect(css).toContain("background: var(--accent)");
    expect(css).toContain("mask: url('/icons/music-note.svg')");
    expect(main).toContain("'tray-icon.png'");
  });

  it('defines quick input floating bar and reuses chat submission', () => {
    const html = fs.readFileSync(path.resolve('frontend/quick-input.html'), 'utf-8');
    const css = fs.readFileSync(path.resolve('frontend/style.css'), 'utf-8');
    const quickInput = fs.readFileSync(path.resolve('frontend/js/quick-input.js'), 'utf-8');
    const main = fs.readFileSync(path.resolve('frontend/js/main.js'), 'utf-8');

    expect(html).toContain('id="quick-input"');
    expect(html).toContain('Say something to the DJ.');
    expect(css).toContain('.quick-input-bar');
    expect(css).toContain('background: var(--bg-card)');
    expect(css).toContain('border-radius: 999px');
    expect(css).toContain('.quick-input-field::placeholder');
    expect(css).toContain('color: var(--orange)');
    expect(quickInput).toContain('window.electronQuickInput');
    expect(quickInput).toContain("event.key === 'Enter'");
    expect(quickInput).toContain("event.key === 'Escape'");
    expect(quickInput).toContain('event.isComposing');
    expect(quickInput).toContain('quickInput?.submit(text)');
    expect(quickInput).toContain('quickInput?.close()');
    expect(main).toContain('electronQuickInput?.onSubmit');
    expect(main).toContain('chat.sendChat(text)');
  });

  it('FM next playback uses the shared playTrack path', () => {
    const source = fs.readFileSync(path.resolve('frontend/js/audio-core.js'), 'utf-8');
    const fmStart = source.indexOf('async function fetchNextFm()');
    const fmEnd = source.indexOf('export async function exitMode()');
    const fmSource = source.slice(fmStart, fmEnd);

    expect(fmSource).toContain('playTrack(item)');
    expect(fmSource).not.toContain('state.currentTrack = item');
  });

  it('retries NCM status quickly until the local service is online', () => {
    const source = fs.readFileSync(path.resolve('frontend/js/ncm-auth.js'), 'utf-8');

    expect(source).toContain('online ? 30000 : 1500');
    expect(source).toContain('pollNcmStatus();');
    expect(source).not.toContain('setInterval(checkNcmStatus, 30000)');
  });

  it('confirms and deletes persisted chat history from the CHAT toolbar', () => {
    const html = fs.readFileSync(path.resolve('frontend/index.html'), 'utf-8');
    const chat = fs.readFileSync(path.resolve('frontend/js/chat.js'), 'utf-8');
    const main = fs.readFileSync(path.resolve('frontend/js/main.js'), 'utf-8');

    expect(html).toContain('id="clear-chat-btn"');
    expect(html).toContain('id="clear-chat-modal"');
    expect(html).toContain('播放历史、收藏和歌单不会受到影响');
    expect(chat).toContain("fetch('/api/messages', { method: 'DELETE' })");
    expect(chat).toContain('dom.chatMessages.replaceChildren()');
    expect(main).toContain("target === 'chat' ? '' : 'none'");
  });

  it('uses a popover volume control and separated transport groups', () => {
    const html = fs.readFileSync(path.resolve('frontend/index.html'), 'utf-8');
    const audio = fs.readFileSync(path.resolve('frontend/js/audio-core.js'), 'utf-8');
    const settings = fs.readFileSync(path.resolve('frontend/js/settings.js'), 'utf-8');
    const css = fs.readFileSync(path.resolve('frontend/style.css'), 'utf-8');

    expect(html).toContain('id="volume-btn"');
    expect(html).toContain('id="volume-popover"');
    expect((html.match(/class="transport-separator"/g) || [])).toHaveLength(2);
    expect(audio).toContain("event.deltaY < 0 ? 5 : -5");
    expect(settings).toContain("return (value || '').trim()");
    expect(css).toContain('.volume-wrap:hover .volume-popover');
    expect(css).toContain('.model-dropdown::-webkit-scrollbar-thumb');
  });

  it('renders now-playing messages with the dedicated double-note SVG', () => {
    const chat = fs.readFileSync(path.resolve('frontend/js/chat.js'), 'utf-8');
    const audio = fs.readFileSync(path.resolve('frontend/js/audio-core.js'), 'utf-8');

    expect(chat).toContain("type === 'now-playing'");
    expect(chat).toContain('className = \'now-playing-icon\'');
    expect(audio).toContain("'now-playing'");
    expect(audio).not.toContain('🎵 Now playing:');
  });

  it('uses one scroll container for DJ replies and segue messages', () => {
    const css = fs.readFileSync(path.resolve('frontend/style.css'), 'utf-8');

    expect(css).toMatch(/\.chat-messages\s*\{[\s\S]*height:\s*100%;[\s\S]*max-height:\s*none;[\s\S]*overflow-y:\s*auto;/);
    expect(css).toMatch(/\.chat-panel\s*\{\s*overflow:\s*hidden;\s*\}/);
  });

  it('recalculates chat scroll when lyrics change the layout height', () => {
    const chat = fs.readFileSync(path.resolve('frontend/js/chat.js'), 'utf-8');
    const lyrics = fs.readFileSync(path.resolve('frontend/js/lyrics.js'), 'utf-8');

    expect(chat).toContain('new ResizeObserver(scrollChatToBottom)');
    expect(lyrics).toContain('scrollChatToBottom();');
  });

  it('keeps lyrics closed on first launch', () => {
    const state = fs.readFileSync(path.resolve('frontend/js/state.js'), 'utf-8');
    const lyrics = fs.readFileSync(path.resolve('frontend/js/lyrics.js'), 'utf-8');

    expect(state).toContain('lyricsVisible: false');
    expect(lyrics).toContain("dom.lyricsContainer.style.display = state.lyricsVisible ? '' : 'none'");
  });

  it('reserves a fixed three-line lyric area while tracks switch', () => {
    const css = fs.readFileSync(path.resolve('frontend/style.css'), 'utf-8');
    const audio = fs.readFileSync(path.resolve('frontend/js/audio-core.js'), 'utf-8');

    expect(css).toMatch(/\.lyrics-container\s*\{[\s\S]*height:\s*76px;[\s\S]*flex:\s*0 0 76px;/);
    expect(css).toMatch(/\.lyrics-container\.empty\s*\{[\s\S]*visibility:\s*hidden;/);
    expect(audio).toContain('token !== playRequestToken || state.currentTrack !== item');
  });

  it('deduplicates repeated history and favorite plays by song id', () => {
    const audio = fs.readFileSync(path.resolve('frontend/js/audio-core.js'), 'utf-8');
    const history = fs.readFileSync(path.resolve('frontend/js/history-panel.js'), 'utf-8');
    const favorites = fs.readFileSync(path.resolve('frontend/js/favs-panel.js'), 'utf-8');

    expect(audio).toContain('export function playNowInQueue(item)');
    expect(audio).toContain('String(existing.songId) !== String(item.songId)');
    expect(history).toContain('await playNowInQueue(playable)');
    expect(favorites).toContain('playNowInQueue(item)');
  });

  it('lets panels fill available height and shows non-blocking suggestions at top right', () => {
    const css = fs.readFileSync(path.resolve('frontend/style.css'), 'utf-8');
    const toast = fs.readFileSync(path.resolve('frontend/js/toast.js'), 'utf-8');

    expect(css).toMatch(/\.panel\s*\{[\s\S]*flex:\s*1 1 auto;[\s\S]*max-height:\s*none;/);
    expect(css).not.toContain('height: 320px');
    expect(css).toMatch(/\.track-item\s*\{[\s\S]*flex-shrink:\s*0;/);
    expect(css).toMatch(/\.toast-container\s*\{[\s\S]*top:\s*76px;[\s\S]*right:\s*18px;/);
    expect(toast).toContain('setTimeout(removeSuggestion, 15000)');
  });

  it('places the GitHub link beside settings', () => {
    const html = fs.readFileSync(path.resolve('frontend/index.html'), 'utf-8');

    expect(html).toContain('class="nav-btn github-btn"');
    expect(html).toContain('https://github.com/HP-Patience/MusiCue');
    expect(html).toContain('title="GitHub"');
  });

  it('keeps the NetEase icon while login state text changes', () => {
    const html = fs.readFileSync(path.resolve('frontend/index.html'), 'utf-8');
    const auth = fs.readFileSync(path.resolve('frontend/js/ncm-auth.js'), 'utf-8');

    expect(html).toContain('id="ncm-login-label">LOGIN</span>');
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(auth).toContain("document.getElementById('ncm-login-label')");
    expect(auth).not.toContain('dom.ncmLoginBtn.textContent');
  });

  it('uses the paper-plane SVG for chat send', () => {
    const html = fs.readFileSync(path.resolve('frontend/index.html'), 'utf-8');

    expect(html).toContain('id="send-btn"');
    expect(html).toContain('M9.912 12H4L2.023 4.135');
    expect(html).not.toContain('id="send-btn">↑</button>');
  });

  it('renders segue text as italic UI instead of exposing markdown markers', () => {
    const chat = fs.readFileSync(path.resolve('frontend/js/chat.js'), 'utf-8');
    const css = fs.readFileSync(path.resolve('frontend/style.css'), 'utf-8');

    expect(chat).toContain("addChatMessage(data.segue, 'segue')");
    expect(chat).not.toContain('`*${data.segue}*`');
    expect(css).toContain('.chat-bubble.segue .bubble-text');
  });
});
