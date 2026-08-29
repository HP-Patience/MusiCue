import type Database from 'better-sqlite3';
import { invokeClaude } from './claude.js';
import { setPlayStats } from './db.js';

export type StatsRange = 'week' | 'month' | 'quarter' | 'year';

interface PlayAggregation {
  totalPlays: number;
  topArtists: { name: string; count: number }[];
  topSongs: { name: string; artist: string; count: number }[];
  hourDistribution: Record<string, number>;
  newDiscoveries: { name: string; artist: string }[];
}

export interface StatsPeriodWindow {
  range: StatsRange;
  period: string;
  startDate: string;
  endDate: string;
  label: string;
  queryStartDate: string;
  queryEndDate: string;
}

const RANGE_LABELS: Record<StatsRange, string> = {
  week: '本周',
  month: '本月',
  quarter: '本季度',
  year: '本年',
};

export function isStatsRange(value: unknown): value is StatsRange {
  return value === 'week' || value === 'month' || value === 'quarter' || value === 'year';
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatSqliteUtc(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function getIsoWeek(date: Date): number {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function createWindow(range: StatsRange, start: Date, end: Date, period: string): StatsPeriodWindow {
  return {
    range,
    period,
    startDate: formatDate(start),
    endDate: formatDate(end),
    label: RANGE_LABELS[range],
    queryStartDate: formatSqliteUtc(start),
    queryEndDate: formatSqliteUtc(end),
  };
}

export function getCurrentStatsWindow(range: StatsRange = 'month', now = new Date()): StatsPeriodWindow {
  const year = now.getFullYear();
  const month = now.getMonth();

  if (range === 'week') {
    const day = now.getDay() || 7;
    const start = new Date(year, month, now.getDate() - day + 1);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
    const weekYear = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 3).getFullYear();
    const week = String(getIsoWeek(now)).padStart(2, '0');
    return createWindow(range, start, end, `${weekYear}-W${week}`);
  }

  if (range === 'quarter') {
    const quarter = Math.floor(month / 3);
    const start = new Date(year, quarter * 3, 1);
    const end = new Date(year, quarter * 3 + 3, 1);
    return createWindow(range, start, end, `${year}-Q${quarter + 1}`);
  }

  if (range === 'year') {
    return createWindow(range, new Date(year, 0, 1), new Date(year + 1, 0, 1), String(year));
  }

  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 1);
  return createWindow(range, start, end, `${year}-${String(month + 1).padStart(2, '0')}`);
}

export function getStatsWindowForPeriod(period: string, range: StatsRange = 'month'): StatsPeriodWindow {
  if (range === 'week') {
    const match = period.match(/^(\d{4})-W(\d{2})$/);
    if (!match) return getCurrentStatsWindow(range);
    const year = Number(match[1]);
    const week = Number(match[2]);
    const jan4 = new Date(year, 0, 4);
    const jan4Day = jan4.getDay() || 7;
    const weekOneStart = new Date(year, 0, 4 - jan4Day + 1);
    const start = new Date(weekOneStart.getFullYear(), weekOneStart.getMonth(), weekOneStart.getDate() + (week - 1) * 7);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
    return createWindow(range, start, end, period);
  }

  if (range === 'quarter') {
    const match = period.match(/^(\d{4})-Q([1-4])$/);
    if (!match) return getCurrentStatsWindow(range);
    const year = Number(match[1]);
    const quarter = Number(match[2]) - 1;
    return createWindow(range, new Date(year, quarter * 3, 1), new Date(year, quarter * 3 + 3, 1), period);
  }

  if (range === 'year') {
    const year = Number(period);
    if (!Number.isFinite(year)) return getCurrentStatsWindow(range);
    return createWindow(range, new Date(year, 0, 1), new Date(year + 1, 0, 1), period);
  }

  const [year, month] = period.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return getCurrentStatsWindow('month');
  return createWindow('month', new Date(year, month - 1, 1), new Date(year, month, 1), period);
}

function aggregatePlays(db: Database.Database, window: StatsPeriodWindow): PlayAggregation {
  const allRows = db.prepare(
    "SELECT song_id, song_name, artist, played_at FROM plays WHERE played_at >= ? AND played_at < ?"
  ).all(window.queryStartDate, window.queryEndDate) as { song_id: string; song_name: string; artist: string; played_at: string }[];

  const totalPlays = allRows.length;

  const artistCount = new Map<string, number>();
  const songCount = new Map<string, { name: string; artist: string; count: number }>();
  const hourDist: Record<string, number> = { '0-6': 0, '6-12': 0, '12-18': 0, '18-24': 0 };

  for (const row of allRows) {
    artistCount.set(row.artist, (artistCount.get(row.artist) || 0) + 1);
    const key = `${row.song_name}|${row.artist}`;
    const existing = songCount.get(key);
    if (existing) { existing.count++; } else { songCount.set(key, { name: row.song_name, artist: row.artist, count: 1 }); }
    const h = parseInt((row.played_at.split(' ')[1] || '').split(':')[0] || '0', 10);
    if (h < 6) hourDist['0-6']++;
    else if (h < 12) hourDist['6-12']++;
    else if (h < 18) hourDist['12-18']++;
    else hourDist['18-24']++;
  }

  const topArtists = [...artistCount.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  const topSongs = [...songCount.values()]
    .sort((a, b) => b.count - a.count).slice(0, 5);

  const prevArtists = new Set(
    (db.prepare(
      "SELECT DISTINCT artist FROM plays WHERE played_at < ?"
    ).all(window.queryStartDate) as { artist: string }[]).map(r => r.artist)
  );
  const newDiscoveries = [...new Set(allRows.map(r => `${r.song_name}|${r.artist}`))]
    .map(s => { const [name, artist] = s.split('|'); return { name, artist }; })
    .filter(d => !prevArtists.has(d.artist))
    .slice(0, 5);

  return { totalPlays, topArtists, topSongs, hourDistribution: hourDist, newDiscoveries };
}

export async function generateReport(db: Database.Database, period?: string, range: StatsRange = 'month'): Promise<{
  period: string; range: StatsRange; stat: PlayAggregation; insight: string;
}> {
  const window = period ? getStatsWindowForPeriod(period, range) : getCurrentStatsWindow(range);
  const stat = aggregatePlays(db, window);

  if (stat.totalPlays === 0) {
    const fallback = `${window.period} ${window.label}听歌报告\n\n${window.label}暂无播放数据，多听点歌再来吧！`;
    setPlayStats(db, window.period, JSON.stringify(stat), fallback);
    return { period: window.period, range: window.range, stat, insight: fallback };
  }

  const prompt = `你是一名音乐数据分析师。根据以下统计生成${window.label}听歌报告：

- 总播放 ${stat.totalPlays} 次
- Top 歌手: ${stat.topArtists.map(a => `${a.name}(${a.count})`).join(', ')}
- Top 歌曲: ${stat.topSongs.map(s => `${s.name}(${s.count})`).join(', ')}
- 时段分布: 0-6点 ${stat.hourDistribution['0-6']}, 6-12点 ${stat.hourDistribution['6-12']}, 12-18点 ${stat.hourDistribution['12-18']}, 18-24点 ${stat.hourDistribution['18-24']}
- ${window.label}新发现: ${stat.newDiscoveries.map(d => `${d.name} - ${d.artist}`).join(', ') || '无'}

请生成自然中文报告，4句话以内：
1. 总体画像（1句话）
2. 时间习惯（1句话）
3. 品味变化（1句话）
4. 推荐方向（1句话）

直接输出报告文案，不要 JSON。`;

  try {
    const result = await invokeClaude(prompt, { db, timeout: 30000, responseFormat: 'text' });
    if (result.say.includes('\uFFFD')) throw new Error('LLM response contains invalid UTF-8');
    setPlayStats(db, window.period, JSON.stringify(stat), result.say);
    return { period: window.period, range: window.range, stat, insight: result.say };
  } catch {
    console.warn('[analytics] LLM report failed, using fallback');
    const fallback = `${window.period} ${window.label}听歌报告\n\n总播放 ${stat.totalPlays} 次\n最爱歌手: ${stat.topArtists[0]?.name || '未知'}\n最爱歌曲: ${stat.topSongs[0]?.name || '未知'}`;
    setPlayStats(db, window.period, JSON.stringify(stat), fallback);
    return { period: window.period, range: window.range, stat, insight: fallback };
  }
}
