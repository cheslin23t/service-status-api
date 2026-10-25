# ches.dev Service Status API

Public, read-only JSON API for checking Colin's Minecraft servers and other services.

**Base URL:** `https://api.ches.dev`

Machine-readable contract: [openapi.yaml](./openapi.yaml)

- No authentication is required.
- Responses are JSON.
- Browser requests are allowed with `Access-Control-Allow-Origin: *`.
- Consumers should ignore unknown response fields for forward compatibility.

## Get service status

```http
GET /v1/services
```

Returns the latest status of every monitored service.

### Example

```json
{
  "generatedAt": "2026-10-25T20:52:50.310Z",
  "stale": false,
  "summary": {
    "active": 2,
    "inactive": 3,
    "unknown": 0
  },
  "services": [
    {
      "id": "minecraft-1591b10e",
      "name": "Hudson Valley SMP Fabric",
      "category": "minecraft",
      "active": true,
      "state": "running",
      "checkedAt": "2026-10-25T20:52:41.946Z"
    },
    {
      "id": "images-ches-dev",
      "name": "images.ches.dev",
      "category": "web",
      "publicUrl": "https://images.ches.dev",
      "active": true,
      "state": "running",
      "checkedAt": "2026-10-25T20:52:50.310Z"
    }
  ]
}
```

### Response fields

| Field | Type | Meaning |
| --- | --- | --- |
| `generatedAt` | ISO 8601 string | Time this response snapshot was assembled. |
| `stale` | boolean | `true` when Minecraft discovery or container data could not be refreshed. Cached or incomplete data may be present. |
| `summary.active` | integer | Services whose `active` value is `true`. |
| `summary.inactive` | integer | Known non-running services. This excludes `unknown` services. |
| `summary.unknown` | integer | Services whose runtime state cannot currently be determined. |
| `services` | array | All currently discovered and configured services. Order is not an API guarantee. |

Each service contains:

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Stable machine-readable identifier. Use this for UI keys and saved selections. |
| `name` | string | Human-readable service name. |
| `category` | string | Service grouping. Currently `minecraft` or `web`; additional values may be added. |
| `publicUrl` | string, optional | Public HTTPS URL when the service has one. Do not assume every service supplies it. |
| `active` | boolean | Convenience flag. `true` only when `state` is `running`. |
| `state` | string | Normalized runtime state described below. |
| `checkedAt` | ISO 8601 string | Time the underlying service check or container snapshot was taken. |

### Service states

| State | `active` | Meaning |
| --- | --- | --- |
| `running` | `true` | Service is currently running or its health check succeeded. |
| `offline` | `false` | Service is stopped, exited, or its health check failed. |
| `starting` | `false` | Service is being created or started. |
| `stopping` | `false` | Service is being removed or stopped. |
| `restarting` | `false` | Service is restarting. |
| `paused` | `false` | Container is paused. |
| `unknown` | `false` | Current runtime state could not be determined. |

Treat unknown future state strings as non-active. Use `active` for a simple online/offline indicator and `state` when displaying richer status text.

### Freshness and caching

- A fresh response sends `Cache-Control: public, max-age=5`.
- A stale response sends `Cache-Control: no-store`.
- `/v1/services` still returns HTTP `200` when `stale` is true. Consumers must inspect the field.
- `generatedAt` describes the assembled payload; each `checkedAt` describes its individual data source.
- An intentionally stopped Minecraft server is `offline`, not stale and not an API error.

## API process health

```http
GET /healthz
```

Successful response:

```json
{ "ok": true }
```

This confirms that the API process can answer requests. It does not mean every monitored service is active or that `/v1/services` is fresh.

## TypeScript contract

```ts
type ServiceState =
  | 'running'
  | 'offline'
  | 'starting'
  | 'stopping'
  | 'restarting'
  | 'paused'
  | 'unknown';

interface MonitoredService {
  id: string;
  name: string;
  category: string;
  publicUrl?: string;
  active: boolean;
  state: ServiceState;
  checkedAt: string;
}

interface ServiceStatusResponse {
  generatedAt: string;
  stale: boolean;
  summary: {
    active: number;
    inactive: number;
    unknown: number;
  };
  services: MonitoredService[];
}
```

## Client example

```ts
async function getServiceStatus(): Promise<ServiceStatusResponse> {
  const response = await fetch('https://api.ches.dev/v1/services');
  if (!response.ok) {
    throw new Error(`Service Status API returned HTTP ${response.status}`);
  }
  return response.json() as Promise<ServiceStatusResponse>;
}

const status = await getServiceStatus();

if (status.stale) {
  console.warn('Some service status data may be outdated or incomplete.');
}

const minecraftServers = status.services.filter(
  (service) => service.category === 'minecraft',
);
```

Operational installation and maintenance notes are in [OPERATIONS.md](./OPERATIONS.md).
