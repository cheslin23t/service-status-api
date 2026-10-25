export type ServiceState = 'running' | 'offline' | 'starting' | 'stopping' | 'restarting' | 'paused' | 'unknown';

export interface ConfiguredService {
  id: string;
  name: string;
  category: string;
  healthUrl: string;
  publicUrl?: string;
  timeoutMs?: number;
}

export interface AppConfig {
  host: string;
  port: number;
  pollIntervalMs: number;
  staleAfterMs: number;
  dockerSnapshotPath: string;
  pterodactyl: {
    baseUrl: string;
    tokenFile: string;
    timeoutMs: number;
  };
  services: ConfiguredService[];
}

export interface PublicService {
  id: string;
  name: string;
  category: string;
  publicUrl?: string;
  active: boolean;
  state: ServiceState;
  checkedAt: string;
}

export interface StatusResponse {
  generatedAt: string;
  stale: boolean;
  summary: { active: number; inactive: number; unknown: number };
  services: PublicService[];
}

export interface DockerServerState {
  uuid: string;
  active: boolean;
  state: ServiceState;
}

export interface DockerSnapshot {
  generatedAt: string;
  servers: DockerServerState[];
}

export interface PanelServer {
  uuid: string;
  identifier: string;
  name: string;
}
