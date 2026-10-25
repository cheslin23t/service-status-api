import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AppConfig, StatusResponse } from '../src/types.js';

describe('public API', () => {
  it('serves status with browser-safe CORS and caching', async () => {
    const status: StatusResponse = {
      generatedAt: '2026-10-25T19:00:00.000Z',
      stale: false,
      summary: { active: 1, inactive: 0, unknown: 0 },
      services: [{ id: 'images', name: 'images.ches.dev', category: 'web', active: true, state: 'running', checkedAt: '2026-10-25T19:00:00.000Z' }],
    };
    const config = {
      host: '127.0.0.1', port: 5053, pollIntervalMs: 10_000, staleAfterMs: 30_000,
      dockerSnapshotPath: '/not-used',
      pterodactyl: { baseUrl: 'http://not-used', tokenFile: '/not-used', timeoutMs: 100 },
      services: [],
    } satisfies AppConfig;
    const app = buildApp(config, { get: () => status, refresh: async () => status } as never);
    const response = await app.inject({ method: 'GET', url: '/v1/services' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.headers['cache-control']).toBe('public, max-age=5');
    expect(response.json()).toEqual(status);
    await app.close();
  });
});
