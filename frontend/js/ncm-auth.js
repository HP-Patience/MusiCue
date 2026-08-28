// Claudio FM — 网易云登录
import { state } from './state.js';
import { dom } from './dom.js';

let qrKey = null;
let qrPollTimer = null;

export function updateLoginBtn() {
  const label = document.getElementById('ncm-login-label');
  if (!label) return;
  if (state.ncmLoggedIn) {
    const vip = state.ncmVipType && state.ncmVipType > 0 ? ' ★VIP' : '';
    label.textContent = (state.ncmNickname || 'LOGGED') + vip;
    dom.ncmLoginBtn.classList.add('logged-in');
  } else {
    label.textContent = 'LOGIN';
    dom.ncmLoginBtn.classList.remove('logged-in');
  }
}

export async function refreshNcmLoginStatus() {
  try {
    const res = await fetch('/api/ncm/login/status');
    const data = await res.json();
    state.ncmLoggedIn = !!data.loggedIn;
    state.ncmVipType = data.vipType || 0;
    state.ncmNickname = data.nickname || '';
  } catch {
    state.ncmLoggedIn = false;
    state.ncmVipType = 0;
    state.ncmNickname = '';
  }
  updateLoginBtn();
}

export function closeNcmLogin() {
  dom.ncmLoginModal.classList.remove('open');
  if (qrPollTimer) { clearInterval(qrPollTimer); qrPollTimer = null; }
  qrKey = null;
}

async function startQrLogin() {
  try {
    const keyRes = await fetch('/api/ncm/login/qr/key', { method: 'POST' });
    const keyData = await keyRes.json();
    if (!keyData.data?.unikey) throw new Error('获取二维码 key 失败');
    qrKey = keyData.data.unikey;

    const imgRes = await fetch('/api/ncm/login/qr/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: qrKey }),
    });
    const imgData = await imgRes.json();
    if (imgData.data?.qrimg) {
      dom.qrImage.src = imgData.data.qrimg;
      dom.qrImage.style.display = '';
      dom.qrPlaceholder.style.display = 'none';
    } else {
      throw new Error('获取二维码图片失败');
    }

    dom.qrStatus.textContent = '请使用网易云音乐扫码';
    qrPollTimer = setInterval(async () => {
      if (!qrKey) return;
      try {
        const checkRes = await fetch('/api/ncm/login/qr/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: qrKey }),
        });
        const checkData = await checkRes.json();
        const code = checkData.code || checkData.body?.code;
        if (code === 803) {
          if (qrPollTimer) { clearInterval(qrPollTimer); qrPollTimer = null; }
          dom.qrStatus.textContent = '✓ 登录成功！';
          dom.qrStatus.className = 'login-status success';
          state.ncmLoggedIn = true;
          updateLoginBtn();
          refreshNcmLoginStatus();
          import('./chat.js').then(m => m.addChatMessage('✓ 网易云登录成功', 'system'));
          setTimeout(closeNcmLogin, 1500);
        } else if (code === 802) {
          dom.qrStatus.textContent = '✓ 已扫码，请在手机上确认';
          dom.qrStatus.className = 'login-status';
        } else if (code === 801) {
          dom.qrStatus.textContent = '请使用网易云音乐扫码';
          dom.qrStatus.className = 'login-status';
        } else if (code === 800) {
          if (qrPollTimer) { clearInterval(qrPollTimer); qrPollTimer = null; }
          dom.qrStatus.textContent = '二维码已过期，请重新获取';
          dom.qrStatus.className = 'login-status error';
          setTimeout(startQrLogin, 2000);
        }
      } catch { /* retry */ }
    }, 2000);
  } catch (err) {
    dom.qrStatus.textContent = '获取二维码失败: ' + err.message;
    dom.qrStatus.className = 'login-status error';
  }
}

// ── NCM status polling ──
let ncmStatusTimer = null;

async function checkNcmStatus() {
  dom.ncmStatus.className = 'ncm-status checking';
  try {
    const res = await fetch('/api/status/ncm');
    const data = await res.json();
    dom.ncmStatus.className = `ncm-status ${data.online ? 'online' : 'offline'}`;
    dom.ncmStatus.title = data.online ? '网易云 API 在线' : `网易云 API 离线: ${data.reason || 'unknown'}`;
    return !!data.online;
  } catch {
    dom.ncmStatus.className = 'ncm-status offline';
    dom.ncmStatus.title = '网易云 API 状态检查失败';
    return false;
  }
}

async function pollNcmStatus() {
  const online = await checkNcmStatus();
  if (ncmStatusTimer) clearTimeout(ncmStatusTimer);
  ncmStatusTimer = setTimeout(pollNcmStatus, online ? 30000 : 1500);
}

export function init() {
  dom.ncmLoginBtn.addEventListener('click', async () => {
    if (state.ncmLoggedIn) {
      try { await fetch('/api/ncm/logout', { method: 'POST' }); } catch { /* ignore */ }
      state.ncmLoggedIn = false;
      state.ncmVipType = 0;
      state.ncmNickname = '';
      updateLoginBtn();
      import('./chat.js').then(m => m.addChatMessage('已退出网易云登录', 'system'));
      return;
    }
    dom.ncmLoginModal.classList.add('open');
    dom.qrImage.style.display = 'none';
    dom.qrPlaceholder.style.display = '';
    dom.qrPlaceholder.textContent = '获取二维码中...';
    dom.qrStatus.textContent = '等待扫码...';
    dom.loginPhone.value = '';
    dom.loginPassword.value = '';
    dom.pwdLoginStatus.textContent = '';
    document.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('[data-login-tab="qr"]').classList.add('active');
    document.getElementById('login-qr-panel').style.display = '';
    document.getElementById('login-pwd-panel').style.display = 'none';
    startQrLogin();
  });

  dom.ncmLoginClose.addEventListener('click', closeNcmLogin);
  let _mousedown = null;
  dom.ncmLoginModal.addEventListener('mousedown', (e) => { _mousedown = e.target; });
  dom.ncmLoginModal.addEventListener('click', (e) => {
    if (e.target === dom.ncmLoginModal && _mousedown === dom.ncmLoginModal) closeNcmLogin();
  });

  // Login tab switching
  document.querySelectorAll('.login-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (qrPollTimer) { clearInterval(qrPollTimer); qrPollTimer = null; }
      document.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.loginTab;
      document.getElementById('login-qr-panel').style.display = target === 'qr' ? '' : 'none';
      document.getElementById('login-pwd-panel').style.display = target === 'pwd' ? '' : 'none';
      if (target === 'qr') startQrLogin();
    });
  });

  // Password login
  dom.pwdLoginBtn.addEventListener('click', async () => {
    const phone = dom.loginPhone.value.trim();
    const password = dom.loginPassword.value.trim();
    if (!phone || !password) {
      dom.pwdLoginStatus.textContent = '请输入手机号和密码';
      dom.pwdLoginStatus.className = 'login-status error';
      return;
    }
    const captchaEl = document.getElementById('login-captcha');
    const captcha = captchaEl ? captchaEl.value.trim() : '';
    dom.pwdLoginStatus.textContent = '登录中...';
    dom.pwdLoginStatus.className = 'login-status';
    dom.pwdLoginBtn.disabled = true;
    try {
      const body = { phone, password };
      if (captcha) body.captcha = captcha;
      const res = await fetch('/api/ncm/login/cellphone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.code === 200) {
        dom.pwdLoginStatus.textContent = '✓ 登录成功！';
        dom.pwdLoginStatus.className = 'login-status success';
        state.ncmLoggedIn = true;
        updateLoginBtn();
        refreshNcmLoginStatus();
        import('./chat.js').then(m => m.addChatMessage('✓ 网易云登录成功', 'system'));
        setTimeout(closeNcmLogin, 1500);
      } else if (data.code === 462 || data.code === 8821) {
        const captchaSection = document.getElementById('login-captcha-section');
        if (captchaSection) captchaSection.style.display = '';
        dom.pwdLoginStatus.textContent = data.message || '需短信验证码验证';
        dom.pwdLoginStatus.className = 'login-status error';
      } else {
        dom.pwdLoginStatus.textContent = `登录失败: ${data.message || '请检查账号密码'}`;
        dom.pwdLoginStatus.className = 'login-status error';
      }
    } catch (err) {
      dom.pwdLoginStatus.textContent = `连接失败: ${err.message}`;
      dom.pwdLoginStatus.className = 'login-status error';
    } finally {
      dom.pwdLoginBtn.disabled = false;
    }
  });

  // Send captcha
  let captchaCooldown = 0;
  document.getElementById('login-send-captcha-btn')?.addEventListener('click', async () => {
    const phone = dom.loginPhone.value.trim();
    if (!phone) {
      const st = document.getElementById('pwd-captcha-status');
      if (st) { st.textContent = '请先输入手机号'; st.className = 'login-status error'; }
      return;
    }
    if (captchaCooldown > 0) return;
    const btn = document.getElementById('login-send-captcha-btn');
    const st = document.getElementById('pwd-captcha-status');
    if (btn) btn.disabled = true;
    if (st) { st.textContent = '发送中...'; st.className = 'login-status'; }
    try {
      const res = await fetch('/api/ncm/login/send-captcha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (data.code === 200) {
        if (st) { st.textContent = '✓ 验证码已发送'; st.className = 'login-status success'; }
        captchaCooldown = 60;
        const tick = () => {
          if (captchaCooldown <= 0) { if (btn) { btn.textContent = '发送验证码'; btn.disabled = false; } return; }
          if (btn) btn.textContent = `${captchaCooldown}s`;
          captchaCooldown--;
          setTimeout(tick, 1000);
        };
        tick();
      } else {
        if (st) { st.textContent = `发送失败: ${data.message || '请稍后重试'}`; st.className = 'login-status error'; }
        if (btn) btn.disabled = false;
      }
    } catch (err) {
      const st2 = document.getElementById('pwd-captcha-status');
      if (st2) { st2.textContent = `发送失败: ${err.message}`; st2.className = 'login-status error'; }
      if (btn) btn.disabled = false;
    }
  });

  // NCM status check
  refreshNcmLoginStatus();
  pollNcmStatus();
}
