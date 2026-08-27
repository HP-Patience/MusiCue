// Claudio FM — 聊天模块
import { state, userCoords } from './state.js';
import { dom } from './dom.js';

let lastAiText = '';
let clearModalMousedownTarget = null;

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

  if (type === 'ai') {
    const avatar = document.createElement('div');
    avatar.className = 'bubble-avatar';
    avatar.textContent = '♪';
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
  dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
}

export function addLoadingMessage() {
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble ai loading';
  bubble.innerHTML = '<div class="bubble-content"><div class="bubble-avatar">♪</div><div class="typing-dots"><span></span><span></span><span></span></div></div>';
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
        addChatMessage(`*${data.segue}*`, 'system');
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
}
