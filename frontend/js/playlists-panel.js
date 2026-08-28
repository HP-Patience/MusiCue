// Claudio FM — 歌单面板
import { state } from './state.js';
import { dom } from './dom.js';
import { playTrack, setQueue, showModeToast, enterPlaylistMode, exitPlaylistMode, removePlaylistTrack } from './audio-core.js';

export async function renderPlaylistsPanel() {
  state._playlists = [];
  dom.playlistsPanel.innerHTML = '';

  const bar = document.createElement('div');
  bar.className = 'playlist-create-bar';
  const createBtn = document.createElement('button');
  createBtn.className = 'playlist-create-btn';
  createBtn.textContent = '+ 创建歌单';
  createBtn.addEventListener('click', openPlaylistCreateModal);
  bar.appendChild(createBtn);
  dom.playlistsPanel.appendChild(bar);

  if (!state.ncmLoggedIn) {
    const empty = document.createElement('div');
    empty.className = 'panel-empty';
    empty.textContent = '请先登录网易云';
    dom.playlistsPanel.appendChild(empty);
    return;
  }

  try {
    const res = await fetch('/api/ncm/playlists');
    if (!res.ok) { dom.playlistsPanel.innerHTML = '<div class="panel-empty">获取歌单失败</div>'; return; }
    const data = await res.json();
    const playlists = data.playlists || [];

    if (playlists.length === 0) {
      dom.playlistsPanel.innerHTML += '<div class="panel-empty">暂无歌单</div>';
      return;
    }

    for (const pl of playlists) {
      const card = document.createElement('div');
      card.className = 'playlist-card';
      card.dataset.pid = pl.id;

      if (pl.coverImgUrl) {
        const img = document.createElement('img');
        img.className = 'playlist-card-cover';
        img.src = pl.coverImgUrl + '?param=88y88';
        img.alt = '';
        card.appendChild(img);
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'playlist-card-cover-placeholder';
        placeholder.textContent = '♫';
        card.appendChild(placeholder);
      }

      const info = document.createElement('div');
      info.className = 'playlist-card-info';
      const name = document.createElement('div');
      name.className = 'playlist-card-name';
      name.textContent = pl.name;
      const meta = document.createElement('div');
      meta.className = 'playlist-card-meta';
      meta.textContent = `${pl.trackCount} 首`;
      info.appendChild(name);
      info.appendChild(meta);
      card.appendChild(info);

      card.addEventListener('click', () => showPlaylistDetail(pl.id));
      dom.playlistsPanel.appendChild(card);
    }
  } catch {
    dom.playlistsPanel.innerHTML = '<div class="panel-empty">加载失败</div>';
  }
}

async function showPlaylistDetail(pid) {
  dom.playlistsPanel.innerHTML = '';

  const bar = document.createElement('div');
  bar.className = 'playlist-detail-bar';
  const backBtn = document.createElement('button');
  backBtn.className = 'playlist-back-btn';
  backBtn.textContent = '← 歌单';
  backBtn.addEventListener('click', renderPlaylistsPanel);
  bar.appendChild(backBtn);
  dom.playlistsPanel.appendChild(bar);

  const container = document.createElement('div');
  container.id = `pl-tracks-${pid}`;
  container.className = 'playlist-tracks';
  container.innerHTML = '<div class="panel-empty" style="padding:24px">加载中...</div>';
  dom.playlistsPanel.appendChild(container);

  try {
    const res = await fetch(`/api/ncm/playlist/${pid}`);
    if (!res.ok) { container.innerHTML = '<div class="panel-empty" style="padding:24px">获取失败</div>'; return; }
    const data = await res.json();
    const tracks = data.tracks || [];
    const pl = data.playlist || {};

    const header = document.createElement('div');
    header.className = 'playlist-detail-header';
    if (pl.coverImgUrl) {
      const img = document.createElement('img');
      img.className = 'playlist-detail-cover';
      img.src = pl.coverImgUrl + '?param=256y256';
      img.alt = '';
      header.appendChild(img);
    }
    const headerInfo = document.createElement('div');
    headerInfo.className = 'playlist-detail-info';
    const hName = document.createElement('div');
    hName.className = 'playlist-detail-name';
    hName.textContent = pl.name;
    const hMeta = document.createElement('div');
    hMeta.className = 'playlist-detail-meta';
    hMeta.textContent = `${pl.trackCount} 首`;
    headerInfo.appendChild(hName);
    headerInfo.appendChild(hMeta);
    const modeBtn = document.createElement('button');
    const updateModeBtn = () => {
      const active = state.isPlaylistMode && state.playlistModeMeta?.id === pid;
      modeBtn.className = `playlist-mode-btn${active ? ' active' : ''}`;
      modeBtn.textContent = active ? '退出歌单模式' : '歌单内播放';
    };
    updateModeBtn();
    modeBtn.addEventListener('click', async () => {
      if (state.isPlaylistMode && state.playlistModeMeta?.id === pid) {
        exitPlaylistMode();
      } else {
        await enterPlaylistMode({ id: pid, name: pl.name, tracks });
      }
      updateModeBtn();
    });
    headerInfo.appendChild(modeBtn);
    header.appendChild(headerInfo);
    container.before(header);

    if (tracks.length === 0) {
      container.innerHTML = '<div class="panel-empty" style="padding:24px">歌单为空</div>';
      return;
    }

    container.innerHTML = '';
    for (const t of tracks) {
      const el = document.createElement('div');
      el.className = 'playlist-track-item';

      const info = document.createElement('div');
      info.className = 'playlist-track-info';
      const name = document.createElement('div');
      name.className = 'playlist-track-name';
      name.textContent = t.name;
      const artist = document.createElement('div');
      artist.className = 'playlist-track-artist';
      artist.textContent = t.artist;
      info.appendChild(name);
      info.appendChild(artist);
      el.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'playlist-track-actions';

      const playBtn = document.createElement('button');
      playBtn.className = 'playlist-track-btn';
      playBtn.textContent = '▶';
      playBtn.title = '播放';
      playBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        playBtn.textContent = '…';
        playBtn.disabled = true;
        try {
          const r = await fetch('/api/play/by-id', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ songId: t.id }),
          });
          const item = await r.json();
          if (!item.url) { showModeToast('无法获取播放链接'); return; }
          if (state.isPlaylistMode) exitPlaylistMode({ silent: true, preserveCurrent: false });
          state.queue.unshift(item);
          setQueue(state.queue);
          playTrack(item);
        } catch { showModeToast('播放失败'); }
        finally { playBtn.textContent = '▶'; playBtn.disabled = false; }
      });
      actions.appendChild(playBtn);

      const delBtn = document.createElement('button');
      delBtn.className = 'playlist-track-btn danger';
      delBtn.textContent = '×';
      delBtn.title = '从歌单删除';
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          const r = await fetch(`/api/ncm/playlist/${pid}/tracks`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trackIds: [t.id] }),
          });
          if (!r.ok) { showModeToast('删除失败'); return; }
          showModeToast('已删除');
          if (state.isPlaylistMode && state.playlistModeMeta?.id === pid) removePlaylistTrack(t.id);
          el.remove();
          const hMeta = dom.playlistsPanel.querySelector('.playlist-detail-meta');
          if (hMeta) {
            const match = hMeta.textContent.match(/(\d+)/);
            if (match) hMeta.textContent = `${parseInt(match[1]) - 1} 首`;
          }
        } catch { showModeToast('删除失败'); }
      });
      actions.appendChild(delBtn);

      el.appendChild(actions);
      container.appendChild(el);
    }
  } catch {
    container.innerHTML = '<div class="panel-empty" style="padding:12px">加载失败</div>';
  }
}

// ── Add to playlist dropdown ──
export function initAddToPlaylist() {
  dom.addToPlaylistBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const dropdown = dom.addToPlaylistDropdown;
    if (dropdown.style.display !== 'none') { dropdown.style.display = 'none'; return; }

    if (!state.ncmLoggedIn) { showModeToast('请先登录网易云'); return; }

    const track = state.currentTrack;
    if (!track || !track.songId) { showModeToast('请先播放一首歌'); return; }

    dropdown.innerHTML = '<div class="add-to-playlist-empty">加载中...</div>';
    dropdown.style.display = '';

    if (state._playlists.length === 0) {
      try {
        const res = await fetch('/api/ncm/playlists');
        if (!res.ok) { dropdown.innerHTML = '<div class="add-to-playlist-empty">获取失败</div>'; return; }
        const data = await res.json();
        state._playlists = data.playlists || [];
      } catch {
        dropdown.innerHTML = '<div class="add-to-playlist-empty">加载失败</div>';
        return;
      }
    }

    if (state._playlists.length === 0) {
      dropdown.innerHTML = '<div class="add-to-playlist-empty">暂无歌单</div>';
      return;
    }

    dropdown.innerHTML = '';
    for (const pl of state._playlists) {
      const item = document.createElement('div');
      item.className = 'add-to-playlist-item';
      item.textContent = `${pl.name} (${pl.trackCount})`;
      item.addEventListener('click', async () => {
        try {
          const detailRes = await fetch(`/api/ncm/playlist/${pl.id}`);
          if (detailRes.ok) {
            const detail = await detailRes.json();
            const allTrackIds = detail.allTrackIds ?? [];
            if (allTrackIds.includes(Number(track.songId))) {
              showModeToast('已在歌单中');
              dropdown.style.display = 'none';
              return;
            }
          }
        } catch { /* fall through */ }

        try {
          const r = await fetch(`/api/ncm/playlist/${pl.id}/tracks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trackIds: [Number(track.songId)] }),
          });
          if (!r.ok) { showModeToast('添加失败'); return; }
          showModeToast(`已添加到「${pl.name}」`);
          pl.trackCount++;
        } catch { showModeToast('添加失败'); }
        dropdown.style.display = 'none';
      });
      dropdown.appendChild(item);
    }
  });
}

// ── Create playlist modal ──
function openPlaylistCreateModal() {
  if (!state.ncmLoggedIn) { showModeToast('请先登录网易云'); return; }
  dom.playlistName.value = '';
  dom.playlistPrivate.checked = false;
  dom.playlistCreateStatus.textContent = '';
  dom.playlistCreateModal.classList.add('open');
  dom.playlistName.focus();
}

function closePlaylistCreateModal() {
  dom.playlistCreateModal.classList.remove('open');
}

export function initPlaylistCreateModal() {
  dom.playlistCreateClose.addEventListener('click', closePlaylistCreateModal);
  dom.playlistCreateCancel.addEventListener('click', closePlaylistCreateModal);
  let _mousedown = null;
  dom.playlistCreateModal.addEventListener('mousedown', (e) => { _mousedown = e.target; });
  dom.playlistCreateModal.addEventListener('click', (e) => {
    if (e.target === dom.playlistCreateModal && _mousedown === dom.playlistCreateModal) closePlaylistCreateModal();
  });

  dom.playlistCreateConfirm.addEventListener('click', async () => {
    const name = dom.playlistName.value.trim();
    if (!name) { dom.playlistCreateStatus.textContent = '请输入歌单名称'; dom.playlistCreateStatus.className = 'form-status error'; return; }

    dom.playlistCreateConfirm.disabled = true;
    dom.playlistCreateStatus.textContent = '创建中...';
    dom.playlistCreateStatus.className = 'form-status';

    try {
      const res = await fetch('/api/ncm/playlist/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, privacy: dom.playlistPrivate.checked }),
      });
      const data = await res.json();
      if (!res.ok || !data.playlist) throw new Error(data.error || '创建失败');
      dom.playlistCreateStatus.textContent = `✓ 已创建「${data.playlist.name}」`;
      dom.playlistCreateStatus.className = 'form-status success';
      setTimeout(() => {
        closePlaylistCreateModal();
        renderPlaylistsPanel();
      }, 1000);
    } catch (err) {
      dom.playlistCreateStatus.textContent = `✗ ${err.message}`;
      dom.playlistCreateStatus.className = 'form-status error';
    } finally {
      dom.playlistCreateConfirm.disabled = false;
    }
  });
}
