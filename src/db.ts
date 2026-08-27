import Database from 'better-sqlite3';

export function initDb(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS plays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      song_id TEXT NOT NULL,
      song_name TEXT NOT NULL DEFAULT '',
      artist TEXT NOT NULL DEFAULT '',
      played_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS plan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      plan_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS prefs (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS favorites (
      song_id TEXT PRIMARY KEY,
      song_name TEXT NOT NULL DEFAULT '',
      artist TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS hidden_songs (
      song_id TEXT PRIMARY KEY,
      song_name TEXT NOT NULL DEFAULT '',
      artist TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS skips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      song_id TEXT NOT NULL,
      song_name TEXT NOT NULL DEFAULT '',
      artist TEXT NOT NULL DEFAULT '',
      scene TEXT NOT NULL DEFAULT '',
      session_id TEXT NOT NULL DEFAULT '',
      skipped_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS play_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period TEXT NOT NULL UNIQUE,
      stat_json TEXT NOT NULL DEFAULT '{}',
      insight_md TEXT NOT NULL DEFAULT '',
      generated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

export interface Message {
  role: string;
  content: string;
}

export function addMessage(db: Database.Database, msg: Message): void {
  db.prepare('INSERT INTO messages (role, content) VALUES (?, ?)').run(
    msg.role,
    msg.content,
  );
}

export function getMessages(db: Database.Database, limit: number) {
  return db
    .prepare('SELECT role, content, created_at FROM messages ORDER BY id DESC LIMIT ?')
    .all(limit) as { role: string; content: string; created_at: string }[];
}

export function clearMessages(db: Database.Database): void {
  db.prepare('DELETE FROM messages').run();
}

export interface Play {
  song_id: string;
  song_name: string;
  artist: string;
}

export function addPlay(db: Database.Database, play: Play): void {
  db.prepare('INSERT INTO plays (song_id, song_name, artist) VALUES (?, ?, ?)').run(
    play.song_id,
    play.song_name,
    play.artist,
  );
}

export function getRecentPlays(db: Database.Database, limit: number) {
  return db
    .prepare('SELECT song_id, song_name, artist, played_at FROM plays ORDER BY id DESC LIMIT ?')
    .all(limit) as { song_id: string; song_name: string; artist: string; played_at: string }[];
}

export interface HistoryPlay {
  song_id: string;
  song_name: string;
  artist: string;
  played_at: string;
}

export interface HistoryPage {
  items: HistoryPlay[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function getPlayHistory(db: Database.Database, page = 1, pageSize = 20): HistoryPage {
  const rawPage = Number(page);
  const rawPageSize = Number(pageSize);
  const safePage = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
  const safePageSize = Number.isFinite(rawPageSize) ? Math.min(20, Math.max(1, Math.floor(rawPageSize))) : 20;
  const offset = (safePage - 1) * safePageSize;

  const uniqueCountRow = db.prepare(
    "SELECT COUNT(*) AS count FROM (SELECT song_id FROM plays WHERE song_id <> '' GROUP BY song_id)",
  ).get() as { count: number };
  const total = Math.min(uniqueCountRow.count, 100);
  const totalPages = total === 0 ? 0 : Math.ceil(total / safePageSize);

  const items = db.prepare(`
    WITH ranked AS (
      SELECT
        song_id,
        song_name,
        artist,
        played_at,
        id,
        ROW_NUMBER() OVER (PARTITION BY song_id ORDER BY played_at DESC, id DESC) AS rn
      FROM plays
      WHERE song_id <> ''
    ),
    unique_plays AS (
      SELECT song_id, song_name, artist, played_at, id
      FROM ranked
      WHERE rn = 1
      ORDER BY played_at DESC, id DESC
      LIMIT 100
    )
    SELECT song_id, song_name, artist, played_at
    FROM unique_plays
    ORDER BY played_at DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(safePageSize, offset) as HistoryPlay[];

  return { items, page: safePage, pageSize: safePageSize, total, totalPages };
}

export function setPlan(db: Database.Database, date: string, plan: unknown): void {
  db.prepare(
    'INSERT INTO plan (date, plan_json) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET plan_json = excluded.plan_json',
  ).run(date, JSON.stringify(plan));
}

export function getPlan(db: Database.Database, date: string): unknown | null {
  const row = db.prepare('SELECT plan_json FROM plan WHERE date = ?').get(date) as
    | { plan_json: string }
    | undefined;
  return row ? JSON.parse(row.plan_json) : null;
}

export function setPref(db: Database.Database, key: string, value: string): void {
  db.prepare('INSERT INTO prefs (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    value,
  );
}

export function getPref(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM prefs WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row ? row.value : null;
}

export function cleanup(db: Database.Database, keepDays: number): void {
  db.prepare(
    "DELETE FROM messages WHERE created_at < datetime('now', '-' || ? || ' days')",
  ).run(keepDays);
  db.prepare(
    "DELETE FROM plays WHERE played_at < datetime('now', '-' || ? || ' days')",
  ).run(keepDays);
}

// ── Favorites ──

export function addFavorite(db: Database.Database, songId: string, songName: string, artist: string): void {
  db.prepare('INSERT OR REPLACE INTO favorites (song_id, song_name, artist) VALUES (?, ?, ?)').run(
    songId, songName, artist,
  );
}

export function removeFavorite(db: Database.Database, songId: string): void {
  db.prepare('DELETE FROM favorites WHERE song_id = ?').run(songId);
}

export function isFavorite(db: Database.Database, songId: string): boolean {
  const row = db.prepare('SELECT 1 FROM favorites WHERE song_id = ?').get(songId);
  return row !== undefined;
}

export function getFavorites(db: Database.Database) {
  return db.prepare('SELECT song_id, song_name, artist, created_at FROM favorites ORDER BY created_at DESC').all() as {
    song_id: string; song_name: string; artist: string; created_at: string;
  }[];
}

// ── Hidden Songs ──

export function addHiddenSong(db: Database.Database, songId: string, songName: string, artist: string): void {
  db.prepare('INSERT OR REPLACE INTO hidden_songs (song_id, song_name, artist) VALUES (?, ?, ?)').run(
    songId, songName, artist,
  );
}

export function isHidden(db: Database.Database, songId: string): boolean {
  const row = db.prepare('SELECT 1 FROM hidden_songs WHERE song_id = ?').get(songId);
  return row !== undefined;
}

// ── Skips ──

export function addSkip(db: Database.Database, skip: {
  song_id: string; song_name: string; artist: string; scene: string; session_id: string;
}): void {
  db.prepare(
    'INSERT INTO skips (song_id, song_name, artist, scene, session_id) VALUES (?, ?, ?, ?, ?)'
  ).run(skip.song_id, skip.song_name, skip.artist, skip.scene, skip.session_id);
}

export function getRecentSkips(db: Database.Database, sessionId: string, limit: number) {
  return db.prepare(
    'SELECT song_id, song_name, artist, scene, session_id, skipped_at FROM skips WHERE session_id = ? ORDER BY id DESC LIMIT ?'
  ).all(sessionId, limit) as { song_id: string; song_name: string; artist: string; scene: string; session_id: string; skipped_at: string }[];
}

// ── Play Stats ──

export function setPlayStats(db: Database.Database, period: string, statJson: string, insightMd: string): void {
  db.prepare(
    'INSERT INTO play_stats (period, stat_json, insight_md) VALUES (?, ?, ?) ON CONFLICT(period) DO UPDATE SET stat_json = excluded.stat_json, insight_md = excluded.insight_md, generated_at = datetime(\'now\')'
  ).run(period, statJson, insightMd);
}

export function getPlayStats(db: Database.Database, period: string) {
  const row = db.prepare(
    'SELECT period, stat_json, insight_md, generated_at FROM play_stats WHERE period = ?'
  ).get(period) as { period: string; stat_json: string; insight_md: string; generated_at: string } | undefined;
  return row ? { period: row.period, stat: JSON.parse(row.stat_json), insight: row.insight_md, generatedAt: row.generated_at } : null;
}

export function getPlayStatsAll(db: Database.Database) {
  return db.prepare(
    'SELECT period, generated_at FROM play_stats ORDER BY period DESC LIMIT 12'
  ).all() as { period: string; generated_at: string }[];
}
