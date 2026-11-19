#!/usr/bin/env bash
# Cập nhật Đà Lạt Homestay trên VPS: kéo code mới, build lại, khởi động lại (migration chạy tự động khi `web` khởi động).
# Dùng (trong thư mục dalat/):  ./deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "Thiếu file .env (sao chép từ .env.production.example)"; exit 1; }
C="docker compose -f docker-compose.prod.yml --env-file .env"

echo "==> Lấy code mới"
git pull --ff-only

echo "==> Build & khởi động"
$C up -d --build

echo "==> Chờ web khoẻ"
for i in $(seq 1 40); do
  s=$($C ps --format '{{.Service}} {{.Health}}' | awk '$1=="web"{print $2}')
  [ "$s" = "healthy" ] && { echo "web: healthy"; break; }
  sleep 3
  [ "$i" = 40 ] && { echo "web chưa healthy — xem log:  $C logs --tail 80 web"; exit 1; }
done
$C ps
