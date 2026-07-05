// Claudio FM — 设置面板
import { state } from './state.js';
import { dom } from './dom.js';
import { updateLoginBtn } from './ncm-auth.js';

let settingsMousedownTarget = null;

export function closeSettings() {
  dom.settingsModal.classList.remove('open');
  dom.settingsStatus.textContent = '';
  dom.settingsStatus.className = 'form-status';
}

export async function syncDesktopConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    await window.electronQuickInput?.setShortcut?.(data.quickInputShortcut || 'CommandOrControl+Shift+Space');
    await window.electronQuickInput?.setAutoLaunch?.(data.autoLaunchEnabled !== false);
  } catch { /* ignore desktop sync failures in browser */ }
}

export async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    dom.settingsApiKey.value = data.apiKey || '';
    dom.settingsBaseUrl.value = data.baseUrl || 'https://api.deepseek.com';
    dom.settingsApiModel.value = data.apiModel || '';
    dom.settingsLlmEnabled.checked = data.llmEnabled !== false;
    dom.settingsSceneSuggestionsEnabled.checked = data.sceneSuggestionsEnabled !== false;
    dom.settingsQuickInputShortcut.value = data.quickInputShortcut || 'CommandOrControl+Shift+Space';
    dom.settingsAutoLaunchEnabled.checked = data.autoLaunchEnabled !== false;
    dom.settingsNcmApi.value = data.ncmApi || 'http://localhost:3001';
    dom.settingsNcmQuality.value = data.ncmQuality || '';
    dom.settingsWeatherKey.value = data.weatherKey || '';
    dom.settingsFishKey.value = data.fishKey || '';
    dom.settingsFeishuAppId.value = data.feishuAppId || '';
    dom.settingsFeishuAppSecret.value = data.feishuAppSecret || '';
    dom.settingsUpnpDevices.value = data.upnpDevices || '[]';
    if (data.ncmLoggedIn !== undefined) {
      state.ncmLoggedIn = data.ncmLoggedIn;
      updateLoginBtn();
    }
  } catch (err) {
    dom.settingsStatus.textContent = `加载失败: ${err.message}`;
    dom.settingsStatus.className = 'form-status error';
  }
}

export function init() {
  dom.settingsToggle.addEventListener('click', async () => {
    await loadConfig();
    dom.settingsModal.classList.add('open');
  });

  dom.settingsClose.addEventListener('click', closeSettings);
  dom.settingsModal.addEventListener('mousedown', (e) => { settingsMousedownTarget = e.target; });
  dom.settingsModal.addEventListener('click', (e) => {
    if (e.target === dom.settingsModal && settingsMousedownTarget === dom.settingsModal) closeSettings();
  });

  dom.settingsTest.addEventListener('click', async () => {
    dom.settingsStatus.textContent = '测试中…';
    dom.settingsStatus.className = 'form-status';
    dom.settingsTest.disabled = true;
    try {
      const res = await fetch('/api/config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: dom.settingsApiKey.value,
          baseUrl: dom.settingsBaseUrl.value,
          apiModel: dom.settingsApiModel.value,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        dom.settingsStatus.textContent = `✓ ${data.message}`;
        dom.settingsStatus.className = 'form-status success';
      } else {
        dom.settingsStatus.textContent = `✗ ${data.message}`;
        dom.settingsStatus.className = 'form-status error';
      }
    } catch (err) {
      dom.settingsStatus.textContent = `✗ 错误: ${err.message}`;
      dom.settingsStatus.className = 'form-status error';
    } finally {
      dom.settingsTest.disabled = false;
    }
  });

  dom.settingsFetchModels.addEventListener('click', async () => {
    if (dom.modelDropdown.classList.contains('open')) {
      dom.modelDropdown.classList.remove('open');
      return;
    }
    dom.settingsFetchModels.disabled = true;
    dom.settingsFetchModels.textContent = '⋯';
    dom.settingsStatus.textContent = '';
    try {
      const res = await fetch('/api/models');
      const data = await res.json();
      if (data.ok && data.models) {
        dom.modelDropdown.innerHTML = '';
        for (const m of data.models) {
          const item = document.createElement('div');
          item.className = 'model-dropdown-item';
          item.textContent = m;
          item.addEventListener('click', () => {
            dom.settingsApiModel.value = m;
            dom.modelDropdown.classList.remove('open');
          });
          dom.modelDropdown.appendChild(item);
        }
        dom.modelDropdown.classList.add('open');
        dom.settingsStatus.textContent = `✓ ${data.models.length} 个模型`;
        dom.settingsStatus.className = 'form-status success';
      } else {
        dom.settingsStatus.textContent = `✗ ${data.message || '获取失败'}`;
        dom.settingsStatus.className = 'form-status error';
      }
    } catch (err) {
      dom.settingsStatus.textContent = `✗ ${err.message}`;
      dom.settingsStatus.className = 'form-status error';
    } finally {
      dom.settingsFetchModels.disabled = false;
      dom.settingsFetchModels.textContent = '▼';
    }
  });

  dom.settingsSave.addEventListener('click', async () => {
    dom.settingsStatus.textContent = '保存中…';
    dom.settingsStatus.className = 'form-status';
    dom.settingsSave.disabled = true;
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: dom.settingsApiKey.value,
          baseUrl: dom.settingsBaseUrl.value,
          apiModel: dom.settingsApiModel.value,
          llmEnabled: dom.settingsLlmEnabled.checked,
          sceneSuggestionsEnabled: dom.settingsSceneSuggestionsEnabled.checked,
          quickInputShortcut: dom.settingsQuickInputShortcut.value,
          autoLaunchEnabled: dom.settingsAutoLaunchEnabled.checked,
          ncmApi: dom.settingsNcmApi.value,
          ncmQuality: dom.settingsNcmQuality.value,
          weatherKey: dom.settingsWeatherKey.value,
          fishKey: dom.settingsFishKey.value,
          feishuAppId: dom.settingsFeishuAppId.value,
          feishuAppSecret: dom.settingsFeishuAppSecret.value,
          upnpDevices: dom.settingsUpnpDevices.value,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        await window.electronQuickInput?.setShortcut?.(dom.settingsQuickInputShortcut.value);
        await window.electronQuickInput?.setAutoLaunch?.(dom.settingsAutoLaunchEnabled.checked);
        closeSettings();
      } else {
        throw new Error(data.message || '保存失败');
      }
    } catch (err) {
      dom.settingsStatus.textContent = `✗ ${err.message}`;
      dom.settingsStatus.className = 'form-status error';
    } finally {
      dom.settingsSave.disabled = false;
    }
  });
}
