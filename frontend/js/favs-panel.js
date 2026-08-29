// Claudio FM — 收藏面板
import { state } from './state.js';
import { dom } from './dom.js';
import { ICONS } from './icons.js';
import { playNowInQueue } from './audio-core.js';

export async function loadFavorites() {
  try {
    const res = await fetch('/api/favorites');
    const data = await res.json();
    for (const fav of data.favorites || []) {
      state.lovedSongs.add(fav.song_id);
    }
    dom.favsCount.textContent = String(data.favorites?.length || 0);
  } catch { /* ignore */ }
}

export async function renderFavsPanel() {
  dom.favsPanel.innerHTML = '<div class="panel-empty">Loading...</div>';
  try {
    const res = await fetch('/api/favorites');
    const data = await res.json();
    const favs = data.favorites || [];
    dom.favsCount.textContent = String(favs.length);
    dom.favsPanel.innerHTML = '';

    if (favs.length === 0) {
      dom.favsPanel.innerHTML = '<div class="panel-empty">No favorites yet</div>';
      return;
    }

    for (const fav of favs) {
      const el = document.createElement('div');
      el.className = 'track-item';
      const info = document.createElement('div');
      info.className = 'track-item-info';
      const name = document.createElement('div');
      name.className = 'track-item-name';
      name.textContent = fav.song_name;
      const artist = document.createElement('div');
      artist.className = 'track-item-artist';
      artist.textContent = fav.artist;
      info.appendChild(name);
      info.appendChild(artist);
      el.appendChild(info);

      const playBtn = document.createElement('button');
      playBtn.className = 'track-action';
      playBtn.textContent = '▶';
      playBtn.title = 'Play now';
      playBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        playBtn.textContent = '…';
        playBtn.disabled = true;
        try {
          const chatModule = await import('./chat.js');
          const r = await fetch('/api/play/by-id', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ songId: fav.song_id }),
          });
          const item = await r.json();
          if (!item.url) {
            chatModule.addChatMessage(`无法获取 ${item.name} 的播放链接`, 'system');
            return;
          }
          playNowInQueue(item);
        } catch (err) {
          const chatModule = await import('./chat.js');
          chatModule.addChatMessage(`播放失败: ${err.message}`, 'system');
        } finally {
          playBtn.textContent = '▶';
          playBtn.disabled = false;
        }
      });
      el.appendChild(playBtn);

      const rmBtn = document.createElement('button');
      rmBtn.className = 'track-action';
      rmBtn.innerHTML = ICONS['heart-filled'];
      rmBtn.title = 'Remove favorite';
      rmBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await fetch('/api/favorites/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ songId: fav.song_id, name: fav.song_name, artist: fav.artist }),
        });
        state.lovedSongs.delete(fav.song_id);
        if (state.currentTrack?.songId === fav.song_id) {
          dom.loveBtn.innerHTML = ICONS.heart;
          dom.loveBtn.classList.remove('loved');
        }
        renderFavsPanel();
      });
      el.appendChild(rmBtn);

      dom.favsPanel.appendChild(el);
    }
  } catch {
    dom.favsPanel.innerHTML = '<div class="panel-empty">Failed to load favorites</div>';
  }
}
