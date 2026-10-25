import { readFile } from 'node:fs/promises';
import type { AppConfig } from './types.js';

const defaultConfigPath = '/etc/service-status-api/services.json';

export async function loadConfig(path = process.env.SERVICE_STATUS_CONFIG ?? defaultConfigPath): Promise<AppConfig> {
  const parsed = JSON.parse(await readFile(path, 'utf8')) as Partial<AppConfig>;
  if (!parsed.pterodactyl?.baseUrl || !parsed.services || !Array.isArray(parsed.services)) {
    throw new Error('Invalid configuration: pterodactyl.baseUrl and services are required');
  }

  return {
    host: parsed.host ?? '127.0.0.1',
    port: parsed.port ?? 5053,
    pollIntervalMs: parsed.pollIntervalMs ?? 10_000,
    staleAfterMs: parsed.staleAfterMs ?? 30_000,
    dockerSnapshotPath: parsed.dockerSnapshotPath ?? '/run/service-status-api/docker.json',
    pterodactyl: {
      baseUrl: parsed.pterodactyl.baseUrl.replace(/\/$/, ''),
      tokenFile: parsed.pterodactyl.tokenFile ?? '/etc/service-status-api/pterodactyl-api-key',
      timeoutMs: parsed.pterodactyl.timeoutMs ?? 3_000,
    },
    services: parsed.services.map((service) => ({
      ...service,
      timeoutMs: service.timeoutMs ?? 2_000,
    })),
  };
}
