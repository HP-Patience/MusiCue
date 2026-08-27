// Claudio FM — 入口
import { state } from './state.js';
import { dom } from './dom.js';
import { ICONS } from './icons.js';
import * as theme from './theme.js';
import * as clock from './clock.js';
import * as lyrics from './lyrics.js';
import * as audioCore from './audio-core.js';
import * as chat from './chat.js';
import * as queuePanel from './queue-panel.js';
import * as favsPanel from './favs-panel.js';
import * as statsPanel from './stats-panel.js';
import * as playlistsPanel from './playlists-panel.js';
import * as historyPanel from './history-panel.js';
import * as settings from './settings.js';
import * as ncmAuth from './ncm-auth.js';
import * as ws from './ws.js';
import * as playmode from './playmode.js';
import * as toast from './toast.js';
import * as scene from './scene.js';

// ── Wire cross-module links ──
audioCore.link(chat.addChatMessage, queuePanel.refreshQueuePanel);

// ── Init modules in dependency order ──
theme.init();
clock.init();
// Init icons
dom.playBtn.innerHTML = ICONS.play;
dom.prevBtn.innerHTML = ICONS['skip-back'];
dom.nextBtn.innerHTML = ICONS['skip-forward'];
dom.loveBtn.innerHTML = ICONS.heart;
dom.lyricToggleBtn.innerHTML = ICONS['message-circle'];

lyrics.init();
chat.init();
// audio-core init after chat/queue panel are ready
audioCore.init();
ws.init();
playmode.init();
toast.init();
ncmAuth.init();
settings.init();
settings.syncDesktopConfig();
playlistsPanel.initAddToPlaylist();
playlistsPanel.initPlaylistCreateModal();
scene.init();
dom.chatPanel.classList.add('active');

// ── Frameless desktop window controls ──
const electronWindow = window.electronWindow;
const runWindowAction = (action) => {
  if (!electronWindow?.[action]) {
    console.warn(`[window-controls] electronWindow.${action} is unavailable`);
    return;
  }
  electronWindow[action]().catch((error) => console.warn(`[window-controls] ${action} failed`, error));
};
document.getElementById('window-minimize')?.addEventListener('click', (event) => {
  event.stopPropagation();
  runWindowAction('minimize');
});
document.getElementById('window-pin')?.addEventListener('click', async (event) => {
  event.stopPropagation();
  if (!electronWindow?.pin) return;
  const button = event.currentTarget;
  try {
    const { pinned } = await electronWindow.pin();
    button.classList.toggle('active', pinned);
    button.setAttribute('aria-pressed', String(pinned));
    button.title = pinned ? '取消固定' : '固定窗口';
  } catch (error) {
    console.warn('[window-controls] pin failed', error);
  }
});
document.getElementById('window-close')?.addEventListener('click', (event) => {
  event.stopPropagation();
  runWindowAction('quit');
});
window.electronQuickInput?.onSubmit?.((text) => {
  chat.sendChat(text);
});

// ── Tab switching ──
let activePanel = 'chat';
document.querySelectorAll('.chat-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    if (activePanel === target) return;
    activePanel = target;
    document.querySelectorAll('.chat-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    dom.chatPanel.style.display = target === 'chat' ? '' : 'none';
    dom.queuePanel.style.display = target === 'queue' ? '' : 'none';
    dom.favsPanel.style.display = target === 'favs' ? '' : 'none';
    dom.statsPanel.style.display = target === 'stats' ? '' : 'none';
    dom.playlistsPanel.style.display = target === 'playlists' ? '' : 'none';
    dom.historyPanel.style.display = target === 'history' ? '' : 'none';
    dom.chatPanel.classList.toggle('active', target === 'chat');
    dom.queuePanel.classList.toggle('active', target === 'queue');
    dom.favsPanel.classList.toggle('active', target === 'favs');
    dom.statsPanel.classList.toggle('active', target === 'stats');
    dom.playlistsPanel.classList.toggle('active', target === 'playlists');
    dom.historyPanel.classList.toggle('active', target === 'history');
    dom.clearChatBtn.style.display = target === 'chat' ? '' : 'none';
    if (target === 'queue') queuePanel.renderQueuePanel();
    if (target === 'favs') favsPanel.renderFavsPanel();
    if (target === 'stats') statsPanel.renderStatsPanel();
    if (target === 'playlists') playlistsPanel.renderPlaylistsPanel();
    if (target === 'history') historyPanel.renderHistoryPanel();
  });
});

// ── Global dropdown close on outside click ──
document.addEventListener('click', (e) => {
  if (dom.addToPlaylistDropdown && !dom.addToPlaylistBtn.contains(e.target) && !dom.addToPlaylistDropdown.contains(e.target)) {
    dom.addToPlaylistDropdown.style.display = 'none';
  }
  if (dom.modelDropdown && !dom.modelDropdown.contains(e.target) && !dom.settingsFetchModels.contains(e.target)) {
    dom.modelDropdown.classList.remove('open');
  }
});

// ── Escape key closes modals ──
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && dom.settingsModal.classList.contains('open')) settings.closeSettings();
  if (e.key === 'Escape' && dom.ncmLoginModal.classList.contains('open')) ncmAuth.closeNcmLogin();
});
