import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('playlist internal playback mode', () => {
  it('keeps playlist playback separate from the external queue', () => {
    const stateSource = fs.readFileSync(path.resolve('frontend/js/state.js'), 'utf-8');
    const audioSource = fs.readFileSync(path.resolve('frontend/js/audio-core.js'), 'utf-8');

    expect(stateSource).toContain('isPlaylistMode: false');
    expect(stateSource).toContain('playlistQueue: []');
    expect(audioSource).toContain('export async function enterPlaylistMode');
    expect(audioSource).toContain('export function exitPlaylistMode');
    expect(audioSource).toContain('state.playlistQueue');
    expect(audioSource).toContain('const queue = getPlaybackQueue();');
    expect(audioSource).toContain('const shuffleHistory = getShuffleHistory();');
    expect(audioSource).not.toContain('setQueue(state.playlistQueue)');
  });

  it('adds a playlist detail button for internal playlist playback', () => {
    const panelSource = fs.readFileSync(path.resolve('frontend/js/playlists-panel.js'), 'utf-8');

    expect(panelSource).toContain('enterPlaylistMode');
    expect(panelSource).toContain('exitPlaylistMode');
    expect(panelSource).toContain('playlist-mode-btn');
    expect(panelSource).toContain('歌单内播放');
  });

  it('styles the playlist mode button and clears playlist mode for streamed play payloads', () => {
    const css = fs.readFileSync(path.resolve('frontend/style.css'), 'utf-8');
    const wsSource = fs.readFileSync(path.resolve('frontend/js/ws.js'), 'utf-8');

    expect(css).toContain('.playlist-mode-btn');
    expect(css).toContain('.playlist-mode-btn.active');
    expect(wsSource).toContain('exitPlaylistMode({ silent: true, preserveCurrent: false })');
  });

  it('keeps playlist cards at full height so the panel can scroll', () => {
    const css = fs.readFileSync(path.resolve('frontend/style.css'), 'utf-8');

    expect(css).toMatch(/\.playlist-card\s*\{[^}]*flex-shrink:\s*0/s);
    expect(css).toMatch(/\.playlist-create-bar\s*\{[^}]*flex-shrink:\s*0/s);
  });

  it('uses the playlists panel as the single detail scroll container', () => {
    const css = fs.readFileSync(path.resolve('frontend/style.css'), 'utf-8');

    expect(css).toMatch(/\.playlists-panel\s*\{[^}]*overflow-y:\s*auto/s);
    expect(css).toMatch(/\.playlist-tracks\s*\{[^}]*overflow:\s*visible/s);
    expect(css).not.toContain('.playlist-tracks::-webkit-scrollbar');
  });

  it('cycles playback modes directly without a dropdown', () => {
    const html = fs.readFileSync(path.resolve('frontend/index.html'), 'utf-8');
    const modeSource = fs.readFileSync(path.resolve('frontend/js/playmode.js'), 'utf-8');
    const audioSource = fs.readFileSync(path.resolve('frontend/js/audio-core.js'), 'utf-8');

    expect(html).not.toContain('playmode-dropdown');
    expect(modeSource).toContain("const modes = ['list', 'single', 'shuffle']");
    expect(modeSource).toContain('setPlayMode(modes[(current + 1) % modes.length])');
    expect(audioSource).toContain("list: ICONS.repeat, single: ICONS.single");
    expect(audioSource).toContain("list: '列表循环', single: '单曲循环', shuffle: '随机播放'");
  });

  it('invalidates stale playlist navigation and synchronizes external playback', () => {
    const audioSource = fs.readFileSync(path.resolve('frontend/js/audio-core.js'), 'utf-8');
    const queueSource = fs.readFileSync(path.resolve('frontend/js/queue-panel.js'), 'utf-8');
    const playlistSource = fs.readFileSync(path.resolve('frontend/js/playlists-panel.js'), 'utf-8');

    expect(audioSource).toContain('playlistModeGeneration');
    expect(audioSource).toContain('generation !== playlistModeGeneration');
    expect(audioSource).toContain('export function removePlaylistTrack');
    expect(audioSource).toContain('fromPlaylist = false');
    expect(queueSource).toContain("exitPlaylistMode({ silent: true, preserveCurrent: false })");
    expect(playlistSource).toContain('removePlaylistTrack(t.id)');
  });
});
