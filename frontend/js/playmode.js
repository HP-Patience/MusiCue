// Claudio FM — 播放模式切换
import { state } from './state.js';
import { dom } from './dom.js';
import { setPlayMode } from './audio-core.js';

const modes = ['list', 'single', 'shuffle'];

export function init() {
  setPlayMode(state.playMode);
  dom.playModeBtn.addEventListener('click', () => {
    if (state.isFmMode || state.isSmartMode) return;
    const current = modes.indexOf(state.playMode);
    setPlayMode(modes[(current + 1) % modes.length]);
  });
}
