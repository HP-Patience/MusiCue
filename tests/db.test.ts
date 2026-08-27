import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initDb, addMessage, getMessages, clearMessages, addPlay, getRecentPlays, getPlayHistory, setPlan, getPlan, setPref, getPref, cleanup } from '../src/db.js';
import fs from 'node:fs';

describe('db', () => {
  const testPath = 'tests/fixtures/test.db';
  let db: Database.Database;

  beforeEach(() => {
    fs.mkdirSync('tests/fixtures', { recursive: true });
    db = new Database(testPath);
    initDb(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(testPath)) {
      fs.unlinkSync(testPath);
    }
  });

  it('init creates messages, plays, plan, prefs tables', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];

    const names = tables.map((t) => t.name);
    expect(names).toContain('messages');
    expect(names).toContain('plays');
    expect(names).toContain('plan');
    expect(names).toContain('prefs');
  });

  it('addMessage inserts and getMessages returns messages ordered by time desc', () => {
    addMessage(db, { role: 'user', content: 'hello' });
    addMessage(db, { role: 'assistant', content: 'hi there' });

    const msgs = getMessages(db, 10);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('assistant');
    expect(msgs[0].content).toBe('hi there');
    expect(msgs[1].role).toBe('user');
    expect(msgs[1].content).toBe('hello');
  });

  it('clearMessages removes chat while preserving playback history', () => {
    addMessage(db, { role: 'user', content: 'play jazz' });
    addMessage(db, { role: 'assistant', content: 'playing jazz' });
    addPlay(db, { song_id: '123', song_name: 'Test Song', artist: 'Test Artist' });

    clearMessages(db);

    expect(getMessages(db, 10)).toEqual([]);
    expect(getRecentPlays(db, 10)).toHaveLength(1);
  });

  it('addPlay inserts and getRecentPlays returns plays ordered by time desc', () => {
    addPlay(db, { song_id: '123', song_name: 'Test Song', artist: 'Test Artist' });
    addPlay(db, { song_id: '456', song_name: 'Another', artist: 'Artist2' });

    const plays = getRecentPlays(db, 10);
    expect(plays).toHaveLength(2);
    expect(plays[0].song_id).toBe('456');
    expect(plays[1].song_id).toBe('123');
  });

  it('getPlayHistory returns latest unique songs with duplicate raw plays collapsed', () => {
    db.prepare("INSERT INTO plays (song_id, song_name, artist, played_at) VALUES (?, ?, ?, ?)")
      .run('123', 'Old Name', 'Old Artist', '2026-06-30 08:00:00');
    db.prepare("INSERT INTO plays (song_id, song_name, artist, played_at) VALUES (?, ?, ?, ?)")
      .run('456', 'Another', 'Artist2', '2026-06-30 09:00:00');
    db.prepare("INSERT INTO plays (song_id, song_name, artist, played_at) VALUES (?, ?, ?, ?)")
      .run('123', 'New Name', 'New Artist', '2026-06-30 10:00:00');

    const history = getPlayHistory(db, 1, 20);

    expect(history).toEqual({
      items: [
        { song_id: '123', song_name: 'New Name', artist: 'New Artist', played_at: '2026-06-30 10:00:00' },
        { song_id: '456', song_name: 'Another', artist: 'Artist2', played_at: '2026-06-30 09:00:00' },
      ],
      page: 1,
      pageSize: 20,
      total: 2,
      totalPages: 1,
    });
  });

  it('getPlayHistory paginates the latest 100 unique songs', () => {
    for (let i = 1; i <= 105; i += 1) {
      db.prepare("INSERT INTO plays (song_id, song_name, artist, played_at) VALUES (?, ?, ?, datetime('2026-06-30 00:00:00', ? || ' minutes'))")
        .run(String(i), `Song ${i}`, `Artist ${i}`, i);
    }

    const pageOne = getPlayHistory(db, 1, 20);
    const pageFive = getPlayHistory(db, 5, 20);
    const pageSix = getPlayHistory(db, 6, 20);

    expect(pageOne.total).toBe(100);
    expect(pageOne.totalPages).toBe(5);
    expect(pageOne.items).toHaveLength(20);
    expect(pageOne.items[0].song_id).toBe('105');
    expect(pageFive.items).toHaveLength(20);
    expect(pageFive.items[19].song_id).toBe('6');
    expect(pageSix.items).toEqual([]);
    expect(pageSix.totalPages).toBe(5);
  });

  it('getPlayHistory ignores records without song_id', () => {
    db.prepare("INSERT INTO plays (song_id, song_name, artist, played_at) VALUES (?, ?, ?, ?)")
      .run('', 'Broken', 'Unknown', '2026-06-30 08:00:00');
    db.prepare("INSERT INTO plays (song_id, song_name, artist, played_at) VALUES (?, ?, ?, ?)")
      .run('123', 'Valid', 'Artist', '2026-06-30 09:00:00');

    const history = getPlayHistory(db, 1, 20);

    expect(history.items).toHaveLength(1);
    expect(history.items[0].song_id).toBe('123');
  });

  it('getPlayHistory normalizes non-finite pagination values', () => {
    addPlay(db, { song_id: '123', song_name: 'Test Song', artist: 'Test Artist' });

    expect(() => getPlayHistory(db, Infinity, Infinity)).not.toThrow();

    const history = getPlayHistory(db, Infinity, Infinity);
    expect(history.page).toBe(1);
    expect(history.pageSize).toBe(20);
    expect(history.items).toHaveLength(1);
  });

  it('setPlan and getPlan store and retrieve daily plan', () => {
    const planData = { songs: ['id1', 'id2'], theme: 'morning' };
    setPlan(db, '2026-06-09', planData);

    const result = getPlan(db, '2026-06-09');
    expect(result).not.toBeNull();
    expect(result!.songs).toEqual(['id1', 'id2']);
    expect(result!.theme).toBe('morning');
  });

  it('getPlan returns null for missing date', () => {
    const result = getPlan(db, '2099-01-01');
    expect(result).toBeNull();
  });

  it('setPref and getPref store and retrieve key-value preferences', () => {
    setPref(db, 'volume', '50');
    setPref(db, 'theme', 'dark');

    expect(getPref(db, 'volume')).toBe('50');
    expect(getPref(db, 'theme')).toBe('dark');
    expect(getPref(db, 'nonexistent')).toBeNull();
  });

  it('cleanup removes records older than N days', () => {
    // Insert old message manually
    db.prepare(
      "INSERT INTO messages (role, content, created_at) VALUES ('user', 'old', datetime('now', '-31 days'))",
    ).run();
    addMessage(db, { role: 'user', content: 'recent' });

    cleanup(db, 30);

    const msgs = getMessages(db, 100);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toBe('recent');
  });
});
