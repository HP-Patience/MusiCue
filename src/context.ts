import fs from 'node:fs';
import path from 'node:path';

interface UserCorpus {
  taste: string;
  routines: string;
  moodRules: string;
  playlists: unknown;
}

export function loadUserCorpus(dir: string): UserCorpus {
  const read = (file: string) => {
    try {
      return fs.readFileSync(path.join(dir, file), 'utf-8');
    } catch {
      return '';
    }
  };

  let playlists = {};
  try {
    playlists = JSON.parse(read('playlists.json'));
  } catch {
    playlists = {};
  }

  return {
    taste: read('taste.md'),
    routines: read('routines.md'),
    moodRules: read('mood-rules.md'),
    playlists,
  };
}

interface PromptOptions {
  userCorpusDir: string;
  weather: string;
  calendar: string;
  time: string;
  recentHistory: { role: string; content: string; created_at: string }[];
}

export function assemblePrompt(options: PromptOptions): string {
  const corpus = loadUserCorpus(options.userCorpusDir);
  const historyText = options.recentHistory
    .map((m) => `[${m.role}]: ${m.content}`)
    .join('\n');

  return [
    '=== DJ Persona ===',
    'You are MusiCue, a personal AI radio DJ.',
    '',
    '=== User Taste ===',
    corpus.taste,
    '',
    '=== User Routines ===',
    corpus.routines,
    '',
    '=== Mood Rules ===',
    corpus.moodRules,
    '',
    '=== Environment ===',
    `Weather: ${options.weather}`,
    `Calendar: ${options.calendar}`,
    `Current time: ${options.time}`,
    '',
    '=== Recent History ===',
    historyText,
  ].join('\n');
}

export function truncateHistory<T>(items: T[], limit: number): T[] {
  return items.slice(-limit);
}
