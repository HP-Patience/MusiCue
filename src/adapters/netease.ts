let BASE = process.env.NCM_API ?? 'http://localhost:3001';
let COOKIE = '';

import { getCachedTrackIds } from '../playlist-cache.js';

// Bitrate levels (br param for /song/url)
export const QUALITY_LEVELS = {
  standard: 128000,
  high: 192000,
  exhigh: 320000,
  lossless: 999000,
} as const;

export type QualityLevel = keyof typeof QUALITY_LEVELS;

let DEFAULT_BR: (typeof QUALITY_LEVELS)[QualityLevel] = QUALITY_LEVELS.exhigh; // default to 320k

export function setDefaultBr(br: (typeof QUALITY_LEVELS)[QualityLevel]): void {
  DEFAULT_BR = br;
}

export function getDefaultBr(): number {
  return DEFAULT_BR;
}

export function setNcmBase(url: string): void {
  if (url) BASE = url;
}

export function setNcmCookie(cookie: string): void {
  COOKIE = cookie;
}

export function getNcmCookie(): string {
  return COOKIE;
}

export function clearNcmCookie(): void {
  COOKIE = '';
}

export function getNcmBase(): string {
  return BASE;
}

export interface Song {
  id: number;
  name: string;
  artist: string;
  album: string;
}

export interface Playlist {
  id: number;
  name: string;
  description: string;
  trackCount: number;
  coverImgUrl: string;
  creator: { nickname: string };
}

export interface PlaylistTrack {
  id: number;
  name: string;
  artist: string;
  album: string;
  duration: number;
}

async function ncmFetch<T>(path: string, retries = 2): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      const url = `${BASE}${path}`;
      const headers: Record<string, string> = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
      if (COOKIE) headers['Cookie'] = `MUSIC_U=${COOKIE}`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        console.error(`ncmFetch ${res.status} for ${path} (attempt ${i + 1})`);
        if (i === retries) throw new Error(`NCM API error: ${res.status}`);
        await new Promise((r) => setTimeout(r, 500 * (i + 1)));
        continue;
      }
      return res.json() as Promise<T>;
    } catch (err) {
      console.error(`ncmFetch error for ${path} (attempt ${i + 1}):`, err instanceof Error ? err.message : err);
      if (i === retries) throw err;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw new Error('unreachable');
}

export async function searchSongs(keyword: string, limit = 10): Promise<Song[]> {
  const data = await ncmFetch<any>(
    `/search?keywords=${encodeURIComponent(keyword)}&limit=${limit}`,
  );
  const songs = data?.result?.songs ?? [];
  return songs.map((s: any) => ({
    id: s.id,
    name: s.name,
    artist: s.artists?.[0]?.name ?? '',
    album: s.album?.name ?? '',
  }));
}

export async function getSongDetail(songId: number): Promise<Song | null> {
  const data = await ncmFetch<any>(`/song/detail?ids=${songId}`);
  const song = data?.songs?.[0];
  if (!song) return null;
  return {
    id: song.id,
    name: song.name,
    artist: song.ar?.[0]?.name ?? '',
    album: song.al?.name ?? '',
  };
}

export async function getSongUrl(songId: number, br?: number): Promise<string> {
  const bitrate = br ?? DEFAULT_BR;
  const data = await ncmFetch<any>(`/song/url?id=${songId}&br=${bitrate}`);
  return data?.data?.[0]?.url ?? '';
}

export async function getLoginStatus(): Promise<{ online: boolean; vipType: number; nickname?: string; userId?: number }> {
  const data = await ncmFetch<any>('/login/status?timestamp=' + Date.now());
  const acct = data?.data?.account;
  const profile = data?.data?.profile;
  return {
    online: acct?.id != null || profile?.userId != null,
    vipType: profile?.vipType ?? acct?.vipType ?? 0,
    nickname: profile?.nickname ?? acct?.userName ?? acct?.nickname ?? '',
    userId: profile?.userId ?? acct?.id,
  };
}

export async function getLyric(songId: number): Promise<string> {
  const data = await ncmFetch<any>(`/lyric?id=${songId}`);
  return data?.lrc?.lyric ?? '';
}

export async function getRecommendations(): Promise<Song[]> {
  const data = await ncmFetch<any>('/recommend/songs');
  const songs = data?.data?.dailySongs ?? [];
  return songs.map((s: any) => ({
    id: s.id,
    name: s.name,
    artist: s.ar?.[0]?.name ?? '',
    album: s.al?.name ?? '',
  }));
}

export async function getPersonalFM(): Promise<Song | null> {
  const data = await ncmFetch<any>('/personal_fm');
  const song = data?.data?.[0];
  if (!song) return null;
  return {
    id: song.id,
    name: song.name,
    artist: song.ar?.[0]?.name ?? '',
    album: song.al?.name ?? '',
  };
}

export async function getSimilarSongs(songId: number): Promise<Song[]> {
  const data = await ncmFetch<any>(`/simi/song?id=${songId}`);
  const songs = data?.songs ?? [];
  return songs.map((s: any) => ({
    id: s.id,
    name: s.name,
    artist: s.artists?.[0]?.name ?? '',
    album: s.album?.name ?? '',
  }));
}

export async function getIntelligenceList(songId: number, playlistId: number): Promise<Song[]> {
  const data = await ncmFetch<any>(`/playmode/intelligence/list?id=${songId}&pid=${playlistId}`);
  const songs = data?.data ?? [];
  return songs.map((s: any) => ({
    id: s.id,
    name: s.name,
    artist: s.ar?.[0]?.name ?? '',
    album: s.al?.name ?? '',
  }));
}

// ── Playlist API ──

export async function getUserPlaylists(userId: number): Promise<Playlist[]> {
  const data = await ncmFetch<any>(`/user/playlist?uid=${userId}`);
  const playlists = data?.playlist ?? [];
  return playlists.map((p: any) => ({
    id: p.id,
    name: p.name,
    description: p.description ?? '',
    trackCount: p.trackCount ?? 0,
    coverImgUrl: p.coverImgUrl ?? '',
    creator: { nickname: p.creator?.nickname ?? '' },
  }));
}

export async function getPlaylistDetail(playlistId: number): Promise<{ playlist: Playlist; tracks: PlaylistTrack[]; allTrackIds: number[] }> {
  const data = await ncmFetch<any>(`/playlist/detail?id=${playlistId}`);
  const p = data?.playlist ?? {};
  const rawTracks = p.tracks ?? [];
  const rawTrackIds = p.trackIds ?? [];
  const apiIds: number[] = rawTrackIds.map((t: any) => (typeof t === 'number' ? t : t.id));
  // Merge local cache to defeat NetEase server-side caching
  const cachedIds = getCachedTrackIds(playlistId);
  const merged = new Set([...apiIds, ...cachedIds]);
  console.log('[getPlaylistDetail]', { playlistId, apiCount: apiIds.length, cachedCount: cachedIds.length, mergedSize: merged.size });
  return {
    playlist: {
      id: p.id,
      name: p.name,
      description: p.description ?? '',
      trackCount: Math.max(p.trackCount ?? 0, merged.size),
      coverImgUrl: p.coverImgUrl ?? '',
      creator: { nickname: p.creator?.nickname ?? '' },
    },
    tracks: rawTracks.map((t: any) => ({
      id: t.id,
      name: t.name,
      artist: t.ar?.map((a: any) => a.name).join(' / ') ?? '',
      album: t.al?.name ?? '',
      duration: t.dt ?? 0,
    })),
    allTrackIds: [...merged],
  };
}

export async function createPlaylist(name: string, privacy = false): Promise<Playlist> {
  const data = await ncmFetch<any>(`/playlist/create?name=${encodeURIComponent(name)}&privacy=${privacy ? 10 : 0}`);
  const p = data?.playlist ?? {};
  return {
    id: p.id,
    name: p.name,
    description: p.description ?? '',
    trackCount: p.trackCount ?? 0,
    coverImgUrl: p.coverImgUrl ?? '',
    creator: { nickname: p.creator?.nickname ?? '' },
  };
}

export async function addTracksToPlaylist(playlistId: number, trackIds: number[]): Promise<void> {
  await ncmFetch<any>(`/playlist/tracks?op=add&pid=${playlistId}&tracks=${trackIds.join(',')}`);
}

export async function removeTracksFromPlaylist(playlistId: number, trackIds: number[]): Promise<void> {
  await ncmFetch<any>(`/playlist/tracks?op=del&pid=${playlistId}&tracks=${trackIds.join(',')}`);
}
