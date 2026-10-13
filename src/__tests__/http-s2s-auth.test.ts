/**
 * HTTP transport fail-closed auth (CWE-306).
 *
 * Startup requires a real CONDUIT_S2S_SECRET unless MCP_ALLOW_INSECURE_DEV=1.
 * Known placeholders are refused even with that flag. The insecure-dev bypass
 * binds 127.0.0.1 only. A configured secret honors MCP_HTTP_HOST.
 * /mcp rejects a missing or invalid X-Gateway-S2S header.
 * AUTH_MODE=gateway rejects requests that omit X-Slide-Api-Token and must
 * not fall back to SLIDE_API_TOKEN.
 */

import { createHmac } from 'node:crypto';
import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getCredentialsSpy = vi.hoisted(() => vi.fn());

vi.mock('../client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../client.js')>();
  return {
    ...actual,
    getCredentials: () => {
      const creds = actual.getCredentials();
      getCredentialsSpy(creds);
      return creds;
    },
  };
});

import { startHttpTransport } from '../http.js';
import { jsonResponse } from './test-helpers.js';

const S2S_SECRET = 's2s-do-not-log-7f3a';
const ENV_TOKEN = 'env-token-must-not-be-used';
const HEADER_TOKEN = 'header-slide-token';

const ENV_KEYS = [
  'CONDUIT_S2S_SECRET',
  'MCP_ALLOW_INSECURE_DEV',
  'MCP_HTTP_PORT',
  'MCP_HTTP_HOST',
  'AUTH_MODE',
  'SLIDE_API_TOKEN',
  'LOG_LEVEL',
  'MCP_TRANSPORT',
] as const;

const savedEnv = new Map<string, string | undefined>();
const servers: Server[] = [];

function mintS2sHeader(secret: string, unixSeconds = Math.floor(Date.now() / 1000)): string {
  const message = `t=${unixSeconds}`;
  const hex = createHmac('sha256', secret).update(message).digest('hex');
  return `${message},v1=${hex}`;
}

function captureStderr(): { text: () => string; restore: () => void } {
  const lines: string[] = [];
  const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    lines.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
  });
  return {
    text: () => lines.join('\n'),
    restore: () => spy.mockRestore(),
  };
}

function exitSpy() {
  return vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit:${String(code)}`);
  }) as typeof process.exit);
}

async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections?.();
  await new Promise<void>((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function listen(): Promise<{ port: number; address: string; close: () => Promise<void> }> {
  const server = await startHttpTransport();
  servers.push(server);
  const bound = server.address() as AddressInfo | null;
  if (!bound || typeof bound === 'string') {
    throw new Error('HTTP server did not bind a TCP port');
  }
  return {
    port: bound.port,
    address: bound.address,
    close: () => closeServer(server),
  };
}

interface HttpResult {
  status: number;
  body: string;
}

function mcpHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    ...extra,
  };
}

const listAccountsCall = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name: 'slide_list_accounts', arguments: {} },
});

function sendHttp(options: {
  port: number;
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
}): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: '127.0.0.1',
        port: options.port,
        method: options.method,
        path: options.path,
        headers: options.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.setTimeout(5000, () => {
      req.destroy(new Error(`timeout ${options.method} ${options.path}`));
    });
    req.on('error', reject);
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

function postMcp(port: number, headers: Record<string, string>): Promise<HttpResult> {
  return sendHttp({
    port,
    method: 'POST',
    path: '/mcp',
    headers: mcpHeaders(headers),
    body: listAccountsCall,
  });
}

beforeAll(() => {
  for (const key of ENV_KEYS) savedEnv.set(key, process.env[key]);
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

beforeEach(() => {
  process.env.MCP_HTTP_PORT = '0';
  process.env.MCP_HTTP_HOST = '127.0.0.1';
  process.env.LOG_LEVEL = 'error';
  delete process.env.CONDUIT_S2S_SECRET;
  delete process.env.MCP_ALLOW_INSECURE_DEV;
  delete process.env.AUTH_MODE;
  delete process.env.SLIDE_API_TOKEN;
  getCredentialsSpy.mockReset();
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  while (servers.length > 0) {
    const server = servers.pop();
    if (server) await closeServer(server);
  }
});

describe('HTTP startup', () => {
  it('refuses to start when CONDUIT_S2S_SECRET is empty', async () => {
    const logs = captureStderr();
    const exit = exitSpy();

    try {
      await expect(startHttpTransport()).rejects.toThrow('process.exit:1');
      expect(exit).toHaveBeenCalledWith(1);
      const text = logs.text();
      expect(text).toContain('Refusing to start HTTP transport');
      expect(text).toContain('CONDUIT_S2S_SECRET is empty');
      expect(text).toContain('MCP_ALLOW_INSECURE_DEV=1');
      expect(text).not.toContain(S2S_SECRET);
    } finally {
      exit.mockRestore();
      logs.restore();
    }
  });

  it('treats a whitespace-only secret as empty', async () => {
    process.env.CONDUIT_S2S_SECRET = '   ';
    const logs = captureStderr();
    const exit = exitSpy();

    try {
      await expect(startHttpTransport()).rejects.toThrow('process.exit:1');
      expect(logs.text()).toContain('CONDUIT_S2S_SECRET is empty');
    } finally {
      exit.mockRestore();
      logs.restore();
    }
  });

  it('still refuses when MCP_ALLOW_INSECURE_DEV is not exactly 1', async () => {
    process.env.MCP_ALLOW_INSECURE_DEV = 'true';
    const logs = captureStderr();
    const exit = exitSpy();

    try {
      await expect(startHttpTransport()).rejects.toThrow('process.exit:1');
      expect(logs.text()).toContain('Refusing to start HTTP transport');
    } finally {
      exit.mockRestore();
      logs.restore();
    }
  });

  it.each(['changeme', 'replace-with-a-real-secret', '  Your-S2S-Secret  '])(
    'refuses known placeholder %j and does not log it',
    async (placeholder) => {
      process.env.CONDUIT_S2S_SECRET = placeholder;
      const logs = captureStderr();
      const exit = exitSpy();

      try {
        await expect(startHttpTransport()).rejects.toThrow('process.exit:1');
        expect(exit).toHaveBeenCalledWith(1);
        const text = logs.text();
        expect(text).toContain('known placeholder');
        expect(text).toContain('openssl rand -hex 32');
        expect(text).not.toContain(placeholder.trim());
        expect(text).not.toContain(S2S_SECRET);
      } finally {
        exit.mockRestore();
        logs.restore();
      }
    },
  );

  it('refuses a placeholder even when MCP_ALLOW_INSECURE_DEV=1', async () => {
    process.env.CONDUIT_S2S_SECRET = 'secret';
    process.env.MCP_ALLOW_INSECURE_DEV = '1';
    const logs = captureStderr();
    const exit = exitSpy();

    try {
      await expect(startHttpTransport()).rejects.toThrow('process.exit:1');
      const text = logs.text();
      expect(text).toContain('known placeholder');
      expect(text).not.toContain('SECURITY WARNING');
      expect(text).not.toContain('CONDUIT_S2S_SECRET=secret');
    } finally {
      exit.mockRestore();
      logs.restore();
    }
  });

  it('allows startup with a warning when MCP_ALLOW_INSECURE_DEV=1 and binds 127.0.0.1', async () => {
    process.env.MCP_ALLOW_INSECURE_DEV = '1';
    delete process.env.MCP_HTTP_HOST;
    const logs = captureStderr();
    const exit = exitSpy();
    let close: (() => Promise<void>) | undefined;

    try {
      const server = await listen();
      close = server.close;
      expect(exit).not.toHaveBeenCalled();
      expect(server.address).toBe('127.0.0.1');
      const text = logs.text();
      expect(text).toContain('SECURITY WARNING');
      expect(text).toContain('CONDUIT_S2S_SECRET is empty');
      expect(text).toContain('MCP_ALLOW_INSECURE_DEV=1');
      expect(text).toContain('127.0.0.1 only');
      expect(text).not.toContain('not a loopback address');
      expect(text).not.toContain(S2S_SECRET);
    } finally {
      exit.mockRestore();
      logs.restore();
      await close?.();
    }
  });

  it('forces 127.0.0.1 when the dev bypass is set and MCP_HTTP_HOST is not loopback', async () => {
    process.env.MCP_ALLOW_INSECURE_DEV = '1';
    process.env.MCP_HTTP_HOST = '0.0.0.0';
    const logs = captureStderr();
    const exit = exitSpy();
    let close: (() => Promise<void>) | undefined;

    try {
      const server = await listen();
      close = server.close;
      expect(exit).not.toHaveBeenCalled();
      expect(server.address).toBe('127.0.0.1');
      const text = logs.text();
      expect(text).toContain('MCP_HTTP_HOST=0.0.0.0 is not a loopback address');
      expect(text).toContain('Binding 127.0.0.1 only');
      expect(text).not.toContain(S2S_SECRET);
    } finally {
      exit.mockRestore();
      logs.restore();
      await close?.();
    }
  });

  it('forces 127.0.0.1 when the dev bypass is set and MCP_HTTP_HOST is localhost', async () => {
    process.env.MCP_ALLOW_INSECURE_DEV = '1';
    process.env.MCP_HTTP_HOST = 'localhost';
    const logs = captureStderr();
    let close: (() => Promise<void>) | undefined;

    try {
      const server = await listen();
      close = server.close;
      expect(server.address).toBe('127.0.0.1');
      expect(logs.text()).toContain('SECURITY WARNING');
      expect(logs.text()).not.toContain('not a loopback address');
    } finally {
      logs.restore();
      await close?.();
    }
  });

  it('honors a non-loopback MCP_HTTP_HOST when CONDUIT_S2S_SECRET is set', async () => {
    process.env.CONDUIT_S2S_SECRET = S2S_SECRET;
    process.env.MCP_HTTP_HOST = '0.0.0.0';
    const logs = captureStderr();
    let close: (() => Promise<void>) | undefined;

    try {
      const server = await listen();
      close = server.close;
      expect(server.address).toBe('0.0.0.0');
      expect(logs.text()).not.toContain('not a loopback address');
      expect(logs.text()).not.toContain(S2S_SECRET);
    } finally {
      logs.restore();
      await close?.();
    }
  });

  it('binds 127.0.0.1 when MCP_HTTP_HOST is unset and a secret is set', async () => {
    delete process.env.MCP_HTTP_HOST;
    process.env.CONDUIT_S2S_SECRET = S2S_SECRET;
    const server = await listen();
    try {
      expect(server.address).toBe('127.0.0.1');
    } finally {
      await server.close();
    }
  });
});

describe('HTTP /mcp authentication', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    process.env.CONDUIT_S2S_SECRET = S2S_SECRET;
    process.env.AUTH_MODE = 'gateway';
    process.env.SLIDE_API_TOKEN = ENV_TOKEN;
    process.env.MCP_HTTP_HOST = '127.0.0.1';
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonResponse({ pagination: {}, data: [] }));
  });

  it('returns 401 when the S2S header is missing or invalid and does not read credentials', async () => {
    const logs = captureStderr();
    const server = await listen();
    try {
      const missing = await postMcp(server.port, { 'x-slide-api-token': HEADER_TOKEN });
      const invalid = await postMcp(server.port, {
        'x-gateway-s2s': mintS2sHeader('wrong-secret'),
        'x-slide-api-token': HEADER_TOKEN,
      });

      expect(missing.status).toBe(401);
      expect(invalid.status).toBe(401);
      const missingBody = missing.body;
      const invalidBody = invalid.body;
      expect(missingBody).toContain('X-Gateway-S2S');
      expect(invalidBody).toContain('X-Gateway-S2S');
      expect(missingBody).not.toContain(S2S_SECRET);
      expect(invalidBody).not.toContain(S2S_SECRET);
      expect(missingBody).not.toContain(ENV_TOKEN);
      expect(invalidBody).not.toContain(HEADER_TOKEN);
      expect(logs.text()).not.toContain(S2S_SECRET);
      expect(getCredentialsSpy).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      logs.restore();
      await server.close();
    }
  });

  it('returns 401 in gateway mode without a credential header and does not use env credentials', async () => {
    const server = await listen();
    try {
      const response = await postMcp(server.port, { 'x-gateway-s2s': mintS2sHeader(S2S_SECRET) });
      const body = response.body;

      expect(response.status).toBe(401);
      expect(body).toContain('X-Slide-Api-Token');
      expect(body).not.toContain(ENV_TOKEN);
      expect(body).not.toContain(S2S_SECRET);
      expect(getCredentialsSpy).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();

      const blank = await postMcp(server.port, {
        'x-gateway-s2s': mintS2sHeader(S2S_SECRET),
        'x-slide-api-token': '   ',
      });
      expect(blank.status).toBe(401);
      expect(getCredentialsSpy).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it('accepts a valid S2S header plus X-Slide-Api-Token and uses that token', async () => {
    const logs = captureStderr();
    const server = await listen();
    try {
      const response = await postMcp(server.port, {
        'x-gateway-s2s': mintS2sHeader(S2S_SECRET),
        'x-slide-api-token': HEADER_TOKEN,
      });
      const body = response.body;

      expect(response.status).toBe(200);
      expect(body).not.toContain(S2S_SECRET);
      expect(body).not.toContain(ENV_TOKEN);
      expect(fetchMock).toHaveBeenCalled();
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${HEADER_TOKEN}`);
      expect(getCredentialsSpy).toHaveBeenCalledWith({ apiToken: HEADER_TOKEN });
      const reads = JSON.stringify(getCredentialsSpy.mock.calls);
      expect(reads).not.toContain(ENV_TOKEN);
      expect(logs.text()).not.toContain(S2S_SECRET);
      expect(logs.text()).not.toContain(HEADER_TOKEN);
      expect(logs.text()).not.toContain(ENV_TOKEN);
    } finally {
      logs.restore();
      await server.close();
    }
  });

  it('uses SLIDE_API_TOKEN in env mode when the request has S2S but no token header', async () => {
    delete process.env.AUTH_MODE;
    const server = await listen();
    try {
      const response = await postMcp(server.port, { 'x-gateway-s2s': mintS2sHeader(S2S_SECRET) });
      expect(response.status).toBe(200);
      expect(response.body).not.toContain(S2S_SECRET);
      expect(fetchMock).toHaveBeenCalled();
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${ENV_TOKEN}`);
      expect(getCredentialsSpy).toHaveBeenCalledWith({ apiToken: ENV_TOKEN });
    } finally {
      await server.close();
    }
  });

  it('serves /health and /healthz without authentication and without reading credentials', async () => {
    const server = await listen();
    try {
      for (const path of ['/health', '/healthz']) {
        const response = await sendHttp({ port: server.port, method: 'GET', path });
        expect(response.status).toBe(200);
        const body = JSON.parse(response.body) as { status?: string; mode?: string; credentials?: unknown };
        expect(body.status).toBe('ok');
        expect(body.mode).toBe('gateway');
        expect(body.credentials).toBeUndefined();
        expect(response.body).not.toContain(S2S_SECRET);
        expect(response.body).not.toContain(ENV_TOKEN);
      }
      expect(getCredentialsSpy).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });
});
