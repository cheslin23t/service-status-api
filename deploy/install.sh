#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this installer with sudo." >&2
  exit 1
fi

project_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

if [[ ! -f "${project_dir}/dist/server.js" ]]; then
  echo "Build output is missing. Run npm install && npm run build first." >&2
  exit 1
fi

if ! id service-status >/dev/null 2>&1; then
  useradd --system --home-dir /nonexistent --shell /usr/sbin/nologin service-status
fi

install -d -o root -g root -m 0755 /opt/service-status-api
install -d -o root -g service-status -m 0750 /etc/service-status-api
install -d -o root -g root -m 0755 /usr/local/libexec

rm -rf /opt/service-status-api/dist /opt/service-status-api/node_modules
cp -a "${project_dir}/dist" /opt/service-status-api/dist
install -o root -g root -m 0644 "${project_dir}/package.json" /opt/service-status-api/package.json
install -o root -g root -m 0644 "${project_dir}/package-lock.json" /opt/service-status-api/package-lock.json
npm ci --omit=dev --ignore-scripts --prefix /opt/service-status-api
chown -R root:root /opt/service-status-api
chmod -R a+rX /opt/service-status-api

install -o root -g root -m 0755 "${project_dir}/collector/collector.mjs" /usr/local/libexec/service-status-collector.mjs
install -o root -g root -m 0644 "${project_dir}/deploy/service-status-api.service" /etc/systemd/system/service-status-api.service
install -o root -g root -m 0644 "${project_dir}/deploy/service-status-collector.service" /etc/systemd/system/service-status-collector.service
install -o root -g root -m 0644 "${project_dir}/deploy/service-status-collector.timer" /etc/systemd/system/service-status-collector.timer

if [[ ! -f /etc/service-status-api/services.json ]]; then
  install -o root -g service-status -m 0640 "${project_dir}/config/services.example.json" /etc/service-status-api/services.json
fi

if [[ ! -s /etc/service-status-api/pterodactyl-api-key ]]; then
  read -rsp "Pterodactyl read-only Application API key: " pterodactyl_key
  echo
  if [[ ${pterodactyl_key} != ptla_* ]]; then
    echo "Expected a Pterodactyl Application API key beginning with ptla_." >&2
    exit 1
  fi
  umask 0077
  printf '%s\n' "${pterodactyl_key}" > /etc/service-status-api/pterodactyl-api-key
fi
chown root:service-status /etc/service-status-api/pterodactyl-api-key
chmod 0640 /etc/service-status-api/pterodactyl-api-key

install -d -o service-status -g service-status -m 0750 /run/service-status-api

systemctl daemon-reload
systemctl enable --now service-status-api.service service-status-collector.timer
systemctl start service-status-collector.service
systemctl restart service-status-api.service

for attempt in {1..15}; do
  if curl --fail --silent http://127.0.0.1:5053/healthz; then
    echo
    break
  fi
  if [[ ${attempt} -eq 15 ]]; then
    systemctl status service-status-api.service --no-pager >&2
    exit 1
  fi
  sleep 1
done
curl --fail --silent --show-error http://127.0.0.1:5053/v1/services
echo
