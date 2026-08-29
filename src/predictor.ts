import { assemblePrompt } from './context.js';
import { invokeClaude } from './claude.js';
import type Database from 'better-sqlite3';
import { getMessages, getPref } from './db.js';
import { defaultUserCorpusDir } from './runtime.js';

export interface SceneInfo {
  scene: string;
  reason: string;
}

export function detectScene(opts: {
  weather: string;
  calendar: string;
}): SceneInfo {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const isWeekend = day === 0 || day === 6;
  const weatherLow = opts.weather.toLowerCase();
  const calLow = opts.calendar.toLowerCase();

  if (calLow.includes('生日')) {
    return { scene: 'birthday', reason: '日历中有生日事件' };
  }
  if (weatherLow.includes('雨') && hour >= 18 && hour <= 22) {
    return { scene: 'rainy_evening', reason: '傍晚下雨' };
  }
  if (hour >= 22 || hour < 6) {
    return { scene: 'late_night', reason: '深夜时段' };
  }
  if (day === 1 && hour >= 7 && hour <= 9) {
    return { scene: 'morning_commute', reason: '周一早晨' };
  }
  if (day === 5 && hour >= 18 && hour <= 22) {
    return { scene: 'friday_night', reason: '周五晚上' };
  }
  if (isWeekend && hour >= 10 && hour <= 14 && weatherLow.includes('晴')) {
    return { scene: 'weekend_chill', reason: '周末晴天' };
  }
  if (hour >= 7 && hour <= 9) {
    return { scene: 'morning_commute', reason: '早晨通勤' };
  }
  if (hour >= 18 && hour <= 20) {
    return { scene: 'evening_unwind', reason: '傍晚放松' };
  }

  return { scene: 'casual', reason: '日常时段' };
}

export async function getSuggestedQueue(opts: {
  db: Database.Database;
  weather: string;
  calendar: string;
}): Promise<{ scene: SceneInfo; say: string; play: string[]; reason: string }> {
  const scene = detectScene({ weather: opts.weather, calendar: opts.calendar });
  const history = getMessages(opts.db, 10).reverse();
  const userCorpusDir = getPref(opts.db, 'user_corpus_dir') ?? defaultUserCorpusDir();

  const basePrompt = assemblePrompt({
    userCorpusDir,
    weather: opts.weather,
    calendar: opts.calendar,
    time: new Date().toLocaleString('zh-CN'),
    recentHistory: history,
  });

  const prompt = `You are MusiCue, a personal AI radio DJ.

${basePrompt}

=== Scene Context ===
Scene: ${scene.scene}
Why: ${scene.reason}
User hasn't typed anything — they just opened the app. Suggest a queue that fits this moment.

IMPORTANT: Output ONLY valid JSON, no markdown.
{
  "say": "DJ开场白（中文，1句，呼应场景）",
  "play": ["搜索词1", "搜索词2", ...],
  "reason": "推荐理由（1句话）"
}`;

  const result = await invokeClaude(prompt, { db: opts.db, timeout: 60000 });
  return {
    scene,
    say: result.say,
    play: result.play,
    reason: result.reason,
  };
}
