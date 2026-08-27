// Claudio FM — 主题切换
import { state } from './state.js';
import { dom } from './dom.js';

export function setTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('claudio-theme', theme);
  const label = theme === 'dark' ? '切换到浅色模式' : '切换到暗色模式';
  dom.themeToggle.title = label;
  dom.themeToggle.setAttribute('aria-label', label);
}

export function init() {
  setTheme(state.theme);
  dom.themeToggle.addEventListener('click', () => {
    setTheme(state.theme === 'dark' ? 'light' : 'dark');
  });
}
