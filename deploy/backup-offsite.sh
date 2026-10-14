#!/usr/bin/env bash
# Đẩy thư mục backups/ lên kho lưu trữ ngoài (Cloudflare R2 / Backblaze B2 / S3…) bằng rclone.
# Cài rclone, chạy `rclone config` tạo remote tên "offsite", rồi thêm vào cron:
#   30 3 * * *  /opt/research-notes/deploy/backup-offsite.sh >> /var/log/research-backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
rclone sync ./backups "offsite:${BACKUP_BUCKET:-research-notes-backups}" --transfers 4 --checksum
echo "$(date -Is) offsite backup done"
