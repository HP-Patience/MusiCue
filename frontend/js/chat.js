// Claudio FM — 聊天模块
import { state, userCoords } from './state.js';
import { dom } from './dom.js';

let lastAiText = '';
let clearModalMousedownTarget = null;
const userAvatarSvg = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="4" d="M19 20a7 7 0 1 0 0-14a7 7 0 0 0 0 14M33 8s2.25 4.5 0 10m7-14s4.5 8.1 0 18M4 40.8V42h30v-1.2c0-4.48 0-6.72-.872-8.432a8 8 0 0 0-3.496-3.496C27.92 28 25.68 28 21.2 28h-4.4c-4.48 0-6.72 0-8.432.872a8 8 0 0 0-3.496 3.496C4 34.08 4 36.32 4 40.8"/></svg>';
const djAvatarSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M12 3.75c-3.241 0-5.756 2.03-6.185 4.5H8a.75.75 0 0 1 .75.75v7a.75.75 0 0 1-.75.75H5A2.75 2.75 0 0 1 2.25 14v-3a2.75 2.75 0 0 1 2.035-2.656C4.667 4.84 8.074 2.25 12 2.25s7.333 2.59 7.715 6.094A2.75 2.75 0 0 1 21.75 11v3a2.75 2.75 0 0 1-2.045 2.659A4.75 4.75 0 0 1 15 20.75h-1.145a2 2 0 1 1 0-1.5H15a3.25 3.25 0 0 0 3.163-2.5H16a.75.75 0 0 1-.75-.75V9a.75.75 0 0 1 .75-.75h2.185c-.429-2.47-2.944-4.5-6.185-4.5m-7 6c-.69 0-1.25.56-1.25 1.25v3c0 .69.56 1.25 1.25 1.25h2.25v-5.5zM20.25 11c0-.69-.56-1.25-1.25-1.25h-2.25v5.5H19c.69 0 1.25-.56 1.25-1.25z" clip-rule="evenodd"/></svg>';

export function scrollChatToBottom() {
  requestAnimationFrame(() => {
    dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
  });
}

function closeClearChatModal() {
  dom.clearChatModal.classList.remove('open');
  dom.clearChatStatus.textContent = '';
  dom.clearChatStatus.className = 'form-status';
}

async function clearChatHistory() {
  dom.clearChatConfirm.disabled = true;
  dom.clearChatStatus.textContent = '正在删除...';
  dom.clearChatStatus.className = 'form-status';
  try {
    const res = await fetch('/api/messages', { method: 'DELETE' });
    if (!res.ok) throw new Error('删除失败');
    dom.chatMessages.replaceChildren();
    dom.tokenUsage.textContent = '';
    lastAiText = '';
    closeClearChatModal();
  } catch (err) {
    dom.clearChatStatus.textContent = `删除失败: ${err.message}`;
    dom.clearChatStatus.className = 'form-status error';
  } finally {
    dom.clearChatConfirm.disabled = false;
  }
}

export function addChatMessage(text, type = 'ai', createdAt) {
  if (type === 'ai' && text === lastAiText) return;
  if (type === 'ai') lastAiText = text;

  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${type}`;

  const inner = document.createElement('div');
  inner.className = 'bubble-content';

  if (type === 'ai' || type === 'user') {
    const avatar = document.createElement('div');
    avatar.className = 'bubble-avatar';
    avatar.innerHTML = type === 'ai' ? djAvatarSvg : userAvatarSvg;
    inner.appendChild(avatar);
  }

  if (type === 'now-playing') {
    const icon = document.createElement('span');
    icon.className = 'now-playing-icon';
    icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21 3H9c-.55 0-1 .45-1 1v9.56c-.59-.34-1.27-.56-2-.56c-2.21 0-4 1.79-4 4s1.79 4 4 4s4-1.79 4-4V5h10v8.56c-.59-.34-1.27-.56-2-.56c-2.21 0-4 1.79-4 4s1.79 4 4 4s4-1.79 4-4V4c0-.55-.45-1-1-1M6 19c-1.1 0-2-.9-2-2s.9-2 2-2s2 .9 2 2s-.9 2-2 2m12 0c-1.1 0-2-.9-2-2s.9-2 2-2s2 .9 2 2s-.9 2-2 2"/></svg>';
    inner.appendChild(icon);
  }

  const textEl = document.createElement('div');
  textEl.className = 'bubble-text';
  textEl.textContent = text;
  inner.appendChild(textEl);

  bubble.appendChild(inner);

  const meta = document.createElement('div');
  meta.className = 'bubble-meta';
  const ts = createdAt ? new Date(createdAt + 'Z') : new Date();
  meta.textContent = `${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')}`;
  bubble.appendChild(meta);

  dom.chatMessages.appendChild(bubble);
  scrollChatToBottom();
}

export function addLoadingMessage() {
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble ai loading';
  bubble.innerHTML = `<div class="bubble-content"><div class="bubble-avatar">${djAvatarSvg}</div><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
  dom.chatMessages.appendChild(bubble);
  dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
  return bubble;
}

export function removeLoadingMessage(bubble) {
  if (bubble?.parentNode) bubble.remove();
}

export async function sendChat(text) {
  if (!text.trim()) return;
  addChatMessage(text, 'user');
  dom.chatInput.value = '';
  const loading = addLoadingMessage();

  try {
    const body = { text };
    if (userCoords.lat != null && userCoords.lon != null) {
      body.lat = userCoords.lat;
      body.lon = userCoords.lon;
    }
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.say) {
      addChatMessage(data.say, 'ai');
      if (data.segue) {
        addChatMessage(data.segue, 'segue');
      }
      if (data.mood) {
        state._currentScene = data.mood.detected || 'chat';
      }
    }
  } catch (err) {
    addChatMessage(`Error: ${err.message}`, 'system');
  } finally {
    removeLoadingMessage(loading);
  }
}

export function init() {
  dom.sendBtn.addEventListener('click', () => sendChat(dom.chatInput.value));
  dom.chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat(dom.chatInput.value);
  });
  dom.clearChatBtn.addEventListener('click', () => dom.clearChatModal.classList.add('open'));
  dom.clearChatClose.addEventListener('click', closeClearChatModal);
  dom.clearChatCancel.addEventListener('click', closeClearChatModal);
  dom.clearChatConfirm.addEventListener('click', clearChatHistory);
  dom.clearChatModal.addEventListener('mousedown', (e) => { clearModalMousedownTarget = e.target; });
  dom.clearChatModal.addEventListener('click', (e) => {
    if (e.target === dom.clearChatModal && clearModalMousedownTarget === dom.clearChatModal) closeClearChatModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dom.clearChatModal.classList.contains('open')) closeClearChatModal();
  });
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(scrollChatToBottom);
    observer.observe(dom.chatPanel);
  }
}
