import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { invokeClaude, parseOutput } from '../src/claude.js';

describe('parseOutput', () => {
  it('parses valid JSON with all fields', () => {
    const raw = JSON.stringify({
      say: 'Good morning!',
      play: ['id1', 'id2'],
      reason: 'jazz time',
      segue: 'Now playing...',
    });

    const result = parseOutput(raw);
    expect(result.say).toBe('Good morning!');
    expect(result.play).toEqual(['id1', 'id2']);
    expect(result.reason).toBe('jazz time');
    expect(result.segue).toBe('Now playing...');
  });

  it('fills missing fields with defaults', () => {
    const result = parseOutput(JSON.stringify({ say: 'Hello', play: ['id1'] }));
    expect(result.say).toBe('Hello');
    expect(result.play).toEqual(['id1']);
    expect(result.reason).toBe('');
    expect(result.segue).toBe('');
  });

  it('handles empty play array', () => {
    const result = parseOutput(JSON.stringify({ say: 'Hi', play: [] }));
    expect(result.say).toBe('Hi');
    expect(result.play).toEqual([]);
  });

  it('rejects plain text responses that violate the JSON contract', () => {
    const result = parseOutput('来一首爵士乐放松一下');
    expect(result.error).toBe(true);
    expect(result.play).toEqual([]);
  });

  it('rejects JSON responses without a valid play array', () => {
    const result = parseOutput(JSON.stringify({ say: '播放好了' }));
    expect(result.error).toBe(true);
    expect(result.play).toEqual([]);
  });

  it('extracts JSON from text with surrounding content', () => {
    const raw = 'Here:\n{"say":"hi","play":[],"reason":"","segue":""}\nEnjoy!';
    const result = parseOutput(raw);
    expect(result.say).toBe('hi');
  });
});

describe('invokeClaude', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;
  const originalModel = process.env.API_MODEL;
  const originalBaseUrl = process.env.ANTHROPIC_BASE_URL;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.API_MODEL = 'claude-test-model';
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.API_MODEL;
    else process.env.API_MODEL = originalModel;
    if (originalBaseUrl === undefined) delete process.env.ANTHROPIC_BASE_URL;
    else process.env.ANTHROPIC_BASE_URL = originalBaseUrl;
  });

  it('posts prompt to Anthropic Messages API', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      content: [{ type: 'text', text: JSON.stringify({ say: 'Hi', play: [] }) }],
    }), { status: 200 }));

    await invokeClaude('test prompt');

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(options.headers).toMatchObject({ 'x-api-key': 'test-key' });
    expect(JSON.parse(options.body as string).messages[0].content).toBe('test prompt');
  });

  it('returns parsed ClaudeOutput from response text', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      content: [{ type: 'text', text: JSON.stringify({ say: 'Hi', play: ['123'], reason: 'test', segue: '' }) }],
      usage: { input_tokens: 10, output_tokens: 5 },
    }), { status: 200 }));

    const result = await invokeClaude('play jazz');
    expect(result.say).toBe('Hi');
    expect(result.play).toEqual(['123']);
    expect(result.usage).toEqual({ input_tokens: 10, output_tokens: 5, context_window: 200000 });
  });

  it('removes a trailing /v1 before appending the Anthropic endpoint', async () => {
    process.env.ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1/';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      content: [{ type: 'text', text: JSON.stringify({ say: 'Hi', play: [] }) }],
    }), { status: 200 }));

    await invokeClaude('test prompt');

    expect(fetchSpy.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/messages');
  });

  it('rejects on timeout', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
      const signal = (options as RequestInit).signal as AbortSignal;
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));

    await expect(invokeClaude('test', { timeout: 10 })).rejects.toThrow('API 请求超时');
  });

  it('rejects on non-2xx API response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('Error', { status: 500 }));

    await expect(invokeClaude('test')).rejects.toThrow('API 500: Error');
  });

  it('rejects when API key is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(invokeClaude('test')).rejects.toThrow('API Key 未配置');
  });
});
