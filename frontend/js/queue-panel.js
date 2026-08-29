// Claudio FM — 队列面板
import { state } from './state.js';
import { dom } from './dom.js';
import { ICONS } from './icons.js';
import { resolveItemUrl, playTrack, exitPlaylistMode } from './audio-core.js';

export function refreshQueuePanel() {
  const panel = dom.queuePanel;
  panel.innerHTML = '';
  dom.queueCount.textContent = String(state.queue.length);

  if (state.queue.length === 0) {
    panel.innerHTML = '<div class="panel-empty">Queue is empty</div>';
    return;
  }

  state.queue.forEach((item, idx) => {
    const el = document.createElement('div');
    el.className = 'track-item' + (idx === 0 ? ' current' : '');

    const info = document.createElement('div');
    info.className = 'track-item-info';
    const name = document.createElement('div');
    name.className = 'track-item-name';
    name.textContent = (idx === 0 ? '♪ ' : '') + item.name;
    const artist = document.createElement('div');
    artist.className = 'track-item-artist';
    artist.textContent = item.artist;
    info.appendChild(name);
    info.appendChild(artist);
    el.appendChild(info);

    if (idx > 0) {
      const playBtn = document.createElement('button');
      playBtn.className = 'track-action';
      playBtn.textContent = '▶';
      playBtn.title = 'Play now';
      playBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (state.isPlaylistMode) exitPlaylistMode({ silent: true, preserveCurrent: false });
        await resolveItemUrl(state.queue[idx]);
        const [moved] = state.queue.splice(idx, 1);
        state.queue.unshift(moved);
        playTrack(state.queue[0]);
        refreshQueuePanel();
      });
      el.appendChild(playBtn);
    }

    const rmBtn = document.createElement('button');
    rmBtn.className = 'track-action';
    rmBtn.textContent = '×';
    rmBtn.title = idx === 0 ? 'Stop' : 'Remove';
    rmBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (state.isPlaylistMode) exitPlaylistMode({ silent: true, preserveCurrent: false });
      const audio = (await import('./audio-core.js')).audio;
      state.queue.splice(idx, 1);
      dom.queueCount.textContent = String(state.queue.length);
      if (idx === 0) {
        if (state.queue.length > 0) {
          await resolveItemUrl(state.queue[0]);
          playTrack(state.queue[0]);
        } else {
          audio.pause();
          audio.src = '';
          state.currentTrack = null;
          state.isPlaying = false;
          dom.playBtn.innerHTML = ICONS.play;
          dom.onAir.classList.remove('active');
          dom.nowPlaying.textContent = 'MusiCue';
          dom.waveform.classList.add('paused');
        }
      }
      refreshQueuePanel();
    });
    el.appendChild(rmBtn);

    panel.appendChild(el);
  });
}

export function renderQueuePanel() {
  refreshQueuePanel();
}
