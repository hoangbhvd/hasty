#!/bin/sh
# Đặt mật khẩu thật cho app_user từ biến môi trường (chạy sau 001_schema.sql).
set -e
psql -v ON_ERROR_STOP=1 -v pw="$APP_DB_PASSWORD" --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
alter role app_user password :'pw';
SQL
