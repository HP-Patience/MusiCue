// Claudio FM — WebSocket
import { state } from './state.js';
import { dom } from './dom.js';
import { ICONS } from './icons.js';
import { setQueue, playTrack, updateModeDisplay, showModeToast, exitPlaylistMode } from './audio-core.js';

let wsReconnectTimer = null;

export function connectWs() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${location.host}/stream`);

  ws.onopen = () => {
    dom.connectionStatus.textContent = 'CONNECTED';
    dom.connectionStatus.className = 'connected';
    if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }
  };

  ws.onclose = () => {
    dom.connectionStatus.textContent = 'DISCONNECTED';
    dom.connectionStatus.className = 'disconnected';
    wsReconnectTimer = setTimeout(connectWs, 3000);
  };

  ws.onmessage = (event) => {
    import('./chat.js').then(chatModule => {
      const addChatMessage = chatModule.addChatMessage;
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'play':
            if (msg.payload?.tracks) {
              if (state.isPlaylistMode) exitPlaylistMode({ silent: true, preserveCurrent: false });
              const becameFm = !!msg.payload.fm && !state.isFmMode;
              const becameSmart = !!msg.payload.smart && !state.isSmartMode;
              state.isFmMode = !!msg.payload.fm;
              state.isSmartMode = !!msg.payload.smart;
              if (!state.isFmMode && !state.isSmartMode) {
                state.isFmMode = false;
                state.isSmartMode = false;
              }
              if (msg.payload.arc) {
                state._arcSteps = msg.payload.arc.steps;
              }
              updateModeDisplay();
              if (becameFm) showModeToast('FM 私人电台');
              if (becameSmart) showModeToast('心动智能模式');
              setQueue(msg.payload.tracks);
              playTrack(msg.payload.tracks[0]);
            }
            break;
          case 'say':
            if (msg.payload?.text) {
              addChatMessage(msg.payload.text, 'ai');
            }
            break;
          case 'mode_exit':
            state.isFmMode = false;
            state.isSmartMode = false;
            updateModeDisplay();
            break;
          case 'token_usage':
            if (msg.payload) {
              const pct = ((msg.payload.input_tokens / msg.payload.context_window) * 100).toFixed(1);
              dom.tokenUsage.textContent = `${(msg.payload.input_tokens / 1000).toFixed(1)}K / ${(msg.payload.context_window / 1000).toFixed(0)}K (${pct}%)`;
            }
            break;
          case 'status':
            if (msg.payload?.isPlaying !== undefined) state.isPlaying = msg.payload.isPlaying;
            break;
          case 'correction':
            if (msg.payload?.say) {
              addChatMessage(msg.payload.say, 'ai');
            }
            break;
          case 'suggestion':
            {
              const s = msg.payload;
              if (!s) break;
              const suggestionsOff = localStorage.getItem('claudio-suggestions') === 'off';
              if (suggestionsOff) break;
              import('./toast.js').then(toastModule => toastModule.showToast(s));
            }
            break;
        }
      } catch { /* ignore parse errors */ }
    });
  };
}

export function init() {
  connectWs();
}
