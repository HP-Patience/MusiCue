// Claudio FM — Toast 通知
import { state } from './state.js';
import { dom } from './dom.js';

let pendingSuggestions = [];

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

export function showToast(s) {
  if (pendingSuggestions.some(p => p.id === s.id)) return;

  pendingSuggestions.push(s);
  updateBellBadge();

  const toast = document.createElement('div');
  toast.className = 'toast-card';
  const toastText = document.createElement('span');
  toastText.className = 'toast-text';
  toastText.textContent = s.text;
  const toastActions = document.createElement('div');
  toastActions.className = 'toast-actions';
  const playBtn = document.createElement('button');
  playBtn.className = 'toast-btn play';
  playBtn.dataset.scene = s.scene;
  playBtn.textContent = '播放';
  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'toast-btn dismiss';
  dismissBtn.textContent = '忽略';
  toastActions.appendChild(playBtn);
  toastActions.appendChild(dismissBtn);
  toast.appendChild(toastText);
  toast.appendChild(toastActions);

  const removeSuggestion = () => {
    if (toast.parentNode) toast.remove();
    pendingSuggestions = pendingSuggestions.filter(p => p.id !== s.id);
    updateBellBadge();
  };

  toast.querySelector('.play').addEventListener('click', async () => {
    removeSuggestion();
    const hints = {
      birthday: '来点庆祝的歌', rainy_evening: '来点爵士', late_night: '来点轻柔助眠的',
      morning_commute: '来点提神的', friday_night: '来点放松的', weekend_chill: '来点轻松的',
    };
    dom.chatInput.value = hints[s.scene] || '来点音乐';
    // Trigger send in chat module
    const event = new KeyboardEvent('keydown', { key: 'Enter' });
    dom.chatInput.dispatchEvent(event);
  });

  toast.querySelector('.dismiss').addEventListener('click', removeSuggestion);

  dom.toastContainer.appendChild(toast);
  setTimeout(removeSuggestion, 15000);
}

function updateBellBadge() {
  const count = pendingSuggestions.length;
  if (count > 0) {
    dom.bellBtn.style.display = '';
    dom.bellBadge.style.display = '';
    dom.bellBadge.textContent = String(count);
  } else {
    dom.bellBtn.style.display = 'none';
    dom.bellBadge.style.display = 'none';
  }
}

export function init() {
  dom.bellBtn?.addEventListener('click', () => {
    const latest = pendingSuggestions[pendingSuggestions.length - 1];
    if (latest) showToast(latest);
  });
}
