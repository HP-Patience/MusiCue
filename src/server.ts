import express from 'express';
import http from 'node:http';
import Database from 'better-sqlite3';
import { initDb, getPref } from './db.js';
import { createApp } from './router.js';
import { createWss } from './ws.js';
import { createExecutor } from './executor.js';
import { setNcmBase, setNcmCookie, setDefaultBr, QUALITY_LEVELS } from './adapters/netease.js';
import { setWeatherKey } from './adapters/weather.js';
import { setFeishuConfig } from './adapters/feishu.js';
import { setUpnpDevices } from './adapters/upnp.js';
import { setFishKey } from './tts.js';
import { startTriggerLoop, stopTriggerLoop, getCachedCoords } from './triggers.js';
import { resolveAppFile, resolveRuntimeFile } from './runtime.js';
import { getNcmCookie } from './adapters/netease.js';
import path from 'node:path';
import fs from 'node:fs';

function resolveDbPath(): string {
  return process.env.DB_PATH ?? resolveRuntimeFile('state.db');
}

interface StartOptions {
  port?: number;
}

export async function start(options: StartOptions = {}) {
  const port = options.port !== undefined ? options.port : (Number(process.env.PORT) || 3005);

  // init DB
  const dbPath = resolveDbPath();
  const dbDir = path.dirname(dbPath);
  if (dbDir && dbDir !== '.') {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const db = new Database(dbPath);
  initDb(db);

  // Inject config from DB prefs into adapters (overrides .env defaults)
  const ncmApi = getPref(db, 'ncm_api');
  if (ncmApi) setNcmBase(ncmApi);
  const weatherKey = getPref(db, 'weather_key');
  if (weatherKey) setWeatherKey(weatherKey);
  const fishKey = getPref(db, 'fish_key');
  if (fishKey) setFishKey(fishKey);
  const feishuAppId = getPref(db, 'feishu_app_id');
  const feishuAppSecret = getPref(db, 'feishu_app_secret');
  if (feishuAppId || feishuAppSecret) setFeishuConfig(feishuAppId ?? '', feishuAppSecret ?? '');
  const upnpRaw = getPref(db, 'upnp_devices');
  if (upnpRaw) {
    try { setUpnpDevices(JSON.parse(upnpRaw)); } catch { console.warn('[server] upnp parse failed, using env default'); }
  }

  // Load NCM cookie for authenticated requests
  const ncmCookie = getPref(db, 'ncm_cookie');
  if (ncmCookie) setNcmCookie(ncmCookie);

  // Apply default audio quality
  const ncmQuality = getPref(db, 'ncm_quality');
  if (ncmQuality && QUALITY_LEVELS[ncmQuality as keyof typeof QUALITY_LEVELS]) {
    setDefaultBr(QUALITY_LEVELS[ncmQuality as keyof typeof QUALITY_LEVELS]);
  }

  // create app
  const executor = createExecutor();
  const app = createApp({ db, executor });

  // serve frontend static files
  app.use(express.static(resolveAppFile('frontend')));

  // create HTTP server
  const server = http.createServer(app);

  // attach WebSocket
  createWss(server);

  // start scene trigger loop (check every 5 min)
  startTriggerLoop(async () => {
    try {
      const coords = getCachedCoords();
      const ctx = await executor.getContext(coords ?? undefined);
      const now = new Date();
      return { hour: now.getHours(), day: now.getDay(), weather: ctx.weather, calendar: ctx.calendar };
    } catch { console.warn('[server] trigger loop context fetch failed'); return { hour: 0, day: 0, weather: '', calendar: '' }; }
  });

  return new Promise<{ server: http.Server; shutdown: () => Promise<void> }>((resolve) => {
    server.listen(port, () => {
      const shutdown = async () => {
        return new Promise<void>((resolveClose) => {
          server.close(() => {
            stopTriggerLoop();
            db.close();
            resolveClose();
          });
        });
      };

      resolve({ server, shutdown });
    });
  });
}

// Direct run: `tsx src/server.ts`
const isMain =
  process.argv[1]?.endsWith('server.ts') ||
  process.argv[1]?.endsWith('server.js');

if (isMain) {
  start().then(({ shutdown }) => {
    const port = process.env.PORT || 3005;
    const ncmApi = process.env.NCM_API || 'http://localhost:3001';
    const hasApiKey = !!(process.env.ANTHROPIC_API_KEY || process.env.DEEPSEEK_API_KEY);
    const ncmLoggedIn = !!getNcmCookie();

    console.log('');
    console.log('┌───────────────────────────────────────────┐');
    console.log('│  MusiCue Server                          │');
    console.log('│  http://localhost:' + String(port).padEnd(28) + '│');
    console.log('├───────────────────────────────────────────┤');
    console.log("│  API: POST /api/chat                     │");
    console.log("│  WS:  /stream                            │");
    console.log('│  NCM: ' + ncmApi.padEnd(33) + '│');
    console.log('│  Key: ' + (hasApiKey ? '✓ configured'.padEnd(33) : '⚠ missing'.padEnd(34)) + '│');
    console.log('│  Login:' + (ncmLoggedIn ? ' ✓ logged in'.padEnd(33) : ' not logged in'.padEnd(33)) + '│');
    console.log('└───────────────────────────────────────────┘');
    console.log('');

    process.on('SIGINT', async () => {
      console.log('\nShutting down...');
      await shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await shutdown();
      process.exit(0);
    });
  });
}
