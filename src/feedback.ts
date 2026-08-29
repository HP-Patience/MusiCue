import type Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { addSkip, getRecentSkips, getPref } from './db.js';
import { invokeClaude } from './claude.js';
import { defaultUserCorpusDir } from './runtime.js';

function getMoodRulesPath(db: Database.Database): string {
  const dir = getPref(db, 'user_corpus_dir') || defaultUserCorpusDir();
  return path.resolve(dir, 'mood-rules.md');
}

export async function handleSkip(opts: {
  db: Database.Database;
  songId: string;
  songName: string;
  artist: string;
  scene: string;
  sessionId: string;
}): Promise<{ corrected: boolean; say?: string; play?: string[] }> {
  const safeScene = /^[a-z_]+$/.test(opts.scene) ? opts.scene : 'unknown';
  addSkip(opts.db, {
    song_id: opts.songId,
    song_name: opts.songName,
    artist: opts.artist,
    scene: safeScene,
    session_id: opts.sessionId,
  });

  const recent = getRecentSkips(opts.db, opts.sessionId, 5);
  if (recent.length < 3) return { corrected: false };

  const sameScene = recent.filter(s => s.scene === safeScene);
  if (sameScene.length < 3) return { corrected: false };

  // Append auto-rule to mood-rules.md
  const today = new Date().toISOString().slice(0, 10);
  const rule = `\n## auto-rule ${today}\n连续跳过 ${safeScene} 场景歌曲 → 降低该场景推荐权重 80%\n`;
  try {
    fs.appendFileSync(getMoodRulesPath(opts.db), rule, 'utf-8');
  } catch (err) { console.error('[feedback] failed to write mood-rules:', (err as Error).message); }

  // Generate corrected recommendation
  const prompt = `You are MusiCue. The user has skipped 3+ songs in the "${safeScene}" scene. The previous direction was wrong. Suggest a completely different direction.

Output ONLY valid JSON:
{
  "say": "纠错文案（中文，1句，承认方向错了并推荐新的）",
  "play": ["新搜索词1", "新搜索词2"]
}`;

  try {
    const result = await invokeClaude(prompt, { db: opts.db, timeout: 30000 });
    return { corrected: true, say: result.say, play: result.play };
  } catch (err) {
    console.error('[feedback] correction call failed:', (err as Error).message);
    return { corrected: false };
  }
}
