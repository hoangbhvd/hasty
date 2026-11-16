-- Hồ sơ cơ sở đầy đủ, số đêm tối thiểu, giá theo mùa. Chạy trên DB đang chạy:
--   docker compose exec -T db psql -U hmstay_admin -d hmstay < db/migrations/007_property_profile_and_seasons.sql

alter table properties
  add column area text,                                   -- khu vực / thành phố
  add column amenities text[] not null default '{}',      -- mã tiện nghi (xem lib/property.ts)
  add column checkin_time text not null default '14:00',
  add column checkout_time text not null default '12:00',
  add column cancel_policy text,
  add column house_rules text;

alter table units add column min_nights int not null default 1 check (min_nights between 1 and 60);

-- Giá net theo mùa/ngày lễ: đêm nào nằm trong [start_date, end_date] thì dùng giá này thay giá mặc định.
-- Nhiều mùa chồng nhau: mùa tạo sau thắng. Giá sàn vẫn lấy từ net_rates.
create table rate_seasons (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete cascade,
  name text not null default '',
  start_date date not null,
  end_date date not null,
  weekday_price bigint not null check (weekday_price >= 0),
  weekend_price bigint not null check (weekend_price >= 0),
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index on rate_seasons (unit_id, start_date);
alter table rate_seasons enable row level security;
create policy seasons_owner on rate_seasons for all
  using (is_property_owner(unit_property(unit_id))) with check (is_property_owner(unit_property(unit_id)));
create policy seasons_broker on rate_seasons for select
  using (is_active_broker(unit_property(unit_id)));
grant select, insert, update, delete on rate_seasons to app_user;
