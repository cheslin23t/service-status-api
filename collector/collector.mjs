import { execFile, execFileSync } from 'node:child_process';
import { chown, mkdir, rename, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);
const outputPath = process.env.STATUS_SNAPSHOT_PATH ?? '/run/service-status-api/docker.json';
const outputDirectory = outputPath.slice(0, outputPath.lastIndexOf('/'));
const serviceUid = Number(process.env.STATUS_SERVICE_UID ?? execFileSync('/usr/bin/id', ['-u', 'service-status'], { encoding: 'utf8' }).trim());
const serviceGid = Number(process.env.STATUS_SERVICE_GID ?? execFileSync('/usr/bin/id', ['-g', 'service-status'], { encoding: 'utf8' }).trim());

function normalizeState(state) {
  if (state.Running && state.Status === 'running') return 'running';
  const supported = new Set(['paused', 'restarting']);
  if (supported.has(state.Status)) return state.Status;
  if (state.Status === 'created') return 'starting';
  if (state.Status === 'removing') return 'stopping';
  if (['exited', 'dead'].includes(state.Status)) return 'offline';
  return 'unknown';
}

const { stdout: idOutput } = await run('/usr/bin/docker', ['ps', '-aq', '--filter', 'label=Service=Pterodactyl'], { timeout: 10_000 });
const ids = idOutput.trim().split(/\s+/).filter(Boolean);
let servers = [];
if (ids.length > 0) {
  const { stdout } = await run('/usr/bin/docker', ['inspect', ...ids], { timeout: 15_000, maxBuffer: 16 * 1024 * 1024 });
  const containers = JSON.parse(stdout);
  servers = containers.flatMap((container) => {
    const labels = container.Config?.Labels ?? {};
    if (!['server', 'server_process'].includes(labels.ContainerType)) return [];
    const env = Object.fromEntries((container.Config?.Env ?? []).map((item) => {
      const separator = item.indexOf('=');
      return separator === -1 ? [item, ''] : [item.slice(0, separator), item.slice(separator + 1)];
    }));
    const hostname = container.Config?.Hostname;
    const uuid = labels.ServerUUID
      ?? labels['com.pterodactyl.server.uuid']
      ?? env.P_SERVER_UUID
      ?? (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(hostname ?? '') ? hostname : undefined);
    if (!uuid) return [];
    const state = normalizeState(container.State ?? {});
    return [{ uuid, active: state === 'running', state }];
  });
}

await mkdir(outputDirectory, { recursive: true, mode: 0o750 });
await chown(outputDirectory, serviceUid, serviceGid);
const temporaryPath = `${outputPath}.${process.pid}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), servers })}\n`, { mode: 0o640 });
if (Number.isInteger(serviceUid) && Number.isInteger(serviceGid)) await chown(temporaryPath, serviceUid, serviceGid);
await rename(temporaryPath, outputPath);
