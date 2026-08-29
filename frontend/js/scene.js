// Claudio FM — 场景与启动
import { state, userCoords } from './state.js';
import { dom } from './dom.js';
import { resolveItemUrl, playTrack, setQueue, updateModeDisplay, updatePlayModeUI } from './audio-core.js';

export async function loadHistory() {
  const chatModule = await import('./chat.js');
  try {
    const res = await fetch('/api/messages');
    const data = await res.json();
    if (data.messages && data.messages.length > 0) {
      for (const msg of data.messages) {
        const role = msg.role === 'user' ? 'user' : 'ai';
        chatModule.addChatMessage(msg.content, role, msg.created_at);
      }
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

export async function fetchWeather() {
  if (userCoords.lat == null || userCoords.lon == null) return;
  try {
    const res = await fetch(`/api/weather?lat=${userCoords.lat}&lon=${userCoords.lon}`);
    const data = await res.json();
    if (data.city) {
      dom.onAir.innerHTML = '';
      const dot = document.createElement('span');
      dot.className = 'on-air-dot';
      dom.onAir.appendChild(dot);
      dom.onAir.appendChild(document.createTextNode(`ON AIR  ☼ ${data.city} ${data.temp}°C ${data.description}`));
    }
  } catch { /* ignore */ }
}

export async function init() {
  // Check NCM login status
  const ncmModule = await import('./ncm-auth.js');
  const chatModule = await import('./chat.js');
  const queueModule = await import('./queue-panel.js');
  try {
    const loginRes = await fetch('/api/ncm/login/status');
    const loginData = await loginRes.json();
    state.ncmLoggedIn = loginData.loggedIn;
    state.ncmVipType = loginData.vipType || 0;
    state.ncmNickname = loginData.nickname || '';
    ncmModule.updateLoginBtn();
  } catch { /* ignore */ }

  const favsModule = await import('./favs-panel.js');
  await favsModule.loadFavorites();

  // Geolocation for weather and suggested queue
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        userCoords.lat = pos.coords.latitude;
        userCoords.lon = pos.coords.longitude;
        await fetchWeather();

        try {
          const params = new URLSearchParams({ lat: String(userCoords.lat), lon: String(userCoords.lon) });
          const r = await fetch('/api/queue/suggested?' + params);
          const data = await r.json();
          if (data.play && data.play.length > 0) {
            chatModule.addChatMessage(data.say, 'ai');
            state.queue = data.play.map(q => ({ songId: '', name: q, artist: '', url: '' }));
            setQueue(state.queue);
            state._currentScene = data.scene.scene;
            chatModule.addChatMessage(`📋 场景推荐 (${data.scene.scene}): ${data.reason}`, 'system');
            await resolveItemUrl(state.queue[0]);
            state._pendingPlay = state.queue[0];
            queueModule.renderQueuePanel();
          }
        } catch { /* ignore */ }
      },
      () => { /* user denied */ },
      { timeout: 5000 },
    );
  }

  const hasHistory = await loadHistory();
  if (!hasHistory) {
    chatModule.addChatMessage('你好！我是 MusiCue，你的私人 AI 电台 DJ。想听什么？', 'ai');
  }

  updatePlayModeUI();

  // Deferred play on first user interaction
  const firstInteraction = () => {
    if (state._pendingPlay) {
      playTrack(state._pendingPlay);
      state._pendingPlay = null;
    }
    document.removeEventListener('click', firstInteraction);
    document.removeEventListener('keydown', firstInteraction);
  };
  document.addEventListener('click', firstInteraction);
  document.addEventListener('keydown', firstInteraction);
}
