#!/bin/bash
# Ship the server's secrets from the local .env.local to the droplet, without
# them ever passing through a terminal transcript: the values go over ssh on
# stdin, and only the key names are printed. Also the way to rotate MCP_SECRET —
# edit it locally, run this, restart the container.
#
# Usage: ./scripts/push-env.sh [user@host] [remote-dir]
set -euo pipefail

TARGET=${1:-root@134.209.227.168}
DIR=${2:-/sites/word-leren}
LOCAL="$(dirname "$0")/../.env.local"

[ -f "$LOCAL" ] || { echo "нет $LOCAL"; exit 1; }

# `sed -n s///p` rather than grep: no pipeline, so nothing here can die of a
# SIGPIPE under `pipefail`, and a key that appears twice takes its last value
# exactly like a shell would read the file.
value() { sed -n "s/^$1=//p" "$LOCAL" | tail -1 | tr -d "\"'"; }

BODY=""
for key in VITE_INSTANT_APP_ID INSTANT_APP_ADMIN_TOKEN OWNER_EMAIL MCP_SECRET; do
  v=$(value "$key")
  [ -n "$v" ] || { echo "в .env.local нет $key"; exit 1; }
  BODY+="$key=$v"$'\n'
  echo "  $key — есть"
done

# The remote file is written whole and only then chmod'ed, so a half-written
# .env is never readable. The container reads it at start, not continuously.
printf '%s' "$BODY" | ssh "$TARGET" "cat > $DIR/.env.tmp && chmod 600 $DIR/.env.tmp && mv $DIR/.env.tmp $DIR/.env"

echo "→ $TARGET:$DIR/.env (chmod 600)"
