#!/usr/bin/env bash
# Khởi động Postgres cho phát triển (cổng 5433, khớp api/.env).
# Ưu tiên cụm Homebrew ở ../.pgdata nếu đã có; nếu không thì dùng Docker (docker-compose.dev.yml).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
if [ -d "$ROOT/.pgdata" ]; then
  export PATH="/opt/homebrew/opt/postgresql@18/bin:/opt/homebrew/opt/postgresql@17/bin:/opt/homebrew/opt/postgresql@16/bin:$PATH"
  export LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8
  mkdir -p /tmp/pg5433
  if pg_isready -h localhost -p 5433 >/dev/null 2>&1; then echo "Postgres đã chạy ở :5433"; exit 0; fi
  pg_ctl -D "$ROOT/.pgdata" -o "-p 5433 -c listen_addresses=localhost -c unix_socket_directories=/tmp/pg5433" -l /tmp/pg5433.log start
else
  docker compose -f "$ROOT/docker-compose.dev.yml" up -d
fi
