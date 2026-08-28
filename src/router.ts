import express from 'express';
import type { Express, Request, Response, NextFunction } from 'express';
import type Database from 'better-sqlite3';
import { getRecentPlays, getPlayHistory, getPlan, addMessage, addPlay, getMessages, clearMessages, getPref, setPref, addFavorite, removeFavorite, isFavorite, getFavorites, addHiddenSong, getPlayStats, getPlayStatsAll } from './db.js';
import { invokeClaude } from './claude.js';
import { assemblePrompt } from './context.js';
import { getSuggestedQueue } from './predictor.js';
import { generateReport, getCurrentStatsWindow, isStatsRange } from './analytics.js';
import type { createExecutor } from './executor.js';
import { broadcast } from './ws.js';
import { handleSkip } from './feedback.js';
import { cacheCoords } from './triggers.js';
import { getSongUrl, getSongDetail, getSimilarSongs, setNcmCookie, getNcmCookie, clearNcmCookie, getNcmBase, getLoginStatus, setDefaultBr, QUALITY_LEVELS, getUserPlaylists, getPlaylistDetail, createPlaylist, addTracksToPlaylist, removeTracksFromPlaylist, getLyric } from './adapters/netease.js';
import { getCurrentWeatherByCoords, setWeatherKey, hasWeatherKey } from './adapters/weather.js';
import { setNcmBase } from './adapters/netease.js';
import { addCachedTrackIds, removeCachedTrackIds } from './playlist-cache.js';
import { setFeishuConfig } from './adapters/feishu.js';
import { setUpnpDevices } from './adapters/upnp.js';
import { setFishKey } from './tts.js';
import { AppError, errorMiddleware } from './errors.js';
import { defaultUserCorpusDir, resolveAppFile, resolveRuntimeFile } from './runtime.js';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';

const ENV_PATH = path.resolve(resolveRuntimeFile('.env'));

const ENV_KEY_MAP: Record<string, string> = {
  ncmApi: 'NCM_API',
  ncmQuality: 'NCM_QUALITY',
  weatherKey: 'SENIVERSE_API_KEY',
  fishKey: 'FISH_AUDIO_API_KEY',
  feishuAppId: 'FEISHU_APP_ID',
  feishuAppSecret: 'FEISHU_APP_SECRET',
  upnpDevices: 'UPNP_DEVICES',
  userCorpusDir: 'USER_CORPUS_DIR',
};

function syncEnvFile(updates: Record<string, string | undefined>): void {
  let content = '';
  try { content = fs.readFileSync(ENV_PATH, 'utf-8'); } catch { /* no .env yet */ }

  const lines = content.split('\n');

  for (const [jsKey, envKey] of Object.entries(ENV_KEY_MAP)) {
    const val = updates[jsKey];
    if (val === undefined) continue;

    const lineIdx = lines.findIndex((l) =>
      l.startsWith(`${envKey}=`) || l.startsWith(`# ${envKey}=`));

    const newLine = `${envKey}=${val}`;
    if (lineIdx >= 0) {
      lines[lineIdx] = newLine;
    } else {
      lines.push(newLine);
    }
  }

  fs.mkdirSync(path.dirname(ENV_PATH), { recursive: true });
  fs.writeFileSync(ENV_PATH, lines.join('\n') + '\n', 'utf-8');
}

function readEnvFile(): Record<string, string> {
  const result: Record<string, string> = {};
  try {
    const content = fs.readFileSync(ENV_PATH, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      result[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
    }
  } catch { /* .env not found */ }
  return result;
}

function extractMusicU(cookie: string): string {
  const match = cookie.match(/MUSIC_U=([^;]+)/);
  return match ? match[1] : '';
}

const SIMPLE_COMMANDS = new Set([
  '下一首', '暂停', '继续', '上一首', '音量加', '音量减',
  'next', 'pause', 'resume', 'prev', 'volume_up', 'volume_down',
  'stop', 'play', 'start',
]);

function classifyIntent(text: string): 'simple' | 'claude' {
  const trimmed = text.trim().toLowerCase();
  for (const cmd of SIMPLE_COMMANDS) {
    if (cmd === trimmed) return 'simple';
  }
  return 'claude';
}

function loadDJPrompt(): string {
  try {
    return fs.readFileSync(resolveAppFile('prompts/dj-persona.md'), 'utf-8');
  } catch {
    return '';
  }
}

function maskSecret(value: string): string {
  return value ? '********' : '';
}

interface RouterOptions {
  db?: Database.Database;
  executor?: ReturnType<typeof createExecutor>;
}

export function createApp(opts: RouterOptions = {}): Express {
  const app = express();
  app.use(express.json());

  app.post('/api/chat', async (req: Request, res: Response, next: NextFunction) => {
    try {
    const { text } = req.body;

    if (typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ error: 'text required' });
      return;
    }

    if (classifyIntent(text) === 'simple') {
      if (opts.db) addMessage(opts.db, { role: 'user', content: text });
      res.json({ talk: false, claude: false, action: text.trim() });
      return;
    }

    // Check if LLM is enabled
    const llmEnabled = opts.db ? getPref(opts.db, 'llm_enabled') : 'true';
    if (llmEnabled === 'false') {
      if (opts.db) addMessage(opts.db, { role: 'user', content: text });
      res.json({ talk: true, claude: false, say: 'LLM 已禁用，请在设置中启用。' });
      return;
    }

    // Save user message to DB
    if (opts.db) addMessage(opts.db, { role: 'user', content: text });

    // Fetch real context if executor is available
    let weather = '';
    let calendar = '';
    if (opts.executor) {
      try {
        const { lat, lon } = req.body;
        const requestLat = Number(lat);
        const requestLon = Number(lon);
        if (lat != null && lon != null && Number.isFinite(requestLat) && Number.isFinite(requestLon)) {
          cacheCoords(requestLat, requestLon);
        }
        const ctx = await opts.executor.getContext(
          (lat != null && lon != null && Number.isFinite(requestLat) && Number.isFinite(requestLon))
            ? { lat: requestLat, lon: requestLon }
            : undefined
        );
        weather = ctx.weather;
        calendar = ctx.calendar;
      } catch {
          console.warn('[chat] getContext failed, using empty context');
        }
    }

    const history = opts.db ? getMessages(opts.db, 10).reverse() : [];
    const basePrompt = assemblePrompt({
      userCorpusDir: (opts.db ? getPref(opts.db, 'user_corpus_dir') : null) ?? defaultUserCorpusDir(),
      weather,
      calendar,
      time: new Date().toLocaleString('zh-CN'),
      recentHistory: history,
    });
    const djPersona = loadDJPrompt();

    // Mood detection
    const moodKeywords: Record<string, string> = {
      '心情不好': 'low', '难过': 'low', '伤心': 'low', '郁闷': 'low', '低落': 'low',
      '累了': 'tired', '困': 'tired', '疲惫': 'tired',
      '焦虑': 'anxious', '紧张': 'anxious', '烦': 'anxious',
      '开心': 'happy', '高兴': 'happy', '愉快': 'happy', '快乐': 'happy',
      '兴奋': 'excited', '激动': 'excited', '期待': 'excited',
    };
    let moodDetected = '';
    for (const [kw, mood] of Object.entries(moodKeywords)) {
      if (text.includes(kw)) { moodDetected = mood; break; }
    }
    const moodGuidance = moodDetected
      ? `\n=== Mood Guidance ===\nUser mood seems: ${moodDetected}\nStrategy: validate first (1 slow/mid song), then gradually warm up. Never jump to extreme opposite.\nOutput "mood" and "arc" fields in your JSON.`
      : '';

    const ncmLoggedIn = !!getNcmCookie();

    const fullPrompt = `${djPersona}

${basePrompt}
${moodGuidance}
NetEase logged in: ${ncmLoggedIn}

=== User Message ===
${text}

IMPORTANT: Output ONLY valid JSON, no markdown, no extra text.
"play" must be an array of search query strings, e.g. ["法老 人上人", "Bill Evans Waltz for Debby"].
These will be used to search NetEase Cloud Music. If no song fits, "play" must be empty.

When user says "随便听听" / "私人FM" / "随便放" / "随机音乐": set "play_mode" to "fm".
When user says "心动模式" / "智能播放" / "根据这首继续" / "类似的多来点": set "play_mode" to "intelligence" and "play_mode_params" to { "songId": <current song id>, "playlistId": <playlist id> }.
Only use play_mode when user explicitly asks for these features. Otherwise omit play_mode.

{
  "say": "DJ播报文案（中文，简短自然，1-2句话）",
  "play": [],
  "reason": "选歌原因",
  "segue": "歌曲转场词（没有则填空字符串）",
  "mood": { "detected": "识别的情绪", "target": "目标情绪" },
  "arc": { "start": "slow|mid|high", "end": "slow|mid|high", "steps": 3 }
}`;

     let result = await invokeClaude(fullPrompt, { db: opts.db });
     if (result.error) {
       result = await invokeClaude(`${fullPrompt}\n\nYour previous response violated the JSON contract. Return a JSON object with string "say" and string-array "play" fields. Output JSON only.`, { db: opts.db });
     }
     if (result.error) {
       res.status(502).json({ say: '抱歉，DJ 返回了无效指令，请再试一次。', play: [], reason: '', segue: '', claude: false, error: true });
       return;
     }

    if (result.usage) {
      broadcast('token_usage', result.usage);
    }

    // Save AI reply to DB
    if (opts.db && result.say) {
      addMessage(opts.db, { role: 'assistant', content: result.say });
    }

    // Execute play actions if executor is available
    let playedItems;
    if (opts.executor && (result.play_mode === 'fm' || result.play_mode === 'intelligence')) {
      if (result.play_mode === 'fm') {
        try {
          const item = await opts.executor.startFM();
          if (item) {
            playedItems = [item];
            broadcast('play', { tracks: [item], fm: true, arc: result.arc });
            if (opts.db) {
              addMessage(opts.db, { role: 'assistant', content: `Playing: ${item.name} by ${item.artist}` });
            }
          }
        } catch {
          console.warn('[chat] FM start failed');
        }
      } else if (result.play_mode === 'intelligence' && result.play_mode_params) {
        try {
          const items = await opts.executor.startIntelligence(
            result.play_mode_params.songId ?? 0,
            result.play_mode_params.playlistId ?? 0,
          );
          if (items.length > 0) {
            playedItems = items;
            broadcast('play', { tracks: items, smart: true, arc: result.arc });
            if (opts.db) {
              for (const item of items) {
                addMessage(opts.db, { role: 'assistant', content: `Playing: ${item.name} by ${item.artist}` });
              }
            }
          }
        } catch {
          console.warn('[chat] intelligence start failed');
        }
      }
    } else if (opts.executor && result.play && result.play.length > 0) {
      const queries = result.play.filter((p: any) => typeof p === 'string');
      if (queries.length > 0) {
        try {
          playedItems = await opts.executor.executePlay(queries);
          // Log player state
          if (opts.db && playedItems.length > 0) {
            for (const item of playedItems) {
              addMessage(opts.db, { role: 'assistant', content: `Playing: ${item.name} by ${item.artist}` });
            }
          }
          // Broadcast play event to all WebSocket clients
          broadcast('play', { tracks: playedItems, arc: result.arc });
        } catch {
          console.warn('[chat] executePlay failed');
        }
      }
    }

    // Handle TTS for the say message
    if (opts.executor && result.say) {
      opts.executor.acquireSpeaker();
      broadcast('say', { text: result.say });
    }

    res.json({ ...result, claude: true, played: playedItems ?? [] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      console.error('[chat error]', err);
      res.status(500).json({
        say: `抱歉，出错了: ${msg}`,
        play: [],
        reason: '',
        segue: '',
        claude: false,
        error: true,
      });
    }
  });

  app.get('/api/messages', (_req: Request, res: Response) => {
    if (!opts.db) return res.json({ messages: [] });
    const messages = getMessages(opts.db, 100).reverse();
    res.json({ messages });
  });

  app.delete('/api/messages', (_req: Request, res: Response) => {
    if (!opts.db) return res.status(503).json({ error: 'DB unavailable' });
    clearMessages(opts.db);
    res.json({ ok: true });
  });

  app.get('/api/now', (_req: Request, res: Response) => {
    const queue = opts.db ? getRecentPlays(opts.db, 20) : [];
    res.json({ current: queue[0] ?? null, queue });
  });

  app.get('/api/history', (req: Request, res: Response) => {
    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? 20);
    if (!opts.db) return res.json({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
    res.json(getPlayHistory(opts.db, page, pageSize));
  });

  app.post('/api/history/record', (req: Request, res: Response) => {
    const { songId, name, artist } = req.body;
    if (!songId) return res.status(400).json({ error: 'songId required' });
    if (opts.db) {
      addPlay(opts.db, {
        song_id: String(songId),
        song_name: name ?? '',
        artist: artist ?? '',
      });
    }
    res.json({ ok: true });
  });

  app.get('/api/queue', (_req: Request, res: Response) => {
    if (!opts.executor) return res.json({ queue: [], current: null });
    const ps = opts.executor.getPlayState();
    res.json({ queue: ps.queue, current: ps.currentSong });
  });

  app.get('/api/queue/suggested', async (req: Request, res: Response, next: NextFunction) => {
    if (!opts.db || !opts.executor) {
      return res.status(503).json({ error: 'unavailable' });
    }
    try {
      const suggestionEnabled = getPref(opts.db, 'scene_suggestions_enabled');
      if (suggestionEnabled === 'false') {
        return res.json({ enabled: false, scene: null, say: '', play: [], reason: '' });
      }
      const { lat, lon } = req.query;
      const requestLat = Number(lat);
      const requestLon = Number(lon);
      if (lat != null && lon != null && (!Number.isFinite(requestLat) || !Number.isFinite(requestLon))) {
        return res.status(400).json({ error: 'invalid coordinates' });
      }
      const ctx = await opts.executor.getContext(
        (lat != null && lon != null) ? { lat: requestLat, lon: requestLon } : undefined
      );
      const suggestion = await getSuggestedQueue({
        db: opts.db,
        weather: ctx.weather,
        calendar: ctx.calendar,
      });
      res.json(suggestion);
    } catch (err) {
      next(new AppError('CLAUDIO_ERR_API', err instanceof Error ? err.message : String(err), 502));
    }
  });

  app.get('/api/plan/today', (_req: Request, res: Response) => {
    const plan = opts.db
      ? getPlan(opts.db, new Date().toISOString().slice(0, 10))
      : null;
    res.json(plan ?? { songs: [], theme: '' });
  });

  // ── API 配置 ──
  app.get('/api/config', (req: Request, res: Response) => {
    if (!opts.db) return res.status(503).json({ error: 'DB unavailable' });
    const env = readEnvFile();
    const apiKey = env.ANTHROPIC_API_KEY || getPref(opts.db, 'api_key') || '';
    const baseUrl = env.ANTHROPIC_BASE_URL || getPref(opts.db, 'api_base_url') || '';
    const apiModel = env.API_MODEL || getPref(opts.db, 'api_model') || '';
    const ncmApi = env.NCM_API || getPref(opts.db, 'ncm_api') || '';
    const weatherKey = env.SENIVERSE_API_KEY || getPref(opts.db, 'weather_key') || '';
    const fishKey = env.FISH_AUDIO_API_KEY || getPref(opts.db, 'fish_key') || '';
    const feishuAppId = env.FEISHU_APP_ID || getPref(opts.db, 'feishu_app_id') || '';
    const feishuAppSecret = env.FEISHU_APP_SECRET || getPref(opts.db, 'feishu_app_secret') || '';
    const upnpDevices = env.UPNP_DEVICES || getPref(opts.db, 'upnp_devices') || '[]';
    const userCorpusDir = env.USER_CORPUS_DIR || getPref(opts.db, 'user_corpus_dir') || '';
    const ncmLoggedIn = !!getNcmCookie();
    const ncmQuality = env.NCM_QUALITY || getPref(opts.db, 'ncm_quality') || '';
    const llmEnabled = getPref(opts.db, 'llm_enabled');
    const sceneSuggestionsEnabled = getPref(opts.db, 'scene_suggestions_enabled');
    const quickInputShortcut = getPref(opts.db, 'quick_input_shortcut') || 'CommandOrControl+Shift+Space';
    const autoLaunchEnabled = getPref(opts.db, 'auto_launch_enabled');
    res.json({ apiKey: maskSecret(apiKey), baseUrl, apiModel, ncmApi, weatherKey: maskSecret(weatherKey), fishKey: maskSecret(fishKey), feishuAppId, feishuAppSecret: maskSecret(feishuAppSecret), upnpDevices, userCorpusDir, ncmLoggedIn, ncmQuality, llmEnabled: llmEnabled !== 'false', sceneSuggestionsEnabled: sceneSuggestionsEnabled !== 'false', quickInputShortcut, autoLaunchEnabled: autoLaunchEnabled === 'true' });
  });

  app.post('/api/config', (req: Request, res: Response) => {
    if (!opts.db) return res.status(503).json({ error: 'DB unavailable' });
    const { apiKey, baseUrl, apiModel, ncmApi, ncmQuality, weatherKey, fishKey, feishuAppId, feishuAppSecret, upnpDevices, userCorpusDir, llmEnabled, sceneSuggestionsEnabled, quickInputShortcut, autoLaunchEnabled } = req.body;
    // Secrets: skip empty or masked values to avoid overwriting with placeholder
    if (apiKey !== undefined && apiKey !== '' && !apiKey.includes('*')) {
      setPref(opts.db, 'api_key', apiKey);
    }
    if (weatherKey !== undefined && weatherKey !== '' && !weatherKey.includes('*')) {
      setPref(opts.db, 'weather_key', weatherKey);
    }
    if (fishKey !== undefined && fishKey !== '' && !fishKey.includes('*')) {
      setPref(opts.db, 'fish_key', fishKey);
    }
    if (feishuAppSecret !== undefined && feishuAppSecret !== '' && !feishuAppSecret.includes('*')) {
      setPref(opts.db, 'feishu_app_secret', feishuAppSecret);
    }
    // Non-secrets: allow empty to clear
    if (baseUrl !== undefined) setPref(opts.db, 'api_base_url', baseUrl);
    if (apiModel !== undefined) setPref(opts.db, 'api_model', apiModel);
    if (ncmApi !== undefined) setPref(opts.db, 'ncm_api', ncmApi);
    if (ncmQuality !== undefined) {
      setPref(opts.db, 'ncm_quality', ncmQuality);
      const br = ncmQuality && QUALITY_LEVELS[ncmQuality as keyof typeof QUALITY_LEVELS];
      if (br) setDefaultBr(br);
    }
    if (feishuAppId !== undefined) setPref(opts.db, 'feishu_app_id', feishuAppId);
    if (upnpDevices !== undefined) setPref(opts.db, 'upnp_devices', upnpDevices);
    if (userCorpusDir !== undefined) setPref(opts.db, 'user_corpus_dir', userCorpusDir);
    if (llmEnabled !== undefined) setPref(opts.db, 'llm_enabled', llmEnabled ? 'true' : 'false');
    if (sceneSuggestionsEnabled !== undefined) setPref(opts.db, 'scene_suggestions_enabled', sceneSuggestionsEnabled ? 'true' : 'false');
    if (quickInputShortcut !== undefined) setPref(opts.db, 'quick_input_shortcut', quickInputShortcut || 'CommandOrControl+Shift+Space');
    if (autoLaunchEnabled !== undefined) setPref(opts.db, 'auto_launch_enabled', autoLaunchEnabled ? 'true' : 'false');

    syncEnvFile({ ncmApi, ncmQuality, weatherKey, fishKey, feishuAppId, feishuAppSecret, upnpDevices, userCorpusDir });

    // Apply config to adapters immediately (no restart needed)
    if (weatherKey !== undefined) setWeatherKey(weatherKey);
    if (fishKey !== undefined) setFishKey(fishKey);
    if (ncmApi !== undefined) setNcmBase(ncmApi);
    if (feishuAppId !== undefined || feishuAppSecret !== undefined) setFeishuConfig(feishuAppId ?? '', feishuAppSecret ?? '');
    if (upnpDevices !== undefined) {
      try { setUpnpDevices(JSON.parse(upnpDevices)); } catch { console.warn('[config] upnp parse failed'); }
    }

    res.json({ ok: true });
  });

  app.post('/api/config/test', async (req: Request, res: Response, next: NextFunction) => {
    if (!opts.db) return res.status(503).json({ error: 'DB unavailable' });
    const suppliedApiKey = typeof req.body.apiKey === 'string' ? req.body.apiKey : '';
    const apiKey = suppliedApiKey && !suppliedApiKey.includes('*')
      ? suppliedApiKey
      : getPref(opts.db, 'api_key') || process.env.ANTHROPIC_API_KEY || '';
    const baseUrl = req.body.baseUrl || getPref(opts.db, 'api_base_url') || process.env.ANTHROPIC_BASE_URL || '';
    if (!apiKey) return res.status(400).json({ ok: false, message: 'API Key 不能为空' });
    if (!baseUrl) return res.status(400).json({ ok: false, message: 'Base URL 不能为空' });

    const cleanBase = baseUrl.replace(/\/v1\/?$/i, '').replace(/\/+$/, '');
    const isAnthropic = cleanBase.includes('anthropic.com');
    const testModel = req.body.apiModel || getPref(opts.db, 'api_model') || 'deepseek-v4-flash';

    try {
      if (isAnthropic) {
        const response = await fetch(`${cleanBase}/v1/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: testModel, max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }),
        });
        if (!response.ok) {
          const text = await response.text().catch(() => 'unknown error');
          return res.status(502).json({ ok: false, message: `API 错误 (${response.status}): ${text.slice(0, 200)}` });
        }
        res.json({ ok: true, message: '主人，我在' });
      } else {
        // OpenAI-compatible
        const body = JSON.stringify({ model: testModel, max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] });
        const u = new URL(`${cleanBase}/v1/chat/completions`);
        const result = await new Promise<{ ok: boolean; message: string }>((resolve) => {
          const req = https.request({
             hostname: u.hostname, port: u.port || 443, path: `${u.pathname}${u.search}`, method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'Content-Length': Buffer.byteLength(body) },
            timeout: 10000,
          }, (r) => {
            let data = '';
            r.on('data', (chunk) => data += chunk);
            r.on('end', () => {
              if (r.statusCode && r.statusCode >= 200 && r.statusCode < 300) {
                resolve({ ok: true, message: '主人，我在' });
              } else {
                resolve({ ok: false, message: `API 错误 (${r.statusCode}): ${data.slice(0, 200)}` });
              }
            });
          });
          req.on('error', (e) => resolve({ ok: false, message: `连接失败: ${e.message}` }));
          req.on('timeout', () => { req.destroy(); resolve({ ok: false, message: '连接超时' }); });
          req.write(body);
          req.end();
        });
        if (result.ok) return res.json(result);
        return res.status(502).json(result);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(502).json({ ok: false, message: `连接失败: ${msg}` });
    }
  });

  app.get('/api/models', async (_req: Request, res: Response, next: NextFunction) => {
    if (!opts.db) return res.status(503).json({ error: 'DB unavailable' });
    const apiKey = getPref(opts.db, 'api_key') || process.env.ANTHROPIC_API_KEY || '';
    const baseUrl = getPref(opts.db, 'api_base_url') || process.env.ANTHROPIC_BASE_URL || '';
    if (!apiKey) return res.json({ ok: false, message: 'API Key 未配置' });
    const cleanBase = baseUrl.replace(/\/v1\/?$/i, '').replace(/\/+$/, '');
    if (cleanBase.includes('anthropic.com')) return res.json({ ok: false, message: 'Anthropic 不支持列出模型' });
    try {
      // OpenAI-compatible: try /v1/models first, fallback to /models (DeepSeek)
      let models: string[] = [];
      for (const path of ['/v1/models', '/models']) {
        const response = await fetch(`${cleanBase}${path}`, {
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' },
        });
        if (response.ok) {
          const data = await response.json() as { data?: Array<{ id: string }> };
          models = data.data?.map(m => m.id) || [];
          break;
        }
      }
      if (!models.length) return res.json({ ok: false, message: '无法获取模型列表' });
      res.json({ ok: true, models });
    } catch (err) {
      res.json({ ok: false, message: err instanceof Error ? err.message : '获取失败' });
    }
  });

  // ── NCM Login ──

  async function ncmProxyGet(path: string): Promise<{ body: any; cookie?: string }> {
    const url = `${getNcmBase()}${path}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const body = await r.json();
    return { body, cookie: body.cookie as string | undefined };
  }

  app.post('/api/ncm/login/qr/key', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const { body } = await ncmProxyGet('/login/qr/key?timestamp=' + Date.now());
      res.json(body);
    } catch (err) {
      next(new AppError('CLAUDIO_ERR_NCM_API', (err as Error).message, 502));
    }
  });

  app.post('/api/ncm/login/qr/create', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { key } = req.body;
      if (!key) return res.status(400).json({ error: 'key required' });
      const { body } = await ncmProxyGet(`/login/qr/create?key=${encodeURIComponent(key)}&qrimg=true&timestamp=${Date.now()}`);
      res.json(body);
    } catch (err) {
      next(new AppError('CLAUDIO_ERR_NCM_API', (err as Error).message, 502));
    }
  });

  app.post('/api/ncm/login/qr/check', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { key } = req.body;
      if (!key) return res.status(400).json({ error: 'key required' });
      const { body, cookie } = await ncmProxyGet(`/login/qr/check?key=${encodeURIComponent(key)}&timestamp=${Date.now()}`);
      // code 803 = authorized, save cookie
      if (body.code === 803 && cookie && opts.db) {
        const musicU = extractMusicU(cookie);
        if (musicU) {
          setPref(opts.db, 'ncm_cookie', musicU);
          setNcmCookie(musicU);
        }
      }
      res.json(body);
    } catch (err) {
      next(new AppError('CLAUDIO_ERR_NCM_API', (err as Error).message, 502));
    }
  });

  app.post('/api/ncm/login/cellphone', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { phone, password, captcha } = req.body;
      if (!phone) return res.status(400).json({ error: 'phone required' });
      // captcha replaces password per API doc: when captcha provided, password ignored
      let path = `/login/cellphone?phone=${encodeURIComponent(phone)}&timestamp=${Date.now()}&randomCNIP=true`;
      if (captcha) {
        path += `&captcha=${encodeURIComponent(captcha)}`;
      } else {
        if (!password) return res.status(400).json({ error: 'password or captcha required' });
        path += `&password=${encodeURIComponent(password)}`;
      }
      const { body, cookie } = await ncmProxyGet(path);
      if (body.code === 200 && cookie && opts.db) {
        const musicU = extractMusicU(cookie);
        if (musicU) {
          setPref(opts.db, 'ncm_cookie', musicU);
          setNcmCookie(musicU);
        }
      }
      res.json(body);
    } catch (err) {
      next(new AppError('CLAUDIO_ERR_NCM_API', (err as Error).message, 502));
    }
  });

  app.post('/api/ncm/login/send-captcha', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { phone } = req.body;
      if (!phone) return res.status(400).json({ error: 'phone required' });
      const { body } = await ncmProxyGet(`/captcha/sent?phone=${encodeURIComponent(phone)}&timestamp=${Date.now()}&randomCNIP=true`);
      res.json(body);
    } catch (err) {
      next(new AppError('CLAUDIO_ERR_NCM_API', (err as Error).message, 502));
    }
  });

  app.post('/api/ncm/logout', (_req: Request, res: Response) => {
    if (opts.db) setPref(opts.db, 'ncm_cookie', '');
    clearNcmCookie();
    res.json({ ok: true });
  });

  app.get('/api/ncm/login/status', async (_req: Request, res: Response, next: NextFunction) => {
    const loggedIn = !!getNcmCookie();
    let vipType = 0;
    let nickname = '';
    if (loggedIn) {
      try {
        const info = await getLoginStatus();
        vipType = info.vipType;
        nickname = info.nickname ?? '';
      } catch { console.warn('[ncm] login status fetch failed'); }
    }
    res.json({ loggedIn, vipType, nickname });
  });

  // ── Playlist routes ──

  function requireNcmLogin(res: Response): boolean {
    if (!getNcmCookie()) {
      res.status(401).json({ error: 'NCM not logged in' });
      return false;
    }
    return true;
  }

  app.get('/api/ncm/playlists', async (_req: Request, res: Response, next: NextFunction) => {
    if (!requireNcmLogin(res)) return;
    try {
      const status = await getLoginStatus();
      if (!status.userId) return res.status(500).json({ error: 'Failed to get user ID' });
      const playlists = await getUserPlaylists(status.userId);
      res.json({ playlists });
    } catch (err) {
      next(new AppError('CLAUDIO_ERR_NCM_API', (err as Error).message, 502));
    }
  });

  app.get('/api/ncm/playlist/:id', async (req: Request, res: Response, next: NextFunction) => {
    if (!requireNcmLogin(res)) return;
    try {
      const pid = Number(req.params.id);
      if (isNaN(pid)) return res.status(400).json({ error: 'Invalid playlist id' });
      const detail = await getPlaylistDetail(pid);
      res.json(detail);
    } catch (err) {
      next(new AppError('CLAUDIO_ERR_NCM_API', (err as Error).message, 502));
    }
  });

  app.post('/api/ncm/playlist/create', async (req: Request, res: Response, next: NextFunction) => {
    if (!requireNcmLogin(res)) return;
    const { name, privacy } = req.body;
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name required' });
    try {
      const playlist = await createPlaylist(name, !!privacy);
      res.json({ playlist });
    } catch (err) {
      next(new AppError('CLAUDIO_ERR_NCM_API', (err as Error).message, 502));
    }
  });

  app.post('/api/ncm/playlist/:id/tracks', async (req: Request, res: Response, next: NextFunction) => {
    if (!requireNcmLogin(res)) return;
    const pid = Number(req.params.id);
    if (isNaN(pid)) return res.status(400).json({ error: 'Invalid playlist id' });
    const { trackIds } = req.body;
    if (!Array.isArray(trackIds) || trackIds.length === 0) return res.status(400).json({ error: 'trackIds array required' });
    try {
      await addTracksToPlaylist(pid, trackIds);
      addCachedTrackIds(pid, trackIds);
      res.json({ ok: true });
    } catch (err) {
      next(new AppError('CLAUDIO_ERR_NCM_API', (err as Error).message, 502));
    }
  });

  app.delete('/api/ncm/playlist/:id/tracks', async (req: Request, res: Response, next: NextFunction) => {
    if (!requireNcmLogin(res)) return;
    const pid = Number(req.params.id);
    if (isNaN(pid)) return res.status(400).json({ error: 'Invalid playlist id' });
    const { trackIds } = req.body;
    if (!Array.isArray(trackIds) || trackIds.length === 0) return res.status(400).json({ error: 'trackIds array required' });
    try {
      await removeTracksFromPlaylist(pid, trackIds);
      removeCachedTrackIds(pid, trackIds);
      res.json({ ok: true });
    } catch (err) {
      next(new AppError('CLAUDIO_ERR_NCM_API', (err as Error).message, 502));
    }
  });

  app.get('/api/status/ncm', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const [status, loginInfo] = await Promise.all([
        (async () => {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 3000);
          const r = await fetch(`${getNcmBase().replace(/\/+$/, '')}/`, {
            signal: ctrl.signal,
          });
          clearTimeout(timer);
          return r.ok ? { online: true } : { online: false, reason: `HTTP ${r.status}` };
        })(),
        getLoginStatus().catch(() => ({ online: false, vipType: 0, nickname: '' })),
      ]);
      res.json({ ...status, vipType: loginInfo.vipType, nickname: loginInfo.nickname ?? '' });
    } catch {
      console.warn('[ncm] status check failed');
      res.json({ online: false, reason: 'unreachable', vipType: 0 });
    }
  });

  // ── Weather ──

  app.get('/api/weather', async (req: Request, res: Response, next: NextFunction) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: 'lat and lon required' });
    cacheCoords(lat, lon);
    if (!hasWeatherKey()) return res.status(204).send();
    try {
      const data = await getCurrentWeatherByCoords(lat, lon);
      res.json(data);
    } catch (err) {
      next(new AppError('CLAUDIO_ERR_NCM_API', (err as Error).message, 502));
    }
  });

  // ── Favorites ──

  app.get('/api/favorites', (_req: Request, res: Response) => {
    if (!opts.db) return res.json({ favorites: [] });
    res.json({ favorites: getFavorites(opts.db) });
  });

  app.post('/api/favorites/toggle', (req: Request, res: Response) => {
    if (!opts.db) return res.status(503).json({ error: 'DB unavailable' });
    const { songId, name, artist } = req.body;
    if (!songId) return res.status(400).json({ error: 'songId required' });

    if (isFavorite(opts.db, songId)) {
      removeFavorite(opts.db, songId);
      res.json({ loved: false });
    } else {
      addFavorite(opts.db, songId, name || '', artist || '');
      res.json({ loved: true });
    }
  });

  // ── Hide ──

  app.post('/api/hide', async (req: Request, res: Response, next: NextFunction) => {
    if (!opts.db) return res.status(503).json({ error: 'DB unavailable' });
    const { songId, name, artist, scene, sessionId } = req.body;
    if (!songId) return res.status(400).json({ error: 'songId required' });

    addHiddenSong(opts.db, songId, name || '', artist || '');
    res.json({ hidden: true });

    // Trigger feedback check (fire-and-forget, don't block response)
    if (sessionId) {
      handleSkip({
        db: opts.db,
        songId,
        songName: name || '',
        artist: artist || '',
        scene: scene || 'unknown',
        sessionId,
      }).then(result => {
        if (result.corrected && result.say) {
          broadcast('correction', { say: result.say, play: result.play });
        }
      }).catch(() => { /* ignore */ });
    }
  });

  // ── Direct Play ──

  app.post('/api/play/fm/start', async (_req: Request, res: Response, next: NextFunction) => {
    if (!opts.executor) return res.status(503).json({ error: 'executor unavailable' });
    try {
      const item = await opts.executor.startFM();
      if (!item) return res.status(502).json({ error: 'FM API returned no song' });
      broadcast('play', { tracks: [item], fm: true });
      if (opts.db) addMessage(opts.db, { role: 'assistant', content: `Playing: ${item.name} by ${item.artist}` });
      res.json(item);
    } catch (err) {
      next(new AppError('CLAUDIO_ERR_NCM_API', (err as Error).message, 502));
    }
  });

  app.post('/api/play/intelligence/start', async (req: Request, res: Response, next: NextFunction) => {
    if (!opts.executor) return res.status(503).json({ error: 'executor unavailable' });
    const { songId, playlistId } = req.body;
    if (!songId) return res.status(400).json({ error: 'songId required' });
    try {
      const items = await opts.executor.startIntelligence(Number(songId), playlistId ? Number(playlistId) : undefined);
      if (!items.length) return res.status(502).json({ error: 'intelligence returned no songs' });
      broadcast('play', { tracks: items, smart: true });
      if (opts.db) {
        for (const item of items) {
          addMessage(opts.db, { role: 'assistant', content: `Playing: ${item.name} by ${item.artist}` });
        }
      }
      res.json(items);
    } catch (err) {
      next(new AppError('CLAUDIO_ERR_NCM_API', (err as Error).message, 502));
    }
  });

  app.post('/api/play/fm/next', async (_req: Request, res: Response, next: NextFunction) => {
    if (!opts.executor) return res.status(503).json({ error: 'executor unavailable' });
    const ps = opts.executor.getPlayState();
    if (!ps.isFmMode) return res.status(400).json({ error: 'not in FM mode' });
    try {
      const item = await opts.executor.getNextFMSong();
      if (!item) return res.status(502).json({ error: 'FM API returned no song' });
      res.json(item);
    } catch (err) {
      next(new AppError('CLAUDIO_ERR_NCM_API', (err as Error).message, 502));
    }
  });

  app.post('/api/play/mode/exit', async (_req: Request, res: Response, next: NextFunction) => {
    if (opts.executor) opts.executor.exitMode();
    broadcast('mode_exit', {});
    res.json({ ok: true });
  });

  app.post('/api/play/by-id', async (req: Request, res: Response, next: NextFunction) => {
    const { songId } = req.body;
    if (!songId) return res.status(400).json({ error: 'songId required' });

    try {
      const [url, detail] = await Promise.all([
        getSongUrl(Number(songId)),
        getSongDetail(Number(songId)),
      ]);
      if (!detail) return res.status(404).json({ error: 'song not found' });

      const item = { songId: String(detail.id), name: detail.name, artist: detail.artist, url };
      res.json(item);
    } catch (err) {
      next(new AppError('CLAUDIO_ERR_API', err instanceof Error ? err.message : String(err), 502));
    }
  });

  app.get('/api/lyric', async (req: Request, res: Response, next: NextFunction) => {
    const songId = Number(req.query.songId);
    if (!songId) return res.status(400).json({ error: 'songId required' });
    try {
      const lyric = await getLyric(songId);
      res.json({ lyric });
    } catch {
      console.warn('[api] lyric fetch failed');
      res.json({ lyric: '' });
    }
  });

  app.post('/api/play/similar', async (req: Request, res: Response, next: NextFunction) => {
    const { songId } = req.body;
    if (!songId) return res.status(400).json({ error: 'songId required' });

    try {
      const songs = await getSimilarSongs(Number(songId));
      if (!songs.length) return res.json({ songs: [] });

      const items = await Promise.all(songs.map(async (s) => {
        let url = '';
        try { url = await getSongUrl(Number(s.id)); } catch { console.warn('[api] similar song URL failed'); }
        return { songId: String(s.id), name: s.name, artist: s.artist, url };
      }));

      res.json({ songs: items });
    } catch (err) {
      next(new AppError('CLAUDIO_ERR_API', err instanceof Error ? err.message : String(err), 502));
    }
  });

  app.post('/api/play/search', async (req: Request, res: Response, next: NextFunction) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });

    try {
      const { searchSongs } = await import('./adapters/netease.js');
      const songs = await searchSongs(name, 1);
      if (!songs.length) return res.status(404).json({ error: 'not found' });

      const url = await getSongUrl(Number(songs[0].id));
      const item = { songId: String(songs[0].id), name: songs[0].name, artist: songs[0].artist, url };
      res.json(item);
    } catch (err) {
      next(new AppError('CLAUDIO_ERR_API', err instanceof Error ? err.message : String(err), 502));
    }
  });

  // ── Audio Proxy ──

  app.get('/api/proxy/audio', (req: Request, res: Response) => {
    const urlStr = req.query.url as string;
    if (!urlStr) return res.status(400).json({ error: 'url required' });

    let targetUrl: URL;
    try {
      targetUrl = new URL(urlStr);
      if (!targetUrl.hostname.endsWith('music.126.net') && !targetUrl.hostname.endsWith('music.163.com')) {
        return res.status(403).json({ error: 'domain not allowed' });
      }
    } catch {
      return res.status(400).json({ error: 'invalid url' });
    }

    const mod = targetUrl.protocol === 'https:' ? https : http;
    const headers: http.OutgoingHttpHeaders = {
      'Referer': 'https://music.163.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    };
    const options: http.RequestOptions = {
      hostname: targetUrl.hostname,
      port: targetUrl.port || undefined,
      path: targetUrl.pathname + targetUrl.search,
      method: 'GET',
      headers,
    };

    if (req.headers.range) {
      headers.Range = req.headers.range as string;
    }

    const proxyReq = mod.request(options, (proxyRes) => {
      res.status(proxyRes.statusCode || 200);
      const forwardHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges'];
      for (const key of forwardHeaders) {
        const val = proxyRes.headers[key];
        if (val) res.setHeader(key, Array.isArray(val) ? val[0] : val);
      }
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('[proxy audio error]', err);
      if (!res.headersSent) res.status(502).json({ error: err.message });
    });

    proxyReq.end();
  });

  // ── Stats ──

  app.get('/api/stats', (req: Request, res: Response) => {
    if (!opts.db) return res.status(503).json({ error: 'DB unavailable' });
    const range = req.query.range;
    if (range !== undefined) {
      if (!isStatsRange(range)) return res.status(400).json({ error: 'invalid range' });
      const window = getCurrentStatsWindow(range);
      const stats = getPlayStats(opts.db, window.period);
      if (!stats) return res.json({ period: window.period, range, stat: null, insight: null });
      return res.json({ ...stats, range });
    }

    const period = (req.query.period as string) || getCurrentStatsWindow('month').period;
    const stats = getPlayStats(opts.db, period);
    if (!stats) return res.json({ period, range: 'month', stat: null, insight: null });
    res.json({ ...stats, range: 'month' });
  });

  app.get('/api/stats/list', (_req: Request, res: Response) => {
    if (!opts.db) return res.json({ periods: [] });
    res.json({ periods: getPlayStatsAll(opts.db) });
  });

  app.post('/api/stats/generate', async (req: Request, res: Response, next: NextFunction) => {
    if (!opts.db) return res.status(503).json({ error: 'DB unavailable' });
    try {
      const range = req.body.range;
      if (range !== undefined) {
        if (!isStatsRange(range)) return res.status(400).json({ error: 'invalid range' });
        const window = getCurrentStatsWindow(range);
        const report = await generateReport(opts.db, window.period, range);
        return res.json(report);
      }

      const period = req.body.period || getCurrentStatsWindow('month').period;
      const report = await generateReport(opts.db, period);
      res.json(report);
    } catch (err) {
      next(new AppError('CLAUDIO_ERR_API', err instanceof Error ? err.message : String(err), 502));
    }
  });

  app.use(errorMiddleware);
  return app;
}
