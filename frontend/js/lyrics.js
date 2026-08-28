// Claudio FM — 歌词解析与同步
import { state } from './state.js';
import { dom } from './dom.js';
import { scrollChatToBottom } from './chat.js';

export function parseLRC(lrcText) {
  if (!lrcText || !lrcText.trim()) return [];
  const lines = lrcText.split('\n');
  const result = [];
  const lineRe = /^\[(\d{2}):(\d{2})(?:[\.:](\d{2,3}))?\](.*)/;
  for (const line of lines) {
    const m = line.match(lineRe);
    if (!m) continue;
    const text = m[4].trim();
    if (!text) continue;
    const mins = parseInt(m[1], 10);
    const secs = parseInt(m[2], 10);
    const ms = parseInt(m[3] || '0', 10);
    const time = mins * 60 + secs + ms / (m[3] && m[3].length === 3 ? 1000 : 100);
    result.push({ time, text });
  }
  result.sort((a, b) => a.time - b.time);
  return result;
}

export function updateLyrics(currentTime) {
  const lyrics = state.currentLyrics;
  const container = dom.lyricsContainer;
  if (!lyrics.length) {
    container.classList.add('empty');
    return;
  }
  let lo = 0, hi = lyrics.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (lyrics[mid].time > currentTime) hi = mid;
    else lo = mid + 1;
  }
  const idx = lo - 1;
  if (idx === state.currentLyricIndex) return;
  state.currentLyricIndex = idx;

  container.classList.remove('empty');
  dom.lyricPrev.textContent = idx >= 1 ? lyrics[idx - 1].text : '';
  dom.lyricCurr.textContent = idx >= 0 ? lyrics[idx].text : '';
  dom.lyricNext.textContent = idx >= 0 && idx < lyrics.length - 1 ? lyrics[idx + 1].text : '';
}

export function init() {
  dom.lyricsContainer.style.display = state.lyricsVisible ? '' : 'none';
  dom.lyricToggleBtn.classList.toggle('active', state.lyricsVisible);
  dom.lyricToggleBtn.addEventListener('click', () => {
    state.lyricsVisible = !state.lyricsVisible;
    dom.lyricsContainer.style.display = state.lyricsVisible ? '' : 'none';
    dom.lyricToggleBtn.classList.toggle('active', state.lyricsVisible);
    scrollChatToBottom();
  });
}
