#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this helper with sudo." >&2
  exit 1
fi

read -rsp "New Pterodactyl Application API key: " pterodactyl_key
echo
if [[ ${pterodactyl_key} != ptla_* ]]; then
  echo "Expected a Pterodactyl Application API key beginning with ptla_." >&2
  exit 1
fi

temporary_key=$(mktemp /etc/service-status-api/pterodactyl-api-key.XXXXXX)
trap 'rm -f "${temporary_key}"' EXIT
printf '%s\n' "${pterodactyl_key}" > "${temporary_key}"
chown root:service-status "${temporary_key}"
chmod 0640 "${temporary_key}"
mv -f "${temporary_key}" /etc/service-status-api/pterodactyl-api-key
trap - EXIT

systemctl restart service-status-api.service
for attempt in {1..15}; do
  if curl --fail --silent http://127.0.0.1:5053/healthz; then
    echo
    exit 0
  fi
  sleep 1
done

systemctl status service-status-api.service --no-pager >&2
exit 1
