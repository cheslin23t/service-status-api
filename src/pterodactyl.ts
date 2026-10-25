import { readFile } from 'node:fs/promises';
import type { AppConfig, PanelServer } from './types.js';

interface PanelPage {
  data?: Array<{ attributes?: { uuid?: string; identifier?: string; name?: string } }>;
  meta?: { pagination?: { current_page?: number; total_pages?: number } };
}

export async function fetchPanelServers(config: AppConfig): Promise<PanelServer[]> {
  const token = (await readFile(config.pterodactyl.tokenFile, 'utf8')).trim();
  if (!token) throw new Error('Pterodactyl API key is empty');

  const servers: PanelServer[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const url = new URL(`${config.pterodactyl.baseUrl}/api/application/servers`);
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', '100');
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'Application/vnd.pterodactyl.v1+json',
      },
      signal: AbortSignal.timeout(config.pterodactyl.timeoutMs),
    });
    if (!response.ok) throw new Error(`Pterodactyl returned HTTP ${response.status}`);
    const body = await response.json() as PanelPage;
    for (const item of body.data ?? []) {
      const value = item.attributes;
      if (value?.uuid && value.identifier && value.name) {
        servers.push({ uuid: value.uuid, identifier: value.identifier, name: value.name });
      }
    }
    totalPages = body.meta?.pagination?.total_pages ?? 1;
    page += 1;
  } while (page <= totalPages);
  return servers;
}
