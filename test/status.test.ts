import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatusStore } from '../src/status.js';
import type { AppConfig } from '../src/types.js';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'service-status-'));
  const tokenFile = join(dir, 'token');
  const snapshot = join(dir, 'docker.json');
  await writeFile(tokenFile, 'test-token');
  await writeFile(snapshot, JSON.stringify({
    generatedAt: '2026-10-25T19:00:00.000Z',
    servers: [{ uuid: 'server-uuid', active: true, state: 'running' }],
  }));
  const config: AppConfig = {
    host: '127.0.0.1', port: 5053, pollIntervalMs: 10_000, staleAfterMs: 30_000,
    dockerSnapshotPath: snapshot,
    pterodactyl: { baseUrl: 'http://panel.test', tokenFile, timeoutMs: 1_000 },
    services: [{ id: 'images', name: 'images.ches.dev', category: 'web', healthUrl: 'http://images.test/healthz' }],
  };
  return config;
}

describe('StatusStore', () => {
  it('merges friendly Panel metadata with Docker and HTTP health', async () => {
    const config = await fixture();
    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url.startsWith('http://panel.test')) {
        return new Response(JSON.stringify({ data: [{ attributes: { uuid: 'server-uuid', identifier: 'abc123', name: 'Survival' } }] }), { status: 200 });
      }
      return new Response('{"ok":true}', { status: 200 });
    }) as typeof fetch;
    const status = await new StatusStore(config).refresh(new Date('2026-10-25T19:00:10.000Z'));
    expect(status.stale).toBe(false);
    expect(status.summary).toEqual({ active: 2, inactive: 0, unknown: 0 });
    expect(status.services).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'minecraft-abc123', name: 'Survival', active: true, state: 'running' }),
      expect.objectContaining({ id: 'images', active: true, state: 'running' }),
    ]));
    expect(JSON.stringify(status)).not.toContain('server-uuid');
    expect(JSON.stringify(status)).not.toContain('panel.test');
  });

  it('marks absent runtime data unknown and stale', async () => {
    const config = await fixture();
    config.dockerSnapshotPath = join(tmpdir(), 'does-not-exist-service-status.json');
    globalThis.fetch = vi.fn(async (input) => {
      if (String(input).startsWith('http://panel.test')) {
        return new Response(JSON.stringify({ data: [{ attributes: { uuid: 'server-uuid', identifier: 'abc123', name: 'Survival' } }] }), { status: 200 });
      }
      throw new Error('connection refused at private address');
    }) as typeof fetch;
    const status = await new StatusStore(config).refresh(new Date('2026-10-25T19:00:10.000Z'));
    expect(status.stale).toBe(true);
    expect(status.summary).toEqual({ active: 0, inactive: 1, unknown: 1 });
    expect(status.services.find((service) => service.category === 'minecraft')?.state).toBe('unknown');
    expect(JSON.stringify(status)).not.toContain('connection refused');
  });
});
