import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

// ── mock claude.js: real parseOutput, fake invokeClaude ──
vi.mock('../../src/claude.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/claude.js')>('../../src/claude.js');
  return {
    ...actual,
    invokeClaude: vi.fn().mockResolvedValue({
      say: 'Good morning! Time for some focus music.',
      play: ['id_123', 'id_456'],
      reason: 'You have a meeting soon, calm instrumental helps.',
      segue: 'Starting with Miles Davis...',
    }),
  };
});

// ── real modules ──
import {
  initDb, addMessage, getMessages,
  addPlay,
  setPlan, getPlan,
  setPref, getPref,
} from '../../src/db.js';
import { assemblePrompt, truncateHistory } from '../../src/context.js';
import { parseOutput, invokeClaude } from '../../src/claude.js';
import { synthesize, getCachePath } from '../../src/tts.js';
import { Scheduler } from '../../src/scheduler.js';
import { createApp } from '../../src/router.js';
import request from 'supertest';

// ── helpers ──

const FIXTURES = 'tests/integration/fixtures';
const USER_DIR = path.join(FIXTURES, 'user');
const CACHE_DIR = path.join(FIXTURES, 'tts-cache');
const DB_PATH = path.join(FIXTURES, 'int-test.db');

function freshDb(): Database.Database {
  fs.mkdirSync(FIXTURES, { recursive: true });
  const db = new Database(DB_PATH);
  initDb(db);
  return db;
}

function seedUserCorpus() {
  fs.mkdirSync(USER_DIR, { recursive: true });
  fs.writeFileSync(path.join(USER_DIR, 'taste.md'), 'I love jazz and lo-fi beats.');
  fs.writeFileSync(path.join(USER_DIR, 'routines.md'), 'Wake at 7am. Work starts 9am.');
  fs.writeFileSync(path.join(USER_DIR, 'mood-rules.md'), 'Morning = calm instrumental.\nNight = ambient.');
  fs.writeFileSync(path.join(USER_DIR, 'playlists.json'), JSON.stringify({ chill: ['id-a', 'id-b'], focus: ['id-c'] }));
}

function cleanupFixtures() {
  if (fs.existsSync(FIXTURES)) fs.rmSync(FIXTURES, { recursive: true });
}

// ── integration tests ──

describe('integration: DB ↔ Context pipeline', () => {
  let db: Database.Database;

  beforeEach(() => {
    cleanupFixtures();
    db = freshDb();
  });

  afterEach(() => {
    db.close();
    cleanupFixtures();
  });

  it('writes plays → reads history → assembles into prompt', () => {
    addPlay(db, { song_id: '789', song_name: 'Take Five', artist: 'Dave Brubeck' });
    addPlay(db, { song_id: '456', song_name: 'So What', artist: 'Miles Davis' });
    addMessage(db, { role: 'user', content: 'play some jazz' });
    addMessage(db, { role: 'assistant', content: 'Playing jazz favorites.' });

    seedUserCorpus();

    const history = getMessages(db, 10).reverse();
    const prompt = assemblePrompt({
      userCorpusDir: USER_DIR,
      weather: 'Rainy, 18C',
      calendar: 'Lunch 12:00',
      time: '2026-06-09 09:30',
      recentHistory: history,
    });

    expect(prompt).toContain('I love jazz and lo-fi beats');
    expect(prompt).toContain('Wake at 7am');
    expect(prompt).toContain('Morning = calm instrumental');
    expect(prompt).toContain('Rainy, 18C');
    expect(prompt).toContain('Lunch 12:00');
    expect(prompt).toContain('2026-06-09 09:30');
    expect(prompt).toContain('play some jazz');
    expect(prompt).toContain('Playing jazz favorites');
  });

  it('plan round-trips through DB (JSON preserved)', () => {
    const planData = {
      songs: ['id1', 'id2', 'id3'],
      theme: 'focus-work',
      notes: 'Instrumental only, no lyrics',
    };

    setPlan(db, '2026-06-09', planData);
    const loaded = getPlan(db, '2026-06-09');

    expect(loaded).toEqual(planData);
  });

  it('prefs survive close and re-open (durability)', () => {
    setPref(db, 'volume', '75');
    setPref(db, 'crossfade', '3');

    const dbPath = db.name;
    db.close();

    const db2 = new Database(dbPath);
    initDb(db2);
    expect(getPref(db2, 'volume')).toBe('75');
    expect(getPref(db2, 'crossfade')).toBe('3');
    db2.close();
  });

  it('truncateHistory keeps last N items', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({
      role: 'user',
      content: `msg ${i}`,
      created_at: `2026-06-09 0${i}:00`,
    }));

    const result = truncateHistory(items, 3);
    expect(result).toHaveLength(3);
    expect(result[0].content).toBe('msg 47');
    expect(result[2].content).toBe('msg 49');
  });
});

describe('integration: Router → Claude pipeline', () => {
  beforeEach(() => cleanupFixtures());
  afterEach(() => cleanupFixtures());

  it('simple commands skip Claude, return local action', async () => {
    const app = createApp({});
    const simpleCmds = ['下一首', '暂停', '继续', '上一首', 'volume_up', 'stop'];

    for (const cmd of simpleCmds) {
      const res = await request(app)
        .post('/api/chat')
        .send({ text: cmd });

      expect(res.status).toBe(200);
      expect(res.body.claude).toBe(false);
      expect(res.body.action).toBe(cmd);
    }
  });

  it('natural language invokes Claude and returns structured JSON', async () => {
    (invokeClaude as any).mockResolvedValueOnce({
      say: 'Good morning! Time for some focus music.',
      play: ['id_123', 'id_456'],
      reason: 'You have a meeting in 30 minutes, calm instrumental helps focus.',
      segue: 'Starting with Miles Davis...',
    });

    const app = createApp({});
    const res = await request(app)
      .post('/api/chat')
      .send({ text: '早上好，给我放点适合工作的音乐' });

    expect(res.status).toBe(200);
    expect(res.body.claude).toBe(true);
    expect(res.body.say).toContain('Good morning');
    expect(res.body.play).toEqual(['id_123', 'id_456']);
    expect(res.body.reason).toContain('meeting');
    expect(res.body.segue).toContain('Miles Davis');
  });

  it('GET /api/now returns expected shape', async () => {
    const app = createApp({});
    const res = await request(app).get('/api/now');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('current');
    expect(res.body).toHaveProperty('queue');
    expect(Array.isArray(res.body.queue)).toBe(true);
  });
});

describe('integration: TTS cache pipeline (real fs)', () => {
  beforeEach(() => {
    cleanupFixtures();
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  });
  afterEach(() => cleanupFixtures());

  it('synthesize → write file → second call hits cache', async () => {
    const mp3Bytes = new Uint8Array([0xff, 0xfb, 0x90, 0x00]).buffer;
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(mp3Bytes, { status: 200 }),
    );

    const text = 'This is your DJ speaking.';

    // cache miss → API call → file written
    const path1 = await synthesize(text, { cacheDir: CACHE_DIR });
    expect(path1).not.toBeNull();
    expect(path1).toBe(getCachePath(text, CACHE_DIR));
    expect(fs.existsSync(path1!)).toBe(true);
    expect(fs.readFileSync(path1!)).toEqual(Buffer.from(mp3Bytes));

    // cache hit → zero fetch calls
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const path2 = await synthesize(text, { cacheDir: CACHE_DIR });
    expect(path2).toBe(path1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('different texts produce different cache files', async () => {
    const mp3Bytes = new Uint8Array([0x01]).buffer;
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(mp3Bytes, { status: 200 }))
      .mockResolvedValueOnce(new Response(mp3Bytes, { status: 200 }));

    const p1 = await synthesize('Hello world', { cacheDir: CACHE_DIR });
    const p2 = await synthesize('Goodbye world', { cacheDir: CACHE_DIR });

    expect(p1).not.toBeNull();
    expect(p2).not.toBeNull();
    expect(p1).not.toBe(p2);
    expect(fs.existsSync(p1!)).toBe(true);
    expect(fs.existsSync(p2!)).toBe(true);
  });
});

describe('integration: Scheduler → DB chain', () => {
  let db: Database.Database;

  beforeEach(() => {
    cleanupFixtures();
    db = freshDb();
  });
  afterEach(() => {
    db.close();
    cleanupFixtures();
  });

  it('scheduled task writes daily plan to DB', async () => {
    const scheduler = new Scheduler();

    scheduler.registerTask('daily-plan', '0 7 * * *', async () => {
      const plan = {
        songs: ['morning-1', 'morning-2'],
        theme: 'wake-up',
        generatedAt: new Date().toISOString(),
      };
      setPlan(db, '2026-06-09', plan);
      return plan;
    });

    const result = await scheduler.execute('daily-plan');
    expect(result).toHaveProperty('theme', 'wake-up');

    const stored = getPlan(db, '2026-06-09');
    expect(stored).toHaveProperty('songs');
    expect((stored as any).songs).toEqual(['morning-1', 'morning-2']);
  });
});

describe('integration: JSON contract (architecture spec)', () => {
  it('valid Claude output matches specified format', () => {
    const raw = JSON.stringify({
      say: '现在是北京时间8点整，早上好。',
      play: ['song_001', 'song_002'],
      reason: '早晨适合轻柔的爵士乐',
      segue: '先来一首Dave Brubeck的Take Five...',
    });

    const parsed = parseOutput(raw);

    expect(typeof parsed.say).toBe('string');
    expect(parsed.say.length).toBeGreaterThan(0);
    expect(Array.isArray(parsed.play)).toBe(true);
    expect(typeof parsed.reason).toBe('string');
    expect(typeof parsed.segue).toBe('string');
    expect(parsed.error).toBeUndefined();
  });

  it('empty play array is valid (no songs requested)', () => {
    const parsed = parseOutput(JSON.stringify({
      say: '当前没有合适的歌曲',
      play: [],
      reason: '',
      segue: '',
    }));

    expect(parsed.play).toEqual([]);
    expect(parsed.say).toBe('当前没有合适的歌曲');
    expect(parsed.error).toBeUndefined();
  });

  it('marks malformed output as invalid instead of treating it as a successful response', () => {
    const parsed = parseOutput('claude returned text not json');

    expect(parsed.error).toBe(true);
    expect(parsed.say).toBe('');
    expect(parsed.play).toEqual([]);
  });

  it('partial JSON gets safe defaults for missing fields', () => {
    const parsed = parseOutput(JSON.stringify({ say: 'Hi', play: ['id1'] }));

    expect(parsed.say).toBe('Hi');
    expect(parsed.play).toEqual(['id1']);
    expect(parsed.reason).toBe('');
    expect(parsed.segue).toBe('');
  });
});
