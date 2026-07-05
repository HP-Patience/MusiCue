// Claudio FM — 音频播放核心
import { state, sessionId } from './state.js';
import { dom } from './dom.js';
import { ICONS } from './icons.js';
import { resolveAudioUrl, formatTime } from './api.js';
import { updateLyrics, parseLRC } from './lyrics.js';

// ── cross-module refs (set by main.js) ──
let addChatMessage = () => {};
let refreshQueuePanel = () => {};

export function link(_addChatMessage, _refreshQueuePanel) {
  addChatMessage = _addChatMessage;
  refreshQueuePanel = _refreshQueuePanel;
}

// ── audio object ──
export const audio = new Audio();
audio.volume = state.volume / 100;

// ── audio events ──
audio.addEventListener('timeupdate', () => {
  if (audio.duration) {
    const pct = (audio.currentTime / audio.duration) * 100;
    dom.progressBar.style.width = `${pct}%`;
    dom.currentTime.textContent = formatTime(audio.currentTime);
    dom.duration.textContent = formatTime(audio.duration);
  }
  updateLyrics(audio.currentTime);
});

audio.addEventListener('ended', () => {
  state.isPlaying = false;
  dom.playBtn.innerHTML = ICONS.play;
  dom.onAir.classList.remove('active');
  if (state.isFmMode) {
    fetchNextFm();
  } else if (state.isSmartMode && state.queue.length > 1) {
    nextTrack();
  } else if (state.playMode === 'single') {
    replayCurrentTrack();
  } else {
    state.isSmartMode = false;
    updateModeDisplay();
    nextTrack();
  }
});

audio.addEventListener('play', () => {
  state.isPlaying = true;
  dom.playBtn.innerHTML = ICONS.pause;
  dom.waveform.classList.remove('paused');
});

audio.addEventListener('pause', () => {
  state.isPlaying = false;
  dom.playBtn.innerHTML = ICONS.play;
  dom.waveform.classList.add('paused');
});

// ── helpers ──

export function showModeToast(label) {
  let container = document.getElementById('mode-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'mode-toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'mode-toast';
  const close = document.createElement('button');
  close.className = 'mode-toast-close';
  close.textContent = '✕';
  close.addEventListener('click', () => toast.remove());
  toast.textContent = label;
  toast.appendChild(close);
  container.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3000);
}

export async function resolveItemUrl(item) {
  if (item.url) return;
  try {
    const endpoint = item.songId ? '/api/play/by-id' : '/api/play/search';
    const body = item.songId ? { songId: item.songId } : { name: item.name };
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const fresh = await r.json();
    if (fresh.url) Object.assign(item, fresh);
  } catch { /* ignore */ }
}

export function togglePlay() {
  if (audio.paused && audio.src) {
    audio.play();
  } else if (!audio.paused) {
    audio.pause();
  }
}

export function getQueue() { return state.queue; }

function getPlaybackQueue() {
  return state.isPlaylistMode ? state.playlistQueue : state.queue;
}

function getShuffleHistory() {
  return state.isPlaylistMode ? state._playlistShuffleHistory : state._shuffleHistory;
}

function refreshPlaybackQueueUi() {
  if (state.isPlaylistMode) return;
  dom.queueCount.textContent = String(state.queue.length);
  refreshQueuePanel();
}

function toPlaylistItem(track) {
  return {
    songId: track.songId || track.id,
    name: track.name,
    artist: track.artist,
    album: track.album,
    url: track.url,
  };
}

export function setQueue(items) {
  state.queue = items;
  state._shuffleHistory = [];
  dom.queueCount.textContent = String(items.length);
  refreshQueuePanel();
}

export async function enterPlaylistMode({ id, name, tracks, startIndex = 0 }) {
  const items = tracks.map(toPlaylistItem);
  if (items.length === 0) return;
  const safeStart = Math.max(0, Math.min(startIndex, items.length - 1));
  state.isFmMode = false;
  state.isSmartMode = false;
  state.isPlaylistMode = true;
  state.playlistModeMeta = { id, name };
  state.playlistQueue = items.slice(safeStart).concat(items.slice(0, safeStart));
  state._playlistShuffleHistory = [];
  await resolveItemUrl(state.playlistQueue[0]);
  playTrack(state.playlistQueue[0]);
  updateModeDisplay();
  showModeToast('歌单内播放');
}

export function exitPlaylistMode({ silent } = {}) {
  state.isPlaylistMode = false;
  state.playlistQueue = [];
  state.playlistModeMeta = null;
  state._playlistShuffleHistory = [];
  updateModeDisplay();
  if (!silent) showModeToast('已退出歌单模式');
}

export function updateModeDisplay() {
  dom.fmBadge.style.display = state.isFmMode ? '' : 'none';
  dom.smartBadge.style.display = state.isSmartMode ? '' : 'none';
  if (state.isFmMode) {
    dom.playerStatus.textContent = 'FM MODE';
  } else if (state.isSmartMode) {
    dom.playerStatus.textContent = 'SMART';
  } else if (state.isPlaylistMode) {
    dom.playerStatus.textContent = 'PLAYLIST';
  } else {
    dom.playerStatus.textContent = 'READY';
  }
  updatePlayModeUI();
}

const PLAY_MODE_LABELS = { list: ICONS.list, single: ICONS.repeat, shuffle: ICONS.shuffle };

export function updatePlayModeUI() {
  const disabled = state.isFmMode || state.isSmartMode;
  dom.playModeBtn.innerHTML = PLAY_MODE_LABELS[state.playMode] || PLAY_MODE_LABELS.list;
  dom.playModeBtn.classList.toggle('disabled', disabled);
}

export function setPlayMode(mode) {
  state.playMode = mode;
  if (mode !== 'shuffle') state._shuffleHistory = [];
  localStorage.setItem('claudio-playmode', mode);
  updatePlayModeUI();
  dom.playModeDropdown.style.display = 'none';
}

function recordPlayback(item) {
  if (!item.songId) return Promise.resolve();
  return fetch('/api/history/record', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ songId: item.songId, name: item.name, artist: item.artist }),
  }).catch((err) => console.warn('[history] record failed', err));
}

let playRequestToken = 0;

function recordConfirmedPlayback(item, token, expectedUrl) {
  return audio.play()
    .then(() => {
      if (token === playRequestToken && state.currentTrack === item && audio.src === expectedUrl) {
        return recordPlayback(item);
      }
    })
    .catch(() => {});
}

export function playTrack(item) {
  if (!item || !item.url) return Promise.resolve();
  const token = ++playRequestToken;
  const audioUrl = resolveAudioUrl(item.url);
  state.currentTrack = item;
  audio.src = audioUrl;
  const recordDone = recordConfirmedPlayback(item, token, audio.src);
  dom.nowPlaying.textContent = `${item.name} - ${item.artist}`;
  dom.onAir.classList.add('active');
  addChatMessage(`🎵 Now playing: ${item.name} — ${item.artist}`, 'system');

  if (item.songId && state.lovedSongs.has(item.songId)) {
    dom.loveBtn.innerHTML = ICONS['heart-filled'];
    dom.loveBtn.classList.add('loved');
  } else {
    dom.loveBtn.innerHTML = ICONS.heart;
    dom.loveBtn.classList.remove('loved');
  }

  if (dom.arcIndicator) {
    const trackIdx = state.queue.findIndex(t => t.songId === item.songId);
    const totalSteps = state._arcSteps || 0;
    if (totalSteps > 1 && trackIdx >= 0) {
      dom.arcIndicator.textContent = `情绪过渡 ${trackIdx + 1}/${Math.min(totalSteps, state.queue.length)}`;
      dom.arcIndicator.style.display = '';
    } else {
      dom.arcIndicator.style.display = 'none';
    }
  }

  state.currentLyrics = [];
  state.currentLyricIndex = -1;
  dom.lyricsContainer.classList.add('empty');
  if (item.songId) {
    fetch(`/api/lyric?songId=${item.songId}`)
      .then(r => r.json())
      .then(data => {
        state.currentLyrics = parseLRC(data.lyric);
        state.currentLyricIndex = -1;
        updateLyrics(audio.currentTime);
      })
      .catch(() => {});
  }

  updateMediaSession(item);
  return recordDone;
}

function updateMediaSession(item) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: item.name || 'Claudio',
    artist: item.artist || 'Claudio FM',
    album: 'Claudio FM',
  });
  navigator.mediaSession.setActionHandler('play', () => audio.play().catch(() => {}));
  navigator.mediaSession.setActionHandler('pause', () => audio.pause());
  navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
  navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
}

function replayCurrentTrack() {
  if (!state.currentTrack || !state.currentTrack.url) return Promise.resolve();
  const item = state.currentTrack;
  const token = ++playRequestToken;
  const audioUrl = audio.src;
  audio.currentTime = 0;
  dom.onAir.classList.add('active');
  dom.playBtn.innerHTML = ICONS.pause;
  return recordConfirmedPlayback(item, token, audioUrl);
}

let _fetchingFm = false;

async function fetchNextFm() {
  if (_fetchingFm) return;
  _fetchingFm = true;
  try {
    const res = await fetch('/api/play/fm/next', { method: 'POST' });
    if (!res.ok) { state.isFmMode = false; updateModeDisplay(); showModeToast('FM 播放结束'); return; }
    const item = await res.json();
    if (!item || !item.url) { state.isFmMode = false; updateModeDisplay(); showModeToast('FM 播放结束'); return; }
    playTrack(item);
    state.isFmMode = true;
    updateModeDisplay();
  } catch {
    state.isFmMode = false;
    updateModeDisplay();
  } finally {
    _fetchingFm = false;
  }
}

export async function exitMode() {
  try { await fetch('/api/play/mode/exit', { method: 'POST' }); } catch { /* ok */ }
  state.isFmMode = false;
  state.isSmartMode = false;
  updateModeDisplay();
  showModeToast('已退出');
}

export async function nextTrack() {
  if (state.isFmMode) {
    await fetchNextFm();
    return;
  }
  const queue = getPlaybackQueue();
  const shuffleHistory = getShuffleHistory();
  if (queue.length === 0) return;
  if (!state.isSmartMode && state.playMode === 'single') {
    replayCurrentTrack();
    return;
  }
  if (!state.isSmartMode && state.playMode === 'shuffle' && queue.length > 1) {
    shuffleHistory.push(queue[0]);
    const rndIdx = 1 + Math.floor(Math.random() * (queue.length - 1));
    const next = queue.splice(rndIdx, 1)[0];
    queue.unshift(next);
    await resolveItemUrl(queue[0]);
    playTrack(queue[0]);
    refreshPlaybackQueueUi();
    return;
  }
  if (queue.length > 1) {
    const next = queue.shift();
    queue.push(next);
    await resolveItemUrl(queue[0]);
    playTrack(queue[0]);
    refreshPlaybackQueueUi();
  }
}

export async function prevTrack() {
  if (state.isFmMode) {
    await fetchNextFm();
    return;
  }
  const queue = getPlaybackQueue();
  const shuffleHistory = getShuffleHistory();
  if (queue.length === 0) return;
  if (!state.isSmartMode && state.playMode === 'single') {
    replayCurrentTrack();
    return;
  }
  if (!state.isSmartMode && state.playMode === 'shuffle') {
    if (shuffleHistory.length > 0) {
      const prev = shuffleHistory.pop();
      const dupIdx = queue.findIndex(t => t.songId === prev.songId && t.name === prev.name);
      if (dupIdx >= 0) queue.splice(dupIdx, 1);
      queue.unshift(prev);
      await resolveItemUrl(queue[0]);
      playTrack(queue[0]);
      refreshPlaybackQueueUi();
    } else {
      replayCurrentTrack();
    }
    return;
  }
  if (queue.length > 1) {
    const prev = queue.pop();
    queue.unshift(prev);
    await resolveItemUrl(queue[0]);
    playTrack(queue[0]);
    refreshPlaybackQueueUi();
  }
}

// ── init event listeners ──
export function init() {
  dom.playBtn.addEventListener('click', () => togglePlay());
  dom.prevBtn.addEventListener('click', () => prevTrack());
  dom.nextBtn.addEventListener('click', () => nextTrack());

  dom.volumeSlider.addEventListener('input', () => {
    state.volume = parseInt(dom.volumeSlider.value);
    audio.volume = state.volume / 100;
    localStorage.setItem('claudio-volume', String(state.volume));
  });

  const progressContainer = document.querySelector('.progress-container');
  if (progressContainer) {
    let dragging = false;
    const seek = (e) => {
      const rect = progressContainer.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      if (audio.duration) audio.currentTime = pct * audio.duration;
    };
    progressContainer.addEventListener('mousedown', (e) => { dragging = true; seek(e); });
    document.addEventListener('mousemove', (e) => { if (!dragging) return; seek(e); });
    document.addEventListener('mouseup', () => { dragging = false; });
  }

  dom.fmBtn.addEventListener('click', async () => {
    if (state.isFmMode) { await exitMode(); return; }
    try {
      const res = await fetch('/api/play/fm/start', { method: 'POST' });
      if (!res.ok) showModeToast('FM 启动失败');
    } catch { showModeToast('FM 启动失败'); }
  });

  dom.smartBtn.addEventListener('click', async () => {
    if (state.isSmartMode) { await exitMode(); return; }
    const track = state.currentTrack;
    if (!track || !track.songId) { showModeToast('请先播放一首歌'); return; }
    try {
      const res = await fetch('/api/play/intelligence/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId: track.songId }),
      });
      if (!res.ok) showModeToast('智能模式不可用');
    } catch { showModeToast('智能模式启动失败'); }
  });

  dom.loveBtn.addEventListener('click', async () => {
    const track = state.currentTrack;
    if (!track || !track.songId) return;
    const loved = state.lovedSongs.has(track.songId);
    try {
      const res = await fetch('/api/favorites/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId: track.songId, name: track.name, artist: track.artist }),
      });
      const data = await res.json();
      if (data.loved) {
        state.lovedSongs.add(track.songId);
        dom.loveBtn.innerHTML = ICONS['heart-filled'];
        dom.loveBtn.classList.add('loved');
      } else {
        state.lovedSongs.delete(track.songId);
        dom.loveBtn.innerHTML = ICONS.heart;
        dom.loveBtn.classList.remove('loved');
      }
    } catch { /* ignore */ }
  });

  dom.similarBtn.addEventListener('click', async () => {
    const track = state.currentTrack;
    if (!track || !track.songId) { showModeToast('请先播放一首歌'); return; }
    const label = dom.similarBtn.innerHTML;
    dom.similarBtn.disabled = true;
    dom.similarBtn.textContent = '…';
    try {
      const res = await fetch('/api/play/similar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId: track.songId }),
      });
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      const songs = data.songs || [];
      if (songs.length === 0) { showModeToast('没有找到相似歌曲'); return; }
      state.queue.push(...songs);
      setQueue(state.queue);
      showModeToast(`已添加 ${songs.length} 首相似歌曲`);
    } catch { showModeToast('获取相似歌曲失败'); }
    finally { dom.similarBtn.innerHTML = label; dom.similarBtn.disabled = false; }
  });
}
