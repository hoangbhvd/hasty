-- Giá vốn booking tự quản (tính lãi). Chạy bằng ./update.sh hoặc:
--   docker compose exec -T db psql -U hmstay_admin -d hmstay < db/migrations/010_broker_booking_net.sql

-- Giá vốn (net) của booking tự quản để tính lãi = tổng tiền − giá vốn
alter table broker_bookings add column if not exists net_total bigint not null default 0 check (net_total >= 0);
