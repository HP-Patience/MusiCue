// Claudio FM — 历史播放面板
import { state } from './state.js';
import { dom } from './dom.js';
import { playNowInQueue, showModeToast } from './audio-core.js';

const PAGE_SIZE = 20;

function formatPlayedAt(value) {
  if (!value) return '';
  const date = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderPagination(page, totalPages) {
  if (totalPages <= 1) return null;
  const wrap = document.createElement('div');
  wrap.className = 'history-pagination';

  for (let p = 1; p <= totalPages; p += 1) {
    const btn = document.createElement('button');
    btn.className = 'history-page-btn' + (p === page ? ' active' : '');
    btn.textContent = String(p);
    btn.disabled = p === page;
    btn.addEventListener('click', () => renderHistoryPanel(p));
    wrap.appendChild(btn);
  }

  return wrap;
}

async function playHistoryItem(item, button) {
  button.textContent = '…';
  button.disabled = true;
  try {
    const res = await fetch('/api/play/by-id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ songId: item.song_id }),
    });
    const playable = await res.json();
    if (!playable.url) {
      showModeToast('历史歌曲暂不可播放');
      return;
    }
    await playNowInQueue(playable);
    await renderHistoryPanel(1);
  } catch {
    showModeToast('历史歌曲播放失败');
  } finally {
    button.textContent = '▶';
    button.disabled = false;
  }
}

function renderItems(items) {
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'track-item history-item';

    const info = document.createElement('div');
    info.className = 'track-item-info';

    const name = document.createElement('div');
    name.className = 'track-item-name';
    name.textContent = item.song_name;

    const artist = document.createElement('div');
    artist.className = 'track-item-artist';
    artist.textContent = item.artist;

    const time = document.createElement('div');
    time.className = 'history-time';
    time.textContent = formatPlayedAt(item.played_at);

    info.appendChild(name);
    info.appendChild(artist);
    info.appendChild(time);
    row.appendChild(info);

    const playBtn = document.createElement('button');
    playBtn.className = 'track-action';
    playBtn.textContent = '▶';
    playBtn.title = 'Play again';
    playBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      playHistoryItem(item, playBtn);
    });
    row.appendChild(playBtn);

    dom.historyPanel.appendChild(row);
  }
}

export async function renderHistoryPanel(page = 1) {
  dom.historyPanel.innerHTML = '<div class="panel-empty">Loading...</div>';
  try {
    const res = await fetch(`/api/history?page=${page}&pageSize=${PAGE_SIZE}`);
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    const items = data.items || [];

    dom.historyPanel.innerHTML = '';
    if (items.length === 0) {
      dom.historyPanel.innerHTML = '<div class="panel-empty">暂无播放记录</div>';
      return;
    }

    renderItems(items);
    const pagination = renderPagination(data.page || page, data.totalPages || 0);
    if (pagination) dom.historyPanel.appendChild(pagination);
  } catch {
    dom.historyPanel.innerHTML = '<div class="panel-empty">加载历史失败 <button class="history-retry" type="button">重试</button></div>';
    dom.historyPanel.querySelector('.history-retry')?.addEventListener('click', () => renderHistoryPanel(page));
  }
}
