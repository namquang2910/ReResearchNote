#!/usr/bin/env bash
# Khôi phục Postgres từ một file backup (.sql.gz) do dịch vụ `backup` tạo ra.
#   ./deploy/restore.sh backups/daily/research_notes-20261014-020000.sql.gz
# CẢNH BÁO: thay thế toàn bộ dữ liệu hiện tại.
set -euo pipefail
FILE="${1:?Cần đường dẫn file backup .sql.gz}"
[ -f "$FILE" ] || { echo "Không thấy $FILE"; exit 1; }
read -r -p "Ghi đè DATABASE hiện tại bằng $FILE ? (gõ YES) " ok
[ "$ok" = "YES" ] || exit 1
docker compose stop api web
docker compose exec -T db psql -U research -d postgres -c "DROP DATABASE IF EXISTS research_notes WITH (FORCE);" -c "CREATE DATABASE research_notes;"
gunzip -c "$FILE" | docker compose exec -T db psql -U research -d research_notes -v ON_ERROR_STOP=1 >/dev/null
docker compose up -d
echo "Đã khôi phục từ $FILE"
