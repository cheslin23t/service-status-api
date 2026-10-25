import { readFile } from 'node:fs/promises';
import type {
  AppConfig,
  DockerSnapshot,
  PanelServer,
  PublicService,
  ServiceState,
  StatusResponse,
} from './types.js';
import { fetchPanelServers } from './pterodactyl.js';

function isValidDate(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

export async function readDockerSnapshot(path: string): Promise<DockerSnapshot> {
  const value = JSON.parse(await readFile(path, 'utf8')) as DockerSnapshot;
  if (!isValidDate(value.generatedAt) || !Array.isArray(value.servers)) throw new Error('Invalid Docker snapshot');
  return value;
}

export async function checkConfiguredService(service: AppConfig['services'][number], checkedAt: string): Promise<PublicService> {
  let active = false;
  let state: ServiceState = 'offline';
  try {
    const response = await fetch(service.healthUrl, {
      signal: AbortSignal.timeout(service.timeoutMs ?? 2_000),
      redirect: 'error',
    });
    active = response.ok;
    state = active ? 'running' : 'offline';
  } catch {
    // Public output deliberately does not expose local errors or addresses.
  }
  return {
    id: service.id,
    name: service.name,
    category: service.category,
    ...(service.publicUrl ? { publicUrl: service.publicUrl } : {}),
    active,
    state,
    checkedAt,
  };
}

export class StatusStore {
  private current: StatusResponse = {
    generatedAt: new Date(0).toISOString(),
    stale: true,
    summary: { active: 0, inactive: 0, unknown: 0 },
    services: [],
  };
  private panelCache: PanelServer[] = [];
  private lastPanelWarning?: string;
  private lastDockerWarning?: string;

  constructor(
    private readonly config: AppConfig,
    private readonly reportWarning: (message: string) => void = () => undefined,
  ) {}

  get(): StatusResponse {
    return this.current;
  }

  async refresh(now = new Date()): Promise<StatusResponse> {
    const generatedAt = now.toISOString();
    const [panelResult, dockerResult, configured] = await Promise.all([
      fetchPanelServers(this.config).then((value) => {
        this.lastPanelWarning = undefined;
        return { ok: true as const, value };
      }).catch((error: unknown) => {
        const warning = `Pterodactyl refresh failed: ${error instanceof Error ? error.message : 'unknown error'}`;
        if (warning !== this.lastPanelWarning) this.reportWarning(warning);
        this.lastPanelWarning = warning;
        return { ok: false as const };
      }),
      readDockerSnapshot(this.config.dockerSnapshotPath).then((value) => {
        this.lastDockerWarning = undefined;
        return { ok: true as const, value };
      }).catch((error: unknown) => {
        const warning = `Docker snapshot refresh failed: ${error instanceof Error ? error.message : 'unknown error'}`;
        if (warning !== this.lastDockerWarning) this.reportWarning(warning);
        this.lastDockerWarning = warning;
        return { ok: false as const };
      }),
      Promise.all(this.config.services.map((service) => checkConfiguredService(service, generatedAt))),
    ]);

    if (panelResult.ok) this.panelCache = panelResult.value;
    const dockerByUuid = new Map(dockerResult.ok ? dockerResult.value.servers.map((server) => [server.uuid, server]) : []);
    const minecraft: PublicService[] = this.panelCache.map((server) => {
      const runtime = dockerByUuid.get(server.uuid);
      return {
        id: `minecraft-${server.identifier}`,
        name: server.name,
        category: 'minecraft',
        active: runtime?.active ?? false,
        state: runtime?.state ?? 'unknown',
        checkedAt: dockerResult.ok ? dockerResult.value.generatedAt : generatedAt,
      };
    });

    const dockerIsFresh = dockerResult.ok && now.getTime() - Date.parse(dockerResult.value.generatedAt) <= this.config.staleAfterMs;
    const services = [...minecraft, ...configured].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    const summary = services.reduce((result, service) => {
      if (service.state === 'unknown') result.unknown += 1;
      else if (service.active) result.active += 1;
      else result.inactive += 1;
      return result;
    }, { active: 0, inactive: 0, unknown: 0 });

    this.current = {
      generatedAt,
      stale: !panelResult.ok || !dockerIsFresh,
      summary,
      services,
    };
    return this.current;
  }
}
