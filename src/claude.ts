import { getPref } from './db.js';
import type Database from 'better-sqlite3';
import https from 'node:https';

export interface ClaudeOutput {
  say: string;
  play: string[];
  play_mode?: 'fm' | 'intelligence';
  play_mode_params?: { songId?: number; playlistId?: number };
  reason: string;
  segue: string;
  error?: boolean;
  raw?: string;
  mood?: { detected: string; target: string };
  arc?: { start: string; end: string; steps: number };
}

export interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
  context_window: number;
}

export function decodeUtf8Chunks(chunks: Buffer[]): string {
  return Buffer.concat(chunks).toString('utf8');
}

export function parseOutput(raw: string): ClaudeOutput {
  // Try to find and parse JSON in the response
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (!parsed || typeof parsed !== 'object' || typeof parsed.say !== 'string' || !Array.isArray(parsed.play) || !parsed.play.every((item: unknown) => typeof item === 'string')) {
        return { say: '', play: [], reason: '', segue: '', error: true, raw };
      }
      return {
        say: parsed.say,
        play: parsed.play,
        play_mode: parsed.play_mode,
        play_mode_params: parsed.play_mode_params,
        reason: parsed.reason ?? '',
        segue: parsed.segue ?? '',
        mood: parsed.mood,
        arc: parsed.arc,
      };
    } catch {
      // invalid JSON inside braces, fall through
    }
  }
  // Plain text response: use as say
  return { say: '', play: [], reason: '', segue: '', error: true, raw };
}

interface InvokeOptions {
  timeout?: number;
  db?: Database.Database;
  responseFormat?: 'json' | 'text';
}

export async function invokeClaude(
  prompt: string,
  options: InvokeOptions = {},
): Promise<ClaudeOutput & { usage?: ClaudeUsage }> {
  const { timeout = 120000, db, responseFormat = 'json' } = options;

  const apiKey = db ? getPref(db, 'api_key') || process.env['ANTHROPIC_API_KEY'] || '' : process.env['ANTHROPIC_API_KEY'] || '';
  const baseUrl = (db ? getPref(db, 'api_base_url') || '' : '') || process.env['ANTHROPIC_BASE_URL'] || 'https://api.anthropic.com';

  if (!apiKey) {
    throw new Error('API Key 未配置，请在设置中填写');
  }

  const cleanBase = baseUrl.replace(/\/v1\/?$/i, '').replace(/\/+$/, '');
  const isAnthropic = cleanBase.includes('anthropic.com');
  const model = (db ? getPref(db, 'api_model') || '' : '') || process.env['API_MODEL'] || 'deepseek-v4-flash';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    let text: string;
    let usage: ClaudeUsage | undefined;

    if (isAnthropic) {
      // Anthropic Messages API
      const response = await fetch(`${cleanBase}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!response.ok) {
        const errText = await response.text().catch(() => 'unknown error');
        throw new Error(`API ${response.status}: ${errText.slice(0, 300)}`);
      }
      const data = await response.json() as { content: Array<{ type: string; text: string }>; usage?: { input_tokens: number; output_tokens: number } };
      text = data.content?.[0]?.text || '';
      if (data.usage) {
        usage = { input_tokens: data.usage.input_tokens, output_tokens: data.usage.output_tokens, context_window: 200000 };
      }
    } else {
      // OpenAI-compatible API (DeepSeek, etc.) — use https.request for reliability
      const result = await new Promise<{ text: string; usage?: ClaudeUsage }>((resolve, reject) => {
        const body = JSON.stringify({
          model,
          max_tokens: 1024,
          reasoning_effort: 'high',
          thinking: { type: 'disabled' },
          messages: [{ role: 'user', content: prompt }],
        });
        const u = new URL(`${cleanBase}/v1/chat/completions`);
        const req = https.request({
          hostname: u.hostname,
          port: 443,
          path: u.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'Content-Length': Buffer.byteLength(body),
          },
          timeout,
        }, (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
          res.on('end', () => {
            const data = decodeUtf8Chunks(chunks);
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                const parsed = JSON.parse(data);
                text = parsed.choices?.[0]?.message?.content || '';
                if (parsed.usage) {
                  usage = { input_tokens: parsed.usage.prompt_tokens ?? 0, output_tokens: parsed.usage.completion_tokens ?? 0, context_window: 128000 };
                }
                resolve({ text, usage });
              } catch { reject(new Error('JSON parse error')); }
            } else {
              reject(new Error(`API ${res.statusCode}: ${data.slice(0, 300)}`));
            }
          });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('API 请求超时')); });
        req.write(body);
        req.end();
      });
      clearTimeout(timer);
      text = result.text;
      usage = result.usage;
    }

    const output = responseFormat === 'text'
      ? { say: text, play: [], reason: '', segue: '' }
      : parseOutput(text);
    return { ...output, usage };
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('API 请求超时');
    }
    throw err;
  }
}
