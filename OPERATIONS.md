# Service Status API Operations

This document is for maintaining the host deployment. API consumers should use [README.md](./README.md).

## Verification

```bash
curl -fsS http://127.0.0.1:5053/healthz
curl -fsS http://127.0.0.1:5053/v1/services
curl -fsS https://api.ches.dev/v1/services
```

## Installation and updates

Build and test the project, then install it with:

```bash
npm install
npm run typecheck
npm test
npm run build
sudo ./deploy/install.sh
```

The installer deploys an unprivileged Fastify API and a root-owned, non-networked Docker status collector. It preserves an existing configuration and Pterodactyl credential.

## Rotate the Pterodactyl credential

The Application API credential requires only `Servers: Read` permission.

```bash
sudo ./deploy/update-api-key.sh
```

The helper reads the key without echoing it, atomically replaces the protected credential file, and restarts the API.

## Configuration

Monitored non-Minecraft services are configured in:

```text
/etc/service-status-api/services.json
```

The API listens on `127.0.0.1:5053`. Cloudflare's centrally managed `wings` tunnel routes `api.ches.dev` to `http://localhost:5053`.

## systemd units

- `service-status-api.service`: public JSON application bound to loopback.
- `service-status-collector.service`: one-shot, sanitized Pterodactyl Docker state collector.
- `service-status-collector.timer`: refreshes the Docker snapshot every ten seconds.

Inspect status and recent logs with:

```bash
systemctl status service-status-api.service service-status-collector.timer
journalctl -u service-status-api.service -u service-status-collector.service -n 100 --no-pager
```
