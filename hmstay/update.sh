#!/usr/bin/env bash
# Cập nhật HMStay trên VPS: kéo code mới, chạy các migration chưa chạy, build lại web.
# Dùng:  ./update.sh
set -euo pipefail
cd "$(dirname "$0")"

DB_USER="${DB_USER:-hmstay_admin}"
DB_NAME="${DB_NAME:-hmstay}"
psql_db() { docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -qAt "$@"; }

echo "==> Lấy code mới"
git pull --ff-only

echo "==> Kiểm tra migration"
psql_db -c "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())" >/dev/null

# Lần đầu (trước khi có bảng theo dõi): migration nào đã chạy tay thì đánh dấu, không chạy lại.
probe() { # trả về "t" nếu migration $1 đã có dấu vết trong DB
  case "$1" in
    002_*) psql_db -c "select to_regclass('public.password_resets') is not null" ;;  # 002 đã chạy tay cùng đợt với 003
    003_*) psql_db -c "select to_regclass('public.password_resets') is not null" ;;
    004_*) psql_db -c "select exists(select 1 from pg_proc where proname='session_valid')" ;;
    005_*) psql_db -c "select to_regclass('public.notifications') is not null" ;;
    006_*) psql_db -c "select to_regclass('public.booking_templates') is not null" ;;
    007_*) psql_db -c "select to_regclass('public.rate_seasons') is not null" ;;
    008_*) psql_db -c "select to_regclass('public.email_verifications') is not null" ;;
    009_*) psql_db -c "select to_regclass('public.broker_properties') is not null" ;;
    *) echo f ;;
  esac
}

if [ "$(psql_db -c "select count(*) from schema_migrations")" = "0" ]; then
  for f in db/migrations/*.sql; do
    n=$(basename "$f" .sql)
    if [ "$(probe "$n")" = "t" ]; then
      psql_db -c "insert into schema_migrations(name) values ('$n') on conflict do nothing" >/dev/null
      echo "   (đã có sẵn) $n"
    fi
  done
fi

for f in db/migrations/*.sql; do
  n=$(basename "$f" .sql)
  if [ "$(psql_db -c "select 1 from schema_migrations where name='$n'")" != "1" ]; then
    echo "   chạy $n"
    docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -1 -q < "$f"
    psql_db -c "insert into schema_migrations(name) values ('$n')" >/dev/null
  fi
done

echo "==> Build và khởi động lại web"
docker compose up -d --build web
docker image prune -f >/dev/null

echo "==> Xong. Xem log: docker compose logs --tail=30 web"
